const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PLAYWRIGHT_PORT || 5600);
const root = path.resolve(__dirname, "..", "frontend");

const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
};

function resolveRequestPath(urlPath) {
    const decodedPath = decodeURIComponent(urlPath.split("?")[0]);
    const normalizedPath = decodedPath === "/" ? "/index.html" : decodedPath;
    const filePath = path.resolve(root, `.${normalizedPath}`);

    if (!filePath.startsWith(root)) {
        return null;
    }

    return filePath;
}

const server = http.createServer((req, res) => {
    const filePath = resolveRequestPath(req.url || "/");

    if (!filePath) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }

        const ext = path.extname(filePath);
        res.writeHead(200, {
            "Content-Type": contentTypes[ext] || "application/octet-stream",
            "Cache-Control": "no-store",
        });
        res.end(content);
    });
});

server.listen(port, "127.0.0.1", () => {
    console.log(`Playwright static server listening on http://127.0.0.1:${port}`);
});
