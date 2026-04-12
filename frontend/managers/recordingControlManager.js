/**
 * RecordingControlManager - orchestrates app-level recording lifecycle and related UI toggles.
 */
class RecordingControlManager {
    constructor(app) {
        this.app = app;
    }

    async toggleRecording() {
        if (this.app.recordingManager && this.app.recordingManager.isRecording) {
            this.stop();
        } else {
            await this.start();
        }
    }

    async start() {
        try {
            if (this.app.recordingSessionId !== null && this.app.recordingSessionId !== this.app.sessionManager.currentSessionId) {
                const recordingSession = this.app.sessionManager.getSession(this.app.recordingSessionId);
                const recordingSessionName = recordingSession ? recordingSession.name : "Unknown";
                this.app.showStatusMessage(`⚠️ Stop recording in "${recordingSessionName}" first!`, 3000);
                return;
            }

            this.app.recordingSessionId = this.app.sessionManager.currentSessionId;
            this.app.updateRecordingIndicator();

            const sessionBtn = document.getElementById('openSessionPanel');
            if (sessionBtn) {
                sessionBtn.disabled = true;
                sessionBtn.title = 'Cannot switch sessions while recording';
                sessionBtn.style.opacity = '0.5';
            }

            const addContentBtn = document.getElementById('addContentBtn');
            if (addContentBtn) {
                addContentBtn.disabled = true;
                addContentBtn.title = 'Cannot add content while recording';
                addContentBtn.style.opacity = '0.5';
            }

            const editBtn = document.getElementById('editTextBtn');
            if (editBtn) {
                editBtn.disabled = true;
                editBtn.title = 'Cannot edit while recording';
                editBtn.style.opacity = '0.5';
            }

            this.app.updateTranscriptionContext();

            const currentSession = this.app.sessionManager.getCurrentSession();
            if (currentSession) {
                this.app.recordingManager.setSessionStartTime(currentSession.startTime);
            }

            await this.app.recordingManager.start(this.app.recordingSessionId);

            this.updateRecordingButtonState();
            this.app.updateDisplay();

            const statsInterval = setInterval(() => {
                if (!this.app.recordingManager.isRecording) {
                    clearInterval(statsInterval);
                    return;
                }
                this.app.updateSessionStats();
                this.app.updateDisplay();
            }, 1000);

        } catch (error) {
            console.error("[ERROR] Microphone access:", error);
            this.app.updateStatus("Microphone access denied");
        }
    }

    stop() {
        if (this.app.recordingManager && this.app.recordingManager.isRecording) {
            this.app.recordingManager.stop();

            this.app.recordingSessionId = null;
            this.app.updateRecordingIndicator();

            const sessionBtn = document.getElementById('openSessionPanel');
            if (sessionBtn) {
                sessionBtn.disabled = false;
                sessionBtn.title = 'Open Sessions';
                sessionBtn.style.opacity = '1';
            }

            const addContentBtn = document.getElementById('addContentBtn');
            if (addContentBtn) {
                addContentBtn.disabled = false;
                addContentBtn.title = 'Add content from file or text';
                addContentBtn.style.opacity = '1';
            }

            const editBtn = document.getElementById('editTextBtn');
            if (editBtn && Object.keys(this.app.recordingManager.preciseResults).length > 0) {
                editBtn.disabled = false;
                editBtn.title = 'Edit transcript';
                editBtn.style.opacity = '1';
            }

            this.updateRecordingButtonState();

            this.app.updateSessionStats();
            if (this.app.recordingSessionId !== null) {
                this.app.sessionManager.updateLastTextModified(this.app.recordingSessionId);
            } else if (this.app.sessionManager.currentSessionId) {
                this.app.sessionManager.updateLastTextModified(this.app.sessionManager.currentSessionId);
            }
        }
    }

    updateRecordingButtonState() {
        const recordBtn = document.getElementById("recordBtn");
        if (recordBtn) {
            if (this.app.recordingManager && this.app.recordingManager.isRecording) {
                recordBtn.classList.add("active");
            } else {
                recordBtn.classList.remove("active");
            }
        }
    }

    clear() {
        this.app.recordingManager.clear();
        this.app.translationResults = {};
        this.app.translationManager.clear();
        this.app.chunkIndex = 0;
        this.app.currentTranscriptText = "";
        this.app.updateDisplay();
        if (this.app.keywordManager) {
            this.app.keywordManager.reset();
        }

        this.app.updateStatus("Cleared");
        this.app.updateSessionStats();
        this.app.sessionManager.updateCurrentTranscripts({});
    }
}

window.RecordingControlManager = RecordingControlManager;
