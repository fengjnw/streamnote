/**
 * SessionInfoManager - renders session title and stats in header.
 */
class SessionInfoManager {
    constructor(app) {
        this.app = app;
    }

    updateSessionInfo() {
        const session = this.app.sessionManager.getCurrentSession();
        if (!session) return;

        const sessionNameDisplay = document.getElementById('sessionNameDisplay');
        if (sessionNameDisplay) {
            sessionNameDisplay.textContent = session.name || 'Untitled Session';
        }

        this.updateSessionStats();
    }

    updateSessionStats() {
        const session = this.app.sessionManager.getCurrentSession();
        if (!session) return;

        let displayTime;
        if (session.lastTextModified !== null && session.lastTextModified !== undefined) {
            const sessionStartTime = session.startTime || Date.now();
            displayTime = sessionStartTime + (session.lastTextModified * 1000);
        } else {
            displayTime = session.startTime || Date.now();
        }

        const dateDisplay = document.getElementById('sessionDateDisplay');
        if (dateDisplay) {
            dateDisplay.textContent = DateTimeUtils.formatDateTime(new Date(displayTime));
        }

        let lineCount = 0;
        if (session.transcripts) {
            lineCount = Object.keys(session.transcripts).length;
        }
        const lineCountDisplay = document.getElementById('sessionLineCountDisplay');
        if (lineCountDisplay) {
            lineCountDisplay.textContent = lineCount;
        }

        let keywordCount = 0;
        if (session.keywords && Array.isArray(session.keywords)) {
            keywordCount = session.keywords.length;
        }
        const keywordCountDisplay = document.getElementById('sessionKeywordCountDisplay');
        if (keywordCountDisplay) {
            keywordCountDisplay.textContent = keywordCount;
        }

        let highlightCount = 0;
        if (session.highlights && Array.isArray(session.highlights)) {
            highlightCount = session.highlights.length;
        }
        const highlightCountDisplay = document.getElementById('sessionHighlightCountDisplay');
        if (highlightCountDisplay) {
            highlightCountDisplay.textContent = highlightCount;
        }
    }
}

window.SessionInfoManager = SessionInfoManager;
