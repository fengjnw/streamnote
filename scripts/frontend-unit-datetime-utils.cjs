const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const dateTimeUtilsPath = path.join(repoRoot, "frontend", "utils", "dateTimeUtils.js");
const source = fs.readFileSync(dateTimeUtilsPath, "utf8");

const context = {
    console,
    window: {},
    Date,
    String,
};

vm.createContext(context);
vm.runInContext(source, context);

const DateTimeUtils = context.window.DateTimeUtils;
assert(DateTimeUtils, "DateTimeUtils should be attached to window");

function runCheck(name, fn) {
    fn();
    console.log(`  [OK] ${name}`);
}

function testPad2() {
    assert.strictEqual(DateTimeUtils.pad2(5), "05");
    assert.strictEqual(DateTimeUtils.pad2(15), "15");
    assert.strictEqual(DateTimeUtils.pad2(0), "00");
    assert.strictEqual(DateTimeUtils.pad2(1), "01");
}

function testFormatDate() {
    const date = new Date(2024, 0, 15); // January 15, 2024
    const result = DateTimeUtils.formatDate(date);
    assert.strictEqual(result, "2024-01-15");
}

function testFormatTime() {
    const date = new Date(2024, 0, 15, 14, 30, 45);
    const result = DateTimeUtils.formatTime(date);
    assert.strictEqual(result, "14:30:45");
}

function testFormatDateTime() {
    const date = new Date(2024, 0, 15, 14, 30, 45);
    const result = DateTimeUtils.formatDateTime(date);
    assert.strictEqual(result, "2024-01-15 14:30:45");
}

function testFormatDateFromEpochMs() {
    // Epoch: 2024-01-15 00:00:00 UTC
    const epochMs = new Date(2024, 0, 15).getTime();
    const result = DateTimeUtils.formatDateFromEpochMs(epochMs);
    assert(result.includes("2024-01-15"), `Should include date components, got ${result}`);
}

function testFormatTimeFromEpochMs() {
    // Epoch for 14:30:45
    const date = new Date(2024, 0, 15, 14, 30, 45);
    const epochMs = date.getTime();
    const result = DateTimeUtils.formatTimeFromEpochMs(epochMs);
    assert.strictEqual(result, "14:30:45");
}

function testGetNowTimeString() {
    const result = DateTimeUtils.getNowTimeString();
    assert(typeof result === "string", "Should return a string");
    assert(result.length > 0, "Should not be empty");
    // Should match HH:MM:SS format
    assert(/^\d{2}:\d{2}:\d{2}$/.test(result), `Should match HH:MM:SS format, got ${result}`);
}

function testFormatDateEdgeCases() {
    // Test single digit months/days get padded
    const date = new Date(2024, 2, 5); // March 5, 2024
    const result = DateTimeUtils.formatDate(date);
    assert.strictEqual(result, "2024-03-05");
}

function testFormatTimeEdgeCases() {
    // Test single digit hours/minutes/seconds get padded
    const date = new Date(2024, 0, 1, 5, 3, 2);
    const result = DateTimeUtils.formatTime(date);
    assert.strictEqual(result, "05:03:02");
}

function run() {
    console.log("Frontend unit tests (DateTimeUtils)");
    runCheck("pad2 pads single digit with leading zero", testPad2);
    runCheck("formatDate returns YYYY-MM-DD format", testFormatDate);
    runCheck("formatTime returns HH:MM:SS format", testFormatTime);
    runCheck("formatDateTime combines date and time", testFormatDateTime);
    runCheck("formatDateFromEpochMs converts epoch to date", testFormatDateFromEpochMs);
    runCheck("formatTimeFromEpochMs converts epoch to time", testFormatTimeFromEpochMs);
    runCheck("getNowTimeString returns current time in HH:MM:SS", testGetNowTimeString);
    runCheck("formatDate handles edge cases with padding", testFormatDateEdgeCases);
    runCheck("formatTime handles edge cases with padding", testFormatTimeEdgeCases);
    console.log("Frontend unit test (DateTimeUtils) passed.");
}

run();
