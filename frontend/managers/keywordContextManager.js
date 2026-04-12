/**
 * KeywordContextManager - handles keyword context extraction and context display rendering.
 */
class KeywordContextManager {
    constructor(keywordManager) {
        this.keywordManager = keywordManager;
        this.builderManager = new KeywordContextBuilderManager(keywordManager);
        this.extractionManager = new KeywordContextExtractionManager(keywordManager);
    }

    extractContextByPosition(positionInfo, contextLength = 100) {
        return this.extractionManager?.extractContextByPosition(positionInfo, contextLength) || "";
    }

    extractKeywordContext(keyword, fullText, contextLength = 100) {
        return this.extractionManager?.extractKeywordContext(keyword, fullText, contextLength) || "";
    }

    getContextForKeyword(keyword) {
        return this.extractionManager?.getContextForKeyword(keyword) || "";
    }

    highlightKeywordInText(text, keyword) {
        return this.builderManager?.highlightKeywordInText(text, keyword) || text;
    }

    updateWordContext(keyword) {
        const contextDiv = document.getElementById("word-context");
        const contextText = document.getElementById("context-text");

        if (!contextDiv || !contextText) return null;

        let displayContext = "";

        if (this.keywordManager.currentContextPositionInfo && this.keywordManager.currentContextWord === keyword) {
            displayContext = this._buildContextByPosition(this.keywordManager.currentContextPositionInfo, keyword, 50);
        } else if (this.keywordManager.highlightPositions && this.keywordManager.highlightPositions[keyword]) {
            const positionInfo = this.keywordManager.highlightPositions[keyword];
            displayContext = this._buildContextByPosition(positionInfo, keyword, 50);
        } else {
            displayContext = this._buildContextBySearch(keyword, 50);
        }

        if (displayContext) {
            contextText.innerHTML = displayContext;
            contextDiv.style.display = 'block';
        } else {
            contextDiv.style.display = 'none';
        }

        return displayContext;
    }

    _buildContextByPosition(positionInfo, keyword, contextLength = 50) {
        return this.builderManager?._buildContextByPosition(positionInfo, keyword, contextLength) || "";
    }

    _buildContextBySearch(keyword, contextLength = 50) {
        return this.builderManager?._buildContextBySearch(keyword, contextLength) || "";
    }
}

window.KeywordContextManager = KeywordContextManager;
