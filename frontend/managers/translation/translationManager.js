

class TranslationManager {
    constructor(config = {}) {
        this.translateApiUrl = config.translateApiUrl || "/api/translate";
        this.apiClient = config.apiClient || null;
        this.onTranslationProgress = config.onTranslationProgress || (() => { });
        this.onStatusUpdate = config.onStatusUpdate || (() => { });
        this.onDisplayUpdate = config.onDisplayUpdate || (() => { });

        this.language = "Chinese";
        this.translationResults = {};
        this.enabled = true;

        this.getSessionData = config.getSessionData || (() => null);
        this.getPreciseResults = config.getPreciseResults || (() => ({}));
        this.saveToSession = config.saveToSession || (() => { });
    }

    setLanguage(language) {
        this.language = language;
    }

    async translateText(text, index, targetSessionId = null, context = "") {
        if (!text || !this.enabled) return;

        const app = window.streamNoteInstance;
        // Bind this request to current execution context; stale results are discarded.
        const translationOperation = OperationGuards.start(app, "translation", { index });
        const endTranslationOperation = OperationGuards.endOnce(translationOperation);

        try {
            const payload = {
                text: text,
                target_lang: this.language,
                context: context || ""
            };
            const signal = OperationGuards.getSignal(translationOperation);

            const response = this.apiClient
                ? await this.apiClient.translate(payload, signal)
                : await fetch(this.translateApiUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload),
                    signal,
                });

            if (!response.ok) {
                console.error(`[ERROR] Translation API error: ${response.status}`);
                endTranslationOperation(`API error: ${response.status}`);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let translation = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    if (!OperationGuards.isValid(translationOperation)) {
                        console.log(`[TranslationManager] Index ${index}: Execution context changed: ${OperationGuards.getChangeReason(translationOperation)}`);
                        endTranslationOperation('Execution context changed during stream');
                        return;
                    }

                    const chunk = decoder.decode(value, { stream: true });
                    translation += chunk;

                    if (translation) {
                        // Save incremental stream output so UI stays responsive for long responses.
                        this.translationResults[index] = translation;
                        this.onTranslationProgress({
                            index: index,
                            translation: translation,
                            isComplete: false
                        });
                        this.onDisplayUpdate();
                        this.saveToSession(targetSessionId);
                    }
                }
                const finalChunk = decoder.decode();
                translation += finalChunk;

                if (!OperationGuards.isValid(translationOperation)) {
                    console.log(`[TranslationManager] Index ${index}: Context changed before final save, discarding result`);
                    endTranslationOperation('Context changed before final save');
                    return;
                }

                if (finalChunk) {
                    this.translationResults[index] = translation;
                    this.onTranslationProgress({
                        index: index,
                        translation: translation,
                        isComplete: true
                    });
                    this.onDisplayUpdate();
                    this.saveToSession(targetSessionId);
                }
            } finally {
                reader.releaseLock();
            }

            endTranslationOperation('Translation completed successfully');

        } catch (error) {
            console.error("[ERROR] Translation request failed:", error);

            endTranslationOperation(`Error: ${error.message}`);
        }
    }

    async retranslateAll() {
        const session = this.getSessionData();
        if (!session) return;

        const app = window.streamNoteInstance;
        const initialLanguage = this.language;
        const initialContextVersion = app ? (app.executionContextVersion || 0) : 0;

        const currentLangCache = session.translations[this.language] || {};
        let hasMissingTranslations = false;

        const preciseResults = this.getPreciseResults();
        const cachedSegments = Object.keys(currentLangCache).length;
        const missingSegments = [];

        for (const index of Object.keys(preciseResults)) {
            if (!currentLangCache[index]) {
                hasMissingTranslations = true;
                missingSegments.push(index);
            }
        }

        if (!hasMissingTranslations && cachedSegments > 0) {
            this.translationResults = { ...currentLangCache };
            this.onDisplayUpdate();
            return;
        }

        const missingCount = missingSegments.length;

        if (missingCount > 5) {
            this.onStatusUpdate(`Translating to ${this.language}... (${missingCount} segments)`);
        }

        this.translationResults = { ...currentLangCache };
        this.onDisplayUpdate();

        let translated = 0;
        // Re-translate only missing segments; keep cache hits untouched.
        for (const [index, item] of Object.entries(preciseResults)) {
            if (app && (this.language !== initialLanguage || (app.executionContextVersion || 0) !== initialContextVersion)) {
                console.log(`[TranslationManager] retranslateAll interrupted: language or context changed`);
                if (missingCount > 5) {
                    this.onStatusUpdate(`Translation interrupted`);
                }
                break;
            }

            if (item && item.text && !this.translationResults[index]) {
                await this.translateText(item.text, index);
                translated++;

                if (missingCount > 5 && translated % 5 === 0) {
                    this.onStatusUpdate(`Translating... ${translated}/${missingCount}`);
                }
            }
        }

        if (missingCount > 5) {
            this.onStatusUpdate(`Translation complete (${this.language})`);
            setTimeout(() => {
                this.onStatusUpdate("Ready");
            }, 2000);
        }
    }

    async translateMissingContent() {
        const session = this.getSessionData();
        if (!session) return;

        const app = window.streamNoteInstance;
        const initialLanguage = this.language;
        const initialDisplaySessionId = app ? app.displaySessionId : null;

        const currentLangCache = session.translations[this.language] || {};
        this.translationResults = { ...currentLangCache };

        const preciseResults = this.getPreciseResults();
        let hasUntranslated = false;
        for (const [index, item] of Object.entries(preciseResults)) {
            if (app && (app.displaySessionId !== initialDisplaySessionId || this.language !== initialLanguage)) {
                console.log(`[TranslationManager] translateMissingContent interrupted: session or language changed`);
                break;
            }

            if (item && item.text && !this.translationResults[index]) {
                hasUntranslated = true;
                await this.translateText(item.text, index);
            }
        }

        if (!hasUntranslated) {
            this.onDisplayUpdate();
        }
    }

    clear() {
        this.translationResults = {};
    }

    getTranslationData() {
        return { ...this.translationResults };
    }

    setTranslationData(data) {
        this.translationResults = { ...data };
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }
}

window.TranslationManager = TranslationManager;
