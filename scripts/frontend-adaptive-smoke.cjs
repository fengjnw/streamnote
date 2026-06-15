const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");

const repoRoot = path.resolve(__dirname, "..");
const frontendRoot = path.join(repoRoot, "frontend");
const indexPath = path.join(frontendRoot, "index.html");
const responsiveCssPath = path.join(frontendRoot, "styles", "responsive.css");
const tokensCssPath = path.join(frontendRoot, "styles", "tokens.css");
const panelManagerPath = path.join(frontendRoot, "managers", "panel", "panelManager.js");
const sidePanelControlManagerPath = path.join(frontendRoot, "managers", "panel", "sidePanelControlManager.js");
const contentActionsPath = path.join(frontendRoot, "managers", "ui", "contentActionsListenersManager.js");
const uiListenersPath = path.join(frontendRoot, "managers", "ui", "uiListenersManager.js");

const html = fs.readFileSync(indexPath, "utf8");
const responsiveCss = fs.readFileSync(responsiveCssPath, "utf8");
const tokensCss = fs.readFileSync(tokensCssPath, "utf8");
const panelManagerJs = fs.readFileSync(panelManagerPath, "utf8");
const sidePanelControlManagerJs = fs.readFileSync(sidePanelControlManagerPath, "utf8");
const contentActionsJs = fs.readFileSync(contentActionsPath, "utf8");
const uiListenersJs = fs.readFileSync(uiListenersPath, "utf8");

const dom = new JSDOM(html);
const { document } = dom.window;

function mustExist(id) {
    const el = document.getElementById(id);
    assert(el, `Missing required adaptive element: #${id}`);
    return el;
}

function assertIncludes(source, pattern, label) {
    assert(
        source.includes(pattern),
        `Missing adaptive rule: ${label}`
    );
}

function assertMatches(source, pattern, label) {
    assert(
        pattern.test(source),
        `Missing adaptive rule: ${label}`
    );
}

const mobileMoreMenu = mustExist("mobileMoreMenu");
const moreItems = Array.from(mobileMoreMenu.querySelectorAll(".mobile-more-item"));
const moreTargets = moreItems.map((item) => item.getAttribute("data-target-button"));
const expectedMoreTargets = [
    "sidebarNewSessionBtn",
    "openSessionPanel",
    "addContentBtn",
    "editTextBtn",
    "downloadSessionBtn",
    "quickAccessHistory",
    "quickAccessSettings"
];

assert.deepStrictEqual(
    moreTargets,
    expectedMoreTargets,
    "Mobile More menu target order changed unexpectedly"
);
console.log("  [OK] Mobile More menu contains expected secondary actions");

[
    "recordBtn",
    "translationToggleBtn",
    "quickAccessKeywords",
    "quickAccessHighlights",
    "quickAccessSummary",
    "leftSidebarGuideToggle"
].forEach(mustExist);
console.log("  [OK] Mobile primary toolbar actions exist");

const layoutOptions = Array.from(mustExist("layoutDropdown").querySelectorAll("option")).map((option) => ({
    value: option.value,
    label: option.textContent.trim(),
}));
assert.deepStrictEqual(
    layoutOptions,
    [
        { value: "compare", label: "Compare" },
        { value: "translation-only", label: "Translation" },
    ],
    "Translation layout selector should default to desktop simplified modes"
);
console.log("  [OK] Translation layout selector defaults to desktop simplified modes");

assertIncludes(html, "event.stopPropagation();", "More menu item clicks stop propagation");
assertIncludes(html, "targetButton.click();", "More menu proxies to existing button handlers");
console.log("  [OK] Mobile More menu proxies actions without bubbling");

assertIncludes(tokensCss, "--panel-width-mobile: 100vw;", "mobile panel width token");
assertIncludes(tokensCss, "--touch-target-size: 44px;", "touch target size token");
assertIncludes(tokensCss, "--safe-area-bottom: env(safe-area-inset-bottom, 0px);", "safe-area bottom token");
console.log("  [OK] Adaptive layout tokens exist");

assertMatches(
    responsiveCss,
    /@media\s*\(max-width:\s*1023px\)[\s\S]*\.panel-close-btn[\s\S]*width:\s*var\(--touch-target-size\)/,
    "adaptive close buttons use touch-sized target"
);
assertMatches(
    responsiveCss,
    /@media\s*\(max-width:\s*1023px\)[\s\S]*\.keyword-explain-btn,[\s\S]*\.keyword-delete-btn,[\s\S]*\.keyword-highlight-toggle-btn,[\s\S]*\.keyword-expand-btn,[\s\S]*width:\s*var\(--touch-target-size\)/,
    "keyword row controls use touch-sized targets"
);
assertMatches(
    responsiveCss,
    /@media\s*\(max-width:\s*768px\)[\s\S]*#recordBtn,[\s\S]*#quickAccessSummary,[\s\S]*#leftSidebarGuideToggle[\s\S]*flex:\s*1 1 0/,
    "mobile bottom toolbar actions distribute evenly"
);
assertMatches(
    responsiveCss,
    /\.mobile-more-menu[\s\S]*border-radius:\s*0;[\s\S]*box-shadow:\s*none;/,
    "mobile More menu keeps flat visual style"
);
assertMatches(
    responsiveCss,
    /\.text-panel \.text-panel-toolbar \.toolbar-language[\s\S]*flex:\s*0 0 108px;/,
    "translation language selector matches layout selector width"
);
console.log("  [OK] Adaptive CSS guards key touch and layout rules");

assertIncludes(panelManagerJs, "isAdaptivePanelMode()", "adaptive panel mode helper");
assertIncludes(panelManagerJs, "closeSidePanelForAdaptiveMode()", "adaptive side panel close helper");
assertIncludes(panelManagerJs, "this.closeSidePanelForAdaptiveMode();", "explanation panel closes side panel in adaptive mode");
assertIncludes(sidePanelControlManagerJs, "app.panelManager.hideExplanationPanel();", "side panel closes explanation panel in adaptive mode");
console.log("  [OK] Adaptive auxiliary panels are coordinated");

assertIncludes(contentActionsJs, "calc(66px + var(--safe-area-bottom))", "mobile import/export menu offset");
assertIncludes(uiListenersJs, "calc(66px + var(--safe-area-bottom))", "mobile record menu offset");
console.log("  [OK] Mobile secondary menus align above bottom toolbar");

console.log("Frontend adaptive smoke test passed.");
