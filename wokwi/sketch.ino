#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// Wokwi test bench only: potentiometers generate SYNTHETIC readings.
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";
const int WIFI_CHANNEL = 6;

// Paste the channel's WRITE API KEY here (ThingSpeak > Channel > API Keys).
// Do not use the Channel ID or the Read API Key.
const char* THINGSPEAK_WRITE_KEY = "YOUR_THINGSPEAK_WRITE_API_KEY";
const char* THINGSPEAK_ENDPOINT = "https://api.thingspeak.com/update";

const int HEART_RATE_POT_PIN = 34;
const int SPO2_POT_PIN = 35;
const int TEST_FLAG_BUTTON_PIN = 27;
const int OLED_SDA_PIN = 21;
const int OLED_SCL_PIN = 22;
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

const unsigned long SAMPLE_INTERVAL_MS = 1000;
const unsigned long THINGSPEAK_INTERVAL_MS = 20000;
unsigned long lastSampleMs = 0;
unsigned long lastUploadMs = 0;
int heartRateBpm = 75;
int spo2Percent = 98;
bool testFlag = false;
String cloudStatus = "WAIT KEY";

bool keyConfigured() {
  String k = String(THINGSPEAK_WRITE_KEY);
  return k.length() >= 8 && k != "YOUR_THINGSPEAK_WRITE_API_KEY" &&
         k != "PASTE_YOUR_WRITE_API_KEY_HERE";
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD, WIFI_CHANNEL);
  Serial.print("Connecting to Wokwi-GUEST");
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 20000) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WIFI_OK, IP="); Serial.println(WiFi.localIP());
  } else {
    Serial.printf("WIFI_FAIL, status=%d. Will retry.\n", (int)WiFi.status());
  }
}

void updateSimulatedReadings() {
  heartRateBpm = map(analogRead(HEART_RATE_POT_PIN), 0, 4095, 45, 150);
  spo2Percent = map(analogRead(SPO2_POT_PIN), 0, 4095, 85, 100);
  testFlag = digitalRead(TEST_FLAG_BUTTON_PIN) == LOW;
}

void drawDisplay() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);  display.println("WOKWI TEST SYNTHETIC");
  display.setCursor(0, 15); display.print("HR: "); display.print(heartRateBpm); display.println(" bpm");
  display.setCursor(0, 27); display.print("SpO2: "); display.print(spo2Percent); display.println(" %");
  display.setCursor(0, 39); display.print("Test flag: "); display.println(testFlag ? "ON" : "OFF");
  display.setCursor(0, 51); display.print("Cloud: "); display.println(cloudStatus);
  display.display();
}

bool postThingSpeak() {
  if (!keyConfigured()) {
    cloudStatus = "SET WRITE KEY";
    Serial.println("TS_SKIP: Replace YOUR_THINGSPEAK_WRITE_API_KEY with the channel WRITE API key.");
    return false;
  }
  if (WiFi.status() != WL_CONNECTED) {
    cloudStatus = "NO WIFI";
    Serial.printf("TS_SKIP: Wi-Fi not connected; status=%d\n", (int)WiFi.status());
    return false;
  }

  WiFiClientSecure tlsClient;
  // Simplifies the public Wokwi demo. For production, validate certificates.
  tlsClient.setInsecure();
  HTTPClient http;
  http.setConnectTimeout(10000);
  http.setTimeout(12000);
  if (!http.begin(tlsClient, THINGSPEAK_ENDPOINT)) {
    cloudStatus = "BEGIN FAIL";
    Serial.println("TS_BEGIN_FAIL: HTTPClient could not start HTTPS request.");
    return false;
  }
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");
  String payload = "api_key=" + String(THINGSPEAK_WRITE_KEY) +
                   "&field1=" + String(heartRateBpm) +
                   "&field2=" + String(spo2Percent) +
                   "&field3=95&field4=" + String(testFlag ? 1 : 0);
  Serial.printf("TS_POST: HR=%d, SpO2=%d, quality=95, testFlag=%d\n",
                heartRateBpm, spo2Percent, testFlag ? 1 : 0);
  int httpCode = http.POST(payload);
  String body = http.getString();
  body.trim();
  http.end();
  Serial.printf("TS_RESPONSE: HTTP=%d, body='%s'\n", httpCode, body.c_str());

  if (httpCode == HTTP_CODE_OK && body.toInt() > 0) {
    cloudStatus = "SENT #" + body;
    Serial.printf("TS_SUCCESS: new ThingSpeak entry ID %s\n", body.c_str());
    return true;
  }
  if (httpCode == HTTP_CODE_OK && body == "0") {
    cloudStatus = "REJECTED (0)";
    Serial.println("TS_REJECTED: response 0. Check WRITE key, channel fields, and 15-second minimum interval.");
  } else {
    cloudStatus = "HTTP ERROR";
    Serial.println("TS_HTTP_ERROR: check internet gateway and HTTP code above.");
  }
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  analogReadResolution(12);
  pinMode(TEST_FLAG_BUTTON_PIN, INPUT_PULLUP);
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED_INIT_FAIL: no SSD1306 at I2C address 0x3C.");
  } else {
    Serial.println("OLED_INIT_OK at 0x3C");
  }
  if (!keyConfigured()) Serial.println("CONFIG_REQUIRED: set THINGSPEAK_WRITE_KEY before upload.");
  connectWiFi();
  updateSimulatedReadings();
  drawDisplay();
  Serial.println("Fields: 1=Heart Rate, 2=SpO2, 3=Signal Quality, 4=Test Flag");
  Serial.println("Open Serial Monitor at 115200 baud. ThingSpeak upload repeats every 20 seconds.");
}

void loop() {
  unsigned long now = millis();
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastRetryMs = 0;
    if (now - lastRetryMs >= 5000) {
      lastRetryMs = now;
      Serial.println("WIFI_RETRY: reconnecting to Wokwi-GUEST...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD, WIFI_CHANNEL);
    }
  }
  if (now - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    lastSampleMs = now;
    updateSimulatedReadings();
    drawDisplay();
    Serial.printf("SIM HR=%d bpm | SpO2=%d%% | flag=%d | WiFi=%s\n",
      heartRateBpm, spo2Percent, testFlag ? 1 : 0,
      WiFi.status() == WL_CONNECTED ? "connected" : "disconnected");
  }
  if (now - lastUploadMs >= THINGSPEAK_INTERVAL_MS) {
    lastUploadMs = now;
    postThingSpeak();
    drawDisplay();
  }
  delay(10);
}
