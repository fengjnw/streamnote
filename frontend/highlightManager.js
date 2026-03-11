/**
 * 高亮管理器 - 前端模块
 * 负责文本高亮、显示和管理
 */

class HighlightManager {
    constructor(config = {}) {
        this.keywordManager = config.keywordManager || null;
        this.translationManager = config.translationManager || null;
        this.recordingManager = config.recordingManager || null;
        this.sessionManager = config.sessionManager || null;

        // 回调函数
        this.onStatusMessage = config.onStatusMessage || (() => { });
        this.getTranscriptData = config.getTranscriptData || (() => ({}));

        // 高亮ID映射
        this.highlightIdMap = config.highlightIdMap || {};
    }

    /**
     * 添加选中的文本作为高亮
     */
    addSelectedTextAsHighlight(selectedText) {
        if (!selectedText || !this.keywordManager) return;

        let highlightText = selectedText.trim();

        // 移除选中文本中的所有时间戳（可能有多个）
        // 时间戳格式: [HH:MM:SS]，用全局替换
        highlightText = highlightText.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').trim();

        // 额外清理：移除多余的空格
        highlightText = highlightText.replace(/\s+/g, ' ').trim();

        if (!highlightText) {
            this.onStatusMessage("No valid text to highlight", 1500);
            return;
        }

        // 检查是否已存在（手动或自动）
        const allKeywords = [...this.keywordManager.manualKeywords, ...this.keywordManager.autoKeywords];
        if (allKeywords.includes(highlightText)) {
            this.onStatusMessage("This highlight already exists", 1500);
            return;
        }

        // 生成唯一的高亮ID
        const highlightId = "hl-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);

        // 添加到手动关键词（实际上是高亮内容）
        this.keywordManager.manualKeywords.push(highlightText);

        // 存储高亮ID映射（用于后续删除）
        this.highlightIdMap[highlightText] = highlightId;

        // 更新所有显示
        this.keywordManager.updateAllKeywordDisplays();

        // 在原文中进行高亮显示
        this.highlightTextInTranscript(highlightText, highlightId);

        // 同时保存高亮和关键词
        this.sessionManager.updateCurrentHighlights(this.keywordManager.manualKeywords);
        this.sessionManager.updateCurrentKeywords(this.keywordManager.autoKeywords);

        this.onStatusMessage(`✓ Highlighted "${highlightText}"`, 1500);

        return highlightText;
    }

    /**
     * 基于选区Range直接高亮文本
     * @param {string} selectedText - 选中的原始文本
     * @param {Range} range - DOM Range对象
     */
    addSelectedTextAsHighlightWithRange(selectedText, range) {
        if (!selectedText || !range || !this.keywordManager) return;

        let highlightText = selectedText.trim();

        // 移除所有时间戳
        highlightText = highlightText.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').trim();
        highlightText = highlightText.replace(/\s+/g, ' ').trim();

        if (!highlightText) {
            this.onStatusMessage("No valid text to highlight", 1500);
            return;
        }

        // 检查是否已存在
        const allKeywords = [...this.keywordManager.manualKeywords, ...this.keywordManager.autoKeywords];
        if (allKeywords.includes(highlightText)) {
            this.onStatusMessage("This highlight already exists", 1500);
            return;
        }

        // 生成唯一的高亮ID
        const highlightId = "hl-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);

        // 添加到列表
        this.keywordManager.manualKeywords.push(highlightText);

        // 存储高亮ID映射
        this.highlightIdMap[highlightText] = highlightId;

        // 直接对Range的内容进行高亮（仅在原文）
        this.highlightRangeDirectly(range, highlightId);

        // 清除用户的选区（应用完高亮后）
        window.getSelection().removeAllRanges();

        // 更新显示和保存
        this.keywordManager.updateAllKeywordDisplays();
        this.sessionManager.updateCurrentHighlights(this.keywordManager.manualKeywords);
        this.sessionManager.updateCurrentKeywords(this.keywordManager.autoKeywords);

        this.onStatusMessage(`✓ Highlighted "${highlightText}"`, 1500);

        return highlightText;
    }

    /**
     * 直接对DOM Range进行高亮，不需要搜索
     * @param {Range} range - DOM Range对象
     * @param {string} highlightId - 高亮的唯一ID
     */
    highlightRangeDirectly(range, highlightId) {
        if (!range || !highlightId) return;

        // 获取 range 的 common ancestor
        const rootNode = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
            ? range.commonAncestorContainer.parentNode
            : range.commonAncestorContainer;

        // 收集 range 内的所有 text nodes
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

            // 检查这个 node 是否与 range 有交集
            if (range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > -1 &&
                range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 1) {
                rangeNodes.push(node);
            }
        }

        // 对每个在 range 内的 text node 进行高亮
        rangeNodes.forEach((node) => {
            // 计算这个 node 在 range 内的起止位置
            let startOffset = 0;
            let endOffset = node.textContent.length;

            // 如果是起始节点，从 startOffset 开始
            if (node === range.startContainer) {
                startOffset = range.startOffset;
            }

            // 如果是结束节点，到 endOffset 结束
            if (node === range.endContainer) {
                endOffset = range.endOffset;
            }

            // 进行高亮
            if (startOffset < endOffset) {
                this._highlightNodePortion(node, startOffset, endOffset, highlightId);
            }
        });
    }

    /**
     * 在原文中高亮显示指定的文本（支持跨段）
     * @param {string} text - 要高亮的文本
     * @param {string} highlightId - 高亮的唯一ID
     */
    highlightTextInTranscript(text, highlightId) {
        if (!text || !highlightId) return;

        const transcriptDiv = document.getElementById("transcript");
        if (!transcriptDiv) return;

        // 从原始数据构建纯文本版本，item之间用空格连接
        const preciseResults = this.getTranscriptData();
        const sortedKeys = Object.keys(preciseResults)
            .sort((a, b) => parseInt(a) - parseInt(b));

        // 获取并trim每个sourceText
        const sourceTexts = sortedKeys.map(key => {
            const text = preciseResults[key]?.text || "";
            return text.trim();
        });

        // 构建虚拟全文，item之间用单个空格连接
        let virtualFullText = sourceTexts.join(" ");

        // 建立位置映射
        const textPositionMap = []; // [{ startInVirtual, endInVirtual, sourceIndex }, ...]
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
            currentPos = endInVirtual + 1; // +1 for the space separator
        });

        // 在虚拟全文中搜索（不区分大小写）
        const lowerVirtualText = virtualFullText.toLowerCase();
        const lowerText = text.toLowerCase();
        const matchPos = lowerVirtualText.indexOf(lowerText);

        if (matchPos === -1) return; // 未找到

        const matchEnd = matchPos + text.length;

        // 根据虚拟位置找到涉及的源文本
        const affectedSources = []; // [{ sourceIndex, startInSource, endInSource }, ...]

        textPositionMap.forEach(mapping => {
            // 检查是否重叠
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

        // 现在在DOM中找到这些源对应的段落，并进行高亮
        affectedSources.forEach(source => {
            const key = sortedKeys[source.sourceIndex];
            const paragraph = transcriptDiv.querySelector(`p[data-index="${key}"]`);
            if (!paragraph) return;

            // 提取段落中的text nodes（排除时间戳部分）
            const textNodes = [];
            const walker = document.createTreeWalker(
                paragraph,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let node;
            while (node = walker.nextNode()) {
                // 时间戳已用伪元素显示，不在DOM中，无需特殊过滤
                textNodes.push(node);
            }

            // 在text nodes中应用高亮
            if (textNodes.length === 0) return;

            let currentPos = 0;
            let matchStartNode = -1;
            let matchStartIdx = -1;
            let matchEndNode = -1;
            let matchEndIdx = -1;

            // 找到起始位置
            for (let i = 0; i < textNodes.length; i++) {
                const nodeLength = textNodes[i].textContent.length;
                if (currentPos + nodeLength > source.startInSource && matchStartNode === -1) {
                    matchStartNode = i;
                    matchStartIdx = source.startInSource - currentPos;
                }
                if (currentPos + nodeLength >= source.endInSource) {
                    matchEndNode = i;
                    matchEndIdx = source.endInSource - currentPos;
                    break;
                }
                currentPos += nodeLength;
            }

            if (matchStartNode === -1 || matchEndNode === -1) return;

            // 进行高亮
            if (matchStartNode === matchEndNode) {
                // 同一个node内
                this._highlightNodePortion(textNodes[matchStartNode], matchStartIdx, matchEndIdx, highlightId);
            } else {
                // 跨多个nodes
                this._highlightNodePortion(textNodes[matchStartNode], matchStartIdx, textNodes[matchStartNode].textContent.length, highlightId);
                for (let i = matchStartNode + 1; i < matchEndNode; i++) {
                    this._highlightNodePortion(textNodes[i], 0, textNodes[i].textContent.length, highlightId);
                }
                this._highlightNodePortion(textNodes[matchEndNode], 0, matchEndIdx, highlightId);
            }
        });
    }

    /**
     * 在翻译区高亮显示指定的文本（支持跨段）
     * @param {string} text - 要高亮的文本
     * @param {string} highlightId - 高亮的唯一ID
     */
    highlightTextInTranslation(text, highlightId) {
        if (!text || !highlightId) return;

        const translationDiv = document.getElementById("translation");
        if (!translationDiv) return;

        // 从translationManager中构建虚拟全文
        const translationData = this.translationManager.getTranslationData();
        const preciseResults = this.getTranscriptData();
        const sortedKeys = Object.keys(preciseResults)
            .sort((a, b) => parseInt(a) - parseInt(b));

        // 获取每个段落对应的翻译文本
        const translationTexts = sortedKeys.map(key => {
            const translation = translationData[key];
            // 如果没有翻译，返回空字符串，这样段落存在但不会被搜索到
            return translation ? translation.trim() : "";
        });

        // 构建虚拟全文
        let virtualFullText = translationTexts.join(" ");

        // 建立位置映射
        const textPositionMap = []; // [{ startInVirtual, endInVirtual, sourceIndex }, ...]
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
            currentPos = endInVirtual + 1; // +1 for the space separator
        });

        // 在虚拟全文中搜索（不区分大小写）
        const lowerVirtualText = virtualFullText.toLowerCase();
        const lowerText = text.toLowerCase();
        const matchPos = lowerVirtualText.indexOf(lowerText);

        if (matchPos === -1) return; // 未找到

        const matchEnd = matchPos + text.length;

        // 根据虚拟位置找到涉及的翻译段落
        const affectedSources = []; // [{ sourceIndex, startInSource, endInSource }, ...]

        textPositionMap.forEach(mapping => {
            // 检查是否重叠
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

        // 在DOM中找到这些段落，并进行高亮
        affectedSources.forEach(source => {
            const key = sortedKeys[source.sourceIndex];
            const paragraph = translationDiv.querySelector(`p[data-index="${key}"]`);
            if (!paragraph) return;

            // 提取段落中的text nodes
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

            if (textNodes.length === 0) return;

            // 在text nodes中应用高亮
            let currentPos = 0;
            let matchStartNode = -1;
            let matchStartIdx = -1;
            let matchEndNode = -1;
            let matchEndIdx = -1;

            // 找到起始位置
            for (let i = 0; i < textNodes.length; i++) {
                const nodeLength = textNodes[i].textContent.length;
                if (currentPos + nodeLength > source.startInSource && matchStartNode === -1) {
                    matchStartNode = i;
                    matchStartIdx = source.startInSource - currentPos;
                }

                if (currentPos + nodeLength >= source.endInSource) {
                    matchEndNode = i;
                    matchEndIdx = source.endInSource - currentPos;
                    break;
                }
                currentPos += nodeLength;
            }

            if (matchStartNode === -1 || matchEndNode === -1) return;

            // 进行高亮
            if (matchStartNode === matchEndNode) {
                // 同一个node内
                this._highlightNodePortion(textNodes[matchStartNode], matchStartIdx, matchEndIdx, highlightId);
            } else {
                // 跨多个nodes
                this._highlightNodePortion(textNodes[matchStartNode], matchStartIdx, textNodes[matchStartNode].textContent.length, highlightId);
                for (let i = matchStartNode + 1; i < matchEndNode; i++) {
                    this._highlightNodePortion(textNodes[i], 0, textNodes[i].textContent.length, highlightId);
                }
                this._highlightNodePortion(textNodes[matchEndNode], 0, matchEndIdx, highlightId);
            }
        });
    }

    /**
     * 高亮text node的某一部分
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

        // 创建节点（空字符串不创建对应的节点）
        const beforeNode = beforeText ? document.createTextNode(beforeText) : null;
        const afterNode = afterText ? document.createTextNode(afterText) : null;

        // 按正确的顺序插入：在textNode之前insert所有新节点，然后删除textNode
        if (beforeNode) {
            textNode.parentNode.insertBefore(beforeNode, textNode);
        }
        textNode.parentNode.insertBefore(span, textNode);
        if (afterNode) {
            textNode.parentNode.insertBefore(afterNode, textNode);
        }
        textNode.parentNode.removeChild(textNode);
    }

    /**
     * 移除高亮显示（从原文和翻译区都移除）
     * @param {string} text - 要移除高亮的文本
     */
    removeHighlightFromTranscript(text) {
        if (!text) return;

        // 通过ID来删除对应的高亮
        if (this.highlightIdMap && this.highlightIdMap[text]) {
            const highlightId = this.highlightIdMap[text];

            // 从原文删除
            const transcriptDiv = document.getElementById("transcript");
            if (transcriptDiv) {
                const highlights = transcriptDiv.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
                highlights.forEach(span => {
                    const textNode = document.createTextNode(span.textContent);
                    span.parentNode.replaceChild(textNode, span);
                });
                this.mergeAdjacentTextNodes(transcriptDiv);
            }

            // 从翻译删除
            const translationDiv = document.getElementById("translation");
            if (translationDiv) {
                const highlights = translationDiv.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
                highlights.forEach(span => {
                    const textNode = document.createTextNode(span.textContent);
                    span.parentNode.replaceChild(textNode, span);
                });
                this.mergeAdjacentTextNodes(translationDiv);
            }

            // 删除ID映射
            delete this.highlightIdMap[text];
        }
    }

    /**
     * 合并相邻的text nodes
     * @param {HTMLElement} element - 容器元素
     */
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

    /**
     * 重新应用所有高亮
     */
    reapplyAllHighlights() {
        if (!this.keywordManager) return;

        // 清除所有现有的高亮（原文和翻译）
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

        // 生成缺失的ID
        this.keywordManager.manualKeywords.forEach(text => {
            if (!this.highlightIdMap[text]) {
                this.highlightIdMap[text] = "hl-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
            }
        });

        // 重新应用所有手动关键词的高亮（在原文和翻译）
        this.keywordManager.manualKeywords.forEach(text => {
            this.highlightTextInTranscript(text, this.highlightIdMap[text]);
            this.highlightTextInTranslation(text, this.highlightIdMap[text]);
        });
    }

    /**
     * 获取高亮ID映射
     */
    getHighlightIdMap() {
        return { ...this.highlightIdMap };
    }

    /**
     * 设置高亮ID映射（用于恢复session）
     */
    setHighlightIdMap(map) {
        this.highlightIdMap = { ...map };
    }
}
