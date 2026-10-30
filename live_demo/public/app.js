"use strict";
const $ = id => document.getElementById(id);
const Review = window.PulseReview;
const DEFAULTS = Review.DEFAULTS;
const PREF_KEY = "pulse-monitor:preferences:v2";
const JOURNAL_KEY = "pulse-monitor:journal:v2";
const POLL_MS = 20000;
const sessionStarted = Date.now();
function storedJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function validPreferences(raw) {
  const settings = { ...DEFAULTS };
  if (raw && typeof raw === "object") {
    if (["dark","light"].includes(raw.theme)) settings.theme = raw.theme;
    if (typeof raw.autoRefresh === "boolean") settings.autoRefresh = raw.autoRefresh;
    for (const key of ["hrMin","hrMax","spo2Min","qualityMin"]) if (Number.isFinite(raw[key])) settings[key] = raw[key];
    if (settings.hrMin < 1 || settings.hrMax > 300 || settings.hrMin >= settings.hrMax) { settings.hrMin=DEFAULTS.hrMin; settings.hrMax=DEFAULTS.hrMax; }
    if (settings.spo2Min < 1 || settings.spo2Min > 100) settings.spo2Min=DEFAULTS.spo2Min;
    if (settings.qualityMin < 0 || settings.qualityMin > 100) settings.qualityMin=DEFAULTS.qualityMin;
  }
  return settings;
}
function validJournal(raw) {
  return Array.isArray(raw) ? raw.filter(e => e && typeof e.id === "string" && typeof e.note === "string" && e.note.length<=1000 && typeof e.feeling === "string" && Number.isFinite(Date.parse(e.occurredAt))).slice(0,100) : [];
}
const state = { readings:[], channel:null, status:"loading", syncedAt:null, settings:validPreferences(storedJSON(PREF_KEY,{})), entries:validJournal(storedJSON(JOURNAL_KEY,[])), range:3600000, pulseRange:600000, smoothed:false, demo:false, controller:null, poll:null, nextPoll:null, toastTimer:null, lastNotification:null, lastNotificationAt:0, notifications:false, review:null };
const number = value => value === null || value === undefined || String(value).trim() === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const valueText = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString(undefined,{maximumFractionDigits:1});
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const dateText = iso => Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}) : "No sample yet";
const timeText = (iso,seconds=true) => Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit",...(seconds?{second:"2-digit"}:{})}) : "--:--";
function savePreferences() { try { localStorage.setItem(PREF_KEY,JSON.stringify(state.settings)); return true; } catch { return false; } }
function toast(message) { $("toast").textContent=message; $("toast").hidden=false; clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>$("toast").hidden=true,4200); }
function badge(id,label,status="neutral") { $(id).textContent=label; $(id).className=`badge ${id.includes("analysis")||id==="device-badge"?"light-badge ":""}${status}`; }
function selectedRange(range) {
  const latest=state.readings.at(-1); if (!latest) return [];
  const cutoff=Date.parse(latest.recordedAt)-range;
  return state.readings.filter(r=>Date.parse(r.recordedAt)>=cutoff);
}
function normalize(rows) {
  return rows.filter(row=>row&&Number.isFinite(Date.parse(row.recordedAt))).map(row=>Review.sanitize({id:number(row.id),recordedAt:new Date(row.recordedAt).toISOString(),hr:number(row.hr),spo2:number(row.spo2),quality:number(row.quality),flag:row.flag===true,flags:Array.isArray(row.flags)?row.flags.filter(f=>typeof f==="string"):[]})).sort((a,b)=>Date.parse(a.recordedAt)-Date.parse(b.recordedAt)||(a.id??0)-(b.id??0));
}
function applyTheme(theme,persist=false) {
  state.settings.theme=theme;
  document.documentElement.dataset.theme=theme;
  document.querySelectorAll(".theme-switch button").forEach(button=>{const on=button.dataset.theme===theme;button.classList.toggle("selected",on);button.setAttribute("aria-pressed",String(on));});
  if (persist && !savePreferences()) toast("Theme applied for this visit; browser storage is unavailable.");
  renderCharts();
}
function renderConnectivity() {
  const latest=state.readings.at(-1), age=latest ? Date.now()-Date.parse(latest.recordedAt) : Infinity;
  const fresh=age>=-30000&&age<=90000;
  let label="Connecting", side="Connecting", status="neutral";
  if (state.status==="loading") { label="Syncing"; side="Syncing feed"; }
  else if (state.status==="error") { label="Unavailable"; side="Feed unavailable"; status="bad"; }
  else if (!latest) { label="No data"; side="Waiting for data"; }
  else if (state.demo) { label="Demo"; side="Demo data"; status="warn"; }
  else if (fresh) { label="Live"; side="Feed Active"; status="good"; }
  else { label="Delayed"; side="Feed Delayed"; status="warn"; }
  $("live-label").textContent=label; $("side-status").textContent=side;
  $("side-dot").className=`status-dot ${status}`;
  $("live-status").querySelector(".status-dot").className=`status-dot ${status}`;
  $("side-source").textContent=state.demo?"Synthetic preview samples":"ThingSpeak uploads";
  $("chart-source").textContent=state.demo?"Demo data · simulated":"ThingSpeak samples";
  $("last-sync").textContent=state.syncedAt?timeText(state.syncedAt):"Not synced yet";
  badge("device-badge",state.demo?"Demo":fresh&&state.status==="ready"?"Feed active":latest?"Delayed":"Waiting",state.demo?"neutral":fresh&&state.status==="ready"?"good":"neutral");
  $("device-source").textContent=state.channel?.name || "ThingSpeak · MAX30102";
  const banner=$("feed-banner");
  banner.hidden=state.status!=="error"&&!state.demo&&(!latest||fresh);
  banner.textContent=state.status==="error"?"The feed could not be refreshed. Try Refresh; any visible measurements are the last loaded samples.":state.demo?"Preview mode: these are simulated readings, not measurements from a person.":"The latest upload is more than 90 seconds old. Showing historical data, not a current measurement.";
  const remaining=state.nextPoll?Math.max(0,Math.ceil((state.nextPoll-Date.now())/1000)):null;
  $("poll-note").textContent=state.settings.autoRefresh?`Next feed refresh in ${remaining??20}s` : "Auto-refresh paused · use Refresh to update";
  $("session-uptime").textContent=`Session: ${Math.floor((Date.now()-sessionStarted)/60000)}m`;
}
function metricStatus(id,value,outside,goodLabel="Within band") { badge(id,value===null?"Not available":outside?"Review":goodLabel,value===null?"neutral":outside?"warn":"good"); }
function renderMetrics() {
  const latest=state.readings.at(-1), prefs=state.settings;
  $("hr").textContent=valueText(latest?.hr);$("spo2").textContent=valueText(latest?.spo2);$("quality").textContent=valueText(latest?.quality);
  $("count").textContent=state.readings.length.toLocaleString();
  $("last-updated").textContent=latest?timeText(latest.recordedAt):"--:--";
  $("last-updated-date").textContent=latest?dateText(latest.recordedAt):"No sample yet";
  $("hr-band").textContent=`Review band: ${prefs.hrMin}–${prefs.hrMax} BPM`;
  $("spo2-band").textContent=`Review threshold: ${prefs.spo2Min}%`;
  metricStatus("hr-badge",latest?.hr??null,latest?.hr<prefs.hrMin||latest?.hr>prefs.hrMax);
  metricStatus("spo2-badge",latest?.spo2??null,latest?.spo2<prefs.spo2Min);
  metricStatus("quality-badge",latest?.quality??null,latest?.quality<prefs.qualityMin,"Reported");
  $("signal-bars").querySelectorAll("i").forEach((bar,index)=>bar.classList.toggle("on",latest?.quality!==null&&latest?.quality!==undefined&&latest.quality>index*20));
}
function renderReview() {
  const latest=state.readings.at(-1), result=Review.evaluate(state.readings,{settings:state.settings,feedError:state.status==="error"});
  state.review=result;
  $("analysis-summary").textContent=result.title;$("analysis-detail").textContent=result.detail;
  const appearance=result.level==="urgent"||result.level==="warning"?"warning":result.level==="good"?"":"neutral";
  $("analysis-message").className=`analysis-message ${appearance}`;
  $("analysis-mark-icon").querySelector("use").setAttribute("href",appearance==="warning"?"#i-warning":"#i-check");
  badge("analysis-badge",result.level==="urgent"?"Attention":result.level==="warning"?"Review":result.level==="good"?"No flags":"Limited",result.level==="good"?"good":appearance==="warning"?"warn":"neutral");
  for (const [key,id,unit] of [["hr","hr","BPM"],["spo2","spo2","%"],["quality","quality","%"]]) {
    const value=latest?.[key]??null;
    const outside=value!==null&&(key==="hr"?(value<state.settings.hrMin||value>state.settings.hrMax):value<state.settings[key==="spo2"?"spo2Min":"qualityMin"]);
    $("review-"+id).textContent=value===null?"Not provided":`${outside?"Review":"Within band"} (${valueText(value)}${key==="hr"?" ":""}${unit})`;
    $("review-"+id+"-dot").className=`review-dot ${value===null?"":outside?"warn":"good"}`;
  }
  $("coverage-bar").style.width=`${result.available/3*100}%`;$("coverage-value").textContent=`${result.available}/3`;
  const flagged=latest?Review.flagsFor(latest,state.settings):[];
  $("alert-summary").textContent=!latest?"No sample to review yet.":!result.fresh?"No current conclusion: the last sample is delayed.":flagged.length?`${flagged.length} review flag${flagged.length===1?"":"s"} on the latest sample. Open the evidence report for details.`:"No threshold alerts on the latest sample.";
  renderEvidence();
  maybeNotify(result);
}
function renderEvidence() {
  if (!$("evidence-reasons")) return;
  const result=state.review;
  $("evidence-reasons").replaceChildren();
  for (const reason of result.reasons) {
    const item=document.createElement("li");item.textContent=reason.text+" ";
    const source=Review.SOURCES[reason.source];
    if (source) { const link=document.createElement("a");link.href=source.url;link.textContent="Source";link.target="_blank";link.rel="noopener noreferrer";item.append(link); }
    $("evidence-reasons").append(item);
  }
  if (!result.reasons.length) { const li=document.createElement("li");li.textContent="No configured threshold condition was triggered. This is not a medical clearance.";$("evidence-reasons").append(li); }
  $("observed-trend").textContent=result.trend.text;
}
function renderRows(id,rows,full=false) {
  $(id).innerHTML=rows.map(row=>{
    const flags=Review.flagsFor(row,state.settings), missing=row.hr===null||row.spo2===null||row.quality===null;
    const status=flags.length?"Review":missing?"Limited":"No flags";
    return `<tr><td>${escapeHTML(full?dateText(row.recordedAt)+" · "+timeText(row.recordedAt):timeText(row.recordedAt))}</td><td>${escapeHTML(valueText(row.hr))}</td><td>${escapeHTML(valueText(row.spo2))}</td><td>${escapeHTML(valueText(row.quality))}${row.quality===null?"":"%"}</td><td><span class="row-badge ${flags.length?"warn":missing?"neutral":""}">${status}</span></td></tr>`;
  }).join("")||'<tr><td colspan="5" class="empty-cell">No measurements available yet.</td></tr>';
}
function stats(rows,key) {
  const values=rows.map(r=>r[key]).filter(v=>v!==null);
  return values.length?{Current:values.at(-1),Average:values.reduce((a,b)=>a+b,0)/values.length,Min:Math.min(...values),Max:Math.max(...values)}:{Current:null,Average:null,Min:null,Max:null};
}
function renderStats(id,rows,key) { const unit=key==="hr"?"BPM":"%";$(id).innerHTML=Object.entries(stats(rows,key)).map(([label,value])=>`<div><dt>${label}</dt><dd>${label==="Current"?"<i></i>":""}${escapeHTML(valueText(value))}${value===null?"":` <small>${unit}</small>`}</dd></div>`).join(""); }
function chart(id,rows,key,pulse=false) {
  const element=$(id), width=Math.max(260,element.clientWidth||700), height=element.clientHeight||160;
  const left=pulse?33:31,right=10,top=10,bottom=24,plotW=width-left-right,plotH=height-top-bottom;
  const light=!pulse||state.settings.theme==="light", grid=light?"#dce6fa":"#163449", labels=light?"#536b98":"#a5bedf",color=key==="spo2"?"#04c8e5":"#ff5a7d";
  let plotted=rows.map((r,index)=>({time:Date.parse(r.recordedAt),value:r[key],original:r}));
  if (pulse&&state.smoothed) plotted=plotted.map((p,index)=>{if(p.value===null)return p;const near=plotted.slice(Math.max(0,index-1),index+2).filter(n=>n.value!==null&&Math.abs(n.time-p.time)<=90000);return {...p,value:near.reduce((s,n)=>s+n.value,0)/near.length};});
  const valid=plotted.filter(p=>p.value!==null),values=valid.map(p=>p.value);
  let yMin=key==="spo2"?Math.min(80,...values):0;
  yMin=Math.floor(yMin/5)*5;
  const yMax=key==="spo2"?Math.max(100,...values):Math.max(pulse?150:120,Math.ceil(Math.max(0,...values)/40)*40);
  const earliest=plotted[0]?.time??Date.now()-600000,latest=plotted.at(-1)?.time??Date.now();
  const x=t=>left+(t-earliest)/Math.max(latest-earliest,20000)*plotW;
  const y=v=>top+plotH-(v-yMin)/Math.max(1,yMax-yMin)*plotH;
  let svg=`<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="fill-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="${pulse ? 0.22 : 0.32}"/><stop offset="1" stop-color="${color}" stop-opacity=".015"/></linearGradient><filter id="glow-${id}" x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="2.5"/></filter></defs>`;
  for(let i=0;i<=4;i++){
    const yy=top+i*plotH/4,val=yMax-i*(yMax-yMin)/4;
    svg+=`<path d="M${left} ${yy}H${width-right}" stroke="${grid}" stroke-width=".7"/><text x="${left-9}" y="${yy+3}" fill="${labels}" stroke="none" font-size="10" text-anchor="end">${Math.round(val)}</text>`;
    const xx=left+i*plotW/4;
    svg+=`<path d="M${xx} ${top}V${height-bottom}" stroke="${grid}" stroke-width=".7"/>`;
    if(plotted.length)svg+=`<text x="${xx}" y="${height-5}" fill="${labels}" stroke="none" font-size="9" text-anchor="${i===0?"start":i===4?"end":"middle"}">${escapeHTML(new Date(earliest+(latest-earliest)*i/4).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit",hour12:false}))}</text>`;
  }
  const segments=[];let segment=[];let previous=null;
  for(const point of plotted){if(point.value===null||(previous&&point.time-previous.time>90000)){if(segment.length)segments.push(segment);segment=[];}if(point.value!==null)segment.push(point);previous=point;}
  if(segment.length)segments.push(segment);
  for(const points of segments){
    const line=points.map((p,i)=>`${i?"L":"M"}${x(p.time).toFixed(2)} ${y(p.value).toFixed(2)}`).join(" ");
    if(points.length>1){svg+=`<path d="${line} L${x(points.at(-1).time)} ${height-bottom} L${x(points[0].time)} ${height-bottom}Z" fill="url(#fill-${id})" stroke="none"/>`;if(pulse)svg+=`<path d="${line}" stroke="${color}" stroke-width="5" opacity=".5" filter="url(#glow-${id})"/>`;svg+=`<path d="${line}" stroke="${color}" stroke-width="2.1"/>`;}
    const last=points.at(-1);svg+=`<circle cx="${x(last.time)}" cy="${y(last.value)}" r="${points.length===1?3:2.5}" fill="${color}" stroke="none"/>`;
  }
  svg+="</svg>";
  element.innerHTML=svg+(!valid.length?'<div class="chart-empty">Waiting for measurements</div>':valid.length===1?'<div class="single-point-note">One sample · more needed for a trend</div>':"")+'<div class="chart-tooltip" hidden></div>';
  element.dataset.points=valid.length;
  element.setAttribute("aria-label",valid.length?`${key==="hr"?"Heart rate":"SpO₂"}: ${valid.length} samples, latest ${valueText(valid.at(-1).value)} ${key==="hr"?"BPM":"percent"}.`:`No ${key==="hr"?"heart-rate":"oxygen"} samples available.`);
  const tooltip=element.querySelector(".chart-tooltip");
  element.onpointermove=event=>{if(!valid.length)return;const ratio=(event.clientX-element.getBoundingClientRect().left-left)/plotW,target=earliest+ratio*(latest-earliest);const nearest=valid.reduce((best,p)=>Math.abs(p.time-target)<Math.abs(best.time-target)?p:best);tooltip.textContent=`${timeText(nearest.original.recordedAt)} · ${valueText(nearest.value)} ${key==="hr"?"BPM":"%"}`;tooltip.hidden=false;};
  element.onpointerleave=()=>tooltip.hidden=true;
}
function renderCharts() {
  if (!$("pulse-chart")) return;
  const pulseRows=selectedRange(state.pulseRange),rows=selectedRange(state.range);
  chart("pulse-chart",pulseRows,"hr",true);chart("hr-chart",rows,"hr");chart("spo2-chart",rows,"spo2");
  $("pulse-count").textContent=`${pulseRows.filter(r=>r.hr!==null).length} samples`;
  renderStats("hr-stats",rows,"hr");renderStats("spo2-stats",rows,"spo2");
  const duration=state.readings.length>1?Math.max(1,Math.round((Date.parse(state.readings.at(-1).recordedAt)-Date.parse(state.readings[0].recordedAt))/60000)):0;
  $("range-note").textContent=`${rows.length} samples in this range · ${duration} min loaded · ranges end at the latest sample.`;
}
function renderDevice() {
  const latest=state.readings.at(-1);
  const rows=[["Source",state.demo?"Simulated preview":state.channel?.name||"ThingSpeak"],["Channel",state.channel?.id??"Not available"],["Last recorded",latest?dateText(latest.recordedAt)+" · "+timeText(latest.recordedAt):"No sample"],["Loaded samples",state.readings.length],["Feed refresh",state.settings.autoRefresh?"Every 20 seconds":"Paused"],["Board connection", "Not directly observable"],["AI model", "Not connected to this live view"]];
  $("device-details").innerHTML=rows.map(([key,value])=>`<div><dt>${escapeHTML(key)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("");
}
function renderAll() {
  renderMetrics();renderConnectivity();renderReview();renderCharts();renderDevice();
  renderRows("readings",state.readings.slice(-7).reverse());renderRows("history-readings",state.readings.slice().reverse(),true);
  $("history-description").textContent=`${state.readings.length} loaded measurements, newest first. Longer ranges do not fetch additional history.`;
  $("export-description").textContent=`Export up to ${state.readings.length} measurements currently loaded in this dashboard.`;
}
async function refresh() {
  if (state.controller) return;
  const controller=new AbortController();state.controller=controller;state.status="loading";
  for(const id of ["refresh","live-status"])$(id).disabled=true;
  $("readings").setAttribute("aria-busy","true");renderConnectivity();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try {
    const response=await fetch("/api/feeds",{cache:"no-store",signal:controller.signal});
    if(!response.ok)throw Error(`Feed request failed (${response.status})`);
    const data=await response.json();if(!data||!Array.isArray(data.readings))throw Error("Invalid feed format");
    state.readings=normalize(data.readings);state.channel=data.channel&&typeof data.channel==="object"?data.channel:null;
    state.demo=data.demo===true||String(state.channel?.id)==="mock";
    state.status="ready";state.syncedAt=new Date().toISOString();
  } catch(error) { state.status="error"; }
  finally {
    clearTimeout(timeout);state.controller=null;
    for(const id of ["refresh","live-status"])$(id).disabled=false;
    $("readings").setAttribute("aria-busy","false");renderAll();
    state.nextPoll=state.settings.autoRefresh?Date.now()+POLL_MS:null;
  }
}
function configurePolling() { clearInterval(state.poll);state.poll=null;state.nextPoll=null;if(state.settings.autoRefresh){state.nextPoll=Date.now()+POLL_MS;state.poll=setInterval(refresh,POLL_MS);}renderConnectivity(); }
const dialogOpeners=new WeakMap();
function openDialog(id,opener=document.activeElement) {
  closeNavigation(false);
  const dialog=$(id);if(dialog.open)return;
  if(id==="settings-dialog") fillSettings(state.settings);
  if(id==="entry-dialog"){ $("entry-form").reset();$("entry-error").textContent="";$("entry-form").elements.occurredAt.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16); }
  if(id==="journal-dialog")renderJournal();
  if(id==="export-dialog")$("export-error").textContent="";
  if(id==="device-dialog")renderDevice();
  dialogOpeners.set(dialog,opener);dialog.showModal();
}
document.querySelectorAll("[data-open]").forEach(button=>button.addEventListener("click",()=>openDialog(button.dataset.open,button)));
document.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>button.closest("dialog").close()));
document.querySelectorAll("dialog").forEach(dialog=>{
  dialog.addEventListener("close",()=>{const opener=dialogOpeners.get(dialog);if(opener?.isConnected&&!opener.closest("[inert]"))opener.focus();});
  dialog.addEventListener("click",event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
});
function fillSettings(settings) { const form=$("settings-form");for(const key of ["hrMin","hrMax","spo2Min","qualityMin"])form.elements[key].value=settings[key];form.elements.autoRefresh.checked=settings.autoRefresh;$("settings-error").textContent=""; }
$("reset-settings").addEventListener("click",()=>fillSettings({...DEFAULTS,theme:state.settings.theme}));
$("settings-form").addEventListener("submit",event=>{
  event.preventDefault();const form=event.currentTarget;
  const next={...state.settings};for(const key of ["hrMin","hrMax","spo2Min","qualityMin"])next[key]=Number(form.elements[key].value);
  if(next.hrMin>=next.hrMax){$("settings-error").textContent="The lower heart-rate bound must be below the upper bound.";return;}
  next.autoRefresh=form.elements.autoRefresh.checked;state.settings=validPreferences(next);
  const saved=savePreferences();configurePolling();renderAll();$("settings-dialog").close();toast(saved?"Dashboard preferences saved.":"Applied for this visit; browser storage is unavailable.");
});
document.querySelectorAll(".theme-switch button").forEach(button=>button.addEventListener("click",()=>applyTheme(button.dataset.theme,true)));
document.querySelectorAll("[data-range]").forEach(button=>button.addEventListener("click",()=>{state.range=Number(button.dataset.range);document.querySelectorAll("[data-range]").forEach(item=>{const selected=item===button;item.classList.toggle("selected",selected);item.setAttribute("aria-pressed",String(selected));});renderCharts();}));
$("pulse-range").addEventListener("change",event=>{state.pulseRange=Number(event.target.value);renderCharts();});
document.querySelectorAll("[data-smoothing]").forEach(button=>button.addEventListener("click",()=>{state.smoothed=button.dataset.smoothing==="true";document.querySelectorAll("[data-smoothing]").forEach(item=>{const selected=item===button;item.classList.toggle("selected",selected);item.setAttribute("aria-pressed",String(selected));});renderCharts();}));
function renderJournal() {
  const root=$("journal-entries");root.replaceChildren();
  $("journal-caption").textContent=state.entries.length?`${state.entries.length} personal ${state.entries.length===1?"entry":"entries"} saved in this browser.`:"Keep a personal note alongside your data.";
  if(!state.entries.length){const empty=document.createElement("p");empty.className="empty-journal";empty.textContent="Your journal starts here. Add a note about how you feel.";root.append(empty);return;}
  for(const entry of [...state.entries].sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt))){
    const article=document.createElement("article");article.className="journal-entry";
    const header=document.createElement("header"),heading=document.createElement("h3"),time=document.createElement("time"),note=document.createElement("p"),remove=document.createElement("button");
    heading.textContent=entry.feeling;time.dateTime=entry.occurredAt;time.textContent=dateText(entry.occurredAt)+" · "+timeText(entry.occurredAt,false);note.textContent=entry.note;
    remove.textContent="Delete entry";remove.className="delete-entry";remove.type="button";
    remove.addEventListener("click",()=>{const next=state.entries.filter(item=>item.id!==entry.id);try{localStorage.setItem(JOURNAL_KEY,JSON.stringify(next));state.entries=next;renderJournal();}catch{toast("Could not delete the saved entry. Browser storage is unavailable.");}});
    header.append(heading,time);article.append(header,note,remove);root.append(article);
  }
}
$("entry-form").addEventListener("submit",event=>{
  event.preventDefault();const form=event.currentTarget,note=form.elements.note.value.trim(),date=new Date(form.elements.occurredAt.value);
  if(!note||!Number.isFinite(date.getTime())){$("entry-error").textContent="Enter a note and valid date/time.";return;}
  if(state.entries.length>=100){$("entry-error").textContent="Your journal has 100 entries. Delete an older entry before adding another.";return;}
  const entry={id:crypto.randomUUID(),note,feeling:form.elements.feeling.value,occurredAt:date.toISOString()};
  try{const next=[...state.entries,entry];localStorage.setItem(JOURNAL_KEY,JSON.stringify(next));state.entries=next;renderJournal();$("entry-dialog").close();toast("Journal entry saved on this browser.");}
  catch{$("entry-error").textContent="Not saved. Browser storage is unavailable; your note is still here.";}
});
$("journal-add").addEventListener("click",()=>{$("journal-dialog").close();openDialog("entry-dialog",document.querySelector('[data-open="journal-dialog"]'));});
function csvCell(value){let text=value==null?"":String(value);if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
function downloadFile(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement("a");link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$("export-form").addEventListener("submit",event=>{
  event.preventDefault();const form=event.currentTarget,rows=form.elements.scope.value==="all"?state.readings:selectedRange(state.range);
  if(!rows.length){$("export-error").textContent="No measurements are available in this selection.";return;}
  const stamp=new Date().toISOString().slice(0,10);
  if(form.elements.format.value==="json")downloadFile(`pulse-monitor-${stamp}.json`,JSON.stringify({exportedAt:new Date().toISOString(),channel:state.channel,simulated:state.demo,review:Review.evaluate(rows,{settings:state.settings}),sources:Review.SOURCES,readings:rows},null,2),"application/json");
  else {const header=["recorded_at","heart_rate_bpm","spo2_percent","signal_quality_percent","firmware_flag","review_flags"];const content=[header,...rows.map(r=>[r.recordedAt,r.hr,r.spo2,r.quality,r.flag,Review.flagsFor(r,state.settings).join("; ")])].map(row=>row.map(csvCell).join(",")).join("\r\n");downloadFile(`pulse-monitor-${stamp}.csv`,content,"text/csv;charset=utf-8");}
  $("export-dialog").close();toast(`${rows.length} measurements exported.`);
});
const mobile=matchMedia("(max-width: 760px)");
function closeNavigation(restore=true){const wasOpen=$("sidebar").classList.contains("open");$("sidebar").classList.remove("open");$("nav-backdrop").hidden=true;$("menu-button").setAttribute("aria-expanded","false");$("sidebar").inert=mobile.matches;document.body.style.overflow="";if(wasOpen&&restore)$("menu-button").focus();}
$("menu-button").addEventListener("click",()=>{if($("sidebar").classList.contains("open")){closeNavigation();return;}$("sidebar").inert=false;$("sidebar").classList.add("open");$("nav-backdrop").hidden=false;$("menu-button").setAttribute("aria-expanded","true");document.body.style.overflow="hidden";$("sidebar").querySelector(".nav-item").focus();});
$("nav-backdrop").addEventListener("click",()=>closeNavigation());
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&$("sidebar").classList.contains("open")){event.preventDefault();closeNavigation();}});
$("sidebar").addEventListener("keydown",event=>{if(event.key!=="Tab"||!mobile.matches||!$("sidebar").classList.contains("open"))return;const items=[...$("sidebar").querySelectorAll('a[href],button:not(:disabled)')],first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
mobile.addEventListener("change",()=>{closeNavigation(false);$("sidebar").inert=mobile.matches;});
document.querySelectorAll(".nav-list a").forEach(link=>link.addEventListener("click",()=>{document.querySelectorAll(".nav-item").forEach(item=>{item.classList.toggle("active",item===link);item.removeAttribute("aria-current");});link.setAttribute("aria-current","page");closeNavigation(false);if(mobile.matches)$("main").focus({preventScroll:true});}));
$("refresh").addEventListener("click",refresh);$("live-status").addEventListener("click",refresh);
function maybeNotify(result) {
  if(result.fresh && result.level === "good" && result.available === 3) state.lastNotification=null;
  if(!state.notifications||state.demo||!result.fresh||!result.alertKey||!("Notification" in window)||Notification.permission!=="granted")return;
  const signature=result.alertKey;
  if(state.lastNotification===signature)return;
  if(result.level!=="urgent"&&Date.now()-state.lastNotificationAt<60000)return;
  try {const notification=new Notification("Pulse Monitor · A reading needs attention",{body:"Open the dashboard to review the measurement, its limitations and guidance.",tag:"pulse-monitor-review",icon:"/favicon.svg"});notification.onclick=()=>{window.focus();notification.close();openDialog("evidence-dialog");};state.lastNotification=signature;state.lastNotificationAt=Date.now();} catch {toast("Browser notification could not be delivered. Check the on-screen review.");}
}
function updateClock(){const date=new Date();$("greeting").textContent=date.getHours()<12?"Good Morning,":date.getHours()<18?"Good Afternoon,":"Good Evening,";$("today").textContent=dateText(date.toISOString());$("clock").textContent=timeText(date.toISOString(),false);$("clock").dateTime=date.toISOString();renderConnectivity();if(state.review?.fresh&&state.readings.at(-1)&&Date.now()-Date.parse(state.readings.at(-1).recordedAt)>90000)renderReview();}
function initializeEvidenceUI(){
  const evidenceButton=document.createElement("button");evidenceButton.type="button";evidenceButton.className="evidence-button";evidenceButton.textContent="View evidence & review report";evidenceButton.addEventListener("click",()=>openDialog("evidence-dialog",evidenceButton));$("analysis").append(evidenceButton);
  const dialog=document.createElement("dialog");dialog.id="evidence-dialog";dialog.className="app-dialog wide-dialog";dialog.setAttribute("aria-labelledby","evidence-heading");
  dialog.innerHTML='<div class="dialog-heading"><div><span class="eyebrow">EXPLAINABLE REVIEW · SOURCES CHECKED OCT 30, 2026</span><h2 id="evidence-heading">Why this reading was flagged</h2></div><button class="icon-button" aria-label="Close evidence report"><svg><use href="#i-close"/></svg></button></div><p class="dialog-description">Evidence-linked rules, not a diagnosis or validated prediction. General adult reference values do not replace personal clinical targets.</p><ul class="evidence-reasons" id="evidence-reasons"></ul><p class="observed-trend" id="observed-trend"></p><h3>How to interpret this review</h3><p class="dialog-description">No flags does not rule out illness. A low-quality or missing signal cannot establish safety. If symptoms are severe or worsening, seek urgent medical help regardless of these numbers. Known lung conditions, altitude, activity and medication can change the appropriate interpretation.</p><h3>Source documents</h3><ul id="evidence-sources" class="evidence-reasons"></ul><p class="dialog-description">No validated disease model is connected. Confidence, arrhythmia diagnosis and future event risk are deliberately not calculated.</p>';
  dialog.querySelector("button").addEventListener("click",()=>dialog.close());dialog.addEventListener("close",()=>{const opener=dialogOpeners.get(dialog);if(opener?.isConnected)opener.focus();});document.body.append(dialog);
  for(const source of Object.values(Review.SOURCES)){const li=document.createElement("li"),a=document.createElement("a");a.href=source.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent=source.title;li.append(a);$("evidence-sources").append(li);}
  const notify=document.createElement("div");notify.className="notification-option";notify.innerHTML='<button type="button" class="secondary-button" id="enable-notifications">Enable browser alerts</button><p>Optional notifications work only while this dashboard is open. They are not emergency monitoring. No email or SMS is sent.</p><span id="notification-state" role="status"></span>';
  $("settings-form").insertBefore(notify,$("settings-error"));
  $("enable-notifications").addEventListener("click",async()=>{if(!("Notification" in window)){$("notification-state").textContent="This browser does not support notifications; use on-screen alerts.";return;}if(state.notifications){state.notifications=false;$("enable-notifications").textContent="Enable browser alerts";$("notification-state").textContent="Browser alerts disabled for this visit.";return;}let permission;try{permission=await Notification.requestPermission();}catch{$("notification-state").textContent="Permission could not be requested. On-screen review remains available.";return;}state.notifications=permission==="granted";$("enable-notifications").textContent=state.notifications?"Disable browser alerts":"Enable browser alerts";$("notification-state").textContent=state.notifications?"Enabled for this visit. Keep the dashboard open.":"Permission not granted. On-screen review remains available.";if(state.review)maybeNotify(state.review);});
}
initializeEvidenceUI();
applyTheme(state.settings.theme);closeNavigation(false);renderJournal();renderAll();configurePolling();updateClock();
setInterval(updateClock,1000);
let resizeFrame;const sizes=new WeakMap();
const resizeObserver=new ResizeObserver(entries=>{let changed=false;for(const entry of entries){const size=`${Math.round(entry.contentRect.width)}:${Math.round(entry.contentRect.height)}`;if(sizes.get(entry.target)!==size){sizes.set(entry.target,size);changed=true;}}if(changed){cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(renderCharts);}});
for(const id of ["pulse-chart","hr-chart","spo2-chart"])resizeObserver.observe($(id));
refresh();
