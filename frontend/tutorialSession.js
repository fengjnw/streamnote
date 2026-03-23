/**
 * 教程会话数据 - 用于首次用户引导
 */

const TUTORIAL_SESSION_DATA = {
    id: 'tutorial-session',
    name: 'Tutorial',

    // 教程转录内容（演示文本选中和高亮功能）
    transcripts: {
        0: {
            index: 0,
            text: 'Welcome to StreamNote, your intelligent learning assistant for managing lecture notes and transcripts.',
            timestamp: 1,
            source: 'text'
        },
        1: {
            index: 1,
            text: 'All feature buttons are on the left and right sidebars. Let\'s explore the main features with a quick walkthrough.',
            timestamp: 6,
            source: 'text'
        },
        2: {
            index: 2,
            text: '1. Start Here: Click ➕ to create a new session for your lecture. You can always come back by clicking 📋 to open sessions, then select Tutorial.',
            timestamp: 11,
            source: 'text'
        },
        3: {
            index: 3,
            text: '2. Record Your Lecture: Click the 🎤 button to record audio, or use 📤 to upload files (DOCX, TXT, PDF), or paste text directly. StreamNote converts audio and documents to text automatically.',
            timestamp: 16,
            source: 'text'
        },
        4: {
            index: 4,
            text: '3. Understand Globally: Click 🌐 to translate your recorded content into other languages. Use the toolbar to select your preferred language.',
            timestamp: 21,
            source: 'text'
        },
        5: {
            index: 5,
            text: '4. Interactive Learning: While reviewing, select important phrases to 🚩 highlight them, or for 📖 instant explanation.',
            timestamp: 26,
            source: 'text'
        },
        6: {
            index: 6,
            text: '5. Extract Key Concepts: Click the 🏷️ button to see auto-extracted keywords from your lecture.',
            timestamp: 31,
            source: 'text'
        },
        7: {
            index: 7,
            text: '6. Quick Review: Click 📃 to get intelligent summaries of the entire lecture. Multiple formats available. Perfect for studying later.',
            timestamp: 36,
            source: 'text'
        }
    },

    // 翻译版本
    translations: {
        Chinese: {},
        English: {},
        Spanish: {},
        French: {},
        Japanese: {},
        Korean: {}
    },

    // 自动提取的关键词
    keywords: [],

    // 手动高亮的关键词（演示高亮功能）
    highlights: [
        'StreamNote',
        'Start Here',
        'Record Your Lecture',
        'Understand Globally',
        'Interactive Learning',
        'Extract Key Concepts',
        'Quick Review'
    ],

    // 高亮位置信息（用于精确提取上下文）
    highlightPositions: {
        'StreamNote': {
            sourceIndices: [0],
            startIndex: 11,
            endIndex: 21
        },
        'Start Here': {
            sourceIndices: [2],
            startIndex: 3,
            endIndex: 13
        },
        'Record Your Lecture': {
            sourceIndices: [3],
            startIndex: 3,
            endIndex: 23
        },
        'Understand Globally': {
            sourceIndices: [4],
            startIndex: 3,
            endIndex: 22
        },
        'Interactive Learning': {
            sourceIndices: [5],
            startIndex: 3,
            endIndex: 23
        },
        'Extract Key Concepts': {
            sourceIndices: [6],
            startIndex: 3,
            endIndex: 23
        },
        'Quick Review': {
            sourceIndices: [7],
            startIndex: 3,
            endIndex: 15
        }
    },

    // 关键词解释缓存
    keywordCache: {},

    // 高亮解释缓存
    highlightCache: {},

    // 解释面板查询词缓存
    explanationCache: {},

    // 总结缓存
    summaryCache: {},

    // 元数据
    contentMetadata: {
        source: 'text',
        sourceFile: 'tutorial.txt',
        uploadTime: Date.now(),
        paragraphCount: 10
    },

    // 解释历史
    explanations: ['Record', 'Upload', 'Highlight', 'Keywords', 'Translation', 'Summary'],
    explanationHistory: [],

    // 设置
    settings: {
        language: 'Chinese',
        explanationLanguage: 'Chinese'
    },

    // 时间戳
    createdAt: Date.now(),
    startTime: Date.now(),
    lastModified: Date.now(),
    lastAccessed: Date.now(),
    lastTextModified: 0
};

/**
 * 检查是否应该加载教程会话（第一次使用）
 */
function shouldLoadTutorialSession() {
    try {
        const sessions = localStorage.getItem('streamnote_sessions');
        // 如果没有已保存的会话，返回 true
        return !sessions || JSON.parse(sessions) === null || Object.keys(JSON.parse(sessions)).length === 0;
    } catch (error) {
        return true;
    }
}

/**
 * 创建教程会话
 */
function createTutorialSession() {
    try {
        const sessions = JSON.parse(localStorage.getItem('streamnote_sessions') || '{}');

        // 始终用最新的教程数据覆盖旧版本（确保用户总是看到最新的教程）
        sessions[TUTORIAL_SESSION_DATA.id] = TUTORIAL_SESSION_DATA;
        localStorage.setItem('streamnote_sessions', JSON.stringify(sessions));

        // 设置为当前会话
        localStorage.setItem('streamnote_current_session', TUTORIAL_SESSION_DATA.id);
    } catch (error) {
        console.error('[Tutorial] Error creating tutorial session:', error);
    }
}
