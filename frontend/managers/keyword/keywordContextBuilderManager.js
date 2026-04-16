/**
 * KeywordContextBuilderManager - builds keyword context snippets and highlighted context text.
 */
class KeywordContextBuilderManager {
    constructor(keywordManager) {
        this.keywordManager = keywordManager;
    }

    _normalizeText(text) {
        let normalizedText = String(text || '').trim();
        normalizedText = normalizedText.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').trim();
        normalizedText = normalizedText.replace(/\s+/g, ' ').trim();
        return normalizedText;
    }

    highlightKeywordInText(text, keyword) {
        if (!text || !keyword) return text;

        const cleanedKeyword = this._normalizeText(keyword);

        if (!cleanedKeyword) return text;

        const escapedKeyword = cleanedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedKeyword, 'gi');

        return text.replace(regex, (match) => `<span class="highlighted-word">${match}</span>`);
    }

    _buildContextByPosition(positionInfo, keyword, contextLength = 50) {
        if (!positionInfo || !positionInfo.sourceIndices || positionInfo.sourceIndices.length === 0) {
            return '';
        }

        // Prefer exact position-based context when source indices are available.
        const isTranslationContext = positionInfo.container === 'translation';
        let dataSource = {};

        if (isTranslationContext && this.keywordManager.translationManager) {
            dataSource = this.keywordManager.translationManager.getTranslationData();
        } else {
            dataSource = this.keywordManager.getTranscriptData();
        }

        const sourceIndices = positionInfo.sourceIndices;
        const firstIdx = sourceIndices[0];
        const lastIdx = sourceIndices[sourceIndices.length - 1];

        const cleanedKeyword = this._normalizeText(keyword);

        const sourceTexts = sourceIndices.map(idx => {
            if (isTranslationContext) {
                const translatedText = dataSource[idx];
                return translatedText ? translatedText.trim() : '';
            }

            const item = dataSource[idx];
            return item ? item.text.trim() : '';
        });

        const targetText = sourceTexts.join(' ');

        const lowerTargetText = targetText.toLowerCase();
        const lowerKeyword = cleanedKeyword.toLowerCase();
        const matchPos = lowerTargetText.indexOf(lowerKeyword);

        if (matchPos === -1) return '';

        const matchEnd = matchPos + cleanedKeyword.length;

        const allKeys = Object.keys(dataSource).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        const globalFirstIdx = parseInt(allKeys[0], 10);
        const globalLastIdx = parseInt(allKeys[allKeys.length - 1], 10);

        let contextBefore = '';
        const beforeInTarget = targetText.substring(Math.max(0, matchPos - contextLength), matchPos);
        contextBefore = beforeInTarget;

        if (contextBefore.length < contextLength && firstIdx > globalFirstIdx) {
            const needChars = contextLength - contextBefore.length;
            let prevIdx = firstIdx - 1;
            const prevTexts = [];
            let prevChars = 0;

            while (prevChars < needChars && prevIdx >= globalFirstIdx) {
                let prevText = '';
                if (isTranslationContext) {
                    prevText = dataSource[prevIdx] ? dataSource[prevIdx].trim() : '';
                } else {
                    const item = dataSource[prevIdx];
                    prevText = item ? item.text.trim() : '';
                }

                if (prevText) {
                    prevTexts.unshift(prevText);
                    prevChars += prevText.length;
                }
                prevIdx--;
            }

            const allPrevText = prevTexts.join(' ');
            if (allPrevText.length > needChars) {
                contextBefore = allPrevText.substring(allPrevText.length - needChars) + ' ' + contextBefore;
            } else if (allPrevText.length > 0) {
                contextBefore = allPrevText + ' ' + contextBefore;
            }
        }

        let contextAfter = '';
        const afterInTarget = targetText.substring(matchEnd, Math.min(targetText.length, matchEnd + contextLength));
        contextAfter = afterInTarget;

        if (contextAfter.length < contextLength && lastIdx < globalLastIdx) {
            const needChars = contextLength - contextAfter.length;
            let nextIdx = lastIdx + 1;
            const nextTexts = [];
            let nextChars = 0;

            while (nextChars < needChars && nextIdx <= globalLastIdx) {
                let nextText = '';
                if (isTranslationContext) {
                    nextText = dataSource[nextIdx] ? dataSource[nextIdx].trim() : '';
                } else {
                    const item = dataSource[nextIdx];
                    nextText = item ? item.text.trim() : '';
                }

                if (nextText) {
                    nextTexts.push(nextText);
                    nextChars += nextText.length;
                }
                nextIdx++;
            }

            const allNextText = nextTexts.join(' ');
            if (allNextText.length > needChars) {
                contextAfter = contextAfter + ' ' + allNextText.substring(0, needChars);
            } else if (allNextText.length > 0) {
                contextAfter = contextAfter + ' ' + allNextText;
            }
        }

        const highlightedKeyword = `<span class="highlighted-word">${cleanedKeyword}</span>`;
        const prefix = (contextBefore.length >= contextLength) ? '... ' : '';
        const suffix = (contextAfter.length >= contextLength) ? ' ...' : '';
        return prefix + contextBefore + highlightedKeyword + contextAfter + suffix;
    }

    _buildContextBySearch(keyword, contextLength = 50) {
        let cleanedKeyword = this._normalizeText(keyword);

        if (!cleanedKeyword) return '';

        // Fallback path: infer from full-text search in the recorded source panel.
        const sourcePanel = this.keywordManager.wordSourcePanel[keyword];
        let dataSource = {};
        let sortedKeys = [];

        if (sourcePanel === 'translation' && this.keywordManager.translationManager) {
            dataSource = this.keywordManager.translationManager.getTranslationData();
            sortedKeys = Object.keys(dataSource).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        } else {
            const preciseResults = this.keywordManager.getTranscriptData();
            dataSource = preciseResults;
            sortedKeys = Object.keys(preciseResults).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        }

        let fullText = '';
        const segments = [];
        let currentPos = 0;

        sortedKeys.forEach(key => {
            let text = '';
            if (sourcePanel === 'translation' && this.keywordManager.translationManager) {
                text = dataSource[key] ? dataSource[key].trim() : '';
            } else {
                const item = dataSource[key];
                text = this._normalizeText(item?.text || '');
            }

            if (text) {
                segments.push({
                    text,
                    srcIndex: parseInt(key, 10),
                    startPos: currentPos,
                    endPos: currentPos + text.length,
                });
                fullText += text + ' ';
                currentPos = fullText.length;
            }
        });

        const lowerFullText = fullText.toLowerCase();
        const lowerKeyword = cleanedKeyword.toLowerCase();
        const matchPos = lowerFullText.indexOf(lowerKeyword);

        if (matchPos === -1) return '';

        const matchEnd = matchPos + cleanedKeyword.length;

        let targetSegment = null;
        for (const seg of segments) {
            if (seg.startPos <= matchPos && matchEnd <= seg.endPos + 1) {
                targetSegment = seg;
                break;
            }
        }

        if (!targetSegment) return '';

        const globalFirstSegment = segments[0];
        const globalLastSegment = segments[segments.length - 1];

        let contextBefore = '';
        const posInSegment = matchPos - targetSegment.startPos;
        const beforeInSegment = targetSegment.text.substring(Math.max(0, posInSegment - contextLength), posInSegment);
        contextBefore = beforeInSegment;

        if (contextBefore.length < contextLength && targetSegment.srcIndex > globalFirstSegment.srcIndex) {
            const needChars = contextLength - contextBefore.length;
            let prevChars = 0;
            const prevTexts = [];

            const targetIdx = segments.indexOf(targetSegment);
            for (let i = targetIdx - 1; i >= 0 && prevChars < needChars; i--) {
                prevTexts.unshift(segments[i].text);
                prevChars += segments[i].text.length;
            }

            const allPrevText = prevTexts.join(' ');
            if (allPrevText.length > needChars) {
                contextBefore = allPrevText.substring(allPrevText.length - needChars) + ' ' + contextBefore;
            } else if (allPrevText.length > 0) {
                contextBefore = allPrevText + ' ' + contextBefore;
            }
        }

        let contextAfter = '';
        const endPosInSegment = posInSegment + cleanedKeyword.length;
        const afterInSegment = targetSegment.text.substring(endPosInSegment, Math.min(targetSegment.text.length, endPosInSegment + contextLength));
        contextAfter = afterInSegment;

        if (contextAfter.length < contextLength && targetSegment.srcIndex < globalLastSegment.srcIndex) {
            const needChars = contextLength - contextAfter.length;
            let nextChars = 0;
            const nextTexts = [];

            const targetIdx = segments.indexOf(targetSegment);
            for (let i = targetIdx + 1; i < segments.length && nextChars < needChars; i++) {
                nextTexts.push(segments[i].text);
                nextChars += segments[i].text.length;
            }

            const allNextText = nextTexts.join(' ');
            if (allNextText.length > needChars) {
                contextAfter = contextAfter + ' ' + allNextText.substring(0, needChars);
            } else if (allNextText.length > 0) {
                contextAfter = contextAfter + ' ' + allNextText;
            }
        }

        const highlightedKeyword = `<span class="highlighted-word">${cleanedKeyword}</span>`;
        const prefix = (contextBefore.length >= contextLength) ? '... ' : '';
        const suffix = (contextAfter.length >= contextLength) ? ' ...' : '';
        return prefix + contextBefore + highlightedKeyword + contextAfter + suffix;
    }
}

window.KeywordContextBuilderManager = KeywordContextBuilderManager;
