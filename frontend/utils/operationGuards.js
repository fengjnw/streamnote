/**
 * OperationGuards - shared helpers to reduce repetitive operation/context guard boilerplate.
 */
class OperationGuards {
    static start(app, operationType, options = {}) {
        if (!app || !app.operationManager) {
            return null;
        }

        const index = options?.index;
        const startMethodFactory = {
            summary: () => ({ method: "startSummary", args: [] }),
            keywords: () => ({ method: "startKeywords", args: [] }),
            explanation: () => ({ method: "startExplanation", args: [] }),
            translation: () => ({ method: "startTranslation", args: [index] }),
        };

        const startConfigFactory = startMethodFactory[operationType];
        if (!startConfigFactory) {
            return null;
        }

        const startConfig = startConfigFactory();
        if (!startConfig?.method || typeof app.operationManager[startConfig.method] !== "function") {
            return null;
        }

        if (operationType === "translation" && (index === undefined || index === null)) {
            return null;
        }

        const snapshot = ExecutionContext.createSnapshot(app);
        const tracker = app.operationManager[startConfig.method](...startConfig.args, snapshot);

        return {
            app,
            operationType,
            snapshot,
            tracker,
            meta: {
                index,
            },
        };
    }

    static isValid(operation) {
        if (!operation || !operation.tracker || !operation.app) {
            return true;
        }
        return operation.tracker.isValid(operation.app);
    }

    static getSignal(operation) {
        return operation?.tracker?.getSignal();
    }

    static getChangeReason(operation) {
        if (!operation || !operation.snapshot || !operation.app) {
            return "Context changed";
        }
        return ExecutionContext.getChangeReason(operation.snapshot, operation.app);
    }

    static endOnce(operation) {
        let ended = false;
        return (reason) => {
            if (!ended) {
                OperationGuards.end(operation, reason);
                ended = true;
            }
        };
    }

    static end(operation, reason) {
        if (!operation) {
            return;
        }

        if (operation.tracker) {
            operation.tracker.abort(reason || `${operation.operationType} completed`);
        }

        const endMethodFactory = {
            summary: () => ({ method: "endSummary", args: [] }),
            keywords: () => ({ method: "endKeywords", args: [] }),
            explanation: () => ({ method: "endExplanation", args: [] }),
            translation: () => ({ method: "endTranslation", args: [operation?.meta?.index] }),
        };

        const endConfigFactory = endMethodFactory[operation.operationType];
        if (!endConfigFactory) {
            return;
        }

        const endConfig = endConfigFactory();
        if (!endConfig?.method) {
            return;
        }

        if (operation.operationType === "translation" && (operation?.meta?.index === undefined || operation?.meta?.index === null)) {
            return;
        }

        if (operation.app?.operationManager && typeof operation.app.operationManager[endConfig.method] === "function") {
            operation.app.operationManager[endConfig.method](...endConfig.args);
        }
    }
}

window.OperationGuards = OperationGuards;
