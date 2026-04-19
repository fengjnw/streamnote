
const WELCOME_SESSION_VERSION = '2026.04.19.1';

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
            text: 'Welcome to StreamNote. This workspace is designed so the interface itself guides your flow from capture to output.',
            timestamp: 1,
            source: 'text'
        },
        1: {
            index: 1,
            text: 'Use the left sidebar from top to bottom: Start a session, add content, understand the text, then generate final output.',
            timestamp: 6,
            source: 'text'
        },
        2: {
            index: 2,
            text: 'Start: New Session creates a clean workspace. Sessions lets you switch between saved study contexts at any time.',
            timestamp: 11,
            source: 'text'
        },
        3: {
            index: 3,
            text: 'Input: Record captures live speech. Import adds text or files. Edit lets you refine transcript quality before analysis.',
            timestamp: 16,
            source: 'text'
        },
        4: {
            index: 4,
            text: 'Understand: Follow the same toolbar order: Translate first for target-language reading, then Keywords to surface core concepts quickly.',
            timestamp: 21,
            source: 'text'
        },
        5: {
            index: 5,
            text: 'For Highlights and Explain, the primary workflow is text selection: select any phrase in transcript or translation, then use the floating menu to choose 🚩 Highlight or 📖 Explain.',
            timestamp: 26,
            source: 'text'
        },
        6: {
            index: 6,
            text: 'Output: Summary builds a compact overview for quick recap and study follow-up.',
            timestamp: 31,
            source: 'text'
        },
        7: {
            index: 7,
            text: 'Tip: If labels are hidden, use the top menu button to expand the sidebar and reveal full action names.',
            timestamp: 36,
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
        'Input',
        'Understand',
        'Keywords',
        'Output',
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
        'Input': {
            sourceIndices: [3],
            startIndex: 0,
            endIndex: 5
        },
        'Understand': {
            sourceIndices: [4],
            startIndex: 0,
            endIndex: 10
        },
        'Keywords': {
            sourceIndices: [5],
            startIndex: 26,
            endIndex: 34
        },
        'Output': {
            sourceIndices: [6],
            startIndex: 0,
            endIndex: 6
        },
        'Tip': {
            sourceIndices: [7],
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
        paragraphCount: 8
    },

    explanations: ['Session', 'Record', 'Import', 'Translate', 'Keywords', 'Summary'],
    explanationHistory: [],

    settings: {
        language: 'Chinese',
        explanationLanguage: 'Chinese'
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
