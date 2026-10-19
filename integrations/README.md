# Connect ThingSpeak → AI → dashboard

This bridge is the missing link for the Wokwi simulation. Wokwi sends synthetic measurements to ThingSpeak. The Python bridge reads new ThingSpeak entries and forwards them to the local Node.js API. The API stores them in SQLite and calls the Python AI service. The dashboard displays the resulting review flags.

## Data path

`Wokwi ESP32 → ThingSpeak input channel → thingspeak_ai_bridge.py → Node API → AI service → SQLite → web dashboard`

This approach lets Wokwi avoid connecting to your computer's `localhost` address. The bridge runs on your computer and connects to both ThingSpeak and localhost.

## ThingSpeak input channel fields

| Field | Required name | Value |
|---|---|---|
| 1 | Simulated Heart Rate (bpm) | Synthetic heart rate |
| 2 | Simulated SpO2 (%) | Synthetic SpO₂ estimate |
| 3 | Simulated Signal Quality | Fixed simulation value |
| 4 | Manual Test Flag | Button test, **not** a measured irregular heartbeat |

Use a dedicated **test channel** for Wokwi. The Read API Key is separate from the Write API Key. For a private channel, configure the Read API Key locally; do not put it in a public repository.

## Windows PowerShell steps

1. Start the AI service in one terminal:

```powershell
cd esp32_heart_monitor\ai_service
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

2. Start the local dashboard/API in another terminal (Node.js 20+):

```powershell
cd esp32_heart_monitor\server
Copy-Item .env.example .env
npm install
npm start
```

Ensure `server/.env` includes:

```dotenv
AI_SERVICE_URL=http://127.0.0.1:8000
```

3. In a third terminal, run the bridge. Replace the sample values with your ThingSpeak **Channel ID** and **Read API Key**:

```powershell
cd esp32_heart_monitor\integrations
$env:THINGSPEAK_CHANNEL_ID="YOUR_CHANNEL_ID"
$env:THINGSPEAK_READ_API_KEY="YOUR_READ_API_KEY"
python thingspeak_ai_bridge.py
```

If your ThingSpeak channel is public, the Read API Key can be omitted. Leave the bridge terminal running while you test.

4. Open `http://localhost:3000`. Wait for a new Wokwi upload; the bridge will ingest it, and the dashboard should show the reading and its AI review flags.

## macOS/Linux

Start `ai_service` and `server` as above using `source .venv/bin/activate`. Then:

```bash
cd esp32_heart_monitor/integrations
export THINGSPEAK_CHANNEL_ID="YOUR_CHANNEL_ID"
export THINGSPEAK_READ_API_KEY="YOUR_READ_API_KEY"  # omit for a public channel
python3 thingspeak_ai_bridge.py
```

## Troubleshooting

- **Bridge says channel ID missing**: set `THINGSPEAK_CHANNEL_ID` in the same terminal before running it.
- **ThingSpeak returns no entries / access error**: verify the channel ID, that Wokwi has written data, and the Read API Key if private.
- **Local API connection refused**: start the Node server and confirm `http://localhost:3000/api/health` works.
- **No AI result**: start the AI service and check `AI_SERVICE_URL=http://127.0.0.1:8000` in `server/.env`.
- **No new rows**: confirm Wokwi is uploading and wait for the configured polling interval. The bridge records the last processed entry in `bridge_state.json` and avoids duplicating it on the next poll. Delete that state file to initialize from the latest input entry again.
- **Want to replay recent history**: set `REPLAY_HISTORY_ON_FIRST_RUN=true` before starting the bridge. It replays only the entries returned in that first fetch (max controlled by `THINGSPEAK_RESULTS`).

## What the AI result means

The provided AI service uses broad configurable thresholds and an unsupervised Isolation Forest that requires at least 50 samples in its current runtime. It is a demonstration of a data pipeline, not a clinically trained model. It cannot diagnose arrhythmias. Restarting the service resets the in-memory anomaly history. Synthetic Wokwi measurements must never be used to make health decisions.
