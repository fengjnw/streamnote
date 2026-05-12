
const WELCOME_SESSION_VERSION = '2026.05.13.1';

function computeWelcomeSessionSignature(session) {
    return JSON.stringify({
        name: session.name,
        transcripts: session.transcripts,
        highlights: session.highlights,
        highlightPositions: session.highlightPositions,
        explanations: session.explanations,
        settings: session.settings
    });
}

function buildWelcomeSessionData() {
    const now = Date.now();

    const data = {
        id: 'welcome-session',
        name: 'Welcome',
        welcomeVersion: WELCOME_SESSION_VERSION,

        transcripts: {
            0: {
                index: 0,
                text: 'Welcome to StreamNote. This workspace is designed to guide your full flow from capture to review and export.',
                timestamp: 1,
                source: 'text'
            },
            1: {
                index: 1,
                text: 'Use the left sidebar from top to bottom: start a session, add content, understand the text, then generate final output.',
                timestamp: 6,
                source: 'text'
            },
            2: {
                index: 2,
                text: 'Start: New Session creates a clean workspace. Sessions lets you switch between saved study contexts or restore previous work.',
                timestamp: 11,
                source: 'text'
            },
            3: {
                index: 3,
                text: 'Account: Use Sign In to create or attach an account. Signed-in sessions can sync to the cloud instead of staying local only.',
                timestamp: 16,
                source: 'text'
            },
            4: {
                index: 4,
                text: 'Input: Record captures live speech. Import adds text, files, or session JSON. Edit lets you refine transcript quality before analysis.',
                timestamp: 21,
                source: 'text'
            },
            5: {
                index: 5,
                text: 'Understand: Translate first for target-language reading, then Keywords to surface the core concepts from the current content.',
                timestamp: 26,
                source: 'text'
            },
            6: {
                index: 6,
                text: 'For translation and explanation, use the language selectors to choose the reading language and the explanation language.',
                timestamp: 31,
                source: 'text'
            },
            7: {
                index: 7,
                text: 'For text selection, select any phrase in the transcript or translation, then use the floating menu to highlight or explain it.',
                timestamp: 36,
                source: 'text'
            },
            8: {
                index: 8,
                text: 'Output: Summary builds a compact overview. Pick a summary style first, then use Refresh to generate or regenerate the result.',
                timestamp: 41,
                source: 'text'
            },
            9: {
                index: 9,
                text: 'Cleanup: Use Clear buttons in the keyword, highlight, explanation, and summary panels to reset a section when needed.',
                timestamp: 46,
                source: 'text'
            },
            10: {
                index: 10,
                text: 'Tip: If labels are hidden, use the top menu button to expand the sidebar and reveal full action names.',
                timestamp: 51,
                source: 'text'
            }
        },

        translations: {
            Chinese: {},
            English: {},
            Spanish: {},
            French: {},
            Japanese: {},
            Korean: {}
        },

        keywords: [],

        highlights: [
            'StreamNote',
            'Start',
            'Account',
            'Input',
            'Understand',
            'language selectors',
            'text selection',
            'Output',
            'Cleanup',
            'Tip'
        ],

        highlightPositions: {
            'StreamNote': {
                sourceIndices: [0],
                startIndex: 11,
                endIndex: 21
            },
            'Start': {
                sourceIndices: [2],
                startIndex: 0,
                endIndex: 5
            },
            'Account': {
                sourceIndices: [3],
                startIndex: 0,
                endIndex: 7
            },
            'Input': {
                sourceIndices: [4],
                startIndex: 0,
                endIndex: 5
            },
            'Understand': {
                sourceIndices: [5],
                startIndex: 0,
                endIndex: 10
            },
            'language selectors': {
                sourceIndices: [6],
                startIndex: 34,
                endIndex: 53
            },
            'text selection': {
                sourceIndices: [7],
                startIndex: 23,
                endIndex: 37
            },
            'Output': {
                sourceIndices: [8],
                startIndex: 0,
                endIndex: 6
            },
            'Cleanup': {
                sourceIndices: [9],
                startIndex: 0,
                endIndex: 7
            },
            'Tip': {
                sourceIndices: [10],
                startIndex: 0,
                endIndex: 3
            }
        },

        keywordCache: {},

        highlightCache: {},

        explanationCache: {},

        summaryCache: {},

        contentMetadata: {
            source: 'text',
            sourceFile: 'welcome.txt',
            uploadTime: now,
            paragraphCount: 11
        },

        explanations: ['Session', 'Account', 'Record', 'Import', 'Translate', 'Keywords', 'Highlights', 'Summary', 'Export', 'Sync', 'Settings'],
        explanationHistory: [],

        settings: {
            language: 'Chinese',
            explanationLanguage: 'English'
        },

        createdAt: now,
        startTime: now,
        lastModified: now,
        lastAccessed: now,
        lastTextModified: 0
    };

    data.welcomeSignature = computeWelcomeSessionSignature(data);
    return data;
}

const WELCOME_SESSION_DATA = buildWelcomeSessionData();

function shouldLoadWelcomeSession() {
    try {
        const sessions = localStorage.getItem('streamnote_sessions');
        return !sessions || JSON.parse(sessions) === null || Object.keys(JSON.parse(sessions)).length === 0;
    } catch {
        return true;
    }
}

function createWelcomeSession() {
    try {
        const sessions = JSON.parse(localStorage.getItem('streamnote_sessions') || '{}');
        const welcomeData = buildWelcomeSessionData();

        sessions[welcomeData.id] = welcomeData;
        localStorage.setItem('streamnote_sessions', JSON.stringify(sessions));

        localStorage.setItem('streamnote_current_session', welcomeData.id);
    } catch (error) {
        console.error('[Welcome] Error creating welcome session:', error);
    }
}

function syncWelcomeSessionVersion() {
    try {
        const sessionsRaw = localStorage.getItem('streamnote_sessions');
        if (!sessionsRaw) {
            return false;
        }

        const sessions = JSON.parse(sessionsRaw);
        const welcomeId = WELCOME_SESSION_DATA.id;
        const existing = sessions && typeof sessions === 'object' ? sessions[welcomeId] : null;

        if (!existing) {
            return false;
        }

        const latest = buildWelcomeSessionData();
        if (
            existing.welcomeVersion === WELCOME_SESSION_VERSION
            && existing.welcomeSignature === latest.welcomeSignature
        ) {
            return false;
        }

        const upgraded = latest;
        const now = Date.now();

        // Preserve stable timestamps when upgrading existing welcome content.
        upgraded.createdAt = existing.createdAt || upgraded.createdAt;
        upgraded.startTime = existing.startTime || upgraded.startTime;
        upgraded.lastAccessed = existing.lastAccessed || now;
        upgraded.lastModified = now;

        sessions[welcomeId] = upgraded;
        localStorage.setItem('streamnote_sessions', JSON.stringify(sessions));
        return true;
    } catch (error) {
        console.error('[Welcome] Error syncing welcome session version:', error);
        return false;
    }
}

syncWelcomeSessionVersion();

window.shouldLoadWelcomeSession = shouldLoadWelcomeSession;
window.createWelcomeSession = createWelcomeSession;
window.syncWelcomeSessionVersion = syncWelcomeSessionVersion;
