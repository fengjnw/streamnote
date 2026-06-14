const { spawnSync } = require("child_process");

function printSection(title, lines = []) {
    console.log(`\n=== ${title} ===`);
    for (const line of lines) {
        console.log(`- ${line}`);
    }
}

function runStep(step, index, total) {
    const { label, command, args, covers } = step;
    printSection(`Step ${index + 1}/${total}: ${label}`, covers);
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.error) {
        console.error(`\n[FAILED] ${label}: ${result.error.message}`);
        process.exit(1);
    }
    if (result.status !== 0) {
        console.error(`\n[FAILED] ${label} (exit code: ${result.status})`);
        if (label.includes("Backend tests")) {
            console.error("Hint: if you see 'No module named pytest', install backend dependencies in your active Python env:");
            console.error("  python3 -m pip install -r requirements.txt");
        }
        process.exit(result.status || 1);
    }
    console.log(`[PASSED] ${label}`);
}

console.log("\nStreamNote detailed test run");
printSection("How To Read", [
    "Coverage buckets describe WHAT functional areas are validated.",
    "Execution stages describe HOW checks are run in sequence.",
]);

printSection("Coverage Buckets (3)", [
    "Basic functions: page structure, script loading order, text cleanup, file validation, health check, upload parameter validation",
    "Core functions: transcription input boundaries, keyword/translation/explanation/summary JSON API contracts, file extraction core logic",
    "Utility & API: date/time formatting, text formatting, request validation, error handling, authentication store, API client",
]);

const steps = [
    {
        label: "[Frontend] Lint",
        command: "npm",
        args: ["run", "lint"],
        covers: ["Frontend syntax and static rules"],
    },
    {
        label: "[Frontend] Unit tests",
        command: "npm",
        args: ["run", "test:frontend:unit"],
        covers: [
            "Core text-processing logic: cleanText/validateFile/convertToPreciseResults",
            "Session sync equivalence normalization: legacy IDs, deprecated defaults, stable key-order-insensitive compare",
            "Utility functions: date/time formatting, text formatting, regex escaping",
            "API client: HTTP requests, endpoint contracts, error handling",
        ],
    },
    {
        label: "[Backend] Error & validation utils",
        command: "npm",
        args: ["run", "test:backend:utils"],
        covers: ["Error formatting", "Request JSON validation", "Password hashing", "Session management"],
    },
    {
        label: "[Frontend] Smoke tests",
        command: "npm",
        args: ["run", "test:frontend:smoke"],
        covers: ["Required DOM elements exist", "Entrypoint script dependencies exist", "Critical script loading order"],
    },
    {
        label: "[Frontend] Adaptive smoke tests",
        command: "npm",
        args: ["run", "test:frontend:adaptive"],
        covers: [
            "Mobile toolbar and More menu structure",
            "Adaptive touch target CSS guards",
            "Tablet/mobile auxiliary panel coordination",
            "Mobile secondary menu positioning",
        ],
    },
    {
        label: "[Backend] API + unit tests",
        command: "npm",
        args: ["run", "test:backend"],
        covers: ["API error contract", "File upload/extraction logic", "Core endpoint baseline behavior"],
    },
];

printSection("Execution Stages (5)", steps.map((step, index) => `${index + 1}. ${step.label}`));

steps.forEach((step, index) => runStep(step, index, steps.length));

console.log("\nAll execution stages passed. Coverage buckets validated: Basic + Core + Utility & API.");
