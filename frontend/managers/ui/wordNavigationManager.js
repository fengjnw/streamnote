/**
 * WordNavigationManager - handles word locating and temporary highlight in transcript/translation panels.
 */
class WordNavigationManager {
    constructor(app) {
        this.app = app;
    }

    scrollToWord(word, sourcePanel = 'transcript') {
        if (!word) return;

        if (this.app.keywordManager && this.app.keywordManager.highlightPositions[word]) {
            const positionInfo = this.app.keywordManager.highlightPositions[word];

            if (positionInfo.sourceIndices && positionInfo.sourceIndices.length > 0) {
                if (positionInfo.sourceIndices.length > 1) {
                    if (this.scrollToWordByIndices(word, positionInfo.sourceIndices, sourcePanel)) {
                        return;
                    }
                } else {
                    const targetIndex = positionInfo.sourceIndices[0];
                    if (this.scrollToWordByIndex(word, targetIndex, sourcePanel)) {
                        return;
                    }
                }
            } else if (positionInfo.startIndex !== undefined) {
                if (this.scrollToWordByIndex(word, positionInfo.startIndex, sourcePanel)) {
                    return;
                }
            }
        }

        this.scrollToWordByText(word, sourcePanel);
    }

    scrollToWordByIndex(word, targetIndex, sourcePanel) {
        const transcript = document.getElementById("transcript");
        const translation = document.getElementById("translation");

        const primaryPanel = sourcePanel === 'translation' ? translation : transcript;
        const secondaryPanel = sourcePanel === 'translation' ? transcript : translation;

        if (!primaryPanel) return false;

        const targetParagraph = primaryPanel.querySelector(`p[data-index="${targetIndex}"]`);
        if (!targetParagraph) {
            return false;
        }

        targetParagraph.scrollIntoView({ behavior: 'auto', block: 'center' });
        this.highlightWordInElement(targetParagraph, word);

        if (secondaryPanel) {
            const secondaryParagraph = secondaryPanel.querySelector(`p[data-index="${targetIndex}"]`);
            if (secondaryParagraph) {
                this.highlightWordInElement(secondaryParagraph, word);
            }
        }

        this.app.showStatusMessage(`Found "${word}" in ${sourcePanel}`, 1000);
        return true;
    }

    scrollToWordByIndices(word, targetIndices, sourcePanel) {
        if (!targetIndices || targetIndices.length === 0) {
            return false;
        }

        const transcript = document.getElementById("transcript");
        const translation = document.getElementById("translation");

        const primaryPanel = sourcePanel === 'translation' ? translation : transcript;
        const secondaryPanel = sourcePanel === 'translation' ? transcript : translation;

        if (!primaryPanel) return false;

        const firstIndex = targetIndices[0];
        const firstParagraph = primaryPanel.querySelector(`p[data-index="${firstIndex}"]`);

        if (!firstParagraph) {
            return false;
        }

        firstParagraph.scrollIntoView({ behavior: 'auto', block: 'center' });

        targetIndices.forEach(index => {
            const paragraph = primaryPanel.querySelector(`p[data-index="${index}"]`);
            if (paragraph) {
                this.highlightWordInElement(paragraph, word);
            }

            if (secondaryPanel) {
                const secondaryParagraph = secondaryPanel.querySelector(`p[data-index="${index}"]`);
                if (secondaryParagraph) {
                    this.highlightWordInElement(secondaryParagraph, word);
                }
            }
        });

        this.app.showStatusMessage(`Found "${word}" in ${sourcePanel}`, 1000);
        return true;
    }

    scrollToWordByText(word, sourcePanel = 'transcript') {
        const transcript = document.getElementById("transcript");
        const translation = document.getElementById("translation");

        let primaryPanel = sourcePanel === 'translation' ? translation : transcript;
        const secondaryPanel = sourcePanel === 'translation' ? transcript : translation;

        if (!primaryPanel) {
            primaryPanel = secondaryPanel;
            sourcePanel = sourcePanel === 'translation' ? 'transcript' : 'translation';
        }

        if (!primaryPanel) return;

        const lowerWord = word.toLowerCase();
        const paragraphs = primaryPanel.querySelectorAll("p");
        const paragraphArray = Array.from(paragraphs);
        let targetParagraphs = [];
        let targetIndices = [];

        for (const p of paragraphArray) {
            const pText = p.innerText.toLowerCase();
            if (pText.includes(lowerWord)) {
                targetParagraphs = [p];
                targetIndices = [p.getAttribute("data-index")];
                break;
            }
        }

        if (targetParagraphs.length === 0) {
            for (let i = 0; i < paragraphArray.length - 1; i++) {
                const p1 = paragraphArray[i];
                const p2 = paragraphArray[i + 1];
                const combinedText = (p1.innerText + " " + p2.innerText).toLowerCase();

                if (combinedText.includes(lowerWord)) {
                    targetParagraphs = [p1, p2];
                    targetIndices = [p1.getAttribute("data-index"), p2.getAttribute("data-index")];
                    break;
                }
            }
        }

        if (targetParagraphs.length === 0) {
            this.app.showStatusMessage(`Word "${word}" not found in ${sourcePanel}`, 1500);
            return;
        }

        targetParagraphs[0].scrollIntoView({ behavior: 'auto', block: 'center' });

        targetParagraphs.forEach(p => {
            this.highlightWordInElement(p, word);
        });

        if (secondaryPanel && targetIndices.length > 0) {
            targetIndices.forEach(index => {
                if (index !== null) {
                    const secondaryParagraph = secondaryPanel.querySelector(`p[data-index="${index}"]`);
                    if (secondaryParagraph) {
                        this.highlightWordInElement(secondaryParagraph, word);
                    }
                }
            });
        }

        this.app.showStatusMessage(`Found "${word}" in ${sourcePanel}`, 1000);
    }

    highlightWordInElement(element, word) {
        if (!element || !word) {
            return;
        }

        const previousHighlights = element.querySelectorAll(".temp-word-highlight");
        previousHighlights.forEach(el => {
            const parent = el.parentNode;
            if (parent) {
                while (el.firstChild) {
                    parent.insertBefore(el.firstChild, el);
                }
                parent.removeChild(el);
                parent.normalize();
            }
        });

        try {
            const originalHtml = element.innerHTML;
            let newHtml = originalHtml;
            let highlightCount = 0;

            const escapedWord = TextFormatters.escapeRegex(word);
            const regex1 = new RegExp(`\\b(${escapedWord})\\b`, 'gi');
            let tempHtml = originalHtml.replace(regex1, (match) => {
                highlightCount++;
                return `<span class="temp-word-highlight">${match}</span>`;
            });

            if (highlightCount > 0) {
                newHtml = tempHtml;
            } else {
                const regex2 = new RegExp(`(${escapedWord})`, 'gi');
                tempHtml = originalHtml.replace(regex2, (match) => {
                    highlightCount++;
                    return `<span class="temp-word-highlight">${match}</span>`;
                });

                if (highlightCount > 0) {
                    newHtml = tempHtml;
                } else {
                    const words = word.split(/\s+/);
                    if (words.length > 1) {
                        let multiWordHtml = originalHtml;
                        for (const singleWord of words) {
                            const escapedSingleWord = TextFormatters.escapeRegex(singleWord);
                            const singleRegex1 = new RegExp(`\\b(${escapedSingleWord})\\b`, 'gi');
                            let singleHighlightCount = 0;
                            const tempHtml2 = multiWordHtml.replace(singleRegex1, (match) => {
                                singleHighlightCount++;
                                return `<span class="temp-word-highlight">${match}</span>`;
                            });

                            if (singleHighlightCount > 0) {
                                multiWordHtml = tempHtml2;
                                highlightCount += singleHighlightCount;
                            } else {
                                const singleRegex2 = new RegExp(`(${escapedSingleWord})`, 'gi');
                                const tempHtml3 = multiWordHtml.replace(singleRegex2, (match) => {
                                    singleHighlightCount++;
                                    return `<span class="temp-word-highlight">${match}</span>`;
                                });
                                if (singleHighlightCount > 0) {
                                    multiWordHtml = tempHtml3;
                                    highlightCount += singleHighlightCount;
                                }
                            }
                        }
                        if (highlightCount > 0) {
                            newHtml = multiWordHtml;
                        }
                    }
                }
            }

            if (highlightCount > 0) {
                element.innerHTML = newHtml;
            }
        } catch {
            return;
        }

        setTimeout(() => {
            const highlights = element.querySelectorAll(".temp-word-highlight");
            highlights.forEach(el => {
                const parent = el.parentNode;
                if (parent) {
                    while (el.firstChild) {
                        parent.insertBefore(el.firstChild, el);
                    }
                    parent.removeChild(el);
                    parent.normalize();
                }
            });
        }, 4000);
    }
}

window.WordNavigationManager = WordNavigationManager;
