/**
 * VisibilityManager - handles focus/visibility events for auto-scroll behavior.
 */
class VisibilityManager {
    constructor(app) {
        this.app = app;
    }

    initVisibilityHandlers() {
        window.addEventListener('focus', () => {
            if (this.app.panelManager && this.app.panelManager.autoScroll) {
                setTimeout(() => {
                    this.scrollToLatestLine();
                }, 0);
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.app.panelManager && this.app.panelManager.autoScroll) {
                setTimeout(() => {
                    this.scrollToLatestLine();
                }, 0);
            }
        });
    }

    scrollToLatestLine() {
        const transcript = document.getElementById("transcript");
        const translation = document.getElementById("translation");
        const keys = Object.keys(this.app.recordingManager.getTranscriptData());

        if (keys.length === 0) return;

        const lastIndex = keys[keys.length - 1];
        if (transcript) {
            this.app.panelManager.scrollToLineBottom(transcript, lastIndex);
        }
        if (translation) {
            this.app.panelManager.scrollToLineBottom(translation, lastIndex);
        }
    }
}

window.VisibilityManager = VisibilityManager;
