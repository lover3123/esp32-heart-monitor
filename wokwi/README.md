# Wokwi + ThingSpeak simulation

This Wokwi simulation exercises the ESP32 Wi-Fi-to-ThingSpeak path with **synthetic test values**. Wokwi does not have a standard built-in MAX30102 sensor part, so the two potentiometers act as manual test-value inputs:

- HR potentiometer: maps to 45–150 bpm (ThingSpeak Field 1)
- SpO₂ potentiometer: maps to 85–100% (ThingSpeak Field 2)
- Signal-quality placeholder: 95 (Field 3; fixed simulation value)
- Red button held down: manual test flag, 1 or 0 (Field 4; not an arrhythmia detector)

This does not simulate the optical sensor physics and does not produce medically meaningful measurements. Use it only to test application and cloud plumbing.

## ThingSpeak setup
1. Create a ThingSpeak channel with four numeric fields:
   - Field 1: Simulated Heart Rate (bpm)
   - Field 2: Simulated SpO2 (%)
   - Field 3: Simulated Signal Quality
   - Field 4: Manual Test Flag
2. Copy the channel's **Write API Key**.
3. Replace `PASTE_YOUR_WRITE_API_KEY_HERE` in `sketch.ino` with that key. Use a dedicated test channel and don't share your real key publicly.
4. Run the Wokwi simulation. It uses the open `Wokwi-GUEST` network and posts about every 20 seconds to `https://api.thingspeak.com/update`.
5. Open Serial Monitor. On a successful update, ThingSpeak should return a positive entry ID; response `0` means the update was not saved. Check the channel's Field Charts to confirm.

ThingSpeak's normal write rate limit is at least 15 seconds between updates for free channels; this sketch sends every 20 seconds.

## Run in Wokwi web editor
1. Open https://wokwi.com/projects/new/esp32.
2. Replace the project's `sketch.ino` with this file.
3. Replace `diagram.json` with the included diagram.
4. Add a `libraries.txt` file containing the two included library lines if the editor does not auto-install the libraries.
5. Run the simulation and view the Serial Monitor.

Alternatively, open this folder in VS Code with the Wokwi extension. The folder contains the standard project files `sketch.ino`, `diagram.json`, and `libraries.txt`.

## Notes
- Potentiometers and the button are test controls, not physiological sensors.
- HTTPS uses `WiFiClientSecure::setInsecure()` to simplify a public Wokwi demonstration. Do not copy that TLS setting into a production or patient-facing deployment; validate server certificates there.
- No local Node.js server is contacted by this simulator. Wokwi's public gateway provides outbound internet access, but it cannot reach your computer's `localhost` service. Test ThingSpeak first, and run the local dashboard separately for physical ESP32 tests.


## OLED blank-screen troubleshooting
- Use the corrected `diagram.json` included here. For this Wokwi ESP32 board, I²C pins are connected by board pin names `esp:21` (SDA) and `esp:22` (SCL), not `esp:GPIO21` / `esp:GPIO22`. Potentiometer and button wiring names are likewise numeric (`esp:34`, `esp:35`, `esp:27`).
- Ensure the `diagram.json` changes are copied into Wokwi, then stop and restart the simulation.
- Open Serial Monitor at 115200 baud. Expected messages include `I2C device found at 0x3C` and `OLED INIT OK at 0x3C`.
- If no device is detected, re-check VCC/GND and SDA/SCL. If an I²C device is found at a different address, set that address consistently in both the diagram's `i2cAddress` and `display.begin(...)`.
- The display is a Wokwi SSD1306 simulation, separate from the MAX30102. Heart-rate and SpO₂ values remain synthetic potentiometer inputs.


## ThingSpeak connection diagnostics (updated sketch)
1. In the channel's API Keys tab, copy the **Write API Key**, not the channel ID or Read API Key, into `THINGSPEAK_WRITE_KEY`. Do not share it publicly.
2. Start the simulation and open Serial Monitor at 115200 baud. Expected: `WIFI_OK` followed after up to 20 seconds by `TS_POST`, then `TS_RESPONSE: HTTP=200, body='<positive entry ID>'`.
3. `TS_SKIP` means the key is still a placeholder or Wi-Fi is offline. `HTTP=200, body='0'` means ThingSpeak did not save the entry; check write key, enabled fields, and update interval. Other HTTP codes indicate a network/HTTPS request issue.
4. This sketch uses HTTPS POST and sends only every 20 seconds. Wokwi's public gateway supports outgoing internet access; it cannot access a computer's localhost service.
