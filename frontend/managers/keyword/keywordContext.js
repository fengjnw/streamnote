/**
 * KeywordContext - Handles keyword context extraction, building, history tracking, and pronunciation.
 * Consolidates context operations, history management, and speech synthesis for keywords.
 */
class KeywordContext {
    constructor(keywordManager) {
        this.keywordManager = keywordManager;
    }

    // ========== Context Management Methods ==========

    extractContextByPosition(positionInfo, contextLength = 100) {
        if (!positionInfo || !positionInfo.sourceIndices || positionInfo.sourceIndices.length === 0) {
            return '';
        }

        // Choose data source based on where the keyword was selected.
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

        // Prefer position-based extraction for deterministic context windows.
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

                // Fallback to last known transcript snapshot during session restore race windows.
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

    // ========== Context Display Methods ==========

    highlightKeywordInText(text, keyword) {
        if (!text || !keyword) return text;

        const cleanedKeyword = this._normalizeText(keyword);

        if (!cleanedKeyword) return text;

        const escapedKeyword = cleanedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedKeyword, 'gi');

        return text.replace(regex, (match) => `<span class="highlighted-word">${match}</span>`);
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

    _normalizeText(text) {
        let normalizedText = String(text || '').trim();
        normalizedText = normalizedText.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '').trim();
        normalizedText = normalizedText.replace(/\s+/g, ' ').trim();
        return normalizedText;
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

    // ========== History Methods ==========

    saveExplanationHistory(word, explanation, contextDisplayText = null) {
        let context = contextDisplayText || "";
        if (!context) {
            const contextTextEl = document.getElementById("context-text");
            if (contextTextEl) {
                context = contextTextEl.textContent;
            }
        }

        const language = window.streamNoteInstance?.explanationLanguage || "English";
        const positionInfo = this.keywordManager.currentQueryPositionInfo || this.keywordManager.highlightPositions[word] || null;

        const historyRecord = {
            word,
            language,
            explanation,
            context,
            sourceIndices: positionInfo ? positionInfo.sourceIndices : [],
            sourcePanel: this.keywordManager.currentQuerySourcePanel || this.keywordManager.wordSourcePanel[word] || 'transcript',
            timestamp: Date.now(),
        };

        this.keywordManager.explanationHistory.unshift(historyRecord);

        // Keep history bounded to control localStorage payload size.
        if (this.keywordManager.explanationHistory.length > 50) {
            this.keywordManager.explanationHistory = this.keywordManager.explanationHistory.slice(0, 50);
        }

        if (window.streamNoteInstance) {
            window.streamNoteInstance.saveSettingsToSession();
        }
    }

    async restoreExplanationHistoryRecord(historyRecord) {
        if (!historyRecord) return;

        const app = window.streamNoteInstance;
        // Restore is also context-sensitive to avoid cross-session UI pollution.
        const explanationOperation = OperationGuards.start(app, "explanation");
        const endExplanationOperation = OperationGuards.endOnce(explanationOperation);

        if (!OperationGuards.isValid(explanationOperation)) {
            console.log('[KeywordManager] Context changed before restore history');
            endExplanationOperation('Context changed before restore');
            return;
        }

        const { word, explanation, context, sourceIndices } = historyRecord;

        const wordElement = document.getElementById("current-explanation-word");
        const contentElement = document.getElementById("explanation-content");
        const contextDiv = document.getElementById("word-context");
        const contextText = document.getElementById("context-text");
        const headerDiv = document.querySelector(".explanation-header");

        if (!OperationGuards.isValid(explanationOperation)) {
            console.log('[KeywordManager] Context changed during UI setup');
            endExplanationOperation('Context changed during setup');
            return;
        }

        if (wordElement) wordElement.textContent = word;

        if (contentElement) {
            contentElement.innerHTML = '';
            const p = document.createElement('p');
            p.textContent = explanation;
            contentElement.appendChild(p);
        }

        if (headerDiv) headerDiv.classList.remove("hidden");

        if (context && contextText) {
            contextText.textContent = context;
            contextDiv.style.display = 'block';
        } else if (contextDiv) {
            contextDiv.style.display = 'none';
        }

        if (sourceIndices && sourceIndices.length > 0) {
            this.keywordManager.highlightPositions[word] = {
                sourceIndices,
            };
            this.keywordManager.wordSourcePanel[word] = historyRecord.sourcePanel || 'transcript';
        }

        endExplanationOperation('History restore completed');
    }

    // ========== Pronunciation Methods ==========

    setupPronounceButton() {
        const pronounceBtn = document.getElementById("pronounce-current-word-btn");
        if (pronounceBtn) {
            pronounceBtn.addEventListener("click", () => {
                const word = document.getElementById("current-explanation-word");
                if (word && word.textContent.trim()) {
                    this.pronounceWord(word.textContent);
                }
            });
        }
    }

    pronounceWord(word) {
        if (this.keywordManager.isPronouncing) {
            window.speechSynthesis.cancel();
            this.keywordManager.isPronouncing = false;
            const btn = document.getElementById("pronounce-current-word-btn");
            if (btn) {
                btn.title = "Pronounce word";
                btn.classList.remove("pronouncing");
            }
            return;
        }

        const langCode = this.detectWordLanguage(word);

        const utterance = new SpeechSynthesisUtterance(word);
        utterance.lang = langCode;
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onstart = () => {
            this.keywordManager.isPronouncing = true;
            const btn = document.getElementById("pronounce-current-word-btn");
            if (btn) {
                btn.title = "Stop pronunciation";
                btn.classList.add("pronouncing");
            }
        };

        utterance.onend = () => {
            this.keywordManager.isPronouncing = false;
            const btn = document.getElementById("pronounce-current-word-btn");
            if (btn) {
                btn.title = "Pronounce word";
                btn.classList.remove("pronouncing");
            }
        };

        utterance.onerror = () => {
            this.keywordManager.isPronouncing = false;
            const btn = document.getElementById("pronounce-current-word-btn");
            if (btn) {
                btn.title = "Pronounce word";
                btn.classList.remove("pronouncing");
            }
        };

        window.speechSynthesis.speak(utterance);
    }

    detectWordLanguage(word) {
        if (!word) return "en-US";

        const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf]/;
        if (chineseRegex.test(word)) {
            return "zh-CN";
        }

        const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff]/;
        if (japaneseRegex.test(word)) {
            return "ja-JP";
        }

        const koreanRegex = /[\uac00-\ud7af\u1100-\u11ff]/;
        if (koreanRegex.test(word)) {
            return "ko-KR";
        }

        const arabicRegex = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/;
        if (arabicRegex.test(word)) {
            return "ar-SA";
        }

        const hindiRegex = /[\u0900-\u097f]/;
        if (hindiRegex.test(word)) {
            return "hi-IN";
        }

        if (/[ãõçáéíóúâêôà]/.test(word.toLowerCase())) {
            return "pt-PT";
        }

        if (/[áéíóúñüàèìòùâêîôûäëïöü]/.test(word.toLowerCase())) {
            return "es-ES";
        }

        if (/[àâäæçéèêëïîôùûüœ]/.test(word.toLowerCase())) {
            return "fr-FR";
        }

        return "en-US";
    }
}

window.KeywordContext = KeywordContext;
