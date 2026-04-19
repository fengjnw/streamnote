/**
 * KeywordDisplayManager - handles keyword list rendering in different keyword panels.
 */
class KeywordDisplayManager {
    constructor(keywordManager) {
        this.keywordManager = keywordManager;
    }

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
}

window.KeywordDisplayManager = KeywordDisplayManager;
