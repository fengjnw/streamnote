
// Guard async workflows by capturing session/language context snapshots.
class ExecutionContext {
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

class OperationTracker {
    constructor(operationType, context) {
        this.operationType = operationType;
        this.context = context;
        this.controller = new AbortController();
        this.startTime = Date.now();
        this.isAborted = false;
    }

    isValid(app) {
        return !this.isAborted && ExecutionContext.isValid(this.context, app);
    }

    abort(reason = 'Unknown reason') {
        if (!this.isAborted) {
            this.isAborted = true;
            this.controller.abort();
            const duration = Date.now() - this.startTime;
            console.log(`[OperationTracker] ${this.operationType} aborted (${duration}ms): ${reason}`);
        }
    }

    getSignal() {
        return this.controller.signal;
    }

    isAbortedBySignal() {
        return this.controller.signal.aborted;
    }
}

class OperationManager {
    constructor() {
        this.activeOperations = {
            explanation: null,
            translation: [],
            summary: null,
            keywords: null
        };
    }

    startExplanation(context) {
        if (this.activeOperations.explanation) {
            this.activeOperations.explanation.abort('New explanation requested');
        }
        this.activeOperations.explanation = new OperationTracker('explanation', context);
        return this.activeOperations.explanation;
    }

    endExplanation() {
        if (this.activeOperations.explanation) {
            this.activeOperations.explanation.abort('Explanation completed');
        }
        this.activeOperations.explanation = null;
    }

    startTranslation(index, context) {
        const tracker = new OperationTracker(`translation[${index}]`, context);
        this.activeOperations.translation[index] = tracker;
        return tracker;
    }

    endTranslation(index) {
        if (this.activeOperations.translation[index]) {
            this.activeOperations.translation[index].abort('Translation completed');
            this.activeOperations.translation[index] = null;
        }
    }

    startSummary(context) {
        if (this.activeOperations.summary) {
            this.activeOperations.summary.abort('New summary requested');
        }
        this.activeOperations.summary = new OperationTracker('summary', context);
        return this.activeOperations.summary;
    }

    endSummary() {
        if (this.activeOperations.summary) {
            this.activeOperations.summary.abort('Summary completed');
        }
        this.activeOperations.summary = null;
    }

    startKeywords(context) {
        if (this.activeOperations.keywords) {
            this.activeOperations.keywords.abort('New keywords requested');
        }
        this.activeOperations.keywords = new OperationTracker('keywords', context);
        return this.activeOperations.keywords;
    }

    endKeywords() {
        if (this.activeOperations.keywords) {
            this.activeOperations.keywords.abort('Keywords completed');
        }
        this.activeOperations.keywords = null;
    }

    // Translation can run per paragraph, so keep independent trackers by index.
    abortAllTranslations(reason) {
        this.activeOperations.translation.forEach((op, index) => {
            if (op) {
                op.abort(reason);
                this.activeOperations.translation[index] = null;
            }
        });
        this.activeOperations.translation = [];
    }

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
