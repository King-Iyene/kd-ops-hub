/**
 * Paystack API Proxy — runs on Fly.io to provide a static egress IP.
 *
 * Supabase Edge Functions call this proxy instead of api.paystack.co directly.
 * Paystack's IP whitelist accepts the Fly.io VM's static IP.
 *
 * Security: requires a shared secret in the X-Proxy-Key header.
 * The proxy ONLY forwards to api.paystack.co — nothing else.
 */

const http = require("http");
const https = require("https");

const PROXY_KEY = process.env.PROXY_KEY;
const TARGET = "https://api.paystack.co";
const PORT = process.env.PORT || 8080;

if (!PROXY_KEY || PROXY_KEY.length < 16) {
  console.error("PROXY_KEY must be set (min 16 chars)");
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Diagnostic: show outbound IPv4 (temporary — remove after confirming)
  if (req.url === "/diag/ip") {
    try {
      const ipRes = await new Promise((resolve, reject) => {
        https.get("https://api.ipify.org?format=json", { family: 4 }, (r) => {
          let d = "";
          r.on("data", (c) => (d += c));
          r.on("end", () => resolve(JSON.parse(d)));
        }).on("error", reject);
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ outbound_ipv4: ipRes.ip }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Auth check
  if (req.headers["x-proxy-key"] !== PROXY_KEY) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // Only allow paths starting with / — strip /paystack prefix if present
  let targetPath = req.url;
  if (targetPath.startsWith("/paystack")) {
    targetPath = targetPath.slice("/paystack".length) || "/";
  }

  const targetUrl = TARGET + targetPath;

  // Collect request body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  // Forward headers (pass through Authorization, Content-Type, etc.)
  const forwardHeaders = {};
  for (const [key, val] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "x-proxy-key" || lower === "connection") continue;
    forwardHeaders[key] = val;
  }

  const url = new URL(targetUrl);
  const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: req.method,
    headers: forwardHeaders,
    timeout: 30000,
    family: 4,
  };

  console.log(`[proxy] → ${req.method} ${url.pathname} (family: 4)`);

  const proxyReq = https.request(options, (proxyRes) => {
    console.log(`[proxy] ← ${proxyRes.statusCode} ${url.pathname}`);
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error("[proxy] upstream error:", err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Upstream error", detail: err.message }));
    }
  });

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Upstream timeout" }));
    }
  });

  if (body.length > 0) proxyReq.write(body);
  proxyReq.end();
});

server.listen(PORT, () => {
  console.log(`Paystack proxy listening on :${PORT}`);
});
