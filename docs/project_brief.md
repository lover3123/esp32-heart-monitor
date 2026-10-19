# Project brief

## Title
ESP32-Based Heart Rate and SpO₂ Monitoring with Cloud Logging and AI-Assisted Measurement Review

## Abstract
This prototype acquires optical pulse signals using a MAX30102 sensor connected to an ESP32. The ESP32 estimates pulse rate and SpO₂, sends valid windows to a local web API and optionally to ThingSpeak. A Node.js service stores measurements and user-entered symptom logs in SQLite. A separate Python service provides configurable review flags and experimental unsupervised anomaly scores relative to recent measurements. The web dashboard displays recent readings and symptom history.

## Objectives
1. Acquire pulse and red/infrared optical data with the MAX30102.
2. Estimate pulse rate and SpO₂ and avoid uploading windows the firmware marks invalid.
3. Store time-stamped measurements persistently.
4. Display recent measurements in a browser dashboard.
5. Let a user record symptoms, severity, and context.
6. Visualize cloud data in ThingSpeak/MATLAB.
7. Explore anomaly scoring without presenting it as a clinical diagnosis.

## Methodology
Sensor sampling → window-based signal processing → quality checks → ESP32 Wi-Fi upload → local API validation → SQLite persistence → dashboard and symptom entry → optional anomaly scoring → ThingSpeak plots.

## Evaluation plan
- Check whether the sensor is detected and whether readings are stable at rest.
- Compare readings with a reputable pulse oximeter; document discrepancies rather than tuning to force agreement.
- Test no-finger, motion, poor-contact, and Wi-Fi-loss conditions.
- Verify records remain after restarting the server.
- Measure upload success rate and dashboard refresh latency.
- Evaluate anomaly service only on appropriately labelled, ethically sourced data; do not claim diagnostic accuracy without a validated protocol and independent clinical labels.

## Known limitations
MAX30102 is not an ECG sensor. Pulse interval variability flags can be caused by movement and noise. Unsupervised anomaly scores identify unusual inputs, not specific conditions. Symptom logs are user-entered and their temporal proximity does not establish causation.
