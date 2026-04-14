/**
 * 执行上下文管理系统
 * 用于防止并发操作导致的竞态条件（会话切换、语言切换、格式切换等）
 */

class ExecutionContext {
    /**
     * 创建上下文快照
     * @param {Object} app - StreamNote 实例
     * @returns {Object} 上下文快照
     */
    static createSnapshot(app) {
        return {
            sessionId: app.displaySessionId,
            recordingSessionId: app.recordingSessionId,
            translationLanguage: app.language,
            explanationLanguage: app.explanationLanguage,
            contextVersion: app.executionContextVersion || 0,
            timestamp: Date.now()
        };
    }

    /**
     * 验证上下文是否仍然有效
     * @param {Object} snapshot - 创建时的快照
     * @param {Object} app - 当前StreamNote实例
     * @returns {boolean} 上下文是否仍然有效
     */
    static isValid(snapshot, app) {
        if (!snapshot || !app) return false;

        return (
            snapshot.sessionId === app.displaySessionId &&
            snapshot.recordingSessionId === app.recordingSessionId &&
            snapshot.translationLanguage === app.language &&
            snapshot.explanationLanguage === app.explanationLanguage &&
            snapshot.contextVersion === (app.executionContextVersion || 0)
        );
    }

    /**
     * 获取上下文变更的原因
     * @param {Object} snapshot - 创建时的快照
     * @param {Object} app - 当前StreamNote实例
     * @returns {string} 变更原因
     */
    static getChangeReason(snapshot, app) {
        if (!snapshot || !app) return 'Unknown change';

        if (snapshot.sessionId !== app.displaySessionId) {
            return `Session changed from ${snapshot.sessionId} to ${app.displaySessionId}`;
        }
        if (snapshot.translationLanguage !== app.language) {
            return `Translation language changed from ${snapshot.translationLanguage} to ${app.language}`;
        }
        if (snapshot.explanationLanguage !== app.explanationLanguage) {
            return `Explanation language changed from ${snapshot.explanationLanguage} to ${app.explanationLanguage}`;
        }
        if (snapshot.contextVersion !== (app.executionContextVersion || 0)) {
            return `Context version changed`;
        }
        return 'Context changed';
    }
}

/**
 * 操作追踪器 - 管理单个长时间运行的操作（如解释流、翻译流等）
 */
class OperationTracker {
    constructor(operationType, context) {
        this.operationType = operationType;  // 'explanation', 'translation', 'summary', 等
        this.context = context;              // 创建时的执行上下文
        this.controller = new AbortController();
        this.startTime = Date.now();
        this.isAborted = false;
    }

    /**
     * 检查操作是否仍然有效
     * @param {Object} app - 当前StreamNote实例
     * @returns {boolean} 操作是否仍然有效
     */
    isValid(app) {
        return !this.isAborted && ExecutionContext.isValid(this.context, app);
    }

    /**
     * 标记操作为已中止
     * @param {string} reason - 中止原因
     */
    abort(reason = 'Unknown reason') {
        if (!this.isAborted) {
            this.isAborted = true;
            this.controller.abort();
            const duration = Date.now() - this.startTime;
            console.log(`[OperationTracker] ${this.operationType} aborted (${duration}ms): ${reason}`);
        }
    }

    /**
     * 获取 AbortSignal（用于 fetch）
     */
    getSignal() {
        return this.controller.signal;
    }

    /**
     * 检查是否已被中止
     */
    isAbortedBySignal() {
        return this.controller.signal.aborted;
    }
}

/**
 * 全局操作管理器 - 在应用级别管理所有长时间运行的操作
 */
class OperationManager {
    constructor() {
        this.activeOperations = {
            explanation: null,    // 当前活跃的解释操作
            translation: [],      // 多个翻译操作（不同段落）
            summary: null,        // 当前摘要生成
            keywords: null        // 当前关键词提取
        };
    }

    /**
     * 开启新的解释操作（自动中止前一个）
     */
    startExplanation(context) {
        if (this.activeOperations.explanation) {
            this.activeOperations.explanation.abort('New explanation requested');
        }
        this.activeOperations.explanation = new OperationTracker('explanation', context);
        return this.activeOperations.explanation;
    }

    /**
     * 完成或中止解释操作
     */
    endExplanation() {
        if (this.activeOperations.explanation) {
            this.activeOperations.explanation.abort('Explanation completed');
        }
        this.activeOperations.explanation = null;
    }

    /**
     * 开启新的翻译操作
     */
    startTranslation(index, context) {
        const tracker = new OperationTracker(`translation[${index}]`, context);
        this.activeOperations.translation[index] = tracker;
        return tracker;
    }

    /**
     * 完成翻译操作
     */
    endTranslation(index) {
        if (this.activeOperations.translation[index]) {
            this.activeOperations.translation[index].abort('Translation completed');
            this.activeOperations.translation[index] = null;
        }
    }

    /**
     * 开启新的摘要生成操作（自动中止前一个）
     */
    startSummary(context) {
        if (this.activeOperations.summary) {
            this.activeOperations.summary.abort('New summary requested');
        }
        this.activeOperations.summary = new OperationTracker('summary', context);
        return this.activeOperations.summary;
    }

    /**
     * 完成摘要生成操作
     */
    endSummary() {
        if (this.activeOperations.summary) {
            this.activeOperations.summary.abort('Summary completed');
        }
        this.activeOperations.summary = null;
    }

    /**
     * 开启新的关键词提取操作（自动中止前一个）
     */
    startKeywords(context) {
        if (this.activeOperations.keywords) {
            this.activeOperations.keywords.abort('New keywords requested');
        }
        this.activeOperations.keywords = new OperationTracker('keywords', context);
        return this.activeOperations.keywords;
    }

    /**
     * 完成关键词提取操作
     */
    endKeywords() {
        if (this.activeOperations.keywords) {
            this.activeOperations.keywords.abort('Keywords completed');
        }
        this.activeOperations.keywords = null;
    }

    /**
     * 语言切换时，中止所有翻译
     */
    abortAllTranslations(reason) {
        this.activeOperations.translation.forEach((op, index) => {
            if (op) {
                op.abort(reason);
                this.activeOperations.translation[index] = null;
            }
        });
        this.activeOperations.translation = [];
    }

    /**
     * 会话切换时，中止所有操作
     */
    abortAll(reason) {
        if (this.activeOperations.explanation) {
            this.activeOperations.explanation.abort(reason);
            this.activeOperations.explanation = null;
        }
        this.abortAllTranslations(reason);
        if (this.activeOperations.summary) {
            this.activeOperations.summary.abort(reason);
            this.activeOperations.summary = null;
        }
        if (this.activeOperations.keywords) {
            this.activeOperations.keywords.abort(reason);
            this.activeOperations.keywords = null;
        }
        console.log(`[OperationManager] All operations aborted: ${reason}`);
    }

    /**
     * 获取当前活跃操作数
     */
    getActiveCount() {
        let count = 0;
        if (this.activeOperations.explanation) count++;
        if (this.activeOperations.summary) count++;
        if (this.activeOperations.keywords) count++;
        count += this.activeOperations.translation.filter(op => op && !op.isAborted).length;
        return count;
    }
}

window.ExecutionContext = ExecutionContext;
window.OperationTracker = OperationTracker;
window.OperationManager = OperationManager;
