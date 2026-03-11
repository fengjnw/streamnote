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
    async translateText(text, index, targetSessionId = null) {
        if (!text || !this.enabled) return;

        try {
            const response = await fetch(this.translateApiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text: text,
                    target_lang: this.language
                })
            });

            if (!response.ok) {
                console.error(`[ERROR] Translation API error: ${response.status}`);
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

        } catch (error) {
            console.error("[ERROR] Translation request failed:", error);
        }
    }

    /**
     * 重新翻译所有内容（仅在语言切换或强制刷新时使用）
     */
    async retranslateAll() {
        const session = this.getSessionData();
        if (!session) return;

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

        // 加载当前语言的缓存
        const currentLangCache = session.translations[this.language] || {};
        this.translationResults = { ...currentLangCache };

        // 检查是否有未翻译的内容
        const preciseResults = this.getPreciseResults();
        let hasUntranslated = false;
        for (const [index, item] of Object.entries(preciseResults)) {
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
