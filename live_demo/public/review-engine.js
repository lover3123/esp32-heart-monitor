/* Explainable prototype review. No diagnosis, disease forecast, or AI confidence. */
(function (root, factory) {
  const engine = factory();
  if (typeof module === "object" && module.exports) module.exports = engine;
  else root.PulseReview = engine;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = "2026-10-30.1";
  const SOURCES = Object.freeze({
    fda: { title: "FDA · Pulse Oximeter Basics", url: "https://www.fda.gov/consumers/consumer-updates/pulse-oximeter-basics" },
    oxygen: { title: "MedlinePlus · Pulse Oximetry", url: "https://medlineplus.gov/lab-tests/pulse-oximetry/" },
    pulse: { title: "American Heart Association · Resting Heart Rate", url: "https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/target-heart-rates" },
    context: { title: "NICE · Individualised oxygen targets", url: "https://www.nice.org.uk/guidance/ng115/chapter/Recommendations" },
  });
  const DEFAULTS = Object.freeze({ hrMin: 60, hrMax: 100, spo2Min: 95, qualityMin: 40, autoRefresh: true, theme: "dark" });
  const finite = value => typeof value === "number" && Number.isFinite(value);
  function sanitize(reading) {
    if (!reading) return reading;
    const clean = { ...reading, invalidFields:Array.isArray(reading.invalidFields)?[...reading.invalidFields]:[] };
    for (const key of ["hr","spo2","quality"]) {
      const value=reading[key];
      if(value===null||value===undefined){clean[key]=null;continue;}
      const valid=finite(value)&&(key==="hr"?value>0&&value<=300:key==="spo2"?value>0&&value<=100:value>=0&&value<=100);
      if(!valid){clean[key]=null;if(!clean.invalidFields.includes(key))clean.invalidFields.push(key);}
    }
    return clean;
  }
  function flagsFor(reading, settings = DEFAULTS) {
    if (!reading) return [];
    reading=sanitize(reading);
    const flags = [];
    if(reading.invalidFields.length)flags.push("invalid_reading");
    if (finite(reading.hr) && (reading.hr < settings.hrMin || reading.hr > settings.hrMax)) flags.push("pulse_band");
    if (finite(reading.spo2) && reading.spo2 < settings.spo2Min) flags.push("oxygen_band");
    if (finite(reading.quality) && reading.quality < settings.qualityMin) flags.push("signal_quality");
    if (reading.flag) flags.push("firmware_flag");
    return flags;
  }
  function observedTrend(rows) {
    const data = rows.slice(-12).map(sanitize).filter(r => finite(r.hr));
    if (data.length < 3) return { direction: "insufficient", text: "More samples needed for an observed trend." };
    const start = Date.parse(data[0].recordedAt), end = Date.parse(data.at(-1).recordedAt);
    if (end - start < 40000 || data.some((r,i) => i && Date.parse(r.recordedAt)-Date.parse(data[i-1].recordedAt)>90000)) return { direction: "insufficient", text: "Sampling gaps prevent a reliable short-window comparison." };
    const pairs = data.map(r => [(Date.parse(r.recordedAt)-start)/60000, r.hr]);
    const mx = pairs.reduce((s,p)=>s+p[0],0)/pairs.length, my = pairs.reduce((s,p)=>s+p[1],0)/pairs.length;
    const denominator = pairs.reduce((s,p)=>s+(p[0]-mx)**2,0);
    const slope = denominator ? pairs.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0)/denominator : 0;
    const direction = slope > 2 ? "rising" : slope < -2 ? "falling" : "little change";
    return { direction, bpmPerMinute: Math.round(slope*10)/10, samples:data.length, text: `Observed pulse: ${direction} across ${data.length} samples. This is a description, not a forecast.` };
  }
  function evaluate(rows, options = {}) {
    const now = options.now ?? Date.now(), settings = { ...DEFAULTS, ...options.settings };
    const latest = sanitize(rows.at(-1));
    const result = { version:VERSION, level:"neutral", title:"Waiting for your first reading.", detail:"Connect the feed to review uploaded estimates.", reasons:[], guidance:[], available:0, fresh:false, persistent:false, alertKey:null, model:"Evidence-linked rules; not a trained diagnostic model", prediction:null, trend:observedTrend(rows) };
    if (!latest) return result;
    result.available = [latest.hr,latest.spo2,latest.quality].filter(finite).length;
    const age = now-Date.parse(latest.recordedAt);
    result.fresh = Number.isFinite(age) && age >= -30000 && age <= 90000;
    result.ageSeconds = Number.isFinite(age) ? Math.round(age/1000) : null;
    if (!result.fresh || options.feedError) {
      result.title = options.feedError ? "The feed could not be refreshed." : "The last measurement is not current.";
      result.detail = "Showing the last uploaded data. No current health conclusion is available.";
      result.reasons.push({ id:"freshness", text:"Freshness checks failed or the feed request failed.", source:null });
      return result;
    }
    const flags = flagsFor(latest, settings);
    if(latest.invalidFields.length)result.reasons.push({id:"invalid_reading",text:`Invalid/sentinel values were received for ${latest.invalidFields.join(", ")}. They are displayed as unavailable, not a diagnosis or a valid measurement.`,source:null});
    const lowQuality = finite(latest.quality) && latest.quality < settings.qualityMin;
    if (!finite(latest.quality)) result.reasons.push({ id:"missing_quality", text:"Signal quality was not supplied; measurement reliability cannot be confirmed.", source:"fda" });
    if (!finite(latest.hr) || !finite(latest.spo2)) result.reasons.push({ id:"incomplete", text:"One of the pulse/oxygen measurements is missing.", source:null });
    if (lowQuality) result.reasons.push({ id:"signal_quality", text:`Reported signal quality ${latest.quality}% is below the configured ${settings.qualityMin}% heuristic. This is not a calibrated accuracy score.`, source:"fda" });
    if (flags.includes("pulse_band")) result.reasons.push({ id:"pulse_band", text:`Pulse ${latest.hr} BPM is outside your ${settings.hrMin}–${settings.hrMax} BPM review band. Rest, activity, medication and personal context matter.`, source:"pulse" });
    if (flags.includes("oxygen_band")) result.reasons.push({ id:"oxygen_band", text:`SpO₂ estimate ${latest.spo2}% is below your ${settings.spo2Min}% review threshold. Confirm the measurement and follow an individual clinical plan.`, source:"oxygen" });
    if (latest.flag) result.reasons.push({ id:"firmware_flag", text:"The firmware/manual variability flag is set. It does not establish an arrhythmia.", source:null });
    const previous = rows.at(-2);
    result.persistent = Boolean(previous && Date.parse(latest.recordedAt)>Date.parse(previous.recordedAt) && Date.parse(latest.recordedAt)-Date.parse(previous.recordedAt)<=90000 && flags.some(f=>f!=="signal_quality"&&flagsFor(previous,settings).includes(f)));
    if (finite(latest.spo2) && latest.spo2 <= 88) {
      result.level = "urgent"; result.title = "Very low oxygen estimate — seek immediate help.";
      result.detail = "Do not rely on this prototype or wait for another dashboard alert. Seek immediate medical attention; severe symptoms need emergency services.";
      result.reasons.unshift({id:"very_low_oxygen",text:`Uploaded SpO₂ estimate is ${latest.spo2}%. This result may be inaccurate, but must not be treated as reassuring.`,source:"oxygen"});
      result.alertKey = "very_low_oxygen";
    } else if (finite(latest.spo2) && latest.spo2 <= 92) {
      result.level = "warning"; result.title = "Low oxygen estimate — contact a clinician.";
      result.detail = "Confirm with a suitable medical device and contact your care provider promptly. Follow any individual oxygen plan; serious symptoms need urgent help.";
      result.reasons.unshift({id:"low_oxygen",text:`SpO₂ estimate is ${latest.spo2}%. The general reference advises contacting a provider at 92% or below; clinical targets may differ.`,source:"oxygen"});
      result.alertKey = "low_oxygen";
    } else if (flags.length) {
      result.level = "warning"; result.title = latest.invalidFields.length ? "Invalid sensor values need a measurement check." : lowQuality ? "Check the signal before interpreting this sample." : result.persistent ? "Repeated readings need your attention." : "A measurement needs another look.";
      result.detail = lowQuality ? "Check placement, keep still and repeat the measurement. Poor signal does not rule out a medical problem." : "Review the reasons below. These flags do not identify a disease or predict an event.";
      if (result.persistent && !lowQuality && !latest.invalidFields.length) result.alertKey = flags.filter(f=>f!=="signal_quality").sort().join("+");
    } else {
      result.level = result.available === 3 ? "good" : "neutral";
      result.title = "No threshold flags on this sample.";
      result.detail = result.available === 3 ? "This does not rule out illness. Consider symptoms, measurement limitations and your clinician’s guidance." : "The available values have no configured flags, but the measurement is incomplete or its signal quality is unknown.";
    }
    result.guidance = ["If symptoms are severe or worsening, seek urgent medical help regardless of these numbers.","This prototype has no validated disease-prediction model or diagnostic confidence score."];
    return result;
  }
  return { VERSION, SOURCES, DEFAULTS, flagsFor, evaluate, observedTrend, sanitize };
});
