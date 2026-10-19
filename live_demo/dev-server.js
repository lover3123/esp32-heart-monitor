/**
 * Local preview server for the live demo — no Vercel CLI required.
 *
 *   copy .env.example .env      (fill in channel id / read key)
 *   npm run dev                 -> http://localhost:4173
 *
 * MOCK=1 npm run dev            -> renders synthetic data (UI preview only)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

loadEnv(path.join(__dirname, ".env"));
const handler = require("./api/feeds.js");

const PUBLIC = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 4173);
const MOCK = process.env.MOCK === "1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

function mockReadings() {
  const now = Date.now();
  const readings = [];
  for (let i = 0; i < 60; i++) {
    const hr = Math.round((73 + 6 * Math.sin(i / 6) + ((i * 7) % 5 - 2) * 0.6) * 10) / 10;
    const spo2 = 98 - (i % 3);
    const quality = 90 + (i % 8) - 3;
    const flag = i === 59;
    const reading = {
      id: 100 + i,
      recordedAt: new Date(now - (59 - i) * 20000).toISOString(),
      hr,
      spo2,
      quality,
      flag,
    };
    reading.flags = [];
    if (reading.hr < 50 || reading.hr > 120) reading.flags.push("heart_rate_outside_configured_review_band");
    if (reading.spo2 < 92) reading.flags.push("spo2_below_configured_review_threshold");
    if (reading.quality < 40) reading.flags.push("low_signal_quality");
    if (flag) reading.flags.push("pulse_interval_variability_flag_from_firmware");
    readings.push(reading);
  }
  return readings;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/feeds") {
    if (MOCK) {
      const readings = mockReadings();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        channel: { id: "mock", name: "Mock channel (UI preview)" },
        generatedAt: new Date().toISOString(),
        readings,
      }));
      return;
    }
    const shim = {
      statusCode: 200,
      headers: {},
      setHeader(key, value) { this.headers[key] = value; },
      status(code) { this.statusCode = code; return this; },
      json(payload) {
        res.writeHead(this.statusCode, {
          "Content-Type": "application/json; charset=utf-8",
          ...this.headers,
        });
        res.end(JSON.stringify(payload));
      },
    };
    Promise.resolve(handler(req, shim)).catch((err) => {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(String(err));
    });
    return;
  }

  let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Live demo preview: http://localhost:${PORT}${MOCK ? "  (MOCK data)" : ""}`);
  if (!MOCK && !process.env.THINGSPEAK_CHANNEL_ID) {
    console.log("Set THINGSPEAK_CHANNEL_ID (and READ_API_KEY) in live_demo/.env to fetch real data.");
    console.log("Or run with MOCK=1 for a UI preview.");
  }
});
