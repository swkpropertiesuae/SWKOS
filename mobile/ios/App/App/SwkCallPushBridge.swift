import Foundation
import Capacitor
import PushKit
import CallKit
import UIKit

/// Native iOS VoIP PushKit & CallKit bridge for locked-screen incoming SIP calls.
/// Ensures iOS 13+ strict compliance by synchronously reporting every VoIP push to CXProvider,
/// while preserving SWK hard-masked Vault client anonymity.
@objc(SwkCallPushBridge)
public class SwkCallPushBridge: CAPPlugin, CAPBridgedPlugin, PKPushRegistryDelegate, CXProviderDelegate {
    public let identifier = "SwkCallPushBridge"
    public let jsName = "SwkCallPushBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "registerVoip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVoipToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportIncomingCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise),
    ]

    private var voipRegistry: PKPushRegistry?
    private var provider: CXProvider?
    private let callController = CXCallController()
    private var activeCallUuid: UUID?
    private var latestVoipToken: String?

    private func ensureProvider() -> CXProvider {
        if let existing = provider { return existing }
        let config = CXProviderConfiguration()
        config.maximumCallsPerCallGroup = 1
        config.maximumCallGroups = 1
        config.supportsVideo = false
        config.supportedHandleTypes = [.generic, .phoneNumber]
        config.includesCallsInRecents = false
        let cx = CXProvider(configuration: config)
        cx.setDelegate(self, queue: nil)
        provider = cx
        return cx
    }

    public override func load() {
        _ = ensureProvider()
    }

    @objc func registerVoip(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.voipRegistry == nil {
                let reg = PKPushRegistry(queue: DispatchQueue.main)
                reg.delegate = self
                reg.desiredPushTypes = [.voIP]
                self.voipRegistry = reg
            }
            call.resolve(["registered": true, "token": self.latestVoipToken as Any])
        }
    }

    @objc func getVoipToken(_ call: CAPPluginCall) {
        call.resolve(["token": latestVoipToken as Any])
    }

    @objc func reportIncomingCall(_ call: CAPPluginCall) {
        let isMasked = call.getBool("isMaskedVault") ?? false
        let callerName = isMasked
            ? "SWK Vault Client (Masked)"
            : (call.getString("callerName") ?? "SWK SIP Call")
        let callId = call.getString("callId") ?? UUID().uuidString
        let ext = call.getString("extensionNo") ?? ""

        let uuid = UUID()
        activeCallUuid = uuid
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: isMasked ? "SWK Vault Client" : callerName)
        update.localizedCallerName = callerName
        update.hasVideo = false

        ensureProvider().reportNewIncomingCall(with: uuid, update: update) { err in
            if let err = err {
                call.reject(err.localizedDescription)
            } else {
                call.resolve(["uuid": uuid.uuidString, "callId": callId, "extensionNo": ext])
            }
        }
    }

    @objc func endCall(_ call: CAPPluginCall) {
        guard let uuid = activeCallUuid else {
            call.resolve(["ended": false])
            return
        }
        let action = CXEndCallAction(call: uuid)
        callController.request(CXTransaction(action: action)) { _ in
            self.activeCallUuid = nil
            call.resolve(["ended": true])
        }
    }

    // MARK: - PKPushRegistryDelegate
    public func pushRegistry(
        _ registry: PKPushRegistry,
        didUpdate pushCredentials: PKPushCredentials,
        for type: PKPushType
    ) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        latestVoipToken = token
        notifyListeners("voipToken", data: ["token": token], retainUntilConsumed: true)
    }

    public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        if type == .voIP {
            latestVoipToken = nil
        }
    }

    public func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else {
            completion()
            return
        }
        let dict = payload.dictionaryPayload
        let isMasked = (dict["isMaskedVault"] as? Bool) ?? false
        let rawCaller = (dict["callerName"] as? String) ?? "SWK SIP Call"
        let callerName = isMasked ? "SWK Vault Client (Masked)" : rawCaller
        let ext = (dict["extensionNo"] as? String) ?? ""

        let uuid = UUID()
        activeCallUuid = uuid
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: isMasked ? "SWK Vault Client" : callerName)
        update.localizedCallerName = callerName
        update.hasVideo = false

        ensureProvider().reportNewIncomingCall(with: uuid, update: update) { _ in
            completion()
        }

        SwkSecurePlugin.setPendingLaunchRoute("/phone?incoming=1")
        notifyListeners("swkIncomingCall", data: [
            "callerName": callerName,
            "extensionNo": ext,
            "isMaskedVault": isMasked,
        ], retainUntilConsumed: true)
    }

    // MARK: - CXProviderDelegate
    public func providerDidReset(_ provider: CXProvider) {
        activeCallUuid = nil
    }

    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        notifyListeners("swkIncomingCall", data: ["answered": true], retainUntilConsumed: true)
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        activeCallUuid = nil
        notifyListeners("swkCallEnded", data: ["ended": true], retainUntilConsumed: true)
        action.fulfill()
    }
}
