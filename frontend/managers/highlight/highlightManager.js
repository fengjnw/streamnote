

class HighlightManager {
    constructor(config = {}) {
        this.keywordManager = config.keywordManager || null;
        this.translationManager = config.translationManager || null;
        this.recordingManager = config.recordingManager || null;
        this.sessionManager = config.sessionManager || null;

        this.onStatusMessage = config.onStatusMessage || (() => { });
        this.getTranscriptData = config.getTranscriptData || (() => ({}));

        this.highlightIdMap = config.highlightIdMap || {};

        this.highlightPositions = config.highlightPositions || {};

        this.temporaryHighlights = {};

        this.currentTemporaryWord = null;
    }

    normalizeHighlightText(text) {
        if (!text) return "";
        let cleanedText = text.trim();
        cleanedText = cleanedText.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').trim();
        cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
        return cleanedText;
    }

    generateHighlightId(prefix = "hl") {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    persistHighlightState() {
        this.keywordManager?.updateAllKeywordDisplays();
        this.sessionManager?.updateCurrentHighlights(this.keywordManager?.highlights || []);
        this.sessionManager?.updateCurrentKeywords(this.keywordManager?.extracts || []);
        this.sessionManager?.updateHighlightPositions(this.highlightPositions);

        // Keep header counters in sync after any highlight add/remove/commit action.
        window.streamNoteInstance?.updateSessionStats?.();
    }

    syncHighlightPositionsToKeywordManager() {
        if (this.keywordManager?.setHighlightPositions) {
            this.keywordManager.setHighlightPositions(this.highlightPositions);
        }
    }

    removeHighlightMarkupById(highlightId) {
        if (!highlightId) return;

        const transcriptDiv = document.getElementById("transcript");
        if (transcriptDiv) {
            const highlights = transcriptDiv.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
            highlights.forEach(span => {
                const textNode = document.createTextNode(span.textContent);
                span.parentNode.replaceChild(textNode, span);
            });
            this.mergeAdjacentTextNodes(transcriptDiv);
        }

        const translationDiv = document.getElementById("translation");
        if (translationDiv) {
            const highlights = translationDiv.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
            highlights.forEach(span => {
                const textNode = document.createTextNode(span.textContent);
                span.parentNode.replaceChild(textNode, span);
            });
            this.mergeAdjacentTextNodes(translationDiv);
        }
    }

    replaceHighlightIdInContainer(containerId, oldId, newId, newClassName) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const spans = container.querySelectorAll(`[data-highlight-id="${oldId}"]`);
        spans.forEach(span => {
            span.setAttribute("data-highlight-id", newId);
            if (newClassName) {
                span.className = newClassName;
            }
        });
    }

    addSelectedTextAsHighlight(selectedText) {
        if (!selectedText || !this.keywordManager) return;

        const highlightText = this.normalizeHighlightText(selectedText);

        if (!highlightText) {
            this.onStatusMessage("No valid text to highlight", 1500);
            return;
        }

        if (this.keywordManager.highlights.includes(highlightText)) {
            this.onStatusMessage("This highlight already exists", 1500);
            return;
        }

        const highlightId = this.generateHighlightId();

        this.keywordManager.highlights.push(highlightText);

        this.highlightIdMap[highlightText] = highlightId;

        this.highlightTextInTranscript(highlightText, highlightId);

        this.persistHighlightState();

        this.onStatusMessage(`✓ Highlighted "${highlightText}"`, 1500);

        this.updateExplanationPanelHighlightButton(highlightText);

        return highlightText;
    }

    addSelectedTextAsHighlightWithRange(selectedText, range) {
        if (!selectedText || !range || !this.keywordManager) return;

        const highlightText = this.normalizeHighlightText(selectedText);

        if (!highlightText) {
            this.onStatusMessage("No valid text to highlight", 1500);
            return;
        }

        if (this.keywordManager.highlights.includes(highlightText)) {
            this.onStatusMessage("This highlight already exists", 1500);
            return;
        }

        const highlightId = this.generateHighlightId();

        this.keywordManager.highlights.push(highlightText);

        this.highlightIdMap[highlightText] = highlightId;

        const positionInfo = this.extractPositionFromRange(range);
        if (positionInfo) {
            this.highlightPositions[highlightText] = positionInfo;
            this.syncHighlightPositionsToKeywordManager();
        }

        this.highlightRangeDirectly(range, highlightId);

        window.getSelection().removeAllRanges();

        this.persistHighlightState();

        this.onStatusMessage(`✓ Highlighted "${highlightText}"`, 1500);

        this.updateExplanationPanelHighlightButton(highlightText);

        return highlightText;
    }

    addHighlightFromContextPosition(highlightText, positionInfo) {
        if (!highlightText || !positionInfo || !positionInfo.sourceIndices) {
            this.onStatusMessage("Cannot highlight: invalid position info", 1500);
            return false;
        }

        const cleanedText = this.normalizeHighlightText(highlightText);

        if (!cleanedText) {
            this.onStatusMessage("No valid text to highlight", 1500);
            return false;
        }

        if (this.keywordManager.highlights.includes(cleanedText)) {
            this.onStatusMessage("This highlight already exists", 1500);
            return false;
        }

        const highlightId = this.generateHighlightId();

        this.keywordManager.highlights.push(cleanedText);

        this.highlightIdMap[cleanedText] = highlightId;

        this.highlightPositions[cleanedText] = {
            sourceIndices: positionInfo.sourceIndices,
            container: positionInfo.container || 'transcript'
        };

        this.syncHighlightPositionsToKeywordManager();

        const container = positionInfo.container || 'transcript';

        if (container === 'translation') {
            this.highlightTextInTranslation(cleanedText, highlightId);
        } else {
            this.highlightTextInTranscript(cleanedText, highlightId);
        }

        this.persistHighlightState();

        this.onStatusMessage(`✓ Highlighted "${cleanedText}"`, 1500);

        this.updateExplanationPanelHighlightButton(cleanedText);

        return true;
    }

    updateExplanationPanelHighlightButton(highlightedWord) {
        this.updateExplanationPanelHighlightButtonState(highlightedWord, true);
    }

    updateExplanationPanelHighlightButtonState(word, isHighlighted) {
        const currentWordEl = document.getElementById("current-explanation-word");
        if (!currentWordEl) return;

        const currentWord = currentWordEl.textContent?.trim();
        if (!currentWord) return;

        if (currentWord.toLowerCase() === word.toLowerCase()) {
            if (window.streamNoteInstance && window.streamNoteInstance.updateHighlightButtonState) {
                window.streamNoteInstance.updateHighlightButtonState(word, isHighlighted);
            }
        }
    }

    highlightRangeDirectly(range, highlightId) {
        if (!range || !highlightId) return;

        const rootNode = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
            ? range.commonAncestorContainer.parentNode
            : range.commonAncestorContainer;

        const rangeNodes = [];
        const walker = document.createTreeWalker(
            rootNode,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            const nodeRange = document.createRange();
            nodeRange.selectNodeContents(node);

            if (range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > -1 &&
                range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 1) {
                rangeNodes.push(node);
            }
        }

        rangeNodes.forEach((node) => {
            let startOffset = 0;
            let endOffset = node.textContent.length;

            if (node === range.startContainer) {
                startOffset = range.startOffset;
            }

            if (node === range.endContainer) {
                endOffset = range.endOffset;
            }

            if (startOffset < endOffset) {
                this._highlightNodePortion(node, startOffset, endOffset, highlightId);
            }
        });
    }

    extractPositionFromRangePublic(range) {
        return this.extractPositionFromRange(range);
    }

    extractPositionFromRange(range, containerSelector = null) {
        if (!range) return null;

        let container = null;
        if (containerSelector) {
            container = document.querySelector(containerSelector);
        } else {
            const startContainer = range.startContainer;
            const endContainer = range.endContainer;

            let node = startContainer;
            while (node && node.nodeType !== Node.DOCUMENT_NODE) {
                if (node.id === 'transcript') {
                    container = node;
                    break;
                }
                if (node.id === 'translation') {
                    container = node;
                    break;
                }
                node = node.parentNode;
            }

            if (!container) {
                node = endContainer;
                while (node && node.nodeType !== Node.DOCUMENT_NODE) {
                    if (node.id === 'transcript') {
                        container = node;
                        break;
                    }
                    if (node.id === 'translation') {
                        container = node;
                        break;
                    }
                    node = node.parentNode;
                }
            }
        }

        if (!container) {
            container = document.getElementById("transcript");
        }

        if (!container) return null;

        const sourceIndices = new Set();

        const paragraphs = container.querySelectorAll('p[data-index]');

        paragraphs.forEach(para => {
            const paraRange = document.createRange();
            paraRange.selectNode(para);

            if (range.compareBoundaryPoints(Range.START_TO_END, paraRange) >= 0 &&
                range.compareBoundaryPoints(Range.END_TO_START, paraRange) <= 0) {

                const dataIndex = para.getAttribute('data-index');
                if (dataIndex !== null) {
                    sourceIndices.add(parseInt(dataIndex));
                }
            }
        });

        if (sourceIndices.size === 0) return null;

        return {
            sourceIndices: Array.from(sourceIndices).sort((a, b) => a - b),
            container: container.id
        };
    }

    highlightTextInTranscript(text, highlightId) {
        if (!text || !highlightId) return;

        const transcriptDiv = document.getElementById("transcript");
        if (!transcriptDiv) return;

        const positionInfo = this.highlightPositions[text];

        if (positionInfo && positionInfo.sourceIndices) {
            this._highlightInTranscriptByIndices(transcriptDiv, text, positionInfo.sourceIndices, highlightId);
        } else {
            this._highlightInTranscriptBySearch(transcriptDiv, text, highlightId);
        }
    }

    /**
     * @private
     */
    _highlightInTranscriptByIndices(transcriptDiv, text, sourceIndices, highlightId) {
        const preciseResults = this.getTranscriptData();

        const sortedIndices = sourceIndices.sort((a, b) => a - b);
        const sortedKeys = Object.keys(preciseResults).sort((a, b) => parseInt(a) - parseInt(b));

        const segmentTexts = sortedIndices.map(idx => {
            const sourceText = preciseResults[sortedKeys[idx]]?.text || "";
            return sourceText.trim();
        });

        // Build a virtual contiguous string, then map the match span back to paragraph-local offsets.
        const virtualText = segmentTexts.join(" ");

        const lowerVirtualText = virtualText.toLowerCase();
        const lowerText = text.toLowerCase();
        const matchPos = lowerVirtualText.indexOf(lowerText);

        if (matchPos === -1) return;

        const textPositionMap = [];
        let currentPos = 0;
        segmentTexts.forEach((segmentText, mapIdx) => {
            const startInVirtual = currentPos;
            const endInVirtual = currentPos + segmentText.length;
            textPositionMap.push({
                startInVirtual,
                endInVirtual,
                sourceIndex: sortedIndices[mapIdx],
                segmentText
            });
            currentPos = endInVirtual + 1; // +1 for separator
        });

        const matchEnd = matchPos + text.length;
        const affectedSegments = [];

        textPositionMap.forEach(mapping => {
            if (mapping.startInVirtual < matchEnd && mapping.endInVirtual > matchPos) {
                const startInSegment = Math.max(0, matchPos - mapping.startInVirtual);
                const endInSegment = Math.min(mapping.segmentText.length, matchEnd - mapping.startInVirtual);

                affectedSegments.push({
                    sourceIndex: mapping.sourceIndex,
                    startInSegment,
                    endInSegment
                });
            }
        });

        affectedSegments.forEach(segment => {
            const key = sortedKeys[segment.sourceIndex];
            const paragraph = transcriptDiv.querySelector(`p[data-index="${key}"]`);
            if (!paragraph) return;

            const range = this._createRangeInParagraph(paragraph, segment.startInSegment, segment.endInSegment);
            if (range) {
                this.highlightRangeDirectly(range, highlightId);
            }
        });
    }

    /**
     * @private
     */
    _highlightInTranscriptBySearch(transcriptDiv, text, highlightId) {
        const preciseResults = this.getTranscriptData();
        const sortedKeys = Object.keys(preciseResults)
            .sort((a, b) => parseInt(a) - parseInt(b));

        const sourceTexts = sortedKeys.map(key => {
            let sourceText = preciseResults[key]?.text || "";
            sourceText = sourceText.trim();
            sourceText = sourceText.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').trim();
            sourceText = sourceText.replace(/\s+/g, ' ').trim();
            return sourceText;
        });

        let virtualFullText = sourceTexts.join(" ");

        const textPositionMap = [];
        let currentPos = 0;
        sourceTexts.forEach((sourceText, idx) => {
            const startInVirtual = currentPos;
            const endInVirtual = currentPos + sourceText.length;
            textPositionMap.push({
                startInVirtual,
                endInVirtual,
                sourceIndex: idx,
                sourceText
            });
            currentPos = endInVirtual + 1;
        });

        const lowerVirtualText = virtualFullText.toLowerCase();
        const lowerText = text.toLowerCase();
        const matchPos = lowerVirtualText.indexOf(lowerText);

        if (matchPos === -1) return;

        const matchEnd = matchPos + text.length;

        const affectedSources = [];

        textPositionMap.forEach(mapping => {
            if (mapping.startInVirtual < matchEnd && mapping.endInVirtual > matchPos) {
                const startInSource = Math.max(0, matchPos - mapping.startInVirtual);
                const endInSource = Math.min(mapping.sourceText.length, matchEnd - mapping.startInVirtual);

                affectedSources.push({
                    sourceIndex: mapping.sourceIndex,
                    startInSource,
                    endInSource
                });
            }
        });

        affectedSources.forEach(source => {
            const key = sortedKeys[source.sourceIndex];
            const paragraph = transcriptDiv.querySelector(`p[data-index="${key}"]`);
            if (!paragraph) return;

            const range = this._createRangeInParagraph(paragraph, source.startInSource, source.endInSource);
            if (range) {
                this.highlightRangeDirectly(range, highlightId);
            }
        });
    }

    highlightTextInTranslation(text, highlightId) {
        if (!text || !highlightId) return;

        const translationDiv = document.getElementById("translation");
        if (!translationDiv) return;

        const positionInfo = this.highlightPositions[text];

        if (positionInfo && positionInfo.sourceIndices) {
            this._highlightInTranslationByIndices(translationDiv, text, positionInfo.sourceIndices, highlightId);
        } else {
            this._highlightInTranslationBySearch(translationDiv, text, highlightId);
        }
    }

    /**
     * @private
     */
    _highlightInTranslationByIndices(translationDiv, text, sourceIndices, highlightId) {
        const translationData = this.translationManager.getTranslationData();

        const sortedIndices = sourceIndices.sort((a, b) => a - b);

        const segmentTexts = sortedIndices.map(idx => {
            const translation = translationData[idx];
            return translation ? translation.trim() : "";
        });

        // Use the same virtual-text mapping strategy as transcript to support multi-paragraph matches.
        const virtualText = segmentTexts.join(" ");

        const lowerVirtualText = virtualText.toLowerCase();
        const lowerText = text.toLowerCase();
        const matchPos = lowerVirtualText.indexOf(lowerText);

        if (matchPos === -1) return;

        const textPositionMap = [];
        let currentPos = 0;
        segmentTexts.forEach((segmentText, mapIdx) => {
            const startInVirtual = currentPos;
            const endInVirtual = currentPos + segmentText.length;
            textPositionMap.push({
                startInVirtual,
                endInVirtual,
                sourceIndex: sortedIndices[mapIdx],
                segmentText
            });
            currentPos = endInVirtual + 1; // +1 for separator
        });

        const matchEnd = matchPos + text.length;
        const affectedSegments = [];

        textPositionMap.forEach(mapping => {
            if (mapping.startInVirtual < matchEnd && mapping.endInVirtual > matchPos) {
                const startInSegment = Math.max(0, matchPos - mapping.startInVirtual);
                const endInSegment = Math.min(mapping.segmentText.length, matchEnd - mapping.startInVirtual);

                affectedSegments.push({
                    sourceIndex: mapping.sourceIndex,
                    startInSegment,
                    endInSegment
                });
            }
        });

        affectedSegments.forEach(segment => {
            const paragraph = translationDiv.querySelector(`p[data-index="${segment.sourceIndex}"]`);
            if (!paragraph) return;

            const range = this._createRangeInParagraph(paragraph, segment.startInSegment, segment.endInSegment);
            if (range) {
                this.highlightRangeDirectly(range, highlightId);
            }
        });
    }

    /**
     * @private
     */
    _createRangeInParagraph(paragraph, startOffset, endOffset) {
        const textNodes = [];
        const walker = document.createTreeWalker(
            paragraph,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        if (textNodes.length === 0) return null;

        let currentPos = 0;
        let startNode = null;
        let startNodeOffset = 0;
        let endNode = null;
        let endNodeOffset = 0;

        for (let i = 0; i < textNodes.length; i++) {
            const nodeLength = textNodes[i].textContent.length;

            if (currentPos <= startOffset && startOffset < currentPos + nodeLength && !startNode) {
                startNode = textNodes[i];
                startNodeOffset = startOffset - currentPos;
            }

            if (currentPos <= endOffset && endOffset <= currentPos + nodeLength) {
                endNode = textNodes[i];
                endNodeOffset = endOffset - currentPos;
                break;
            }

            currentPos += nodeLength;
        }

        if (!startNode || !endNode) return null;

        const range = document.createRange();
        try {
            range.setStart(startNode, startNodeOffset);
            range.setEnd(endNode, endNodeOffset);
            return range;
        } catch {
            return null;
        }
    }

    /**
     * @private
     */
    _highlightInTranslationBySearch(translationDiv, text, highlightId) {
        const translationData = this.translationManager.getTranslationData();
        const preciseResults = this.getTranscriptData();
        const sortedKeys = Object.keys(preciseResults)
            .sort((a, b) => parseInt(a) - parseInt(b));

        const translationTexts = sortedKeys.map(key => {
            const translation = translationData[key];
            return translation ? translation.trim() : "";
        });

        let virtualFullText = translationTexts.join(" ");

        const textPositionMap = [];
        let currentPos = 0;
        translationTexts.forEach((translationText, idx) => {
            const startInVirtual = currentPos;
            const endInVirtual = currentPos + translationText.length;
            textPositionMap.push({
                startInVirtual,
                endInVirtual,
                sourceIndex: idx,
                translationText
            });
            currentPos = endInVirtual + 1;
        });

        const lowerVirtualText = virtualFullText.toLowerCase();
        const lowerText = text.toLowerCase();
        const matchPos = lowerVirtualText.indexOf(lowerText);

        if (matchPos === -1) return;

        const matchEnd = matchPos + text.length;

        const affectedSources = [];

        textPositionMap.forEach(mapping => {
            if (mapping.startInVirtual < matchEnd && mapping.endInVirtual > matchPos) {
                const startInSource = Math.max(0, matchPos - mapping.startInVirtual);
                const endInSource = Math.min(mapping.translationText.length, matchEnd - mapping.startInVirtual);

                affectedSources.push({
                    sourceIndex: mapping.sourceIndex,
                    startInSource,
                    endInSource
                });
            }
        });

        affectedSources.forEach(source => {
            const key = sortedKeys[source.sourceIndex];
            const paragraph = translationDiv.querySelector(`p[data-index="${key}"]`);
            if (!paragraph) return;

            const range = this._createRangeInParagraph(paragraph, source.startInSource, source.endInSource);
            if (range) {
                this.highlightRangeDirectly(range, highlightId);
            }
        });
    }

    /**
     * @private
     */
    _highlightNodePortion(textNode, startIdx, endIdx, highlightId) {
        const nodeText = textNode.textContent;
        if (startIdx < 0 || endIdx > nodeText.length || startIdx >= endIdx) return;

        const beforeText = nodeText.substring(0, startIdx);
        const highlightText = nodeText.substring(startIdx, endIdx);
        const afterText = nodeText.substring(endIdx);

        const span = document.createElement("span");
        span.className = "text-highlight";
        span.setAttribute("data-highlight-id", highlightId);
        span.textContent = highlightText;

        const beforeNode = beforeText ? document.createTextNode(beforeText) : null;
        const afterNode = afterText ? document.createTextNode(afterText) : null;

        if (beforeNode) {
            textNode.parentNode.insertBefore(beforeNode, textNode);
        }
        textNode.parentNode.insertBefore(span, textNode);
        if (afterNode) {
            textNode.parentNode.insertBefore(afterNode, textNode);
        }
        textNode.parentNode.removeChild(textNode);
    }

    removeHighlightFromTranscript(text) {
        if (!text) return;

        if (this.highlightIdMap && this.highlightIdMap[text]) {
            const highlightId = this.highlightIdMap[text];

            this.removeHighlightMarkupById(highlightId);

            delete this.highlightIdMap[text];

            if (this.highlightPositions && this.highlightPositions[text]) {
                delete this.highlightPositions[text];
            }

            if (this.sessionManager) {
                this.sessionManager.updateHighlightPositions(this.highlightPositions);
            }
        }
    }

    removeHighlightFromList(text) {
        if (!text || !this.keywordManager) return false;

        const index = this.keywordManager.highlights.indexOf(text);
        if (index === -1) return false;

        this.keywordManager.highlights.splice(index, 1);

        this.removeHighlightFromTranscript(text);

        this.persistHighlightState();

        this.updateExplanationPanelHighlightButtonState(text, false);

        return true;
    }

    toggleHighlight(text) {
        if (!text || !this.keywordManager) return false;

        const cleanedText = this.normalizeHighlightText(text);

        if (!cleanedText) return false;

        const isHighlighted = this.keywordManager.highlights.includes(cleanedText);

        if (isHighlighted) {
            this.removeHighlightFromList(cleanedText);
            this.onStatusMessage(`✓ Removed "${cleanedText}" from highlights`, 1500);
            return false;
        } else {
            this.addSelectedTextAsHighlight(cleanedText);
            return true;
        }
    }

    mergeAdjacentTextNodes(element) {
        let merged = true;
        while (merged) {
            merged = false;
            const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let node;
            while (node = walker.nextNode()) {
                if (node.nextSibling && node.nextSibling.nodeType === Node.TEXT_NODE) {
                    node.textContent += node.nextSibling.textContent;
                    node.parentNode.removeChild(node.nextSibling);
                    merged = true;
                    break;
                }
            }
        }
    }

    reapplyAllHighlights() {
        if (!this.keywordManager) return;

        const transcriptDiv = document.getElementById("transcript");
        const translationDiv = document.getElementById("translation");

        if (transcriptDiv) {
            const highlights = transcriptDiv.querySelectorAll(".text-highlight");
            highlights.forEach(span => {
                const textNode = document.createTextNode(span.textContent);
                span.parentNode.replaceChild(textNode, span);
            });
            this.mergeAdjacentTextNodes(transcriptDiv);
        }

        if (translationDiv) {
            const highlights = translationDiv.querySelectorAll(".text-highlight");
            highlights.forEach(span => {
                const textNode = document.createTextNode(span.textContent);
                span.parentNode.replaceChild(textNode, span);
            });
            this.mergeAdjacentTextNodes(translationDiv);
        }

        this.keywordManager.highlights.forEach(text => {
            if (!this.highlightIdMap[text]) {
                this.highlightIdMap[text] = "hl-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
            }
        });

        this.keywordManager.highlights.forEach(text => {
            this.highlightTextInTranscript(text, this.highlightIdMap[text]);
            this.highlightTextInTranslation(text, this.highlightIdMap[text]);
        });
    }

    setHighlightIdMap(map) {
        this.highlightIdMap = { ...map };
    }

    clearTemporaryHighlight() {
        if (!this.currentTemporaryWord) return;

        const word = this.currentTemporaryWord;
        const tempInfo = this.temporaryHighlights[word];

        if (tempInfo && tempInfo.highlightId) {
            const tempId = tempInfo.highlightId;
            this.removeHighlightMarkupById(tempId);
        }

        delete this.temporaryHighlights[word];
        this.currentTemporaryWord = null;
    }

    commitTemporaryHighlight(word) {
        if (!word) return false;

        const cleanedWord = this.normalizeHighlightText(word);

        if (!cleanedWord) return false;

        const tempInfo = this.temporaryHighlights[cleanedWord];
        if (!tempInfo) return false;

        if (this.keywordManager?.highlights.includes(cleanedWord)) {
            this.onStatusMessage("This highlight already exists", 1500);
            return false;
        }

        const permanentHighlightId = this.generateHighlightId();

        const tempId = tempInfo.highlightId;
        const positionInfo = tempInfo.positionInfo;

        this.replaceHighlightIdInContainer("transcript", tempId, permanentHighlightId, "text-highlight");
        this.replaceHighlightIdInContainer("translation", tempId, permanentHighlightId, "text-highlight");

        if (this.keywordManager) {
            this.keywordManager.highlights.push(cleanedWord);
        }

        this.highlightIdMap[cleanedWord] = permanentHighlightId;
        this.highlightPositions[cleanedWord] = positionInfo;

        this.syncHighlightPositionsToKeywordManager();

        delete this.temporaryHighlights[cleanedWord];
        this.currentTemporaryWord = null;

        this.persistHighlightState();

        this.onStatusMessage(`✓ Highlighted "${cleanedWord}"`, 1500);

        this.updateExplanationPanelHighlightButton(cleanedWord);

        return true;
    }
}

window.HighlightManager = HighlightManager;
