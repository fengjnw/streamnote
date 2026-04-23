/**
 * KeywordDisplayCollection - Handles keyword list rendering, collection state, and utility operations.
 * Consolidates display rendering, keyword collection management, and scrolling utilities.
 */
class KeywordDisplayCollection {
    constructor(keywordManager) {
        this.keywordManager = keywordManager;
    }

    // ========== Display Methods ==========

    displayItemList(items, containerElement, deleteHandlerName, emptyMessage = "No items", showAddHighlightBtn = false, showDeleteBtn = true) {
        if (!containerElement) {
            return;
        }

        if (items.length === 0) {
            containerElement.innerHTML = `<p class="placeholder">${emptyMessage}</p>`;
            return;
        }

        const html = `
            <div class="keywords-items">
                ${items.map((item, index) => {
            const escapedItem = item.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

            const isHighlighted = showAddHighlightBtn && this.keywordManager.highlights?.includes(item);
            const btnClass = isHighlighted ? "keyword-highlight-toggle-btn active" : "keyword-highlight-toggle-btn";
            const highlightTooltip = isHighlighted ? "Remove from highlights" : "Add to highlights";

            return `
                    <div class="keyword-item-wrapper" data-keyword="${index}" title="${this.escapeHtml(item)}">
                        <div class="keyword-item">
                            <span class="keyword-text" onclick="window.keywordManagerInstance.scrollToKeyword('${escapedItem}')">
                                ${this.escapeHtml(item)}
                            </span>
                            ${showAddHighlightBtn ? `<button class="${btnClass}" onclick="window.keywordManagerInstance.toggleExtractedKeywordHighlight('${escapedItem}')" title="${highlightTooltip}"><i data-feather="flag"></i></button>` : ""}
                            <button class="keyword-explain-btn" onclick="window.keywordManagerInstance.openExplanationForWord('${escapedItem}')" title="Open explanation"><i data-feather="book-open"></i></button>
                            ${showDeleteBtn ? `<button class="keyword-delete-btn" onclick="window.keywordManagerInstance.${deleteHandlerName}('${escapedItem}')" title="Remove item"><i data-feather="trash-2"></i></button>` : ""}
                        </div>
                    </div>
                `;
        }).join("")}
            </div>
        `;

        containerElement.innerHTML = html;

        // Re-initialize Feather Icons for newly rendered elements
        if (window.feather) {
            window.feather.replace();
        }
    }

    escapeHtml(text) {
        const map = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };
        return text.replace(/[&<>"']/g, (char) => map[char]);
    }

    displayKeywordsList(keywords, targetElement = null) {
        const element = targetElement || this.keywordManager.keywordElement;
        const uniqueKeywords = [...new Set(keywords)];
        this.displayItemList(uniqueKeywords, element, "deleteKeywordItem", "No keywords detected");
    }

    displayHighlights() {
        const element = document.getElementById("manual-keywords-display");
        if (!element) return;
        const uniqueKeywords = [...new Set(this.keywordManager.highlights)];
        this.displayItemList(uniqueKeywords, element, "deleteKeywordItem", "Select text to highlight and add to this panel");
    }

    displayExtracts() {
        const element = document.getElementById("auto-keywords-display");
        if (!element) return;

        const scrollPosition = element.scrollTop;

        const uniqueKeywords = [...new Set(this.keywordManager.extracts)];
        this.displayItemList(uniqueKeywords, element, "deleteKeywordItem", "Click Refresh to extract keywords from your transcription", true, false);

        element.scrollTop = scrollPosition;
    }

    updateAllKeywordDisplays() {
        this.displayHighlights();
        this.displayExtracts();
    }

    // ========== Collection Management Methods ==========

    addToExplanations(term) {
        term = term.trim();
        if (!term) return;

        // Move term to front (dedupe + recency ordering).
        this.keywordManager.explanations = this.keywordManager.explanations.filter(t => t !== term);
        this.keywordManager.explanations.unshift(term);

        if (this.keywordManager.explanations.length > 20) {
            this.keywordManager.explanations = this.keywordManager.explanations.slice(0, 20);
        }

        if (window.streamNoteInstance) {
            window.streamNoteInstance.sessionManager?.updateCurrentExplanations(this.keywordManager.explanations);
            window.streamNoteInstance.saveSettingsToSession();
        }
    }

    removeFromExplanations(term) {
        this.keywordManager.explanations = this.keywordManager.explanations.filter(t => t !== term);

        if (window.streamNoteInstance) {
            window.streamNoteInstance.sessionManager?.updateCurrentExplanations(this.keywordManager.explanations);
            window.streamNoteInstance.saveSettingsToSession();
        }
    }

    deleteKeywordItem(keyword) {
        if (window.streamNoteInstance) {
            window.streamNoteInstance.deleteKeyword(keyword);
        }
    }

    toggleExtractedKeywordHighlight(keyword) {
        if (!this.keywordManager.highlightManager) {
            this.keywordManager.onStatusMessage('Highlight manager not available', 1500);
            return;
        }

        if (!keyword) {
            this.keywordManager.onStatusMessage('No keyword to toggle', 1500);
            return;
        }

        // Toggle only affects manual highlight collection; extracted list remains intact.
        this.keywordManager.highlightManager.toggleHighlight(keyword);
        this.keywordManager.displayExtracts();
        this.keywordManager.displayHighlights();
    }

    async processText(text) {
        const keywords = await this.keywordManager.extractKeywords(text);

        if (keywords.length > 0) {
            this.keywordManager.extracts = [...new Set([...this.keywordManager.extracts, ...keywords])];
        }

        return keywords;
    }

    reset() {
        this.keywordManager.currentKeywords = [];
        this.keywordManager.explanations = [];
        this.keywordManager.highlights = [];
        this.keywordManager.extracts = [];

        if (this.keywordManager.keywordElement) {
            this.keywordManager.keywordElement.innerHTML = '';
        }
    }

    // ========== Utility Methods ==========

    scrollToKeyword(keyword) {
        const sourcePanel = this.keywordManager.wordSourcePanel[keyword] || 'transcript';

        if (window.streamNoteInstance && window.streamNoteInstance.scrollToWord) {
            window.streamNoteInstance.scrollToWord(keyword, sourcePanel);
        }
    }

    setHighlightPositions(positions) {
        this.keywordManager.highlightPositions = positions || {};
    }
}

window.KeywordDisplayCollection = KeywordDisplayCollection;
