#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include "MAX30105.h"
#include "heartRate.h"
#include "spo2_algorithm.h"

// Configure these before flashing. Use your computer's LAN IP, not localhost.
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_BASE_URL = "http://192.168.1.20:3000";
const char* DEVICE_ID = "esp32-monitor-01";

// ThingSpeak: create a channel with fields 1=HR, 2=SpO2, 3=signal quality.
// Keep the Write API Key private.
const char* THINGSPEAK_WRITE_KEY = "YOUR_THINGSPEAK_WRITE_KEY";
const bool ENABLE_THINGSPEAK = true;

MAX30105 particleSensor;
static const int32_t BUFFER_LENGTH = 100;
uint32_t irBuffer[BUFFER_LENGTH];
uint32_t redBuffer[BUFFER_LENGTH];
int32_t spo2 = 0;
int8_t validSPO2 = 0;
int32_t algorithmHeartRate = 0;
int8_t validHeartRate = 0;

float beatIntervals[8];
int beatCount = 0;
int beatIndex = 0;
uint32_t lastBeatMs = 0;
float recentBpm = 0;
uint32_t lastPostMs = 0;
uint32_t lastThingSpeakMs = 0;
uint32_t sampleCounter = 0;

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Wi-Fi unavailable; measurements will continue locally.");
  }
}

float averageBpm() {
  if (beatCount == 0) return 0;
  float sum = 0;
  for (int i = 0; i < beatCount; i++) sum += beatIntervals[i];
  return sum / beatCount;
}

void postReading(float bpm, int oxygen, int signalQuality, bool pulseFlag) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(API_BASE_URL) + "/api/readings";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  String body = "{";
  body += "\"deviceId\":\"" + String(DEVICE_ID) + "\",";
  body += "\"heartRate\":" + String(bpm, 1) + ",";
  body += "\"spo2\":" + String(oxygen) + ",";
  body += "\"signalQuality\":" + String(signalQuality) + ",";
  body += "\"irregularPulseFlag\":" + String(pulseFlag ? "true" : "false") + ",";
  body += "\"timestamp\":\"" + String((uint32_t)(millis() / 1000)) + "\"";
  body += "}";
  int code = http.POST(body);
  Serial.printf("Local API HTTP status: %d\n", code);
  http.end();
}

void postThingSpeak(float bpm, int oxygen, int signalQuality) {
  if (!ENABLE_THINGSPEAK || WiFi.status() != WL_CONNECTED) return;
  // ThingSpeak free channels generally require at least 15 seconds between updates.
  if (millis() - lastThingSpeakMs < 15000) return;
  HTTPClient http;
  String url = "http://api.thingspeak.com/update?api_key=";
  url += THINGSPEAK_WRITE_KEY;
  url += "&field1=" + String(bpm, 1);
  url += "&field2=" + String(oxygen);
  url += "&field3=" + String(signalQuality);
  http.begin(url);
  int code = http.GET();
  Serial.printf("ThingSpeak HTTP status: %d\n", code);
  http.end();
  lastThingSpeakMs = millis();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Wire.begin(21, 22);
  connectWiFi();

  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("MAX30102/MAX3010x sensor not found. Check wiring and power.");
    while (true) delay(1000);
  }

  // Tune only after checking your specific breakout and signal quality.
  byte ledBrightness = 60;
  byte sampleAverage = 4;
  byte ledMode = 2;          // red + IR
  int sampleRate = 100;
  int pulseWidth = 411;
  int adcRange = 4096;
  particleSensor.setup(ledBrightness, sampleAverage, ledMode, sampleRate, pulseWidth, adcRange);
  particleSensor.setPulseAmplitudeRed(0x1F);
  particleSensor.setPulseAmplitudeIR(0x1F);
  particleSensor.setPulseAmplitudeGreen(0);

  Serial.println("Place a finger gently over the sensor and keep still.");
}

void loop() {
  // Gather a 100-sample window for the Maxim/SparkFun SpO2 algorithm.
  for (int i = 0; i < BUFFER_LENGTH; i++) {
    while (!particleSensor.available()) {
      particleSensor.check();
      delay(1);
    }
    redBuffer[i] = particleSensor.getRed();
    irBuffer[i] = particleSensor.getIR();

    uint32_t irValue = irBuffer[i];
    if (checkForBeat(irValue)) {
      uint32_t now = millis();
      if (lastBeatMs > 0) {
        float interval = (now - lastBeatMs) / 1000.0f;
        float bpm = 60.0f / interval;
        if (bpm >= 40 && bpm <= 200) {
          beatIntervals[beatIndex] = bpm;
          beatIndex = (beatIndex + 1) % 8;
          if (beatCount < 8) beatCount++;
          recentBpm = averageBpm();
        }
      }
      lastBeatMs = now;
    }
    particleSensor.nextSample();
    sampleCounter++;
  }

  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, BUFFER_LENGTH, redBuffer,
    &spo2, &validSPO2, &algorithmHeartRate, &validHeartRate
  );

  // Basic signal-quality heuristic: IR level and algorithm validity only.
  // It is not a clinical signal-quality metric.
  uint32_t irMean = 0;
  for (int i = 0; i < BUFFER_LENGTH; i++) irMean += irBuffer[i] / BUFFER_LENGTH;
  int signalQuality = (irMean > 50000 && validSPO2 && validHeartRate) ? 90 :
                      (irMean > 10000 ? 50 : 10);

  float bpmOut = recentBpm > 0 ? recentBpm :
                 (validHeartRate && algorithmHeartRate > 0 ? algorithmHeartRate : 0);
  int spo2Out = (validSPO2 && spo2 >= 70 && spo2 <= 100) ? spo2 : 0;

  Serial.printf("HR=%.1f bpm, SpO2=%d%%, quality=%d\n", bpmOut, spo2Out, signalQuality);

  // The pulse flag only reports a coarse change in beat intervals; it does not detect arrhythmia.
  bool pulseFlag = false;
  if (beatCount >= 4) {
    float minBpm = 999, maxBpm = 0;
    for (int i = 0; i < beatCount; i++) {
      minBpm = min(minBpm, beatIntervals[i]);
      maxBpm = max(maxBpm, beatIntervals[i]);
    }
    pulseFlag = (maxBpm - minBpm) > 25.0f;
  }

  if (millis() - lastPostMs >= 5000) {
    if (bpmOut > 0 && spo2Out > 0) {
      postReading(bpmOut, spo2Out, signalQuality, pulseFlag);
      postThingSpeak(bpmOut, spo2Out, signalQuality);
    } else {
      Serial.println("Measurement invalid/low confidence; not uploading this window.");
    }
    lastPostMs = millis();
  }
}
