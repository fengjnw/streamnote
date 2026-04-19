

const WELCOME_SESSION_DATA = {
    id: 'welcome-session',
    name: 'Welcome',

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
            text: 'Understand: Translate rewrites content into your target language. Explain helps you inspect difficult phrases in context.',
            timestamp: 21,
            source: 'text'
        },
        5: {
            index: 5,
            text: 'Deepen: Keywords surfaces core concepts, and Highlights marks important lines for later review and revision.',
            timestamp: 26,
            source: 'text'
        },
        6: {
            index: 6,
            text: 'Output: Summary builds a compact overview for quick recap, while Export saves your session artifacts for reuse.',
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
        'Deepen',
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
        'Deepen': {
            sourceIndices: [5],
            startIndex: 0,
            endIndex: 6
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
        uploadTime: Date.now(),
        paragraphCount: 8
    },

    explanations: ['Session', 'Record', 'Import', 'Translate', 'Keywords', 'Summary'],
    explanationHistory: [],

    settings: {
        language: 'Chinese',
        explanationLanguage: 'Chinese'
    },

    createdAt: Date.now(),
    startTime: Date.now(),
    lastModified: Date.now(),
    lastAccessed: Date.now(),
    lastTextModified: 0
};

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

        sessions[WELCOME_SESSION_DATA.id] = WELCOME_SESSION_DATA;
        localStorage.setItem('streamnote_sessions', JSON.stringify(sessions));

        localStorage.setItem('streamnote_current_session', WELCOME_SESSION_DATA.id);
    } catch (error) {
        console.error('[Welcome] Error creating welcome session:', error);
    }
}

window.shouldLoadWelcomeSession = shouldLoadWelcomeSession;
window.createWelcomeSession = createWelcomeSession;
