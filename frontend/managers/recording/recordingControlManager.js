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

    async start(source = "microphone") {
        try {
            if (this.app.recordingSessionId !== null && this.app.recordingSessionId !== this.app.sessionManager.currentSessionId) {
                const recordingSession = this.app.sessionManager.getSession(this.app.recordingSessionId);
                const recordingSessionName = recordingSession ? recordingSession.name : "Unknown";
                this.app.showStatusMessage(`⚠️ Stop recording in "${recordingSessionName}" first!`, 3000);
                return;
            }

            this.app.recordingSessionId = this.app.sessionManager.currentSessionId;
            this.app.updateRecordingIndicator();

            this.setRecordingUiEnabled(false);

            this.app.updateTranscriptionContext();

            const currentSession = this.app.sessionManager.getCurrentSession();
            if (currentSession) {
                this.app.recordingManager.setSessionStartTime(currentSession.startTime);
            }

            await this.app.recordingManager.start(this.app.recordingSessionId, source);

            if (!this.app.recordingManager.isRecording) {
                this.stop(true);
                return;
            }

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
            console.error("[ERROR] Recording access:", error);
            this.app.updateStatus("Audio capture failed");
            this.stop(true);
        }
    }

    stop(force = false) {
        const shouldStop = this.app.recordingManager && this.app.recordingManager.isRecording;
        if (!shouldStop && !force) {
            return;
        }

        if (shouldStop) {
            this.app.recordingManager.stop();
        }

        this.app.recordingSessionId = null;
        this.app.updateRecordingIndicator();

        this.setRecordingUiEnabled(true);

        this.updateRecordingButtonState();

        this.app.updateSessionStats();
        if (shouldStop && this.app.recordingSessionId !== null) {
            this.app.sessionManager.updateLastTextModified(this.app.recordingSessionId);
        } else if (shouldStop && this.app.sessionManager.currentSessionId) {
            this.app.sessionManager.updateLastTextModified(this.app.sessionManager.currentSessionId);
        }
    }

    setRecordingUiEnabled(isEnabled) {
        const sessionBtn = document.getElementById('openSessionPanel');
        if (sessionBtn) {
            sessionBtn.disabled = !isEnabled;
            if (!isEnabled) {
                sessionBtn.title = 'Switching sessions is unavailable while recording';
            } else {
                sessionBtn.removeAttribute('title');
            }
        }

        const addContentBtn = document.getElementById('addContentBtn');
        if (addContentBtn) {
            addContentBtn.disabled = !isEnabled;
            if (!isEnabled) {
                addContentBtn.title = 'Importing content is unavailable while recording';
            } else {
                addContentBtn.removeAttribute('title');
            }
        }

        const downloadSessionBtn = document.getElementById('downloadSessionBtn');
        if (downloadSessionBtn) {
            downloadSessionBtn.disabled = !isEnabled;
            if (!isEnabled) {
                downloadSessionBtn.title = 'Exporting sessions is unavailable while recording';
            } else {
                downloadSessionBtn.removeAttribute('title');
            }
        }

        const editBtn = document.getElementById('editTextBtn');
        if (editBtn) {
            if (!isEnabled) {
                editBtn.disabled = true;
                editBtn.title = 'Editing transcript is unavailable while recording';
            } else if (Object.keys(this.app.recordingManager.preciseResults).length > 0) {
                editBtn.disabled = false;
                editBtn.removeAttribute('title');
            } else {
                editBtn.disabled = true;
                editBtn.removeAttribute('title');
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
