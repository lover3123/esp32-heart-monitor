# ESP32 Heart Rate & SpO₂ Monitor — Starter Project

A research/learning prototype using ESP32 + MAX30102, a local web dashboard, SQLite persistence, ThingSpeak, symptom logging, and an optional anomaly-scoring service.

- **Live dashboard (read-only):** `live_demo/` contains a Vercel-ready public view of the ThingSpeak channel. See [`DEPLOYMENT.md`](DEPLOYMENT.md). The full system still runs locally.

## Important limits
- MAX30102 estimates pulse rate and peripheral oxygen saturation (SpO₂); it does **not** measure ECG.
- The included anomaly score is a **prototype screening aid**, not a validated arrhythmia detector or medical diagnosis. It can flag unusual measurements for review, but cannot identify a specific arrhythmia reliably.
- Consumer optical sensors can produce misleading readings due to motion, poor contact, cold fingers, skin/perfusion differences, ambient light, and other factors. Do not use this project for emergency decisions or to change treatment.
- If someone has severe shortness of breath, chest pain, fainting, blue/grey lips, or other emergency symptoms, seek urgent medical care rather than relying on this device.
- Keep API keys private. Do not expose ThingSpeak write keys in a public repository or browser code.

## Architecture
MAX30102 -> ESP32 -> (1) local Node.js API + SQLite -> web dashboard and symptom log
                                  -> (2) ThingSpeak channel
Historical readings -> Python anomaly service (optional) -> dashboard annotations

## Components
- ESP32 development board (recommended instead of Arduino Nano for Wi-Fi)
- MAX30102 module
- Breadboard and jumper wires
- USB cable / stable USB supply
- Optional enclosure and power switch

## Wiring (ESP32 DevKit)
| MAX30102 | ESP32 |
|---|---|
| VIN | 3V3 (use 3.3 V unless your breakout explicitly supports another input) |
| GND | GND |
| SDA | GPIO 21 |
| SCL | GPIO 22 |
| INT | Not connected for this starter |

Use short wires and keep the sensor still during readings. Confirm your module's pin labels and voltage requirements.

## 1. Flash the firmware
1. Install Arduino IDE and the ESP32 board package.
2. Install **SparkFun MAX3010x Sensor Library** from Library Manager.
3. Open `firmware/esp32_max30102_monitor.ino`.
4. Fill in Wi-Fi details, `API_BASE_URL`, and ThingSpeak channel/write key.
5. `API_BASE_URL` must be reachable from the ESP32 on the same network, e.g. `http://192.168.1.20:3000` (not `localhost`).
6. Select the correct ESP32 board/port and upload.
7. Open Serial Monitor at 115200 baud.

The firmware uses the SparkFun MAX3010x library and its `spo2_algorithm.h` implementation. Library/example versions can differ; if the compiler cannot find `spo2_algorithm.h`, open the installed library's examples and use the matching include path/version.

## 2. Run the web dashboard and persistent API
Requires Node.js 20+.

```bash
cd server
cp .env.example .env
npm install
npm start
```

Open `http://localhost:3000`. The database `server/data/monitor.db` is created automatically.
- ESP32 should post to `http://YOUR_COMPUTER_LAN_IP:3000/api/readings`.
- Ensure the computer and ESP32 are on the same Wi-Fi and allow inbound TCP port 3000 in the local firewall.
- This starter uses no login. Keep it on a trusted local network; do not port-forward it to the public internet.

## 3. ThingSpeak setup
1. Create a ThingSpeak channel with fields:
   - Field 1: Heart rate (bpm)
   - Field 2: SpO₂ (%)
   - Field 3: Signal quality (0–100)
2. Copy the channel ID and **Write API Key** into the firmware.
3. The firmware sends data to ThingSpeak's update endpoint. ThingSpeak may rate-limit updates; this starter sends roughly one update every 15 seconds.
4. In ThingSpeak, use MATLAB Visualizations or MATLAB Analysis to plot fields 1 and 2. Keep the write key secret.

## 4. Optional anomaly scoring service
Requires Python 3.10+.

```bash
cd ai_service
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

It listens on `http://localhost:8000`. The dashboard server can call it if `AI_SERVICE_URL=http://127.0.0.1:8000` is set in `server/.env`. It scores a reading using conservative range checks plus an Isolation Forest trained only when enough local historical rows are available. The score is experimental and is not an arrhythmia diagnosis.

## API
- `POST /api/readings` — ESP32 JSON: `deviceId`, `heartRate`, `spo2`, `signalQuality`, `irregularPulseFlag`, `timestamp`
- `GET /api/readings?limit=100` — recent records
- `POST /api/symptoms` — JSON: `readingId` (optional), `symptoms`, `severity`, `notes`, `occurredAt`
- `GET /api/symptoms?limit=100` — recent symptom logs
- `GET /api/health` — API health check

## Symptom correlation
The dashboard allows symptoms to be logged alongside measurements. The project does **not** infer that a symptom was caused by a particular measurement. Treat time alignment as a review aid only; correlation is not causation.

## Recommended validation before any study
- Compare readings against a reputable fingertip pulse oximeter and a clinical measurement under supervision.
- Test motion/no-contact cases and label invalid readings rather than treating them as real values.
- Record sensor placement, ambient conditions, and device/software versions.
- For arrhythmia research, add an ECG sensor, obtain appropriately labelled ECG data, define a clinical protocol, and evaluate sensitivity/specificity with qualified supervision.


## Wokwi ThingSpeak simulation

The `wokwi/` folder contains an import-ready ESP32 + OLED + two potentiometers + test-button simulation. Since Wokwi has no standard built-in MAX30102 part, the potentiometers generate synthetic test heart-rate and SpO2 values. This verifies Wi-Fi/ThingSpeak connectivity, not sensor accuracy. See `wokwi/README.md` for setup.


## Connect the Wokwi simulation to AI analysis
The Wokwi sketch sends synthetic values to ThingSpeak. To make those readings appear in the local dashboard and pass through the Python AI service, run `integrations/thingspeak_ai_bridge.py` on your computer. It polls the ThingSpeak input channel, forwards each new entry to the Node API, and prints the AI review response. The Node API saves values and review flags in SQLite; the dashboard shows the latest AI-assisted review.

Follow `integrations/README.md` for exact setup commands. This bridge needs your ThingSpeak Channel ID and (for a private channel) the Read API Key. Keep keys local and do not commit them.

ThingSpeak documentation: [Read channel data](https://www.mathworks.com/help/thingspeak/readdata.html) and [channel settings and fields](https://www.mathworks.com/help/thingspeak/channel-settings.html).
