const { test, expect } = require("@playwright/test");

async function preparePage(page) {
    await page.route("**/feather-icons/**", async (route) => {
        await route.fulfill({
            contentType: "application/javascript",
            body: "window.feather = { replace() {} };",
        });
    });

    await page.route("**/mammoth**", async (route) => {
        await route.fulfill({
            contentType: "application/javascript",
            body: "window.mammoth = {};",
        });
    });

    await page.route("**/pdf.min.js", async (route) => {
        await route.fulfill({
            contentType: "application/javascript",
            body: "window.pdfjsLib = { GlobalWorkerOptions: {} };",
        });
    });

    await page.route("**/api/**", async (route) => {
        await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({}),
        });
    });
}

async function openMoreMenu(page) {
    await page.locator("#leftSidebarGuideToggle").click();
    await expect(page.locator("#mobileMoreMenu")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
    await preparePage(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
});

test("layout does not create horizontal page overflow", async ({ page }) => {
    const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth - document.body.clientWidth,
        html: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));

    expect(overflow.body).toBeLessThanOrEqual(1);
    expect(overflow.html).toBeLessThanOrEqual(1);
});

test("translation layout selector exposes device-appropriate modes", async ({ page }, testInfo) => {
    await page.locator("#translationToggleBtn").click();

    const isPortraitAdaptive = testInfo.project.name === "ipad-portrait" || testInfo.project.name === "iphone";
    await expect(page.locator(".main-content")).toHaveClass(isPortraitAdaptive ? /layout-stacked/ : /layout-compare/);

    const layoutOptions = await page.locator("#layoutDropdown option").evaluateAll((options) =>
        options.map((option) => ({
            value: option.value,
            label: option.textContent.trim(),
        }))
    );

    expect(layoutOptions).toEqual(isPortraitAdaptive
        ? [
            { value: "stacked", label: "Stacked" },
            { value: "translation-only", label: "Translation" },
        ]
        : [
            { value: "compare", label: "Compare" },
            { value: "translation-only", label: "Translation" },
        ]);

    await page.locator("#layoutDropdown").selectOption(isPortraitAdaptive ? "stacked" : "compare");
    await expect(page.locator(".main-content")).toHaveClass(isPortraitAdaptive ? /layout-stacked/ : /layout-compare/);

    await page.locator("#layoutDropdown").selectOption("translation-only");
    await expect(page.locator(".main-content")).toHaveClass(/layout-translation-only/);
    await expect(page.locator(".transcript-panel")).toBeHidden();
    await expect(page.locator(".translation-panel")).toBeVisible();
});

test("mobile bottom toolbar distributes primary actions and opens More", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone", "Mobile toolbar is only active on phone layout");

    const toolbarIds = [
        "recordBtn",
        "translationToggleBtn",
        "quickAccessKeywords",
        "quickAccessHighlights",
        "quickAccessSummary",
        "leftSidebarGuideToggle",
    ];

    const boxes = [];
    for (const id of toolbarIds) {
        const locator = page.locator(`#${id}`);
        await expect(locator).toBeVisible();
        const box = await locator.boundingBox();
        expect(box, `${id} should have a visible box`).not.toBeNull();
        expect(box.width, `${id} should have a tappable width`).toBeGreaterThan(40);
        expect(box.height, `${id} should have a tappable height`).toBeGreaterThanOrEqual(48);
        boxes.push(box);
    }

    const firstLeft = boxes[0].x;
    const lastRight = boxes[boxes.length - 1].x + boxes[boxes.length - 1].width;
    const viewportWidth = page.viewportSize().width;
    expect(firstLeft).toBeLessThanOrEqual(12);
    expect(lastRight).toBeGreaterThanOrEqual(viewportWidth - 12);

    await openMoreMenu(page);
});

test("mobile More menu keeps import and export submenus open", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone", "Mobile More menu is only active on phone layout");

    await openMoreMenu(page);
    await page.locator(".mobile-more-item[data-target-button='addContentBtn']").click();
    await expect(page.locator("#contentMenu")).toBeVisible();
    await expect(page.locator("#importFromFileOption")).toHaveText("File");
    await expect(page.locator("#importFromTextOption")).toHaveText("Text");
    await expect(page.locator("#importSessionOption")).toHaveText("Session");

    await page.locator("#leftSidebarGuideToggle").click();
    await expect(page.locator("#mobileMoreMenu")).toBeVisible();
    await page.locator(".mobile-more-item[data-target-button='downloadSessionBtn']").click();
    await expect(page.locator("#downloadMenu")).toBeVisible();
    await expect(page.locator("#copyTranscriptOption")).toBeVisible();
    await expect(page.locator("#downloadCurrentSessionOption")).toHaveText("Session JSON");
    await expect(page.locator("#exportTranscriptTextOption")).toHaveText("Text File");
    await expect(page.locator("#downloadAllSessionsOption")).toBeHidden();
    await expect(page.locator("#exportTranscriptMarkdownOption")).toBeHidden();
});

test("mobile record menu hides system audio capture", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone", "Mobile record capability filtering is only active on phone layout");

    await page.locator("#recordBtn").click();
    await expect(page.locator("#recordMenu")).toBeVisible();
    await expect(page.locator("#recordFromMicOption")).toBeVisible();
    await expect(page.locator("#recordFromTabOption")).toBeHidden();
});

test("adaptive auxiliary panels are mutually exclusive", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "desktop-chromium", "Desktop layout keeps side panels independent");

    await page.locator("#quickAccessKeywords").click();
    await expect(page.locator(".side-panels-container")).toHaveClass(/expanded/);

    if (testInfo.project.name === "iphone") {
        await openMoreMenu(page);
        await page.locator(".mobile-more-item[data-target-button='quickAccessHistory']").click();
    } else {
        await page.locator("#quickAccessHistory").click();
    }

    await expect(page.locator(".explanation-panel-left")).toHaveClass(/expanded/);
    await expect(page.locator(".side-panels-container")).not.toHaveClass(/expanded/);
});
