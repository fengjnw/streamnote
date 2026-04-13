/**
 * ContentImportManager - handles importing text content into the current session.
 */
class ContentImportManager {
    constructor(app) {
        this.app = app;
    }

    /**
     * 导入文本内容到当前 session
     * @param {Object} preciseResults - 精确结果对象 {index: {text, timestamp, source}}
     * @param {string} sourceFile - 文件名或来源标识
     * @param {string} sourceType - 'file' 或 'edit'
     */
    importTextContent(preciseResults, sourceFile, sourceType) {
        const currentSession = this.app.sessionManager.getCurrentSession();
        const sessionId = this.app.sessionManager.currentSessionId;
        const newIndices = [];

        if (currentSession) {
            const existingIndices = Object.keys(currentSession.transcripts || {})
                .map(k => parseInt(k, 10))
                .filter(k => !isNaN(k));
            const maxIndex = existingIndices.length > 0 ? Math.max(...existingIndices) : -1;

            const mergedTranscripts = { ...(currentSession.transcripts || {}) };
            Object.entries(preciseResults).forEach(([key, value], idx) => {
                const newIndex = maxIndex + 1 + idx;
                mergedTranscripts[newIndex] = value;
                newIndices.push(newIndex);
            });

            currentSession.transcripts = mergedTranscripts;
            currentSession.contentMetadata = {
                source: "mixed",
                sourceFile: sourceFile,
                sourceType: sourceType,
                uploadTime: new Date().toISOString(),
                paragraphCount: Object.keys(mergedTranscripts).length
            };
            this.app.sessionManager.saveSessions();
            this.app.sessionManager.updateLastTextModified(sessionId);
        }

        const mergedData = currentSession?.transcripts || preciseResults;
        if (this.app.recordingManager) {
            this.app.recordingManager.setTranscriptData(mergedData);
        }
        if (this.app.panelManager) {
            this.app.panelManager.setTranscriptData(mergedData);
        }

        this.app.updateDisplay();

        if (this.app.translationEnabled && newIndices.length > 0) {
            const translationContext = this.app.recordingManager.getTranscriptionContext();
            newIndices.forEach(index => {
                const item = mergedData[index];
                if (item && item.text) {
                    this.app.translationManager.translateText(item.text, index, sessionId, translationContext);
                }
            });
        }

        this.app.saveToSession();
    }

    /**
     * 显示添加纯文本的对话框
     */
    showAddTextDialog() {
        const backdrop = document.createElement("div");
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 9999;
        `;

        const modal = document.createElement("div");
        modal.className = "add-content-modal";
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 900px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            max-height: 70vh;
        `;

        const header = document.createElement("div");
        header.className = "floating-modal-header input-group-modal-header";
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        `;
        const title = document.createElement("h3");
        title.textContent = "Add Content from Text";
        title.style.cssText = "margin: 0;";
        header.appendChild(title);

        const closeBtn = document.createElement("button");
        closeBtn.className = "panel-close-btn toggle-btn";
        closeBtn.textContent = "✕";
        header.appendChild(closeBtn);

        const toolbar = document.createElement("div");
        toolbar.className = "floating-modal-toolbar";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "toolbar-btn";
        cancelBtn.textContent = "Cancel";

        const addBtn = document.createElement("button");
        addBtn.className = "toolbar-btn";
        addBtn.textContent = "Add";
        addBtn.style.marginLeft = "auto";

        toolbar.appendChild(cancelBtn);
        toolbar.appendChild(addBtn);

        const content = document.createElement("div");
        content.style.cssText = `
            padding: 16px;
            overflow-y: auto;
            flex: 1;
            display: flex;
            flex-direction: column;
        `;

        const textArea = document.createElement("textarea");
        textArea.placeholder = "Each line becomes a timestamped item";
        textArea.style.cssText = `
            padding: 6px 8px;
            border: 1px solid #ddd;
            border-radius: 3px;
            font-size: 13px;
            font-family: inherit;
            resize: none;
            flex: 1;
            min-height: 200px;
            line-height: 1.4;
            box-sizing: border-box;
        `;
        content.appendChild(textArea);

        modal.appendChild(header);
        modal.appendChild(toolbar);
        modal.appendChild(content);

        const closeDialog = () => {
            backdrop.remove();
            modal.remove();
            const addContentBtn = document.getElementById("addContentBtn");
            if (addContentBtn) addContentBtn.classList.remove("active");
        };

        closeBtn.addEventListener("click", closeDialog);
        cancelBtn.addEventListener("click", closeDialog);
        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) {
                closeDialog();
            }
        });

        addBtn.addEventListener("click", () => {
            const inputText = textArea.value.trim();
            if (!inputText) {
                this.app.showStatusMessage("Please enter some text", 1500);
                return;
            }

            const lines = inputText.split("\n").filter(line => line.trim().length > 0);
            if (lines.length === 0) {
                this.app.showStatusMessage("Please enter some text", 1500);
                return;
            }

            const preciseResults = {};
            const session = this.app.sessionManager.getCurrentSession();
            const sessionStart = session && session.startTime ? session.startTime : Date.now();
            const relativeSeconds = Math.floor((Date.now() - sessionStart) / 1000);
            const timestamp = relativeSeconds;

            lines.forEach((line, idx) => {
                preciseResults[idx] = {
                    text: line.trim(),
                    timestamp: timestamp,
                    source: "text"
                };
            });

            this.importTextContent(preciseResults, "manual", "text");
            this.app.showStatusMessage(`Added ${lines.length} items`, 2000);
            closeDialog();
        });

        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        setTimeout(() => {
            textArea.focus();
        }, 100);
    }
}

window.ContentImportManager = ContentImportManager;
