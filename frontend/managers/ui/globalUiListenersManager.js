/**
 * GlobalUiListenersManager - binds shared non-domain-specific UI listeners.
 */
class GlobalUiListenersManager {
    constructor(app) {
        this.app = app;
    }

    setup() {
        const app = this.app;

        app.initDeviceIdentityUI();

        const floatingAutoScrollBtn = document.getElementById("floatingAutoScrollBtn");
        if (floatingAutoScrollBtn) {
            floatingAutoScrollBtn.addEventListener("click", () => {
                app.panelManager.toggleAutoScroll();
            });
            app.panelManager.updateAutoScrollButton();
        }

        app.initKeywordsTabSwitcher();

        document.addEventListener("selectionchange", () => {
            const selection = window.getSelection();
            app.hasActiveSelection = selection.toString().length > 0;

            if (!app.hasActiveSelection && app.pendingUpdates) {
                app.pendingUpdates = false;
                app.updateDisplay();
            }
        });

        const closeSessionModalBtn = document.getElementById("closeSessionModal");
        if (closeSessionModalBtn) {
            closeSessionModalBtn.addEventListener("click", () => {
                app.closeModal("sessionModal");
            });
        }

        const closeSettingsModalBtn = document.getElementById("closeSettingsModal");
        if (closeSettingsModalBtn) {
            closeSettingsModalBtn.addEventListener("click", () => {
                app.closeModal("settingsModal");
            });
        }
    }
}

window.GlobalUiListenersManager = GlobalUiListenersManager;
