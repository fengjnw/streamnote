const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const apiClientPath = path.join(repoRoot, "frontend", "services", "apiClient.js");
const source = fs.readFileSync(apiClientPath, "utf8");

// Mock fetch
const mockFetch = async (url, options = {}) => ({
    status: 200,
    ok: true,
    json: async () => ({ success: true }),
    text: async () => "success",
});

const context = {
    console,
    window: {},
    fetch: mockFetch,
};

vm.createContext(context);
vm.runInContext(source, context);

const StreamNoteApiClient = context.window.StreamNoteApiClient;
assert(StreamNoteApiClient, "StreamNoteApiClient should be attached to window");

function runCheck(name, fn) {
    fn();
    console.log(`  [OK] ${name}`);
}

function testClientConstruction() {
    const client = new StreamNoteApiClient();
    assert(client !== null);
    assert.strictEqual(client.baseUrl, "");
}

function testClientConstructionWithBaseUrl() {
    const client = new StreamNoteApiClient({ baseUrl: "https://api.example.com" });
    assert.strictEqual(client.baseUrl, "https://api.example.com");
}

function testBuildUrl() {
    const client = new StreamNoteApiClient();
    assert.strictEqual(client.buildUrl("/api/test"), "/api/test");

    const clientWithBase = new StreamNoteApiClient({ baseUrl: "https://api.com" });
    assert.strictEqual(clientWithBase.buildUrl("/api/test"), "https://api.com/api/test");
}

function testEndpointMethodsExist() {
    const client = new StreamNoteApiClient();

    // Verify all endpoint methods exist
    assert(typeof client.summarize === "function");
    assert(typeof client.transcribe === "function");
    assert(typeof client.translate === "function");
    assert(typeof client.extractKeywords === "function");
    assert(typeof client.explainKeyword === "function");
    assert(typeof client.getSessionState === "function");
    assert(typeof client.saveSessionState === "function");
    assert(typeof client.postJson === "function");
    assert(typeof client.request === "function");
}

function testMultipleUrlBuilds() {
    const client = new StreamNoteApiClient({ baseUrl: "http://api.example.com" });

    const url1 = client.buildUrl("/api/endpoint1");
    const url2 = client.buildUrl("/api/endpoint2");

    assert.strictEqual(url1, "http://api.example.com/api/endpoint1");
    assert.strictEqual(url2, "http://api.example.com/api/endpoint2");
}

function testEmptyBaseUrl() {
    const client = new StreamNoteApiClient({ baseUrl: "" });
    assert.strictEqual(client.buildUrl("/api/test"), "/api/test");
}

function testNoBaseUrlProvided() {
    const client = new StreamNoteApiClient();
    assert.strictEqual(client.baseUrl, "");
    assert.strictEqual(client.buildUrl("/api/test"), "/api/test");
}

console.log("Frontend unit tests (StreamNoteApiClient)");
runCheck("constructor with no config", testClientConstruction);
runCheck("constructor with baseUrl config", testClientConstructionWithBaseUrl);
runCheck("buildUrl constructs correct URLs", testBuildUrl);
runCheck("all endpoint methods exist", testEndpointMethodsExist);
runCheck("multiple buildUrl calls work", testMultipleUrlBuilds);
runCheck("empty baseUrl handled", testEmptyBaseUrl);
runCheck("no baseUrl provided defaults correctly", testNoBaseUrlProvided);
console.log("Frontend unit test (StreamNoteApiClient) passed.");
