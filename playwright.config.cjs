const { defineConfig, devices } = require("@playwright/test");

const port = Number(process.env.PLAYWRIGHT_PORT || 5600);

module.exports = defineConfig({
    testDir: "./tests/playwright",
    timeout: 30 * 1000,
    expect: {
        timeout: 5 * 1000,
    },
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        trace: "on-first-retry",
    },
    webServer: {
        command: "node scripts/playwright-static-server.cjs",
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: !process.env.CI,
        timeout: 10 * 1000,
    },
    projects: [
        {
            name: "desktop-chromium",
            use: {
                ...devices["Desktop Chrome"],
                browserName: "chromium",
                viewport: { width: 1280, height: 800 },
            },
        },
        {
            name: "ipad-portrait",
            use: {
                ...devices["iPad Pro 11"],
                browserName: "chromium",
                viewport: { width: 834, height: 1194 },
            },
        },
        {
            name: "iphone",
            use: {
                ...devices["iPhone 13"],
                browserName: "chromium",
            },
        },
    ],
});
