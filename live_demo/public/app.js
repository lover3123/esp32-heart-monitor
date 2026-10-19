const $ = (id) => document.getElementById(id);

const fmt = (value, suffix = "") =>
  value === null || value === undefined ? "—" : `${value}${suffix}`;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const flagLabels = {
  low_signal_quality: "Low signal quality — repeat measurement while still",
  heart_rate_outside_configured_review_band: "Heart rate outside configured review band",
  spo2_below_configured_review_threshold: "SpO₂ below configured review threshold",
  pulse_interval_variability_flag_from_firmware: "Manual/test pulse-variability flag present",
  unusual_relative_to_recent_device_history: "Unusual relative to recent device history",
};

function readableFlags(reading) {
  const pieces = (reading.flags || []).map((flag) => flagLabels[flag] || flag);
  if (!pieces.length) {
    return "No configured review flags on this sample. This is not proof that a health condition is absent.";
  }
  return pieces.join(" · ");
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso || "—");
  return date.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

async function refresh() {
  try {
    const response = await fetch("/api/feeds", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.detail || `HTTP ${response.status}`);

    const readings = Array.isArray(data.readings) ? data.readings : [];
    $("status").textContent = `Live · ${new Date().toLocaleTimeString()}`;
    $("status").classList.add("ok");
    $("count").textContent = readings.length;

    const latest = readings[readings.length - 1];
    $("hr").textContent = latest ? fmt(Number(latest.hr).toFixed(1)) : "—";
    $("spo2").textContent = latest ? fmt(latest.spo2) : "—";
    $("quality").textContent = latest ? fmt(latest.quality) : "—";
    $("aiSummary").textContent = latest
      ? readableFlags(latest)
      : "No measurements in the channel yet. Start the simulator and wait for the next upload.";

    $("readings").innerHTML = readings
      .slice()
      .reverse()
      .map((r) => `<tr>
        <td>${escapeHTML(formatTime(r.recordedAt))}</td>
        <td>${fmt(Number(r.hr).toFixed(1))}</td>
        <td>${fmt(r.spo2, "%")}</td>
        <td>${fmt(r.quality, "%")}</td>
        <td>${r.flag ? "Manual/test flag" : "No manual flag"}</td>
        <td>${escapeHTML(readableFlags(r))}</td>
      </tr>`)
      .join("") || '<tr><td colspan="6">No measurements received yet.</td></tr>';
  } catch (error) {
    $("status").textContent = "Feed unavailable";
    $("status").classList.remove("ok");
    $("readings").innerHTML =
      '<tr><td colspan="6">Could not load the ThingSpeak feed. Check the serverless environment variables.</td></tr>';
    console.error(error);
  }
}

$("refresh").addEventListener("click", refresh);
refresh();
setInterval(refresh, 15000);
