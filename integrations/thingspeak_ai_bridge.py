"""Poll a ThingSpeak input channel and forward new samples to the local AI-enabled API.

Uses only Python's standard library. This is a research/learning connector, not medical software.
"""
from __future__ import annotations
import json
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# Windows consoles/redirected output can fall back to a legacy codepage (e.g. cp1252),
# which cannot encode characters such as "→" in the banner below. Force UTF-8 output.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CHANNEL_ID = os.getenv("THINGSPEAK_CHANNEL_ID", "").strip()
READ_API_KEY = os.getenv("THINGSPEAK_READ_API_KEY", "").strip()
LOCAL_API_URL = os.getenv("LOCAL_API_URL", "http://127.0.0.1:3000/api/readings").strip()
POLL_SECONDS = max(5, int(os.getenv("POLL_SECONDS", "10")))
RESULTS = min(8000, max(1, int(os.getenv("THINGSPEAK_RESULTS", "100"))))
STATE_FILE = Path(os.getenv("BRIDGE_STATE_FILE", str(Path(__file__).with_name("bridge_state.json"))))
REPLAY_HISTORY_ON_FIRST_RUN = os.getenv("REPLAY_HISTORY_ON_FIRST_RUN", "false").lower() in {"1", "true", "yes"}
HTTP_TIMEOUT = 15


def http_json(url: str, payload: dict | None = None) -> dict:
    data = None
    headers = {"Accept": "application/json", "User-Agent": "ESP32-Health-Prototype-Bridge/1.0"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = Request(url, data=data, headers=headers, method="POST" if payload is not None else "GET")
    try:
        with urlopen(req, timeout=HTTP_TIMEOUT) as response:
            body = response.read().decode("utf-8", errors="replace")
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"HTTP {response.status}: {body[:300]}")
            if not body.strip():
                return {}
            return json.loads(body)
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {body[:300]}") from exc
    except URLError as exc:
        raise RuntimeError(f"Network error: {exc.reason}") from exc


def fetch_entries() -> list[dict]:
    if not CHANNEL_ID:
        raise RuntimeError("Set THINGSPEAK_CHANNEL_ID in environment before running this bridge.")
    params = {"results": RESULTS}
    if READ_API_KEY:
        params["api_key"] = READ_API_KEY
    url = f"https://api.thingspeak.com/channels/{CHANNEL_ID}/feeds.json?{urlencode(params)}"
    data = http_json(url)
    feeds = data.get("feeds", [])
    return sorted((f for f in feeds if f.get("entry_id") is not None), key=lambda f: int(f["entry_id"]))


def load_state() -> int | None:
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        value = data.get("last_entry_id")
        return int(value) if value is not None else None
    except FileNotFoundError:
        return None
    except (ValueError, TypeError, json.JSONDecodeError):
        print(f"WARNING: State file {STATE_FILE} unreadable; will initialize from latest feed entry.")
        return None


def save_state(entry_id: int) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(STATE_FILE.suffix + ".tmp")
    tmp.write_text(json.dumps({"last_entry_id": entry_id}, indent=2), encoding="utf-8")
    tmp.replace(STATE_FILE)


def as_float(value, name: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Missing/non-numeric {name}")
    if number != number or number in (float("inf"), float("-inf")):
        raise ValueError(f"Invalid {name}")
    return number


def forward_entry(entry: dict) -> None:
    # Input channel: field1=HR, field2=SpO2, field3=signal quality, field4=manual test flag.
    # Field 4 is NOT a measured arrhythmia indicator; it's a simulation button.
    hr = as_float(entry.get("field1"), "field1/heart rate")
    oxygen = as_float(entry.get("field2"), "field2/SpO2")
    quality = as_float(entry.get("field3", 0), "field3/signal quality")
    manual_flag = as_float(entry.get("field4", 0), "field4/manual test flag") != 0
    payload = {
        "deviceId": "wokwi-thingspeak-bridge",
        "heartRate": hr,
        "spo2": oxygen,
        "signalQuality": quality,
        "irregularPulseFlag": manual_flag,
        "timestamp": str(entry.get("created_at", entry.get("entry_id", ""))),
    }
    result = http_json(LOCAL_API_URL, payload)
    ai = result.get("ai") or {}
    flags = ai.get("reviewFlags", [])
    anomaly = ai.get("unsupervisedAnomaly")
    print(f"ThingSpeak entry {entry.get('entry_id')} forwarded | HR={hr:g} bpm, SpO2={oxygen:g}% | API saved={result.get('saved')} | AI flags={flags or 'none returned'} | relative anomaly={anomaly}")
    if not ai:
        print("  NOTE: No AI result returned. Check that ai_service is running and server/.env has AI_SERVICE_URL=http://127.0.0.1:8000")


def main() -> int:
    print("ThingSpeak → Local API → AI service → SQLite/dashboard bridge")
    print(f"Input channel: {CHANNEL_ID or '(not configured)'} | local API: {LOCAL_API_URL} | poll every {POLL_SECONDS}s")
    print("Use a dedicated test channel. Field 4 is a manual simulation flag, not an arrhythmia detector.")
    last_id = load_state()

    while True:
        try:
            feeds = fetch_entries()
            if not feeds:
                print("No feed entries found yet; confirm the channel has data and its Read API Key is correct.")
            elif last_id is None:
                if REPLAY_HISTORY_ON_FIRST_RUN:
                    pending = feeds
                else:
                    # On first run, avoid replaying a whole channel history through the local AI.
                    pending = [feeds[-1]]
                    if len(feeds) > 1:
                        print(f"First run: processing latest entry only ({feeds[-1].get('entry_id')}). Set REPLAY_HISTORY_ON_FIRST_RUN=true to replay fetched history.")
                for entry in pending:
                    try:
                        forward_entry(entry)
                        last_id = int(entry["entry_id"])
                        save_state(last_id)
                    except (ValueError, RuntimeError) as exc:
                        print(f"Could not process entry {entry.get('entry_id')}: {exc}; will retry on next poll.")
                        break
            else:
                pending = [f for f in feeds if int(f["entry_id"]) > last_id]
                for entry in pending:
                    try:
                        forward_entry(entry)
                        last_id = int(entry["entry_id"])
                        save_state(last_id)
                    except (ValueError, RuntimeError) as exc:
                        print(f"Could not process entry {entry.get('entry_id')}: {exc}; will retry on next poll.")
                        break
                if not pending:
                    print(f"No new entries. Last processed entry: {last_id}")
        except (RuntimeError, json.JSONDecodeError) as exc:
            print(f"Bridge error: {exc}")
        except KeyboardInterrupt:
            print("Bridge stopped.")
            return 0
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    sys.exit(main())
