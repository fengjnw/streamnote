module.exports = [
    {
        files: ["frontend/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: {
                window: "readonly",
                document: "readonly",
                navigator: "readonly",
                localStorage: "readonly",
                sessionStorage: "readonly",
                fetch: "readonly",
                Blob: "readonly",
                FormData: "readonly",
                URL: "readonly",
                URLSearchParams: "readonly",
                TextDecoder: "readonly",
                AbortController: "readonly",
                FileReader: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                console: "readonly",
                OperationGuards: "readonly",
                TextFormatters: "readonly",
                markdownit: "readonly",
                mammoth: "readonly",
                pdfjsLib: "readonly"
            }
        },
        linterOptions: {
            reportUnusedDisableDirectives: "warn"
        },
        rules: {
            "no-undef": "off",
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
        }
    }
];
