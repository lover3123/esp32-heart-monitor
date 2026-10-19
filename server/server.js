require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const app = express();
app.use(express.json({ limit: "32kb" }));
const PORT = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "monitor.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  heart_rate REAL NOT NULL,
  spo2 INTEGER NOT NULL,
  signal_quality INTEGER NOT NULL DEFAULT 0,
  irregular_pulse_flag INTEGER NOT NULL DEFAULT 0,
  device_timestamp TEXT,
  ai_review_flags TEXT,
  ai_anomaly INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS symptoms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reading_id INTEGER,
  symptoms TEXT NOT NULL,
  severity INTEGER NOT NULL,
  notes TEXT,
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(reading_id) REFERENCES readings(id)
);
`);
// Add columns when upgrading a database created by an earlier starter version.
const readingColumns = new Set(db.pragma("table_info(readings)").map((column) => column.name));
if (!readingColumns.has("ai_review_flags")) db.exec("ALTER TABLE readings ADD COLUMN ai_review_flags TEXT");
if (!readingColumns.has("ai_anomaly")) db.exec("ALTER TABLE readings ADD COLUMN ai_anomaly INTEGER");
const insertReading = db.prepare(`INSERT INTO readings
(device_id, heart_rate, spo2, signal_quality, irregular_pulse_flag, device_timestamp)
VALUES (@deviceId, @heartRate, @spo2, @signalQuality, @irregularPulseFlag, @timestamp)`);
const deviceToken = process.env.DEVICE_API_TOKEN || "";

function cleanNumber(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "heart-monitor-api" }));

app.post("/api/readings", async (req, res) => {
  if (deviceToken && req.get("X-Device-Token") !== deviceToken) {
    return res.status(401).json({ error: "unauthorized device" });
  }
  const heartRate = cleanNumber(req.body.heartRate, 25, 240);
  const spo2 = cleanNumber(req.body.spo2, 70, 100);
  const signalQuality = cleanNumber(req.body.signalQuality ?? 0, 0, 100);
  if (heartRate === null || spo2 === null || signalQuality === null) {
    return res.status(400).json({ error: "invalid measurement fields" });
  }
  const row = {
    deviceId: String(req.body.deviceId || "unknown").slice(0, 80),
    heartRate, spo2, signalQuality,
    irregularPulseFlag: req.body.irregularPulseFlag ? 1 : 0,
    timestamp: String(req.body.timestamp || "").slice(0, 80)
  };
  const result = insertReading.run(row);
  let ai = null;
  if (process.env.AI_SERVICE_URL) {
    try {
      const response = await fetch(`${process.env.AI_SERVICE_URL}/score`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heartRate, spo2, signalQuality, irregularPulseFlag: !!row.irregularPulseFlag })
      });
      if (response.ok) {
        ai = await response.json();
        db.prepare("UPDATE readings SET ai_review_flags = ?, ai_anomaly = ? WHERE id = ?")
          .run(JSON.stringify(ai.reviewFlags || []),
               ai.unsupervisedAnomaly === null ? null : Number(ai.unsupervisedAnomaly),
               result.lastInsertRowid);
      }
    } catch (_) { /* AI service is optional */ }
  }
  res.status(201).json({ id: result.lastInsertRowid, saved: true, ai });
});

app.get("/api/readings", (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit || "100", 10) || 100, 1), 1000);
  const rows = db.prepare(`SELECT * FROM readings ORDER BY id DESC LIMIT ?`).all(limit);
  res.json(rows.reverse());
});
app.get("/api/symptoms", (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit || "100", 10) || 100, 1), 1000);
  res.json(db.prepare(`SELECT * FROM symptoms ORDER BY id DESC LIMIT ?`).all(limit));
});
app.post("/api/symptoms", (req, res) => {
  const symptoms = String(req.body.symptoms || "").trim().slice(0, 500);
  const severity = cleanNumber(req.body.severity, 1, 5);
  if (!symptoms || severity === null) {
    return res.status(400).json({ error: "symptoms and severity (1–5) are required" });
  }
  const readingId = req.body.readingId ? Number(req.body.readingId) : null;
  const occurredAt = String(req.body.occurredAt || new Date().toISOString()).slice(0, 40);
  const notes = String(req.body.notes || "").slice(0, 2000);
  const result = db.prepare(`INSERT INTO symptoms (reading_id, symptoms, severity, notes, occurred_at)
    VALUES (?, ?, ?, ?, ?)`).run(readingId, symptoms, severity, notes, occurredAt);
  res.status(201).json({ id: result.lastInsertRowid, saved: true });
});
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, "0.0.0.0", () => console.log(`Dashboard/API listening on http://0.0.0.0:${PORT}`));
