/**
 * KeywordPronunciationManager - handles keyword pronunciation and language detection.
 */
class KeywordPronunciationManager {
    constructor(keywordManager) {
        this.keywordManager = keywordManager;
    }

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
                btn.title = "Pronounce the word";
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
                btn.title = "Stop pronouncing";
                btn.classList.add("pronouncing");
            }
        };

        utterance.onend = () => {
            this.keywordManager.isPronouncing = false;
            const btn = document.getElementById("pronounce-current-word-btn");
            if (btn) {
                btn.title = "Pronounce the word";
                btn.classList.remove("pronouncing");
            }
        };

        utterance.onerror = () => {
            this.keywordManager.isPronouncing = false;
            const btn = document.getElementById("pronounce-current-word-btn");
            if (btn) {
                btn.title = "Pronounce the word";
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

        if (/[áéíóúñüàèìòùâêîôûäëïöü]/.test(word.toLowerCase())) {
            return "es-ES";
        }

        if (/[àâäæçéèêëïîôùûüœ]/.test(word.toLowerCase())) {
            return "fr-FR";
        }

        return "en-US";
    }
}

window.KeywordPronunciationManager = KeywordPronunciationManager;
