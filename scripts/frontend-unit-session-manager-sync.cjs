const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const sessionManagerPath = path.join(repoRoot, "frontend", "managers", "session", "sessionManager.js");
const source = fs.readFileSync(sessionManagerPath, "utf8");

const context = {
    console,
    window: {},
    localStorage: {
        _data: {},
        getItem(key) {
            return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null;
        },
        setItem(key, value) {
            this._data[key] = String(value);
        },
        removeItem(key) {
            delete this._data[key];
        },
    },
};

vm.createContext(context);
vm.runInContext(source, context);

const SessionManager = context.window.SessionManager;
assert(SessionManager, "SessionManager should be attached to window");

function runCheck(name, fn) {
    fn();
    console.log(`  [OK] ${name}`);
}

function createSessionManagerLikeInstance() {
    const instance = Object.create(SessionManager.prototype);
    instance.RESERVED_SESSION_IDS = ["welcome-session"];
    return instance;
}

function testEquivalentWithLegacySessionIdAndDeprecatedDefaults() {
    const sm = createSessionManagerLikeInstance();

    const localState = {
        sessions: {
            "welcome-session": {
                id: "welcome-session",
                name: "Welcome",
                transcripts: { "0": { text: "hello", timestamp: 1 } },
                translations: { English: {} },
                settings: { language: "Chinese" },
                lastModified: 100,
            },
        },
        currentSessionId: "welcome-session",
        defaultSettings: {
            defaultLanguage: "Chinese",
            defaultExplanationLanguage: "Chinese",
        },
    };

    const remoteState = {
        sessions: {
            "tutorial-session": {
                id: "tutorial-session",
                name: "Tutorial",
                transcripts: { "0": { text: "hello", timestamp: 1 } },
                translations: { English: {} },
                settings: { language: "Chinese" },
                lastModified: 100,
            },
        },
        currentSessionId: "tutorial-session",
        defaultSettings: {
            loadWelcomeSession: true,
            loadTutorialSession: true,
            defaultExplanationLanguage: "Chinese",
            defaultLanguage: "Chinese",
        },
    };

    const equivalent = sm.statesAreEquivalent(localState, remoteState);
    assert.strictEqual(equivalent, true, "Legacy tutorial-session and deprecated defaults should normalize as equivalent");
}

function testEquivalentIgnoresObjectKeyOrder() {
    const sm = createSessionManagerLikeInstance();

    const stateA = {
        sessions: {
            "1": {
                id: "1",
                name: "A",
                transcripts: {
                    "0": { text: "one", timestamp: 1 },
                    "1": { text: "two", timestamp: 2 },
                },
                settings: { language: "Chinese", explanationLanguage: "Chinese" },
                lastModified: 200,
            },
        },
        currentSessionId: "1",
        defaultSettings: {
            defaultLanguage: "Chinese",
            defaultExplanationLanguage: "Chinese",
        },
    };

    const stateB = {
        defaultSettings: {
            defaultExplanationLanguage: "Chinese",
            defaultLanguage: "Chinese",
        },
        currentSessionId: "1",
        sessions: {
            "1": {
                name: "A",
                id: "1",
                lastModified: 200,
                settings: { explanationLanguage: "Chinese", language: "Chinese" },
                transcripts: {
                    "1": { timestamp: 2, text: "two" },
                    "0": { timestamp: 1, text: "one" },
                },
            },
        },
    };

    const equivalent = sm.statesAreEquivalent(stateA, stateB);
    assert.strictEqual(equivalent, true, "Different key order should not trigger false conflict");
}

function testNonEquivalentWhenTranscriptActuallyDiffers() {
    const sm = createSessionManagerLikeInstance();

    const stateA = {
        sessions: {
            "1": {
                id: "1",
                name: "A",
                transcripts: { "0": { text: "hello", timestamp: 1 } },
                lastModified: 100,
            },
        },
        currentSessionId: "1",
        defaultSettings: {},
    };

    const stateB = {
        sessions: {
            "1": {
                id: "1",
                name: "A",
                transcripts: { "0": { text: "hello world", timestamp: 1 } },
                lastModified: 100,
            },
        },
        currentSessionId: "1",
        defaultSettings: {},
    };

    const equivalent = sm.statesAreEquivalent(stateA, stateB);
    assert.strictEqual(equivalent, false, "Actual content difference must remain non-equivalent");
}

function run() {
    console.log("Frontend unit tests (SessionManager sync equivalence)");
    runCheck("normalizes legacy tutorial-session and deprecated default settings", testEquivalentWithLegacySessionIdAndDeprecatedDefaults);
    runCheck("ignores object key order when comparing states", testEquivalentIgnoresObjectKeyOrder);
    runCheck("detects true transcript content difference", testNonEquivalentWhenTranscriptActuallyDiffers);
    console.log("Frontend unit test (SessionManager sync equivalence) passed.");
}

run();
