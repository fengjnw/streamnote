/**
 * TranscriptionFlowManager - handles transcription progress callbacks and context updates.
 */
class TranscriptionFlowManager {
    constructor(app) {
        this.app = app;
    }

    onTranscribeProgress(data) {
        const app = this.app;
        const { index, text, sessionId } = data;

        const isCurrentSession = sessionId === app.sessionManager.currentSessionId;

        if (isCurrentSession) {
            app.updateDisplay();

            if (app.translationEnabled) {
                const translationContext = app.recordingManager.getTranscriptionContext();
                app.translationManager.translateText(text, index, sessionId, translationContext);
            }

            this.updateTranscriptionContext();
        }

        app.saveToSession(sessionId);
    }

    updateTranscriptionContext() {
        const app = this.app;
        const transcriptData = app.recordingManager.getTranscriptData();
        const indices = Object.keys(transcriptData).map(Number).sort((a, b) => a - b);

        const recentTranscripts = indices.slice(-5).map((idx) => {
            const item = transcriptData[idx];
            return (item && item.text) ? item.text : "";
        }).filter((text) => text && text.length > 0);

        const context = recentTranscripts.join(" ");
        const maxContextLength = 200;
        const contextToUse = context.length > maxContextLength
            ? context.substring(context.length - maxContextLength)
            : context;

        app.recordingManager.setTranscriptionContext(contextToUse);
    }

    updateStatus(text) {
        const app = this.app;
        const statusElement = document.getElementById("status");
        if (statusElement) {
            statusElement.textContent = text;
        }

        if (text.includes("Listening") || text.includes("Transcripting")) {
            app.updateDisplay();
        }
    }
}

window.TranscriptionFlowManager = TranscriptionFlowManager;
