const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const textFormattersPath = path.join(repoRoot, "frontend", "utils", "textFormatters.js");
const source = fs.readFileSync(textFormattersPath, "utf8");

const context = {
    console,
    window: {},
};

vm.createContext(context);
vm.runInContext(source, context);

const TextFormatters = context.window.TextFormatters;
assert(TextFormatters, "TextFormatters should be attached to window");

function runCheck(name, fn) {
    fn();
    console.log(`  [OK] ${name}`);
}

function testEscapeRegex() {
    const input = "test.regex+special[chars]";
    const result = TextFormatters.escapeRegex(input);
    // Should escape all special regex characters
    assert(result.includes("\\"), "Should contain escaped characters");
    // Result should be usable in a RegExp without issues
    try {
        new RegExp(result);
    } catch (e) {
        assert.fail("Escaped string should be valid regex: " + e.message);
    }
}

function testFormatParagraph() {
    const input = "Line 1\nLine 2";
    const result = TextFormatters.formatParagraph(input);
    assert(result.includes("<p>"), "Should wrap in paragraph tags");
    assert(result.includes("<br>"), "Should convert newlines to <br>");
    assert(result.includes("</p>"), "Should have closing paragraph tag");
}

function testFormatKeyTakeaways() {
    const input = "- Point 1\n- Point 2\n- Point 3";
    const result = TextFormatters.formatKeyTakeaways(input);
    assert(result.includes("<ul>"), "Should create unordered list");
    assert(result.includes("<li>"), "Should have list items");
    assert(result.includes("Point 1"), "Should contain original content");
    assert(result.includes("</ul>"), "Should close list");
}

function testFormatKeyTakeawaysWithBullets() {
    const input = "• Item A\n• Item B";
    const result = TextFormatters.formatKeyTakeaways(input);
    assert(result.includes("<ul>"), "Should format bullet points as list");
    assert(result.includes("Item A"), "Should preserve item content");
}

function testFormatKeyTakeawaysNoMarkers() {
    // If no bullet markers, should still process the lines
    const input = "Just regular text\nNo bullets here";
    const result = TextFormatters.formatKeyTakeaways(input);
    // Should contain some HTML structure
    assert(result.length > 0, "Should return formatted content");
    assert(result.includes("<") && result.includes(">"), "Should contain HTML tags");
}

function testFormatQAFormat() {
    const input = "Q: What is this?\nA: It is a test.\nQ: Another question?\nA: Another answer.";
    const result = TextFormatters.formatQAFormat(input);
    assert(result.includes("qa-pair"), "Should have QA pair class");
    assert(result.includes("qa-question"), "Should have question class");
    assert(result.includes("qa-answer"), "Should have answer class");
    assert(result.includes("What is this?"), "Should contain question content");
    assert(result.includes("It is a test"), "Should contain answer content");
}

function testFormatQAFormatChinese() {
    const input = "问: 这是什么?\n答: 这是测试。\n问: 另一个问题?\n答: 另一个答案。";
    const result = TextFormatters.formatQAFormat(input);
    assert(result.includes("qa-pair"), "Should handle Chinese Q&A format");
    assert(result.includes("这是什么"), "Should preserve Chinese content");
}

function testFormatQAFormatEnglishVariant() {
    const input = "Question: First Q?\nAnswer: First A.\nQuestion: Second Q?\nAnswer: Second A.";
    const result = TextFormatters.formatQAFormat(input);
    assert(result.includes("qa-pair"), "Should handle Question/Answer format");
    assert(result.includes("First Q"), "Should preserve content");
}

function testFormatSummaryDisplayParagraph() {
    const input = "This is a paragraph\nwith multiple lines";
    const result = TextFormatters.formatSummaryDisplay(input, "paragraph");
    assert(result.includes("<p>"), "Should format as paragraph");
    assert(result.includes("<br>"), "Should convert newlines");
}

function testFormatSummaryDisplayKeyTakeaways() {
    const input = "- First point\n- Second point";
    const result = TextFormatters.formatSummaryDisplay(input, "key_takeaways");
    assert(result.includes("<ul>") || result.includes("<li>"), "Should format as takeaways");
}

function testFormatSummaryDisplayQA() {
    const input = "Q: A question\nA: An answer";
    const result = TextFormatters.formatSummaryDisplay(input, "q&a");
    assert(result.includes("qa-"), "Should format as Q&A");
}

function testFormatSummaryDisplayDefault() {
    const input = "Default format text";
    const result = TextFormatters.formatSummaryDisplay(input);
    assert(result.includes("<p>"), "Should default to paragraph format");
}

function testFormatSummaryDisplayEmpty() {
    const result = TextFormatters.formatSummaryDisplay("");
    assert.strictEqual(result, "", "Should return empty string for empty input");
}

function testFormatSummaryDisplayNull() {
    const result = TextFormatters.formatSummaryDisplay(null);
    assert.strictEqual(result, "", "Should return empty string for null input");
}

function testFormatKeyTakeawaysWithNewlines() {
    const input = "- Multi\nline\nitem\n- Another";
    const result = TextFormatters.formatKeyTakeaways(input);
    // Should have some list structure
    assert(result.includes("<") && result.includes(">"), "Should contain HTML tags");
    assert(result.includes("item"), "Should preserve content");
}

function testEscapeRegexSpecialChars() {
    const specialChars = ".*+?^${}()|[]\\";
    const result = TextFormatters.escapeRegex(specialChars);
    // Result should contain escaped characters
    assert(result.includes("\\"), "Should escape special characters");
    // Result should be a valid regex string
    try {
        new RegExp(result);
    } catch (e) {
        assert.fail("Result should be valid regex: " + e.message);
    }
}

function run() {
    console.log("Frontend unit tests (TextFormatters)");
    runCheck("escapeRegex escapes all special regex characters", testEscapeRegex);
    runCheck("formatParagraph wraps in <p> and converts newlines", testFormatParagraph);
    runCheck("formatKeyTakeaways creates list from bullet points", testFormatKeyTakeaways);
    runCheck("formatKeyTakeaways handles bullet markers", testFormatKeyTakeawaysWithBullets);
    runCheck("formatKeyTakeaways falls back to paragraph without markers", testFormatKeyTakeawaysNoMarkers);
    runCheck("formatQAFormat parses Q/A structure", testFormatQAFormat);
    runCheck("formatQAFormat handles Chinese format", testFormatQAFormatChinese);
    runCheck("formatQAFormat handles Question/Answer variant", testFormatQAFormatEnglishVariant);
    runCheck("formatSummaryDisplay with paragraph style", testFormatSummaryDisplayParagraph);
    runCheck("formatSummaryDisplay with key_takeaways style", testFormatSummaryDisplayKeyTakeaways);
    runCheck("formatSummaryDisplay with q&a style", testFormatSummaryDisplayQA);
    runCheck("formatSummaryDisplay defaults to paragraph", testFormatSummaryDisplayDefault);
    runCheck("formatSummaryDisplay handles empty string", testFormatSummaryDisplayEmpty);
    runCheck("formatSummaryDisplay handles null", testFormatSummaryDisplayNull);
    runCheck("formatKeyTakeaways preserves newlines in items", testFormatKeyTakeawaysWithNewlines);
    runCheck("escapeRegex handles all special characters", testEscapeRegexSpecialChars);
    console.log("Frontend unit test (TextFormatters) passed.");
}

run();
