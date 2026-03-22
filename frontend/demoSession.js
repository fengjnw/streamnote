/**
 * 示例会话数据 - 用于首次用户引导
 */

const DEMO_SESSION_DATA = {
    id: 'demo-session',
    name: 'Demo - Complete Tutorial',

    // 示例转录内容（演示文本选中和高亮功能）
    transcripts: {
        0: {
            index: 0,
            text: 'Welcome to StreamNote, your intelligent learning assistant. Record classroom lectures or upload transcripts. Get automatic transcription, keyword extraction, instant word explanations, multi-language translation, and powerful summaries to enhance your learning.',
            timestamp: 0,
            source: 'text'
        },
        1: {
            index: 1,
            text: 'StreamNote has a clean, organized layout. Header at the top shows session name and statistics. Center area displays your transcript text. Left sidebar provides quick-access action buttons. Right sidebar contains information panels and tabs.',
            timestamp: 5,
            source: 'text'
        },
        2: {
            index: 2,
            text: 'Left sidebar buttons from top to bottom: 📋 Sessions menu shows all your sessions, ➕ Creates new session, 🎤 Records audio, 📤 Imports documents, ✏️ For Editing, 📖 Shows explanations, 🌐 For Translation.',
            timestamp: 15,
            source: 'text'
        },
        3: {
            index: 3,
            text: 'Right sidebar tabs from top to bottom: 🚩 Highlights tab shows your manually highlighted text, 🏷️ Keywords tab displays auto-extracted important terms, 📃 Summary tab provides intelligent summaries.',
            timestamp: 20,
            source: 'text'
        },
        4: {
            index: 4,
            text: '1. 📚 Add Content: Use the 🎤 to Record audio, or 📤 to import text and documents.',
            timestamp: 25,
            source: 'text'
        },
        5: {
            index: 5,
            text: '2. ✨ Process Text: Select text to 🚩 important phrases, or right-click to 📖 for instant definitions.',
            timestamp: 30,
            source: 'text'
        },
        6: {
            index: 6,
            text: '3. 🔍 Keywords & Highlights: View auto-extracted 🏷️ and your 🚩 in the right sidebar tabs.',
            timestamp: 35,
            source: 'text'
        },
        7: {
            index: 7,
            text: '4. 🌐 Translation: Click 🌐 in sidebar to view translations. Change language from toolbar.',
            timestamp: 40,
            source: 'text'
        },
        8: {
            index: 8,
            text: '5. 📃 Summary: Click 📃 in right sidebar to view intelligent summaries.',
            timestamp: 45,
            source: 'text'
        },
        9: {
            index: 9,
            text: '6. 🚀 Get Started: Click ➕ in sidebar to create new session. Then 🎤 or 📤 to add content.',
            timestamp: 50,
            source: 'text'
        }
    },

    // 翻译版本
    translations: {
        Chinese: {
            0: '欢迎使用StreamNote，您的智能学习助手。录制课堂讲座或上传转录。获取自动转录、关键词提取、即时词语解释、多语言翻译和强大的摘要功能来增强您的学习体验。',
            1: 'StreamNote布局清晰有序。顶部Header显示会话名称和统计信息。中心区域显示您的转录文本。左侧栏提供快速访问的操作按钮。右侧栏包含信息面板和标签。',
            2: '左侧栏按钮从上到下：📋 会话菜单显示所有会话、➕ 创建新会话、🎤 录制音频、📤 导入文档、✏️ 编辑、📖 显示解释、🌐 翻译。',
            3: '右侧栏标签从上到下：🚩 高亮标签显示您手动高亮的文本、🏷️ 关键词标签显示自动提取的重要术语、📃 总结标签提供智能摘要。',
            4: '1. 📚 添加内容：使用🎤录制音频，或使用📤导入文本和文档。',
            5: '2. ✨ 处理文本：选择文本🚩重要短语，或右键点击📖获取即时定义。',
            6: '3. 🔍 关键词和高亮：在右侧栏中查看自动提取的🏷️和您的🚩。',
            7: '4. 🌐 翻译：点击侧栏中的🌐查看翻译。从工具栏更改语言。',
            8: '5. 📃 总结：点击右侧栏中的📃查看智能摘要。',
            9: '6. 🚀 开始使用：点击侧栏中的➕创建新会话。然后🎤或📤添加内容。',
        },
        English: {},
        Spanish: {},
        French: {},
        Japanese: {},
        Korean: {}
    },

    // 自动提取的关键词
    keywords: [
        'Record',
        'Upload',
        'Highlight',
        'Keywords',
        'Translation',
        'Summary'
    ],

    // 手动高亮的关键词（演示高亮功能）
    highlights: [
        'Highlight',
        'Keywords',
        'Summary',
        'Translation'
    ],

    // 高亮位置信息（用于精确提取上下文）
    highlightPositions: {
        'Highlight': {
            sourceIndices: [5],
            startIndex: 18,
            endIndex: 27
        },
        'Keywords': {
            sourceIndices: [6],
            startIndex: 19,
            endIndex: 27
        },
        'Summary': {
            sourceIndices: [8],
            startIndex: 10,
            endIndex: 17
        },
        'Translation': {
            sourceIndices: [7],
            startIndex: 10,
            endIndex: 21
        }
    },

    // 关键词解释缓存
    keywordCache: {
        'Record|English': 'The Record function captures audio from your microphone in real-time and uses automatic speech recognition to convert spoken words into text. This is ideal for converting lectures, meetings, interviews, and verbal notes into searchable, editable documents.',
        'Record|Chinese': '"录制"功能实时从您的麦克风捕获音频，并使用自动语音识别将口语转换为文本。这非常适合将讲座、会议、采访和口头笔记转换为可搜索、可编辑的文档。',

        'Upload|English': 'The Upload feature allows you to import content from various sources including text files, Word documents, PDF files, and previously exported StreamNote sessions. This enables you to work with existing documents and integrate them into your workflow.',
        'Upload|Chinese': '"上传"功能允许您从各种来源导入内容，包括文本文件、Word文档、PDF文件和先前导出的StreamNote会话。这使您能够处理现有文档并将其集成到您的工作流程中。',

        'Highlight|English': 'Highlighting allows you to mark important text passages, phrases, or terminology. Highlighted items are automatically collected in the right panel for easy reference and can be used to create focused study guides or emphasis lists.',
        'Highlight|Chinese': '"高亮"允许您标记重要的文本段落、短语或术语。高亮的项目自动收集在右侧面板中，便于参考，可用于创建重点学习指南或强调列表。',

        'Keywords|English': 'Keywords are important terms and concepts automatically extracted from your content using natural language processing. These help identify the main topics and themes, making it easier to understand the core ideas in your notes.',
        'Keywords|Chinese': '关键词是使用自然语言处理从您的内容中自动提取的重要术语和概念。这些有助于识别主要主题和主题，使更容易理解笔记中的核心思想。',

        'Translation|English': 'The Translation feature provides automatic translation of your content into multiple languages. View translations side-by-side with the original text or toggle between full-screen modes. Perfect for learning languages or working with multilingual content.',
        'Translation|Chinese': '"翻译"功能自动将您的内容翻译成多种语言。并排查看翻译与原始文本，或在全屏模式之间切换。非常适合学习语言或处理多语言内容。',

        'Summary|English': 'The Summary feature generates intelligent, concise summaries of your entire document or transcript. It uses advanced algorithms to identify key points and create meaningful overviews. Summaries are useful for quick review and understanding main concepts.',
        'Summary|Chinese': '"总结"功能为整个文档或转录生成智能、简洁的摘要。它使用高级算法识别关键点并创建有意义的概览。摘要对于快速审查和理解主要概念很有用。',
    },

    // 高亮解释缓存
    highlightCache: {},

    // 解释面板查询词缓存
    explanationCache: {},

    // 总结缓存
    summaryCache: {
        English: 'StreamNote is an intelligent learning assistant for recording lectures and transcripts. It offers automatic transcription, keyword extraction, instant explanations, multi-language translation, and powerful summaries. This tutorial explains the clean organized layout with header and sidebars. Then covers left sidebar buttons (📋 Sessions, ➕ Create, 🎤 Record, 📤 Upload, ✏️ Edit, 📖 Explain, 🌐 Translate) and right sidebar tabs (🚩 Highlights, 🏷️ Keywords, 📃 Summary). Finally follows six workflow steps: 📚 Add Content, ✨ Process Text, 🔍 Keywords & Highlights, 🌐 Translation, 📃 Summary, and 🚀 Get Started.',
        Chinese: 'StreamNote是一个智能学习助手，用于录制课程和转录。它提供自动转录、关键词提取、即时解释、多语言翻译和强大的摘要功能。本教程解释了清晰有序的布局。然后介绍左侧栏按钮(📋 会话、➕ 新建、🎤 录制、📤 上传、✏️ 编辑、📖 解释、🌐 翻译)和右侧栏标签(🚩 高亮、🏷️ 关键词、📃 总结)。最后是六个工作流步骤：📚 添加内容、✨ 处理文本、🔍 关键词和高亮、🌐 翻译、📃 总结、🚀 开始使用。'
    },

    // 元数据
    contentMetadata: {
        source: 'text',
        sourceFile: 'demo.txt',
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
 * 检查是否应该加载示例会话（第一次使用）
 */
function shouldLoadDemoSession() {
    try {
        const sessions = localStorage.getItem('streamnote_sessions');
        // 如果没有已保存的会话，返回 true
        return !sessions || JSON.parse(sessions) === null || Object.keys(JSON.parse(sessions)).length === 0;
    } catch (error) {
        return true;
    }
}

/**
 * 创建示例会话
 */
function createDemoSession() {
    try {
        const sessions = JSON.parse(localStorage.getItem('streamnote_sessions') || '{}');

        // 如果已经存在 demo session，不创建新的
        if (sessions[DEMO_SESSION_DATA.id]) {
            return;
        }

        // 添加示例会话
        sessions[DEMO_SESSION_DATA.id] = DEMO_SESSION_DATA;
        localStorage.setItem('streamnote_sessions', JSON.stringify(sessions));

        // 设置为当前会话
        localStorage.setItem('streamnote_current_session', DEMO_SESSION_DATA.id);
    } catch (error) {
        console.error('[Demo] Error creating demo session:', error);
    }
}
