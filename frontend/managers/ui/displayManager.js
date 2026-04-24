/**
 * DisplayManager - handles transcript/translation rendering and related UI state updates.
 */
class DisplayManager {
    constructor(app) {
        this.app = app;
    }

    formatTimestamp(item) {
        if (item.timestamp !== undefined && item.timestamp !== null && item.timestamp !== '') {
            let timeValue = item.timestamp;
            let timestampStr = null;

            if (typeof timeValue === 'string') {
                if (/^\d{2}:\d{2}:\d{2}$/.test(timeValue)) {
                    timestampStr = timeValue;
                } else if (/^\d+$/.test(timeValue)) {
                    timeValue = parseInt(timeValue);
                }
            }

            if (timestampStr) {
                return timestampStr;
            }

            if (typeof timeValue === 'number' && !isNaN(timeValue)) {
                const session = this.app.sessionManager.getCurrentSession();
                const sessionStartMs = session && session.startTime ? session.startTime : Date.now();
                const actualTimeMs = sessionStartMs + timeValue * 1000;
                return DateTimeUtils.formatTimeFromEpochMs(actualTimeMs);
            }
        }

        return DateTimeUtils.getNowTimeString();
    }

    updateDisplay() {
        if (this.app.hasActiveSelection) {
            this.app.pendingUpdates = true;
            return;
        }

        this.app.pendingUpdates = false;
        this.app.panelManager.isUpdatingUI = true;

        this.app.updateSessionStats();

        const transcriptDiv = document.getElementById("transcript");
        const preciseResults = this.app.recordingManager.getTranscriptData();

        const formattedLines = Object.keys(preciseResults).map(key => {
            const item = preciseResults[key];
            if (!item || !item.text) return null;

            const text = item.text.trim();
            const timestamp = this.formatTimestamp(item);

            return `<p data-index="${key}" data-timestamp="[${timestamp}]">${text}</p>`;
        }).filter(line => line !== null);

        if (formattedLines.length > 0) {
            let displayHTML = formattedLines.join('');
            const statusText = (this.app.recordingManager.isRecording || this.app.recordingManager.isTranscribingActive())
                ? (this.app.recordingManager.isTranscribingActive() ? 'Transcripting...' : 'Listening...')
                : '';
            displayHTML += `<p class="placeholder">${statusText || '&nbsp;'}</p>`;
            transcriptDiv.innerHTML = displayHTML;
        } else if (this.app.recordingManager.isRecording) {
            transcriptDiv.innerHTML = '<p class="placeholder">Listening...</p>';
        } else if (this.app.recordingManager.isTranscribingActive()) {
            transcriptDiv.innerHTML = '<p class="placeholder">Transcripting...</p>';
        } else {
            transcriptDiv.innerHTML = '<p class="placeholder">Start recording or add text</p>';
        }

        this.updateTranslationDisplay();

        this.app.highlightManager.reapplyAllHighlights();

        if (this.app.panelManager.autoScroll) {
            const transcript = document.getElementById("transcript");
            const translation = document.getElementById("translation");

            const keys = Object.keys(preciseResults);
            if (keys.length > 0) {
                if (transcript) {
                    transcript.style.scrollBehavior = 'auto';
                    transcript.scrollTop = transcript.scrollHeight;
                }
                if (translation) {
                    translation.style.scrollBehavior = 'auto';
                    translation.scrollTop = translation.scrollHeight;
                }
            }
        }

        setTimeout(() => {
            this.app.panelManager.isUpdatingUI = false;

            const transcript = document.getElementById("transcript");
            if (transcript) {
                const canScroll = transcript.scrollHeight > transcript.clientHeight + 1;
                const atBottom = this.app.panelManager.isScrolledToBottom(transcript);

                // Keep auto-scroll enabled when content does not overflow to avoid a stuck "Back to Latest" button.
                const shouldEnableAutoScroll = !canScroll || atBottom;
                if (this.app.panelManager.autoScroll !== shouldEnableAutoScroll) {
                    this.app.panelManager.autoScroll = shouldEnableAutoScroll;
                    this.app.panelManager.updateAutoScrollButton();
                    this.app.panelManager.savePanelState();
                }
            }

            const editTextBtn = document.getElementById("editTextBtn");
            if (editTextBtn && this.app.recordingSessionId === null) {
                const transcriptData = this.app.recordingManager.getTranscriptData();
                const hasContent = Object.keys(transcriptData).length > 0;
                editTextBtn.disabled = !hasContent;
                if (!hasContent) {
                    editTextBtn.style.opacity = "0.3";
                    editTextBtn.style.pointerEvents = "none";
                } else {
                    editTextBtn.style.opacity = "1";
                    editTextBtn.style.pointerEvents = "auto";
                }
            }
        }, 50);
    }

    updateTranslationDisplay() {
        const translationDiv = document.getElementById("translation");
        if (!translationDiv) return;

        const mainContent = document.querySelector('.main-content');
        if (mainContent && mainContent.classList.contains('layout-full-transcript')) {
            return;
        }

        const preciseResults = this.app.recordingManager.getTranscriptData();
        const translationData = this.app.translationManager.getTranslationData();

        const translationLines = Object.keys(preciseResults).map(key => {
            const item = preciseResults[key];
            if (!item || !item.text) return null;

            const timestamp = this.formatTimestamp(item);
            const translation = translationData[key];
            const translationText = translation || '<span class="placeholder">Translating...</span>';

            return `<p data-index="${key}" data-timestamp="[${timestamp}]">${translationText}</p>`;
        }).filter(line => line !== null);

        if (translationLines.length > 0) {
            let translationHTML = translationLines.join('');
            const statusText = (this.app.recordingManager.isRecording || this.app.recordingManager.isTranscribingActive())
                ? (this.app.recordingManager.isTranscribingActive() ? 'Transcripting...' : 'Listening...')
                : '';
            translationHTML += `<p class="placeholder">${statusText || '&nbsp;'}</p>`;
            translationDiv.innerHTML = translationHTML;
        } else if (this.app.recordingManager.isRecording) {
            translationDiv.innerHTML = '<p class="placeholder">Listening...</p>';
        } else if (this.app.recordingManager.isTranscribingActive()) {
            translationDiv.innerHTML = '<p class="placeholder">Transcripting...</p>';
        } else {
            translationDiv.innerHTML = '<p class="placeholder">Translations will appear here as you record</p>';
        }
    }
}

window.DisplayManager = DisplayManager;
