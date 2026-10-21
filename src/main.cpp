#include <Arduino.h>



// a powiadomienia Notify.


#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#include "config.h"

// Wskaźnik do charakterystyki BLE
BLECharacteristic* touchCharacteristic = nullptr;

// Stan połączenia Bluetooth
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Parametry pomiaru
const unsigned long INTERVAL_MS = 200;
const int TOUCH_THRESHOLD = 30;

unsigned long lastMeasurement = 0;
unsigned long touchCount = 0;

bool touched = false;

// Obsługa połączenia BLE
class MyServerCallbacks : public BLEServerCallbacks {

  void onConnect(BLEServer* server) override {
    deviceConnected = true;
    Serial.println("Klient BLE polaczony");
  }

  void onDisconnect(BLEServer* server) override {
    deviceConnected = false;
    Serial.println("Klient BLE rozlaczony");
  }
};

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("ESP32 BLE Touch Monitor");

  // Uruchomienie Bluetooth
  BLEDevice::init(DEVICE_NAME);

  // Utworzenie serwera BLE
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new MyServerCallbacks());

  // Utworzenie usługi BLE
  BLEService* service = server->createService(SERVICE_UUID);

  // Utworzenie charakterystyki BLE
  touchCharacteristic = service->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_NOTIFY
  );

  touchCharacteristic->addDescriptor(new BLE2902());
  touchCharacteristic->setValue("0,0,0");

  // Uruchomienie usługi
  service->start();

  // Reklamowanie urządzenia BLE
  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->start();

  Serial.println("BLE gotowy!");
  Serial.println(DEVICE_NAME);
}

void loop() {
  unsigned long now = millis();

  if (now - lastMeasurement >= INTERVAL_MS) {
    lastMeasurement = now;

    // Odczyt czujnika dotykowego
    int touchValue = touchRead(TOUCH_PIN);

    // Wykrywanie dotkniecia
    bool currentTouch = touchValue < TOUCH_THRESHOLD;

    if (currentTouch && !touched) {
      touchCount++;
    }

    touched = currentTouch;

    // Przygotowanie danych CSV
    String data =
      String(touchValue) + "," +
      String(touched ? 1 : 0) + "," +
      String(touchCount);

    // Aktualizacja charakterystyki
    touchCharacteristic->setValue(data.c_str());

    // Wyslanie powiadomienia BLE
    if (deviceConnected) {
      touchCharacteristic->notify();
    }

    // Wyswietlenie pomiaru w terminalu
    Serial.println(data);
  }

  // Ponowne uruchomienie reklamowania
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    BLEDevice::startAdvertising();
    oldDeviceConnected = false;
  }

  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = true;
  }
}
