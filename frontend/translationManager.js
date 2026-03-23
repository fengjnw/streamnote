/**
 * 翻译管理器 - 前端模块
 * 负责翻译 API 调用、缓存管理、显示更新
 */

class TranslationManager {
    constructor(config = {}) {
        this.translateApiUrl = config.translateApiUrl || "/api/translate";
        this.onTranslationProgress = config.onTranslationProgress || (() => { });
        this.onStatusUpdate = config.onStatusUpdate || (() => { });
        this.onDisplayUpdate = config.onDisplayUpdate || (() => { });

        // 状态
        this.language = "Chinese";
        this.translationResults = {};
        this.enabled = true;

        // 回调获取数据
        this.getSessionData = config.getSessionData || (() => null);
        this.getPreciseResults = config.getPreciseResults || (() => ({}));
        this.saveToSession = config.saveToSession || (() => { });
    }

    /**
     * 设置语言
     */
    setLanguage(language) {
        this.language = language;
    }

    /**
     * 翻译文本 - 流式版本
     */
    async translateText(text, index, targetSessionId = null, context = "") {
        if (!text || !this.enabled) return;

        // === [执行上下文防护] ===
        const app = window.streamNoteInstance;
        const executionContextSnapshot = app ? ExecutionContext.createSnapshot(app) : null;

        // 启动操作追踪
        let operationTracker = null;
        if (app && app.operationManager) {
            operationTracker = app.operationManager.startTranslation(index, executionContextSnapshot);
        }

        try {
            const response = await fetch(this.translateApiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text: text,
                    target_lang: this.language,
                    context: context || ""  // 传递上下文信息以改进翻译准确性
                }),
                signal: operationTracker ? operationTracker.getSignal() : undefined
            });

            if (!response.ok) {
                console.error(`[ERROR] Translation API error: ${response.status}`);
                if (operationTracker) operationTracker.abort(`API error: ${response.status}`);
                if (app && app.operationManager) app.operationManager.endTranslation(index);
                return;
            }

            // 处理流式响应
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let translation = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    // [防护] 检查执行上下文是否仍然有效
                    if (operationTracker && !operationTracker.isValid(app)) {
                        reader.releaseLock();
                        console.log(`[TranslationManager] Index ${index}: Execution context changed: ${ExecutionContext.getChangeReason(executionContextSnapshot, app)}`);
                        return;
                    }

                    const chunk = decoder.decode(value, { stream: true });
                    translation += chunk;

                    // 实时更新显示
                    if (translation) {
                        this.translationResults[index] = translation;
                        this.onTranslationProgress({
                            index: index,
                            translation: translation,
                            isComplete: false
                        });
                        this.onDisplayUpdate();
                        // 保存翻译到正确的session
                        this.saveToSession(targetSessionId);
                    }
                }
                // 刷新解码器缓冲区，获取最后的字符
                const finalChunk = decoder.decode();
                translation += finalChunk;

                // [防护] 保存前最后检查一次执行上下文
                if (operationTracker && !operationTracker.isValid(app)) {
                    console.log(`[TranslationManager] Index ${index}: Context changed before final save, discarding result`);
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

            // [防护] 标记操作完成
            if (operationTracker) {
                operationTracker.abort('Translation completed successfully');
            }
            if (app && app.operationManager) {
                app.operationManager.endTranslation(index);
            }

        } catch (error) {
            console.error("[ERROR] Translation request failed:", error);

            // [防护] 清理操作追踪
            if (operationTracker) {
                operationTracker.abort(`Error: ${error.message}`);
            }
            if (app && app.operationManager) {
                app.operationManager.endTranslation(index);
            }
        }
    }

    /**
     * 重新翻译所有内容（仅在语言切换或强制刷新时使用）
     */
    async retranslateAll() {
        const session = this.getSessionData();
        if (!session) return;

        // === [执行上下文防护 - 记录起始状态] ===
        const app = window.streamNoteInstance;
        const initialLanguage = this.language;
        const initialContextVersion = app ? (app.executionContextVersion || 0) : 0;

        // 检查当前语言的缓存是否完整
        const currentLangCache = session.translations[this.language] || {};
        let hasMissingTranslations = false;

        // 检查是否所有转录都已翻译
        const preciseResults = this.getPreciseResults();
        const totalSegments = Object.keys(preciseResults).length;
        const cachedSegments = Object.keys(currentLangCache).length;
        const missingSegments = [];

        for (const index of Object.keys(preciseResults)) {
            if (!currentLangCache[index]) {
                hasMissingTranslations = true;
                missingSegments.push(index);
            }
        }

        if (!hasMissingTranslations && cachedSegments > 0) {
            // 缓存完整，直接使用
            this.translationResults = { ...currentLangCache };
            this.onDisplayUpdate();
            return;
        }

        // 缓存不完整，只翻译缺失的部分
        const missingCount = missingSegments.length;

        // 显示翻译进度提示
        if (missingCount > 5) {
            this.onStatusUpdate(`Translating to ${this.language}... (${missingCount} segments)`);
        }

        this.translationResults = { ...currentLangCache };  // 保留已有的翻译
        this.onDisplayUpdate();

        // 翻译缺失的部分
        let translated = 0;
        for (const [index, item] of Object.entries(preciseResults)) {
            // [防护] 检查语言或会话是否改变
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

                // 更新进度（避免过于频繁）
                if (missingCount > 5 && translated % 5 === 0) {
                    this.onStatusUpdate(`Translating... ${translated}/${missingCount}`);
                }
            }
        }

        // 翻译完成提示
        if (missingCount > 5) {
            this.onStatusUpdate(`Translation complete (${this.language})`);
            setTimeout(() => {
                this.onStatusUpdate("Ready");
            }, 2000);
        }
    }

    /**
     * 只翻译缺失的内容（用于翻译开关重新打开时）
     */
    async translateMissingContent() {
        const session = this.getSessionData();
        if (!session) return;

        // === [执行上下文防护] ===
        const app = window.streamNoteInstance;
        const initialLanguage = this.language;
        const initialDisplaySessionId = app ? app.displaySessionId : null;

        // 加载当前语言的缓存
        const currentLangCache = session.translations[this.language] || {};
        this.translationResults = { ...currentLangCache };

        // 检查是否有未翻译的内容
        const preciseResults = this.getPreciseResults();
        let hasUntranslated = false;
        for (const [index, item] of Object.entries(preciseResults)) {
            // [防护] 检查会话或语言是否改变
            if (app && (app.displaySessionId !== initialDisplaySessionId || this.language !== initialLanguage)) {
                console.log(`[TranslationManager] translateMissingContent interrupted: session or language changed`);
                break;
            }

            if (item && item.text && !this.translationResults[index]) {
                hasUntranslated = true;
                await this.translateText(item.text, index);
            }
        }

        // 如果没有未翻译的内容，只需要更新显示即可
        if (!hasUntranslated) {
            this.onDisplayUpdate();
        }
    }

    /**
     * 清除所有数据
     */
    clear() {
        this.translationResults = {};
    }

    /**
     * 获取翻译数据
     */
    getTranslationData() {
        return { ...this.translationResults };
    }

    /**
     * 设置翻译数据（用于加载 session）
     */
    setTranslationData(data) {
        this.translationResults = { ...data };
    }

    /**
     * 启用/禁用翻译
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }
}
