/**
 * TranscriptEditDialogManager - builds and opens the transcript edit dialog.
 */
class TranscriptEditDialogManager {
    constructor(app) {
        this.app = app;
        this.editInputs = null;
        this.editTimestamps = null;
        this.editItems = null;
    }

    showEditTranscriptDialog() {
        const transcriptData = this.app.recordingManager.getTranscriptData();

        if (!transcriptData || Object.keys(transcriptData).length === 0) {
            this.app.showStatusMessage("No transcript to edit", 1500);
            return;
        }

        const editTextBtn = document.getElementById("editTextBtn");
        if (editTextBtn) editTextBtn.classList.add("active");

        const editRowsContainer = document.getElementById("editRowsContainer");
        if (!editRowsContainer) return;

        editRowsContainer.innerHTML = "";

        const toolbar = document.createElement("div");
        toolbar.className = "floating-modal-toolbar edit-modal-toolbar";
        toolbar.style.cssText = `
            display: flex;
            gap: 8px;
            padding: 10px 16px;
            border-bottom: 1px solid #e9ecef;
            flex-shrink: 0;
            background: #f5f5f5;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 10;
        `;

        const leftGroup = document.createElement("div");
        leftGroup.style.cssText = `
            display: flex;
            gap: 8px;
        `;

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "toolbar-btn";
        cancelBtn.textContent = "Cancel";

        leftGroup.appendChild(cancelBtn);

        const buttonGroup = document.createElement("div");
        buttonGroup.style.cssText = `
            display: flex;
            gap: 8px;
            margin-left: auto;
        `;

        const clearAllBtn = document.createElement("button");
        clearAllBtn.className = "toolbar-btn danger";
        clearAllBtn.textContent = "Clear";

        const saveBtn = document.createElement("button");
        saveBtn.className = "toolbar-btn";
        saveBtn.textContent = "Save";

        buttonGroup.appendChild(clearAllBtn);
        buttonGroup.appendChild(saveBtn);

        toolbar.appendChild(leftGroup);
        toolbar.appendChild(buttonGroup);
        editRowsContainer.appendChild(toolbar);

        const itemsContainer = document.createElement("div");
        itemsContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 12px 0;
            width: 100%;
        `;
        editRowsContainer.appendChild(itemsContainer);

        this.editInputs = {};
        this.editTimestamps = {};

        const indices = Object.keys(transcriptData).map(Number).sort((a, b) => a - b);
        indices.forEach(idx => {
            const item = transcriptData[idx];
            const text = item?.text || '';
            const timestamp = item?.timestamp || '';
            this._createEditItem(itemsContainer, idx, text, timestamp);
        });

        clearAllBtn.addEventListener("click", () => {
            if (confirm("Clear all items?")) {
                this.app.clear();
                this.app.setEditModalVisibility(false);
            }
        });

        saveBtn.addEventListener("click", () => {
            this.saveEditedTranscript();
        });

        cancelBtn.addEventListener("click", () => {
            this.app.setEditModalVisibility(false);
        });

        this.app.setEditModalVisibility(true);
    }

    _createEditItem(container, idx, text, timestamp) {
        const item = document.createElement("div");
        item.className = "edit-item";
        item.id = `edit-item-${idx}`;
        item.style.cssText = `
            display: flex;
            gap: 10px;
            padding: 10px 12px;
            align-items: flex-start;
            overflow: visible;
            margin: 0 12px;
        `;

        const session = this.app.sessionManager.getCurrentSession();
        const sessionStartMs = session && session.startTime ? session.startTime : Date.now();
        const sessionStartDate = new Date(sessionStartMs);

        let displayDate = "2000-01-01";
        let displayTime = "00:00:00";

        if (timestamp !== null && timestamp !== undefined && timestamp !== '') {
            const relativeSeconds = typeof timestamp === 'number' ? timestamp :
                (typeof timestamp === 'string' && /^\d+$/.test(timestamp) ? parseInt(timestamp) : null);

            if (relativeSeconds !== null && relativeSeconds >= 0) {
                const actualTimeMs = sessionStartMs + relativeSeconds * 1000;
                displayDate = DateTimeUtils.formatDateFromEpochMs(actualTimeMs);
                displayTime = DateTimeUtils.formatTimeFromEpochMs(actualTimeMs);
            }
            else if (typeof timestamp === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(timestamp)) {
                displayTime = timestamp;
                displayDate = DateTimeUtils.formatDate(sessionStartDate);
            }
        } else {
            displayDate = DateTimeUtils.formatDate(sessionStartDate);
            displayTime = DateTimeUtils.formatTime(sessionStartDate);
        }

        const dateInput = document.createElement("input");
        dateInput.type = "text";
        dateInput.value = displayDate;
        dateInput.placeholder = "YYYY-MM-DD";
        dateInput.style.cssText = `
            width: 110px;
            padding: 6px 6px;
            border: 1px solid #ddd;
            border-radius: 3px;
            font-family: "Monaco", "Menlo", monospace;
            font-size: 13px;
            text-align: center;
            box-sizing: border-box;
            flex-shrink: 0;
            line-height: 1.4;
            height: 32px;
        `;
        dateInput.addEventListener("blur", (e) => {
            const val = e.target.value.trim();
            if (!val) {
                e.target.value = displayDate;
                e.target.style.borderColor = "#ddd";
            } else if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                e.target.style.borderColor = "#d32f2f";
                e.target.value = displayDate;
                this.app.showStatusMessage("Invalid date format (use YYYY-MM-DD, e.g., 2026-03-16)", 2000);
            } else {
                const [y, m, d] = val.split('-').map(Number);
                const date = new Date(y, m - 1, d);
                if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
                    e.target.style.borderColor = "#d32f2f";
                    e.target.value = displayDate;
                    this.app.showStatusMessage("Invalid date", 2000);
                } else {
                    e.target.style.borderColor = "#ddd";
                }
            }
        });
        dateInput.addEventListener("focus", (e) => {
            e.target.style.borderColor = "#5a7c99";
        });

        const timeInput = document.createElement("input");
        timeInput.type = "text";
        timeInput.value = displayTime;
        timeInput.placeholder = "HH:MM:SS";
        timeInput.style.cssText = `
            width: 100px;
            padding: 6px 6px;
            border: 1px solid #ddd;
            border-radius: 3px;
            font-family: "Monaco", "Menlo", monospace;
            font-size: 13px;
            text-align: center;
            box-sizing: border-box;
            flex-shrink: 0;
            line-height: 1.4;
            height: 32px;
        `;
        timeInput.addEventListener("blur", (e) => {
            const val = e.target.value.trim();
            if (!val) {
                e.target.value = displayTime;
                e.target.style.borderColor = "#ddd";
            } else if (!/^\d{2}:\d{2}:\d{2}$/.test(val)) {
                e.target.style.borderColor = "#d32f2f";
                e.target.value = displayTime;
                this.app.showStatusMessage("Invalid timestamp format (use HH:MM:SS, e.g., 12:34:56)", 2000);
            } else {
                const [h, m, s] = val.split(':').map(Number);
                if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) {
                    e.target.style.borderColor = "#d32f2f";
                    e.target.value = displayTime;
                    this.app.showStatusMessage("Invalid time: hours 00-23, minutes 00-59, seconds 00-59", 2500);
                } else {
                    e.target.style.borderColor = "#ddd";
                }
            }
        });
        timeInput.addEventListener("focus", (e) => {
            e.target.style.borderColor = "#5a7c99";
        });

        const timestampContainer = document.createElement("div");
        timestampContainer.style.cssText = `
            display: flex;
            gap: 6px;
            align-items: center;
        `;
        timestampContainer.appendChild(dateInput);
        timestampContainer.appendChild(timeInput);

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.placeholder = "Edit text";
        textarea.rows = "1";
        textarea.style.cssText = `
            flex: 1;
            padding: 6px 6px;
            border: 1px solid #ddd;
            border-radius: 3px;
            font-family: inherit;
            font-size: 13px;
            resize: none;
            line-height: 1.4;
            min-height: 32px;
            box-sizing: border-box;
            overflow: hidden;
            height: auto;
        `;

        const adjustHeight = () => {
            setTimeout(() => {
                textarea.style.height = "auto";
                const newHeight = Math.max(textarea.scrollHeight, 32);
                textarea.style.height = newHeight + "px";
            }, 0);
        };

        textarea.addEventListener("input", adjustHeight);
        textarea.addEventListener("change", adjustHeight);

        textarea.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                e.preventDefault();

                const currentItem = textarea.closest('[id^="edit-item-"]');
                if (!currentItem) return;

                const itemsContainer = currentItem.parentElement;
                const items = Array.from(itemsContainer.querySelectorAll('[id^="edit-item-"]'));
                const indices = items.map(el => parseInt(el.id.replace('edit-item-', '')));
                const newIdx = Math.max(...indices, -1) + 1;

                const currentSession = this.app.sessionManager.getCurrentSession();
                const sessionStart = currentSession && currentSession.startTime ? currentSession.startTime : Date.now();
                const relativeSeconds = Math.floor((Date.now() - sessionStart) / 1000);
                const newTimestamp = relativeSeconds;

                this._createEditItem(itemsContainer, newIdx, '', newTimestamp);

                const newItem = itemsContainer.children[itemsContainer.children.length - 1];
                newItem.remove();
                currentItem.insertAdjacentElement('afterend', newItem);

                const newTextarea = newItem.querySelector('textarea');
                if (newTextarea) newTextarea.focus();
            }

            if (e.key === "ArrowUp") {
                const beforeCursor = textarea.value.substring(0, textarea.selectionStart);
                if (!beforeCursor.includes('\n')) {
                    const currentItem = textarea.closest('[id^="edit-item-"]');
                    if (!currentItem) return;

                    const itemsContainer = currentItem.parentElement;
                    const items = Array.from(itemsContainer.querySelectorAll('[id^="edit-item-"]'));
                    const currentIndex = items.indexOf(currentItem);

                    if (currentIndex > 0) {
                        e.preventDefault();
                        const prevItem = items[currentIndex - 1];
                        const prevTextarea = prevItem.querySelector('textarea');
                        if (prevTextarea) {
                            prevTextarea.focus();
                            prevTextarea.setSelectionRange(prevTextarea.value.length, prevTextarea.value.length);
                        }
                    }
                }
            }

            if (e.key === "ArrowDown") {
                const afterCursor = textarea.value.substring(textarea.selectionStart);
                if (!afterCursor.includes('\n')) {
                    const currentItem = textarea.closest('[id^="edit-item-"]');
                    if (!currentItem) return;

                    const itemsContainer = currentItem.parentElement;
                    const items = Array.from(itemsContainer.querySelectorAll('[id^="edit-item-"]'));
                    const currentIndex = items.indexOf(currentItem);

                    if (currentIndex < items.length - 1) {
                        e.preventDefault();
                        const nextItem = items[currentIndex + 1];
                        const nextTextarea = nextItem.querySelector('textarea');
                        if (nextTextarea) {
                            nextTextarea.focus();
                            nextTextarea.setSelectionRange(0, 0);
                        }
                    }
                }
            }

            if (e.key === "ArrowLeft") {
                if (textarea.selectionStart === 0) {
                    const currentItem = textarea.closest('[id^="edit-item-"]');
                    if (!currentItem) return;

                    const itemsContainer = currentItem.parentElement;
                    const items = Array.from(itemsContainer.querySelectorAll('[id^="edit-item-"]'));
                    const currentIndex = items.indexOf(currentItem);

                    if (currentIndex > 0) {
                        e.preventDefault();
                        const prevItem = items[currentIndex - 1];
                        const prevTextarea = prevItem.querySelector('textarea');
                        if (prevTextarea) {
                            prevTextarea.focus();
                            prevTextarea.setSelectionRange(prevTextarea.value.length, prevTextarea.value.length);
                        }
                    }
                }
            }

            if (e.key === "ArrowRight") {
                if (textarea.selectionStart === textarea.value.length) {
                    const currentItem = textarea.closest('[id^="edit-item-"]');
                    if (!currentItem) return;

                    const itemsContainer = currentItem.parentElement;
                    const items = Array.from(itemsContainer.querySelectorAll('[id^="edit-item-"]'));
                    const currentIndex = items.indexOf(currentItem);

                    if (currentIndex < items.length - 1) {
                        e.preventDefault();
                        const nextItem = items[currentIndex + 1];
                        const nextTextarea = nextItem.querySelector('textarea');
                        if (nextTextarea) {
                            nextTextarea.focus();
                            nextTextarea.setSelectionRange(0, 0);
                        }
                    }
                }
            }
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "item-delete-btn";
        deleteBtn.textContent = "✕";
        deleteBtn.addEventListener("click", () => {
            item.remove();
            delete this.editInputs[idx];
            delete this.editTimestamps[idx];
        });

        this.editInputs[idx] = textarea;
        this.editTimestamps[idx] = { date: dateInput, time: timeInput };

        item.appendChild(timestampContainer);
        item.appendChild(textarea);
        item.appendChild(deleteBtn);
        container.appendChild(item);

        adjustHeight();
    }

    saveEditedTranscript() {
        const editItems = document.querySelectorAll('[id^="edit-item-"]');

        const updatedData = {};
        const session = this.app.sessionManager.getCurrentSession();
        const sessionStartTime = session && session.startTime ? session.startTime : Date.now();

        let hasError = false;
        let errorMsg = "";

        const dateTimeToSeconds = (dateStr, timeStr) => {
            if (!dateStr || !timeStr) return 0;

            const [y, m, d] = dateStr.split('-').map(Number);
            const [h, mi, s] = timeStr.split(':').map(Number);
            const inputDate = new Date(y, m - 1, d, h, mi, s);

            const relativeSeconds = Math.floor((inputDate.getTime() - sessionStartTime) / 1000);
            return Math.max(0, relativeSeconds);
        };

        editItems.forEach((item) => {
            const timestampContainer = item.querySelector('div[style*="display: flex"]');
            if (timestampContainer) {
                const inputs = timestampContainer.querySelectorAll('input[type="text"]');
                if (inputs.length >= 2) {
                    const dateInput = inputs[0];
                    const timeInput = inputs[1];
                    const dateStr = dateInput.value.trim();
                    const timeStr = timeInput.value.trim();

                    if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                        hasError = true;
                        errorMsg = `Invalid date format: "${dateStr}". Use YYYY-MM-DD`;
                        dateInput.style.borderColor = "#d32f2f";
                        return;
                    }

                    if (dateStr) {
                        const [y, m, d] = dateStr.split('-').map(Number);
                        const date = new Date(y, m - 1, d);
                        if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
                            hasError = true;
                            errorMsg = `Invalid date: "${dateStr}"`;
                            dateInput.style.borderColor = "#d32f2f";
                            return;
                        }
                    }

                    if (timeStr && !/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) {
                        hasError = true;
                        errorMsg = `Invalid time format: "${timeStr}". Use HH:MM:SS`;
                        timeInput.style.borderColor = "#d32f2f";
                        return;
                    }

                    if (timeStr) {
                        const [h, m, s] = timeStr.split(':').map(Number);
                        if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) {
                            hasError = true;
                            errorMsg = "Invalid time: hours 00-23, minutes 00-59, seconds 00-59";
                            timeInput.style.borderColor = "#d32f2f";
                            return;
                        }
                    }
                }
            }
        });

        if (hasError) {
            this.app.showStatusMessage(errorMsg, 2500);
            return;
        }

        let itemIndex = 0;
        editItems.forEach((item) => {
            const textarea = item.querySelector('textarea');
            const timestampContainer = item.querySelector('div[style*="display: flex"]');

            const text = textarea ? textarea.value.trim() : '';
            if (text.length > 0) {
                let timestamp = 0;

                if (timestampContainer) {
                    const inputs = timestampContainer.querySelectorAll('input[type="text"]');
                    if (inputs.length >= 2) {
                        const dateStr = inputs[0].value.trim();
                        const timeStr = inputs[1].value.trim();
                        timestamp = dateTimeToSeconds(dateStr, timeStr);
                    }
                }

                updatedData[itemIndex] = {
                    text: text,
                    timestamp: timestamp,
                    source: 'edited'
                };
                itemIndex++;
            }
        });

        if (Object.keys(updatedData).length === 0) {
            this.app.showStatusMessage("Transcript cannot be empty", 1500);
            return;
        }

        this.app.recordingManager.setTranscriptData(updatedData);
        const currentSession = this.app.sessionManager.getCurrentSession();
        if (currentSession) {
            currentSession.transcripts = updatedData;
            this.app.sessionManager.saveSessions();
            this.app.sessionManager.updateLastTextModified(this.app.sessionManager.currentSessionId);
        }
        if (this.app.panelManager) {
            this.app.panelManager.setTranscriptData(updatedData);
        }

        this.app.updateDisplay();

        if (this.app.translationEnabled && this.app.translationManager) {
            this.app.translationManager.retranslateAll();
        }

        this.app.saveToSession();
        this.app.showStatusMessage("Transcript updated", 1500);

        this.app.setEditModalVisibility(false);

        this.editInputs = null;
        this.editTimestamps = null;
        this.editItems = null;
    }
}

window.TranscriptEditDialogManager = TranscriptEditDialogManager;
