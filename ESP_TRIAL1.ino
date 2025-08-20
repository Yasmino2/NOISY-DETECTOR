#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <WiFiClient.h> 



// WiFi credentials
const char* ssid = "";
const char* password = "";

const char* mqtt_server = "broker.hivemq.com"; // e.g., "192.168.1.100" or "broker.hivemq.com"
const int mqtt_port = 1883;
 


const char* sensor_topic = "ESP/office/sensors/data";
const char* status_topic = "ESP/office/sensors/status";

// Sensor pins and setup
#define DHTPIN 4         // GPIO connected to DHT11
#define DHTTYPE DHT11    // DHT11 sensor type
#define MIC_ANALOG_PIN 34  // Microphone A0 connected here
#define LIGHT_SENSOR_PIN 18 // Light sensor digital pin
#define LED_PIN 2

DHT dht(DHTPIN, DHTTYPE);

// MQTT and WiFi clients
WiFiClient espClient;
PubSubClient client(espClient);


// Timing variables
unsigned long lastSensorRead = 0;
unsigned long lastStatusUpdate = 0;
const unsigned long sensorInterval = 2000;  // Read sensors every 2 seconds
const unsigned long statusInterval = 30000; // Send status every 30 seconds

// Device info
String deviceID = "ESP32_Office_Monitor";
String firmwareVersion = "v2.1.3";

void setup() {
  Serial.begin(115200);
  
  // sensors
  dht.begin();
  pinMode(LIGHT_SENSOR_PIN, INPUT);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  
  // Connect to WiFi
  setup_wifi();
  
 
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
  
 
  reconnect();
  
  Serial.println("ESP32 MQTT Sensor System Ready!");
  delay(1000);
}

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
}

void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");
  for (int i = 0; i < length; i++) {
    Serial.print((char)payload[i]);
  }
  Serial.println();
  
 
}


void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection... ");
    String clientId = deviceID + "-" + String(random(0xffff), HEX);

    if (client.connect(clientId.c_str())) {
      Serial.println("connected");
      sendStatusUpdate();
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" retrying in 5s...");
      delay(5000);
    }
  }
}


void sendSensorData() {
  
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();
  int micValue = analogRead(MIC_ANALOG_PIN);
  int lightValue = digitalRead(LIGHT_SENSOR_PIN);
  
 
  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("Failed to read from DHT sensor!");
    return;
  }



if (lightValue == HIGH) {
  digitalWrite(LED_PIN, HIGH); // turn LED off
  Serial.println("LED turned OFF");
} else {
  digitalWrite(LED_PIN, LOW); // turn LED on
  Serial.println("LED turned ON");
}

  
  
  float noiseLevel = map(micValue, 0, 4095, 30, 90); /
  
  
  int lightLevel = (lightValue == HIGH) ? 100 : 800;
  // Create JSON payload
  StaticJsonDocument<300> doc;
  doc["deviceId"] = deviceID;
  doc["timestamp"] = millis();
  doc["temperature"] = round(temperature * 10) / 10.0; // Round to 1 decimal
  doc["humidity"] = round(humidity * 10) / 10.0;
  doc["light"] = lightLevel;
  doc["noise"] = round(noiseLevel * 10) / 10.0;
  doc["micRaw"] = micValue; 
  doc["lightRaw"] = lightValue;
  
  // Convert to string
  char jsonString[300];
  serializeJson(doc, jsonString);
  
  // Publish to MQTT
  if (client.publish(sensor_topic, jsonString)) {
    Serial.println("Sensor data published:");
    Serial.println(jsonString);
  } else {
    Serial.println("Failed to publish sensor data");
  }
}

void sendStatusUpdate() {
  // Create status JSON
  StaticJsonDocument<250> doc;
  doc["deviceId"] = deviceID;
  doc["firmware"] = firmwareVersion;
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["uptime"] = millis();
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["status"] = "online";
  
  char jsonString[250];
  serializeJson(doc, jsonString);
  
  if (client.publish(status_topic, jsonString, true)) { 
    Serial.println("Status update published:");
    Serial.println(jsonString);
  } else {
    Serial.println("Failed to publish status update");
  }
}

void loop() {
  // Ensure MQTT connection
  if (!client.connected()) {
    reconnect();
  }
  client.loop();
  
  unsigned long now = millis();
  

  if (now - lastSensorRead >= sensorInterval) {
    sendSensorData();
    lastSensorRead = now;
  }
  
  
  if (now - lastStatusUpdate >= statusInterval) {
    sendStatusUpdate();
    lastStatusUpdate = now;
  }
  

  delay(100);
}