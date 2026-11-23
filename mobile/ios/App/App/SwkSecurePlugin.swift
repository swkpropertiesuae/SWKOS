import Foundation
import Capacitor
import Security
import CryptoKit
import LocalAuthentication
import CoreLocation
import UIKit
import Network

/// Unified iOS native security, Secure Enclave/Keychain EC P-256 device key,
/// FaceID/TouchID gate, verified CoreLocation fix, and Field Duty background uploader.
@objc(SwkSecurePlugin)
public class SwkSecurePlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "SwkSecurePlugin"
    public let jsName = "SwkSecure"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "secureSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureRemove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getOrCreateDeviceKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signDeviceChallenge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deviceInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "integrity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "biometricAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "biometricAuth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "telemetry", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getFix", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startDuty", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopDuty", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ensureNotificationChannels", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeLaunchRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startCallAudioService", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopCallAudioService", returnType: CAPPluginReturnPromise),
    ]

    private let keychainService = "ae.swkproperties.os.secure"
    private let ecSeAccount = "swk_device_ec_p256_se_v1"
    private let ecRawAccount = "swk_device_ec_p256_raw_v1"

    private let locationManager = CLLocationManager()
    private let pathMonitor = NWPathMonitor()
    private let networkQueue = DispatchQueue(label: "ae.swkproperties.os.network")
    private var currentNetworkType = "Online"

    private var pendingFixCall: CAPPluginCall?
    private var pendingDutyStart: (call: CAPPluginCall, sid: Int, serverUrl: String, token: String, devId: String)?
    private var isFlushing = false
    private var dutyActive = false
    private var dutySessionId = -1
    private var dutyServerUrl = ""
    private var dutyToken = ""
    private var dutyDeviceId = ""
    private var pendingPoints: [[String: Any]] = []
    private var pointSeq: Int64 = 0
    private static var pendingLaunchRoute: String?

    public override func load() {
        UIDevice.current.isBatteryMonitoringEnabled = true
        DispatchQueue.main.async {
            self.locationManager.delegate = self
            self.locationManager.desiredAccuracy = kCLLocationAccuracyBest
        }
        pathMonitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }
            if path.status != .satisfied {
                self.currentNetworkType = "Offline"
            } else if path.usesInterfaceType(.wifi) {
                self.currentNetworkType = "Wi-Fi"
            } else if path.usesInterfaceType(.cellular) {
                self.currentNetworkType = "Cellular"
            } else if path.usesInterfaceType(.wiredEthernet) {
                self.currentNetworkType = "Ethernet"
            } else {
                self.currentNetworkType = "Online"
            }
        }
        pathMonitor.start(queue: networkQueue)
    }

    deinit {
        pathMonitor.cancel()
    }

    static func setPendingLaunchRoute(_ route: String?) {
        pendingLaunchRoute = route
    }

    // MARK: - Keychain Secret Storage
    private func keychainSet(account: String, data: Data) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var attrs = query
        attrs[kSecValueData as String] = data
        attrs[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(attrs as CFDictionary, nil) == errSecSuccess
    }

    private func keychainGet(account: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    private func keychainRemove(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }

    @objc func secureSet(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let val = call.getString("value"),
              let data = val.data(using: .utf8) else {
            call.reject("key and value required")
            return
        }
        if keychainSet(account: "kv:" + key, data: data) {
            call.resolve()
        } else {
            call.reject("secure_store_failed")
        }
    }

    @objc func secureGet(_ call: CAPPluginCall) {
        let key = call.getString("key") ?? ""
        if let data = keychainGet(account: "kv:" + key), let str = String(data: data, encoding: .utf8) {
            call.resolve(["value": str])
        } else {
            call.resolve(["value": NSNull()])
        }
    }

    @objc func secureRemove(_ call: CAPPluginCall) {
        let key = call.getString("key") ?? ""
        keychainRemove(account: "kv:" + key)
        call.resolve()
    }

    // MARK: - EC P-256 Device Key & IEEE P1363 Signing
    private enum DeviceKeyHandle {
        case secureEnclave(SecureEnclave.P256.Signing.PrivateKey)
        case softwareKeychain(P256.Signing.PrivateKey)

        var publicRawRepresentation: Data {
            switch self {
            case .secureEnclave(let k): return k.publicKey.rawRepresentation
            case .softwareKeychain(let k): return k.publicKey.rawRepresentation
            }
        }

        func sign(_ data: Data) throws -> Data {
            switch self {
            case .secureEnclave(let k): return try k.signature(for: data).rawRepresentation
            case .softwareKeychain(let k): return try k.signature(for: data).rawRepresentation
            }
        }
    }

    private func ensureDeviceKey() throws -> DeviceKeyHandle {
        #if !targetEnvironment(simulator)
        if SecureEnclave.isAvailable {
            if let blob = keychainGet(account: ecSeAccount),
               let existing = try? SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: blob) {
                return .secureEnclave(existing)
            }
            if let created = try? SecureEnclave.P256.Signing.PrivateKey() {
                _ = keychainSet(account: ecSeAccount, data: created.dataRepresentation)
                return .secureEnclave(created)
            }
        }
        #endif
        if let blob = keychainGet(account: ecRawAccount),
           let existing = try? P256.Signing.PrivateKey(rawRepresentation: blob) {
            return .softwareKeychain(existing)
        }
        let created = P256.Signing.PrivateKey()
        _ = keychainSet(account: ecRawAccount, data: created.rawRepresentation)
        return .softwareKeychain(created)
    }

    private func b64Url(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private func jwkDict(from rawPub: Data) -> [String: String] {
        let x = rawPub.subdata(in: 0..<32)
        let y = rawPub.subdata(in: 32..<64)
        return [
            "kty": "EC",
            "crv": "P-256",
            "x": b64Url(x),
            "y": b64Url(y),
        ]
    }

    @objc func getOrCreateDeviceKey(_ call: CAPPluginCall) {
        do {
            let handle = try ensureDeviceKey()
            call.resolve(jwkDict(from: handle.publicRawRepresentation))
        } catch {
            call.reject("device_key_unavailable")
        }
    }

    @objc func signDeviceChallenge(_ call: CAPPluginCall) {
        guard let message = call.getString("message"), !message.isEmpty,
              let data = message.data(using: .utf8) else {
            call.reject("message required")
            return
        }
        do {
            let handle = try ensureDeviceKey()
            let p1363Sig = try handle.sign(data)
            call.resolve([
                "pub": jwkDict(from: handle.publicRawRepresentation),
                "sig": b64Url(p1363Sig),
            ])
        } catch {
            call.reject("device_sign_failed")
        }
    }

    // MARK: - Device Info, Integrity & Biometrics
    @objc func deviceInfo(_ call: CAPPluginCall) {
        let vendorId = UIDevice.current.identifierForVendor?.uuidString ?? "UNKNOWN"
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "3.1.0"
        call.resolve([
            "device_id": "SWK-IOS-" + vendorId,
            "device_name": "Apple " + UIDevice.current.model,
            "os_version": "iOS " + UIDevice.current.systemVersion,
            "app_version": version,
        ])
    }

    @objc func integrity(_ call: CAPPluginCall) {
        #if targetEnvironment(simulator)
        let isSimulator = true
        #else
        let isSimulator = false
        #endif
        var jailbroken = false
        let paths = ["/Applications/Cydia.app", "/Library/MobileSubstrate/MobileSubstrate.dylib", "/bin/bash", "/usr/sbin/sshd"]
        for p in paths where FileManager.default.fileExists(atPath: p) {
            jailbroken = true
        }
        call.resolve([
            "debuggable": isSimulator,
            "rooted": jailbroken,
            "emulator": isSimulator,
        ])
    }

    @objc func biometricAvailable(_ call: CAPPluginCall) {
        let ctx = LAContext()
        var err: NSError?
        let available = ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err)
        call.resolve(["available": available])
    }

    @objc func biometricAuth(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Unlock SWK Properties OS"
        DispatchQueue.main.async {
            let ctx = LAContext()
            var err: NSError?
            guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else {
                call.reject("biometric_unavailable")
                return
            }
            ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { ok, authErr in
                if ok {
                    call.resolve(["verified": true])
                } else {
                    call.reject(authErr?.localizedDescription ?? "auth_cancelled")
                }
            }
        }
    }

    @objc func telemetry(_ call: CAPPluginCall) {
        let level = UIDevice.current.batteryLevel
        let pct = level >= 0 ? Int((level * 100.0).rounded()) : -1
        let state = UIDevice.current.batteryState
        let charging = state == .charging || state == .full
        call.resolve([
            "battery_pct": pct,
            "is_charging": charging,
            "network_type": currentNetworkType,
            "duty_service_running": dutyActive,
        ])
    }

    // MARK: - CoreLocation Fix & Background Field Duty
    @objc func getFix(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let status = self.locationManager.authorizationStatus
            if status == .notDetermined {
                self.pendingFixCall = call
                self.locationManager.requestWhenInUseAuthorization()
                return
            }
            guard status == .authorizedWhenInUse || status == .authorizedAlways else {
                call.reject("location_permission_required")
                return
            }
            self.pendingFixCall = call
            self.locationManager.requestLocation()
        }
    }

    private func activateDutyTracking(
        sid: Int,
        serverUrl: String,
        token: String,
        devId: String,
        status: CLAuthorizationStatus
    ) {
        dutySessionId = sid
        dutyServerUrl = serverUrl
        dutyToken = token
        dutyDeviceId = devId
        dutyActive = true
        locationManager.distanceFilter = 15
        locationManager.pausesLocationUpdatesAutomatically = false
        locationManager.allowsBackgroundLocationUpdates = (status == .authorizedAlways || status == .authorizedWhenInUse)
        locationManager.startUpdatingLocation()
    }

    private func stopDutyInternal() {
        dutyActive = false
        dutySessionId = -1
        dutyToken = ""
        isFlushing = false
        pendingPoints.removeAll()
        locationManager.allowsBackgroundLocationUpdates = false
        locationManager.stopUpdatingLocation()
    }

    @objc func startDuty(_ call: CAPPluginCall) {
        let sid = call.getInt("sessionId") ?? -1
        let serverUrl = (call.getString("serverUrl") ?? "").trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
        let token = call.getString("sessionToken") ?? ""
        let devId = call.getString("deviceId") ?? ""

        guard sid > 0 else {
            call.resolve(["started": false, "reason": "invalid_session"])
            return
        }
        guard !token.isEmpty else {
            call.resolve(["started": false, "reason": "not_signed_in"])
            return
        }
        guard isAllowedServer(serverUrl) else {
            call.resolve(["started": false, "reason": "insecure_server"])
            return
        }

        DispatchQueue.main.async {
            let status = self.locationManager.authorizationStatus
            if status == .notDetermined {
                if let prev = self.pendingDutyStart {
                    prev.call.resolve(["started": false, "reason": "cancelled"])
                }
                self.pendingDutyStart = (call, sid, serverUrl, token, devId)
                self.locationManager.requestAlwaysAuthorization()
                return
            }
            guard status == .authorizedWhenInUse || status == .authorizedAlways else {
                call.resolve(["started": false, "reason": "location_permission_required"])
                return
            }
            if status == .authorizedWhenInUse {
                // Request upgrade from WhenInUse (e.g. from prior getFix) to Always for locked-screen duty.
                self.locationManager.requestAlwaysAuthorization()
            }
            self.activateDutyTracking(sid: sid, serverUrl: serverUrl, token: token, devId: devId, status: status)
            call.resolve(["started": true])
        }
    }

    @objc func stopDuty(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopDutyInternal()
            call.resolve()
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let st = manager.authorizationStatus
        if let pending = pendingFixCall {
            if st == .authorizedWhenInUse || st == .authorizedAlways {
                manager.requestLocation()
            } else if st != .notDetermined {
                pendingFixCall = nil
                pending.reject("location_permission_required")
            }
        }
        if let queuedDuty = pendingDutyStart, st != .notDetermined {
            pendingDutyStart = nil
            if st == .authorizedAlways || st == .authorizedWhenInUse {
                if st == .authorizedWhenInUse {
                    manager.requestAlwaysAuthorization()
                }
                activateDutyTracking(
                    sid: queuedDuty.sid,
                    serverUrl: queuedDuty.serverUrl,
                    token: queuedDuty.token,
                    devId: queuedDuty.devId,
                    status: st
                )
                queuedDuty.call.resolve(["started": true])
            } else {
                queuedDuty.call.resolve(["started": false, "reason": "location_permission_required"])
            }
        }
        if dutyActive && (st == .authorizedAlways || st == .authorizedWhenInUse) {
            manager.allowsBackgroundLocationUpdates = true
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last, loc.horizontalAccuracy >= 0 else { return }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let pending = pendingFixCall {
            pendingFixCall = nil
            var out: [String: Any] = [
                "lat": loc.coordinate.latitude,
                "lng": loc.coordinate.longitude,
                "accuracy": max(1.0, loc.horizontalAccuracy),
                "capturedAt": iso.string(from: loc.timestamp),
                "mock": false,
            ]
            if loc.speed >= 0 { out["speed_mps"] = loc.speed }
            if loc.course >= 0 && loc.course <= 360 { out["heading"] = loc.course }
            pending.resolve(out)
        }

        if dutyActive && dutySessionId > 0 && !dutyToken.isEmpty {
            // Skip coarse GPS fixes > 150m client-side so server validation does not reject or stall batches.
            guard loc.horizontalAccuracy <= 150.0 else { return }
            pointSeq += 1
            let level = UIDevice.current.batteryLevel
            let batteryPct = level >= 0 ? Int((level * 100.0).rounded()) : nil
            var pt: [String: Any] = [
                "lat": loc.coordinate.latitude,
                "lng": loc.coordinate.longitude,
                "accuracy_m": max(1, Int(loc.horizontalAccuracy.rounded())),
                "is_mock": false,
                "recorded_at": iso.string(from: loc.timestamp),
                "idempotency_key": "fgps-ios-\(dutySessionId)-\(pointSeq)-\(Int(loc.timestamp.timeIntervalSince1970 * 1000))",
            ]
            if loc.speed >= 0 { pt["speed_mps"] = loc.speed }
            if loc.course >= 0 && loc.course <= 360 { pt["heading"] = loc.course }
            if let b = batteryPct { pt["battery_pct"] = b }

            pendingPoints.append(pt)
            if pendingPoints.count > 500 {
                pendingPoints.removeFirst(pendingPoints.count - 500)
            }
            flushDutyPoints()
        }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if let pending = pendingFixCall {
            pendingFixCall = nil
            pending.reject("no_fix")
        }
    }

    private func flushDutyPoints() {
        guard !isFlushing, dutyActive, !pendingPoints.isEmpty, isAllowedServer(dutyServerUrl), !dutyToken.isEmpty else {
            return
        }
        guard let url = URL(string: dutyServerUrl + "/api/field-gps/pings") else { return }

        let nowMs = Date().timeIntervalSince1970
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        var anyReplay = false
        let rawSlice = Array(pendingPoints.prefix(50))
        let batchKeys = Set(rawSlice.compactMap { $0["idempotency_key"] as? String })
        let preparedBatch: [[String: Any]] = rawSlice.map { pt in
            var copy = pt
            if let recStr = pt["recorded_at"] as? String,
               let recDate = iso.date(from: recStr),
               (nowMs - recDate.timeIntervalSince1970) > 240.0 {
                copy["offline_replay"] = true
                anyReplay = true
            }
            return copy
        }

        var payload: [String: Any] = [
            "field_session_id": dutySessionId,
            "network_type": currentNetworkType,
            "points": preparedBatch,
        ]
        if anyReplay { payload["offline_replay"] = true }
        if !dutyDeviceId.isEmpty { payload["device_id"] = dutyDeviceId }

        guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("mobile", forHTTPHeaderField: "x-swk-client")
        req.setValue(dutyToken, forHTTPHeaderField: "x-swk-session")
        req.httpBody = body

        isFlushing = true
        URLSession.shared.dataTask(with: req) { [weak self] data, response, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.isFlushing = false
                guard let http = response as? HTTPURLResponse else { return }

                if (200..<300).contains(http.statusCode) {
                    self.pendingPoints.removeAll { pt in
                        guard let k = pt["idempotency_key"] as? String else { return false }
                        return batchKeys.contains(k)
                    }
                    if !self.pendingPoints.isEmpty && self.dutyActive {
                        self.flushDutyPoints()
                    }
                } else if http.statusCode == 401 || http.statusCode == 403 || http.statusCode == 404 || http.statusCode == 422 {
                    self.stopDutyInternal()
                } else if http.statusCode == 400 {
                    let errMsg = data.flatMap { String(data: $0, encoding: .utf8) }?.lowercased() ?? ""
                    if errMsg.contains("no active field duty") || errMsg.contains("ended") || errMsg.contains("expired") {
                        self.stopDutyInternal()
                    } else {
                        // Drop non-retryable payload errors (e.g. coarse accuracy or timestamp skew) so new fixes flush.
                        self.pendingPoints.removeAll { pt in
                            guard let k = pt["idempotency_key"] as? String else { return false }
                            return batchKeys.contains(k)
                        }
                        if !self.pendingPoints.isEmpty && self.dutyActive {
                            self.flushDutyPoints()
                        }
                    }
                }
            }
        }.resume()
    }

    private func isAllowedServer(_ url: String) -> Bool {
        if url.hasPrefix("https://") { return true }
        #if DEBUG
        return url.hasPrefix("http://localhost") || url.hasPrefix("http://127.0.0.1")
        #else
        return false
        #endif
    }

    @objc func ensureNotificationChannels(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func consumeLaunchRoute(_ call: CAPPluginCall) {
        let r = Self.pendingLaunchRoute
        Self.pendingLaunchRoute = nil
        call.resolve(["route": r as Any])
    }

    @objc func startCallAudioService(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func stopCallAudioService(_ call: CAPPluginCall) {
        call.resolve()
    }
}
