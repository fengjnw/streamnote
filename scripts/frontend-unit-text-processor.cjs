const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const textProcessorPath = path.join(repoRoot, "frontend", "services", "textProcessor.js");
const source = fs.readFileSync(textProcessorPath, "utf8");

const context = {
    console,
    window: {},
    Date,
};

vm.createContext(context);
vm.runInContext(source, context);

const TextProcessor = context.window.TextProcessor;
assert(TextProcessor, "TextProcessor should be attached to window");

function runCheck(name, fn) {
    fn();
    console.log(`  [OK] ${name}`);
}

function testCleanText() {
    const input = "\r\n  hello\r\nworld  \n";
    const output = TextProcessor.cleanText(input);
    assert.strictEqual(output, "hello\nworld", "cleanText should normalize newlines and trim");
}

function testValidateFile() {
    const valid = TextProcessor.validateFile({
        name: "demo.md",
        size: 1024,
    });
    assert.strictEqual(valid.valid, true);
    assert.strictEqual(valid.error, null);

    const invalid = TextProcessor.validateFile({
        name: "demo.exe",
        size: 1024,
    });
    assert.strictEqual(invalid.valid, false);
    assert(invalid.error.includes("Unsupported file format"));
}

function testConvertToPreciseResults() {
    const sessionStart = Date.now() - 4500;
    const result = TextProcessor.convertToPreciseResults("Line A\n\nLine B", sessionStart);

    assert.strictEqual(result.lineCount, 2);
    assert.strictEqual(result.data[0].text, "Line A");
    assert.strictEqual(result.data[1].text, "Line B");
    assert.strictEqual(result.data[0].source, "text");
    assert(result.data[0].timestamp >= 4, "timestamp should reflect relative seconds");
}

function run() {
    console.log("Frontend unit tests (TextProcessor)");
    runCheck("cleanText normalizes newline + trim", testCleanText);
    runCheck("validateFile accepts supported and rejects unsupported format", testValidateFile);
    runCheck("convertToPreciseResults maps lines to timestamped records", testConvertToPreciseResults);
    console.log("Frontend unit test (TextProcessor) passed.");
}

run();
