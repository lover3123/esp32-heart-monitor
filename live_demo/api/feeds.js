/**
 * Vercel serverless function: GET /api/feeds
 *
 * Proxies the project's ThingSpeak channel so the read key never reaches the
 * browser. Normalises entries and applies the same threshold review rules as
 * the local AI service (Stage 1). The Isolation Forest anomaly stage runs only
 * in the local deployment.
 *
 * Environment variables (set in Vercel project settings):
 *   THINGSPEAK_CHANNEL_ID     (required)
 *   THINGSPEAK_READ_API_KEY   (required for private channels)
 *   THINGSPEAK_RESULTS        (optional, default 60, max 8000)
 */
const CHANNEL = (process.env.THINGSPEAK_CHANNEL_ID || "").trim();
const READ_KEY = (process.env.THINGSPEAK_READ_API_KEY || "").trim();
const RESULTS = Math.min(Math.max(Number(process.env.THINGSPEAK_RESULTS || 60) || 60, 1), 8000);

const FLAG = {
  low: "low_signal_quality",
  hr: "heart_rate_outside_configured_review_band",
  spo2: "spo2_below_configured_review_threshold",
  manual: "pulse_interval_variability_flag_from_firmware",
};

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function reviewFlags(reading) {
  const flags = [];
  if (reading.hr !== null && (reading.hr < 50 || reading.hr > 120)) flags.push(FLAG.hr);
  if (reading.spo2 !== null && reading.spo2 < 92) flags.push(FLAG.spo2);
  if (reading.quality !== null && reading.quality < 40) flags.push(FLAG.low);
  if (reading.flag) flags.push(FLAG.manual);
  return flags;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!CHANNEL) {
    res.status(500).json({ error: "THINGSPEAK_CHANNEL_ID is not configured" });
    return;
  }

  const params = new URLSearchParams({ results: String(RESULTS) });
  if (READ_KEY) params.set("api_key", READ_KEY);
  const url = `https://api.thingspeak.com/channels/${encodeURIComponent(CHANNEL)}/feeds.json?${params}`;

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "pulse-monitor-live-demo" },
    });
    if (!upstream.ok) {
      throw new Error(`ThingSpeak responded with HTTP ${upstream.status}`);
    }
    const data = await upstream.json();
    const feeds = Array.isArray(data.feeds) ? data.feeds : [];

    const readings = feeds
      .map((entry) => {
        const reading = {
          id: Number(entry.entry_id),
          recordedAt: entry.created_at,
          hr: num(entry.field1),
          spo2: num(entry.field2),
          quality: num(entry.field3),
          flag: num(entry.field4) === 1,
        };
        reading.flags = reviewFlags(reading);
        return reading;
      })
      .filter((r) => r.hr !== null || r.spo2 !== null)
      .sort((a, b) => a.id - b.id);

    res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=40");
    res.status(200).json({
      channel: data.channel
        ? { id: data.channel.id, name: data.channel.name, updatedAt: data.channel.updated_at }
        : null,
      generatedAt: new Date().toISOString(),
      readings,
      note:
        "Threshold review flags use the same rules as the local AI service. " +
        "The unsupervised anomaly stage runs only in the local deployment.",
    });
  } catch (err) {
    res.status(502).json({
      error: "Could not reach ThingSpeak",
      detail: String((err && err.message) || err),
    });
  }
};
