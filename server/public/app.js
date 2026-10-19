const $ = (id) => document.getElementById(id);
const fmt = (v, suffix="") => v === null || v === undefined ? "—" : `${v}${suffix}`;
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
const flagLabels = {
  low_signal_quality: "Low signal quality — repeat measurement while still",
  heart_rate_outside_configured_review_band: "Heart rate outside configured review band",
  spo2_below_configured_review_threshold: "SpO₂ below configured review threshold",
  pulse_interval_variability_flag_from_firmware: "Manual/test pulse-variability flag present",
  unusual_relative_to_recent_device_history: "Unusual relative to recent device history"
};
function readableAI(r) {
  if (!r.ai_review_flags) return "AI result unavailable — check that the Python AI service is running.";
  let flags;
  try { flags = JSON.parse(r.ai_review_flags); } catch { flags = []; }
  const pieces = (Array.isArray(flags) ? flags : []).map(f => flagLabels[f] || f);
  if (r.ai_anomaly === 1 && !pieces.includes(flagLabels.unusual_relative_to_recent_device_history)) {
    pieces.push("Unusual relative to recent device history");
  }
  if (!pieces.length) {
    if (r.ai_anomaly === 0) return "No configured review flags on this sample. This is not proof that a health condition is absent.";
    return "No threshold flags returned. The unsupervised model needs at least 50 samples before it scores unusual patterns.";
  }
  return pieces.join(" · ");
}
async function refresh() {
  try {
    const [readings, symptoms] = await Promise.all([getJSON("/api/readings?limit=100"), getJSON("/api/symptoms?limit=30")]);
    $("status").textContent = "API connected";
    $("count").textContent = readings.length;
    const latest = readings[readings.length - 1];
    $("hr").textContent = latest ? fmt(Number(latest.heart_rate).toFixed(1)) : "—";
    $("spo2").textContent = latest ? fmt(latest.spo2) : "—";
    $("quality").textContent = latest ? fmt(latest.signal_quality) : "—";
    $("aiSummary").textContent = latest ? readableAI(latest) : "No measurements stored yet. Start the Wokwi simulator and ThingSpeak bridge.";
    $("readings").innerHTML = readings.slice().reverse().map(r => `<tr>
      <td>${escapeHTML(r.recorded_at)}</td><td>${fmt(Number(r.heart_rate).toFixed(1))}</td>
      <td>${fmt(r.spo2, "%")}</td><td>${fmt(r.signal_quality, "%")}</td>
      <td>${r.irregular_pulse_flag ? "Manual/test flag" : "No manual flag"}</td>
      <td>${escapeHTML(readableAI(r))}</td></tr>`).join("") || '<tr><td colspan="6">No measurements received yet.</td></tr>';
    $("symptomList").innerHTML = symptoms.map(s => `<article class="symptom"><strong>${escapeHTML(s.symptoms)}</strong>
      <div>Severity: ${s.severity}/5</div><small>Occurred: ${escapeHTML(s.occurred_at)} · Logged: ${escapeHTML(s.recorded_at)}</small>
      ${s.notes ? `<p>${escapeHTML(s.notes)}</p>` : ""}</article>`).join("") || "No symptom logs yet.";
  } catch (e) { $("status").textContent = "API unavailable"; console.error(e); }
}
$("refresh").addEventListener("click", refresh);
$("symptomForm").addEventListener("submit", async (e) => {
  e.preventDefault(); $("symptomStatus").textContent = "Saving…";
  try {
    const occurred = new Date($("occurredAt").value);
    const r = await fetch("/api/symptoms", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      symptoms:$("symptoms").value, severity:Number($("severity").value),
      occurredAt:occurred.toISOString(), notes:$("notes").value
    })});
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Save failed");
    $("symptomStatus").textContent = "Saved.";
    $("symptoms").value = ""; $("notes").value = ""; await refresh();
  } catch (err) { $("symptomStatus").textContent = `Error: ${err.message}`; }
});
$("occurredAt").value = new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
refresh(); setInterval(refresh, 10000);
