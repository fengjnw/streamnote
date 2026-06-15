/**
 * DeviceCapabilities - lightweight feature and viewport checks for adaptive UI.
 */
class DeviceCapabilities {
    static matches(query) {
        return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
    }

    static isMobileViewport() {
        return DeviceCapabilities.matches("(max-width: 768px)");
    }

    static isAdaptiveViewport() {
        return DeviceCapabilities.matches("(max-width: 1023px)");
    }

    static supportsSystemAudioCapture() {
        return !DeviceCapabilities.isMobileViewport()
            && !!navigator.mediaDevices
            && typeof navigator.mediaDevices.getDisplayMedia === "function";
    }

    static supportsClipboardWrite() {
        return !!navigator.clipboard && typeof navigator.clipboard.writeText === "function";
    }
}

window.DeviceCapabilities = DeviceCapabilities;
