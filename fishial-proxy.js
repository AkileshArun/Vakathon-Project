#!/usr/bin/env node
/* =====================================================================
   fishial-proxy.js  —  Fish AI web app helper
   ---------------------------------------------------------------------
   Why this exists:
   Fishial's API needs your SECRET key and uses server-to-server calls
   that a browser can't make (CORS + secret exposure). This tiny proxy
   holds the secret, performs Fishial's 4-step recognition flow, and
   returns the result to the web app with CORS enabled.

   HOW TO RUN (no npm install needed — pure Node, v18+):
     1) Get your Fishial Key ID + Secret from portal.fishial.ai
        (log in → left menu "About" → "For developers").
     2) In a terminal, in this folder, run ONE of:

          # simplest — paste keys inline:
          FISHIAL_KEY_ID=xxxx FISHIAL_SECRET=yyyy node fishial-proxy.js

          # or set them first, then run:
          export FISHIAL_KEY_ID=xxxx
          export FISHIAL_SECRET=yyyy
          node fishial-proxy.js

          # or just run it and it will PROMPT you for the keys:
          node fishial-proxy.js

     3) It prints:  Fishial proxy running on http://localhost:8787
        Paste that URL into the web app's "API Keys" → Proxy URL box.

   Nothing is stored to disk. Keys live only in this process's memory.
   ===================================================================== */

const http = require("http");
const https = require("https");
const crypto = require("crypto");
const readline = require("readline");

const PORT = process.env.PORT || 8787;

/* ---------- tiny helper: HTTPS request returning {status, body} ---------- */
function request(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { method, hostname: u.hostname, path: u.pathname + u.search, headers: headers || {} };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, buffer: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
const json = (r) => { try { return JSON.parse(r.buffer.toString("utf8")); } catch (e) { return {}; } };

/* ---------- Fishial 4-step recognition ---------- */
async function recognize(keyId, secret, imageBuffer, filename, contentType) {
  // 1. auth token
  const auth = await request(
    "POST", "https://api-users.fishial.ai/v1/auth/token",
    { "Content-Type": "application/json", "Accept": "application/json" },
    JSON.stringify({ client_id: keyId, client_secret: secret })
  );
  if (auth.status !== 200) throw new Error("auth failed (" + auth.status + "): " + auth.buffer.toString().slice(0, 200));
  const token = json(auth).access_token;
  if (!token) throw new Error("no access_token returned");

  // 2. metadata → signed upload url
  const checksum = crypto.createHash("md5").update(imageBuffer).digest("base64");
  const up = await request(
    "POST", "https://api.fishial.ai/v1/recognition/upload",
    { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json" },
    JSON.stringify({ blob: { filename, content_type: contentType, byte_size: imageBuffer.length, checksum } })
  );
  if (up.status < 200 || up.status >= 300) throw new Error("upload-url failed (" + up.status + "): " + up.buffer.toString().slice(0, 200));
  const upJson = json(up);
  const signedId = upJson["signed-id"];
  const direct = upJson["direct-upload"];
  if (!direct || !direct.url) throw new Error("no direct-upload url");

  // 3. PUT raw bytes to Google Cloud (only the headers Fishial returned)
  const putHeaders = Object.assign({}, direct.headers);
  await new Promise((resolve, reject) => {
    const u = new URL(direct.url);
    const req = https.request(
      { method: "PUT", hostname: u.hostname, path: u.pathname + u.search, headers: putHeaders },
      (res) => { res.on("data", () => {}); res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error("cloud upload failed (" + res.statusCode + ")"));
      }); }
    );
    req.on("error", reject);
    req.write(imageBuffer);
    req.end();
  });

  // 4. run recognition
  const rec = await request(
    "GET", "https://api.fishial.ai/v1/recognition/image?q=" + encodeURIComponent(signedId),
    { "Authorization": "Bearer " + token, "Accept": "application/json" }
  );
  if (rec.status !== 200) throw new Error("recognition failed (" + rec.status + "): " + rec.buffer.toString().slice(0, 200));
  return json(rec);
}

/* ---------- minimal multipart/form-data parser (single image field) ---------- */
function parseMultipart(buffer, boundary) {
  const b = Buffer.from("--" + boundary);
  const parts = [];
  let start = buffer.indexOf(b);
  while (start !== -1) {
    let end = buffer.indexOf(b, start + b.length);
    if (end === -1) break;
    const part = buffer.slice(start + b.length, end);
    parts.push(part);
    start = end;
  }
  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString("utf8");
    if (!/name="image"/.test(header)) continue;
    const fnMatch = header.match(/filename="([^"]*)"/);
    const ctMatch = header.match(/Content-Type:\s*([^\r\n]+)/i);
    let content = part.slice(headerEnd + 4);
    // strip trailing \r\n
    if (content.slice(-2).toString() === "\r\n") content = content.slice(0, -2);
    return { filename: (fnMatch && fnMatch[1]) || "fish.jpg", contentType: (ctMatch && ctMatch[1].trim()) || "image/jpeg", data: content };
  }
  return null;
}

/* ---------- HTTP server ---------- */
function startServer(keyId, secret) {
  const server = http.createServer((req, res) => {
    // CORS for the browser app (any origin, since it may run from file://)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    if (req.url === "/health") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"ok":true}'); }

    if (req.url === "/recognize" && req.method === "POST") {
      const ctype = req.headers["content-type"] || "";
      const m = ctype.match(/boundary=(.+)$/);
      if (!m) { res.writeHead(400); return res.end('{"error":"expected multipart/form-data"}'); }
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        try {
          const file = parseMultipart(Buffer.concat(chunks), m[1]);
          if (!file) { res.writeHead(400); return res.end('{"error":"no image field"}'); }
          const result = await recognize(keyId, secret, file.data, file.filename, file.contentType);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          console.error("  ✗ recognition error:", err.message);
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404); res.end('{"error":"not found"}');
  });

  server.listen(PORT, () => {
    console.log("");
    console.log("  🐟  Fishial proxy running on  http://localhost:" + PORT);
    console.log("      Paste that URL into the web app → API Keys → Proxy URL");
    console.log("      Health check: http://localhost:" + PORT + "/health");
    console.log("      Press Ctrl+C to stop.");
    console.log("");
  });
}

/* ---------- key acquisition: env vars or interactive prompt ---------- */
(async function main() {
  let keyId = process.env.FISHIAL_KEY_ID;
  let secret = process.env.FISHIAL_SECRET;

  if (!keyId || !secret) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((r) => rl.question(q, r));
    console.log("\n  Fishial keys not found in env vars — let's set them now.");
    console.log("  (Get them at portal.fishial.ai → About → For developers)\n");
    if (!keyId) keyId = (await ask("  Fishial Key ID:  ")).trim();
    if (!secret) secret = (await ask("  Fishial Secret:  ")).trim();
    rl.close();
  }

  if (!keyId || !secret) {
    console.error("\n  ✗ Need both a Key ID and Secret. Exiting.\n");
    process.exit(1);
  }
  startServer(keyId, secret);
})();
