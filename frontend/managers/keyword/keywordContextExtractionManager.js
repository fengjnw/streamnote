/**
 * KeywordContextExtractionManager - handles extracting context text from transcript/translation sources.
 */
class KeywordContextExtractionManager {
    constructor(keywordManager) {
        this.keywordManager = keywordManager;
    }

    extractContextByPosition(positionInfo, contextLength = 100) {
        if (!positionInfo || !positionInfo.sourceIndices || positionInfo.sourceIndices.length === 0) {
            return '';
        }

        const isTranslationContext = positionInfo.container === 'translation';
        let dataSource = {};

        if (isTranslationContext && this.keywordManager.translationManager) {
            dataSource = this.keywordManager.translationManager.getTranslationData();
        } else {
            dataSource = this.keywordManager.getTranscriptData();
        }

        const sourceIndices = positionInfo.sourceIndices;
        const sourceTexts = sourceIndices.map(idx => {
            if (isTranslationContext) {
                const translatedText = dataSource[idx];
                return translatedText ? translatedText.trim() : '';
            }

            const item = dataSource[idx];
            return item ? item.text.trim() : '';
        });

        const targetText = sourceTexts.join(' ');

        let contextBefore = '';
        const firstIdx = sourceIndices[0];
        if (firstIdx > 0) {
            const indices = [];
            for (let i = firstIdx - 1; i >= 0 && indices.length < 2; i--) {
                if (isTranslationContext) {
                    const translatedText = dataSource[i];
                    if (translatedText) {
                        indices.unshift(translatedText.trim());
                    }
                } else if (dataSource[i]) {
                    indices.unshift(dataSource[i].text.trim());
                }
            }
            contextBefore = indices.join(' ');
            if (contextBefore) {
                contextBefore = contextBefore.slice(-contextLength);
            }
        }

        let contextAfter = '';
        const lastIdx = sourceIndices[sourceIndices.length - 1];
        const maxIdx = Object.keys(dataSource).map(k => parseInt(k, 10)).sort((a, b) => b - a)[0];
        if (lastIdx < maxIdx) {
            const indices = [];
            for (let i = lastIdx + 1; i <= maxIdx && indices.length < 2; i++) {
                if (isTranslationContext) {
                    const translatedText = dataSource[i];
                    if (translatedText) {
                        indices.push(translatedText.trim());
                    }
                } else if (dataSource[i]) {
                    indices.push(dataSource[i].text.trim());
                }
            }
            contextAfter = indices.join(' ');
            if (contextAfter) {
                contextAfter = contextAfter.slice(0, contextLength);
            }
        }

        let fullContext = '';
        if (contextBefore) fullContext += contextBefore + ' ';
        fullContext += targetText;
        if (contextAfter) fullContext += ' ' + contextAfter;

        return fullContext.trim();
    }

    extractKeywordContext(keyword, fullText, contextLength = 100) {
        if (!keyword) return '';

        if (this.keywordManager.highlightPositions && this.keywordManager.highlightPositions[keyword]) {
            const positionInfo = this.keywordManager.highlightPositions[keyword];
            const contextByPosition = this.extractContextByPosition(positionInfo, contextLength);
            if (contextByPosition) {
                return contextByPosition;
            }
        }

        let searchText = fullText;
        if (!searchText) {
            const sourcePanel = this.keywordManager.wordSourcePanel[keyword];

            if (sourcePanel === 'translation' && this.keywordManager.translationManager) {
                const translationData = this.keywordManager.translationManager.getTranslationData();
                if (translationData && Object.keys(translationData).length > 0) {
                    const sortedKeys = Object.keys(translationData).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
                    searchText = sortedKeys
                        .map(key => translationData[key])
                        .filter(text => text)
                        .join(' ');
                }
            } else {
                let preciseResults = this.keywordManager.getTranscriptData();

                if (!preciseResults || Object.keys(preciseResults).length === 0) {
                    if (this.keywordManager.lastKnownTranscriptData && Object.keys(this.keywordManager.lastKnownTranscriptData).length > 0) {
                        console.warn('[KeywordManager] Main transcript data empty, using fallback cache for context extraction');
                        preciseResults = this.keywordManager.lastKnownTranscriptData;
                    }
                } else {
                    this.keywordManager.lastKnownTranscriptData = { ...preciseResults };
                }

                if (preciseResults && Object.keys(preciseResults).length > 0) {
                    const sortedKeys = Object.keys(preciseResults).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
                    searchText = sortedKeys
                        .map(key => {
                            const item = preciseResults[key];
                            return item && item.text ? item.text.trim() : '';
                        })
                        .filter(text => text)
                        .join(' ');
                }
            }
        }

        if (!searchText) {
            console.warn(`[KeywordManager] Unable to extract context for keyword "${keyword}" - transcriptData may be empty or not restored yet`);
            return '';
        }

        const lowerText = searchText.toLowerCase();
        const lowerKeyword = keyword.toLowerCase();
        const index = lowerText.indexOf(lowerKeyword);

        if (index === -1) return '';

        const contextStart = Math.max(0, index - contextLength);
        const contextEnd = Math.min(searchText.length, index + keyword.length + contextLength);

        let context = searchText.substring(contextStart, contextEnd);

        if (contextStart > 0) {
            context = '...' + context;
        }

        if (contextEnd < searchText.length) {
            context = context + '...';
        }

        return context.trim();
    }

    getContextForKeyword(keyword) {
        if (this.keywordManager.highlightPositions && this.keywordManager.highlightPositions[keyword]) {
            const positionInfo = this.keywordManager.highlightPositions[keyword];
            if (positionInfo.container) {
                return this.extractKeywordContext(keyword, '', 100);
            }
        }

        const sourcePanel = this.keywordManager.wordSourcePanel[keyword];
        if (sourcePanel === 'translation') {
            if (this.keywordManager.translationManager) {
                const translationData = this.keywordManager.translationManager.getTranslationData();
                if (translationData && Object.keys(translationData).length > 0) {
                    const sortedKeys = Object.keys(translationData).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
                    const fullTranslation = sortedKeys
                        .map(key => translationData[key])
                        .filter(text => text)
                        .join(' ');

                    if (fullTranslation) {
                        const lowerText = fullTranslation.toLowerCase();
                        const lowerKeyword = keyword.toLowerCase();
                        const index = lowerText.indexOf(lowerKeyword);

                        if (index !== -1) {
                            const contextLength = 100;
                            const contextStart = Math.max(0, index - contextLength);
                            const contextEnd = Math.min(fullTranslation.length, index + keyword.length + contextLength);

                            let context = fullTranslation.substring(contextStart, contextEnd);
                            if (contextStart > 0) context = '...' + context;
                            if (contextEnd < fullTranslation.length) context = context + '...';
                            return context;
                        }
                    }
                }
            }
        }

        const context = this.extractKeywordContext(keyword, '', 100);
        return context || '';
    }
}

window.KeywordContextExtractionManager = KeywordContextExtractionManager;
