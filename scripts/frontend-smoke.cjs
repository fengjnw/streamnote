const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");

const repoRoot = path.resolve(__dirname, "..");
const indexPath = path.join(repoRoot, "frontend", "index.html");
const html = fs.readFileSync(indexPath, "utf8");
const dom = new JSDOM(html);
const { document } = dom.window;

function mustExist(id) {
    const el = document.getElementById(id);
    assert(el, `Missing required element: #${id}`);
}

const requiredIds = [
    "transcript",
    "translation",
    "quickAccessKeywords",
    "quickAccessSummary",
    "summary-display",
    "auto-keywords-display",
    "summarizeStyleSelect",
    "reExtractKeywordsBtn",
    "regenerateSummaryBtn",
    "clearSummaryBtn",
    "clearKeywordsBtn"
];

requiredIds.forEach(mustExist);
console.log("  [OK] Required DOM panels and controls exist");

const scripts = Array.from(document.querySelectorAll("script[src]"));
const scriptSrcList = scripts.map((s) => s.getAttribute("src"));

const requiredScripts = [
    "core/executionContext.js",
    "utils/operationGuards.js",
    "utils/deviceCapabilities.js",
    "managers/panel/sidePanelControlManager.js",
    "managers/ui/summaryListenersManager.js",
    "core/app.js"
];

requiredScripts.forEach((scriptSrc) => {
    assert(
        scriptSrcList.includes(scriptSrc),
        `Missing required script include: ${scriptSrc}`
    );
});
console.log("  [OK] Required script includes exist");

const sidePanelIndex = scriptSrcList.indexOf("managers/panel/sidePanelControlManager.js");
const appIndex = scriptSrcList.indexOf("core/app.js");
assert(sidePanelIndex > -1 && appIndex > -1 && sidePanelIndex < appIndex,
    "sidePanelControlManager.js must load before core/app.js");
console.log("  [OK] Critical script load order is correct");

console.log("Frontend smoke test passed.");
