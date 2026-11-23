import UIKit
import Capacitor

class SwkViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SwkSecurePlugin())
        bridge?.registerPluginInstance(SwkCallPushBridge())
    }
}
