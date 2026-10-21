
"use strict";

// ==========================================
// ESP32 BLE TOUCH MONITOR
// Web Bluetooth + wykres + eksport CSV
// ==========================================

// UUID muszą być takie same jak w config.h
const SERVICE_UUID =
  "a12b0d0d-d609-41a9-9f18-05e9ec046688";

const CHARACTERISTIC_UUID =
  "12b3e628-415b-4b82-abae-d4d6f4b6fc07";

const DEVICE_NAME = "ESP32_TOUCH_LAB";

// Elementy HTML
const $ = (id) => document.getElementById(id);

const connectBtn = $("connect");
const disconnectBtn = $("disconnect");
const exportBtn = $("export");

const statusEl = $("status");
const errorEl = $("errorMessage");

const rawEl = $("raw");
const touchEl = $("touch");
const countEl = $("count");
const lastMessageEl = $("lastMessage");

const canvas = $("chart");
const ctx = canvas.getContext("2d");

// Bluetooth
let device = null;
let characteristic = null;
let connecting = false;

// Historia pomiarów
const measurements = [];
const MAX_CHART_POINTS = 100;

// ==========================================
// STATUS I PRZYCISKI
// ==========================================

function setStatus(message, color = "#94a3b8") {
  statusEl.textContent = message;
  statusEl.style.color = color;
}

function showError(message = "") {
  errorEl.textContent = message;
}

function updateButtons() {
  const connected = Boolean(device?.gatt?.connected);

  connectBtn.disabled = connecting || connected;
  disconnectBtn.disabled = !connected;
  exportBtn.disabled = measurements.length === 0;
}

// ==========================================
// POŁĄCZENIE BLUETOOTH
// ==========================================

async function connectBLE() {
  if (connecting) return;

  if (!navigator.bluetooth) {
    showError(
      "Web Bluetooth jest niedostępny. " +
      "Użyj Chrome na komputerze z Bluetooth LE " +
      "i uruchom stronę przez HTTPS lub localhost."
    );
    return;
  }

  connecting = true;
  showError("");
  setStatus("Łączenie...", "#fbbf24");
  updateButtons();

  try {
    // Wybór ESP32 z listy urządzeń
    device = await navigator.bluetooth.requestDevice({
      filters: [{ name: DEVICE_NAME }],
      optionalServices: [SERVICE_UUID]
    });

    device.addEventListener(
      "gattserverdisconnected",
      onDisconnected
    );

    // Połączenie z serwerem GATT
    const server = await device.gatt.connect();

    // Znalezienie usługi po UUID
    const service =
      await server.getPrimaryService(SERVICE_UUID);

    // Znalezienie charakterystyki
    characteristic =
      await service.getCharacteristic(
        CHARACTERISTIC_UUID
      );

    // Nasłuchiwanie nowych danych
    characteristic.addEventListener(
      "characteristicvaluechanged",
      onValueChanged
    );

    await characteristic.startNotifications();

    setStatus("Połączono z ESP32", "#4ade80");

  } catch (error) {
    console.error(error);

    showError("Błąd BLE: " + error.message);
    setStatus("Rozłączono", "#fb7185");

    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }

    characteristic = null;

  } finally {
    connecting = false;
    updateButtons();
  }
}

// ==========================================
// ODBIERANIE DANYCH Z ESP32
// ==========================================

function onValueChanged(event) {
  // ESP32 wysyła np. "102,0,7"
  const dataView = event.target.value;

  const message = new TextDecoder("utf-8")
    .decode(dataView)
    .trim();

  const parts = message.split(",");

  if (parts.length !== 3) {
    showError("Nieprawidłowy format: " + message);
    return;
  }

  const raw = Number(parts[0]);
  const touch = Number(parts[1]);
  const count = Number(parts[2]);

  if (
    !Number.isFinite(raw) ||
    !Number.isInteger(raw) ||
    ![0, 1].includes(touch) ||
    !Number.isSafeInteger(count) ||
    count < 0
  ) {
    showError("Nieprawidłowe wartości: " + message);
    return;
  }

  showError("");

  // Aktualizacja kart na stronie
  rawEl.textContent = raw;

  touchEl.textContent =
    touch === 1 ? "DOTKNIĘTY" : "BRAK DOTYKU";

  countEl.textContent = count;
  lastMessageEl.textContent = message;

  // Dodanie pomiaru do historii
  measurements.push({
    timestamp: new Date(),
    raw,
    touch,
    count
  });

  updateButtons();
  drawChart();
}

// ==========================================
// ROZŁĄCZANIE
// ==========================================

function disconnectBLE() {
  if (device?.gatt?.connected) {
    device.gatt.disconnect();
  }
}

function onDisconnected() {
  if (characteristic) {
    characteristic.removeEventListener(
      "characteristicvaluechanged",
      onValueChanged
    );
  }

  characteristic = null;

  setStatus("Rozłączono", "#fb7185");
  updateButtons();
}

// ==========================================
// WYKRES NA CANVAS
// ==========================================

function drawChart() {
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  // Ostatnie 100 pomiarów
  const points =
    measurements.slice(-MAX_CHART_POINTS);

  const left = 65;
  const right = 20;
  const top = 25;
  const bottom = 45;

  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  // Tło
  ctx.fillStyle = "#0e1a2b";
  ctx.fillRect(0, 0, width, height);

  // Brak pomiarów
  if (points.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "16px Arial";
    ctx.fillText(
      "Połącz ESP32, aby zobaczyć wykres.",
      90,
      height / 2
    );
    return;
  }

  const values = points.map(p => p.raw);

  let min = Math.min(...values);
  let max = Math.max(...values);

  // Margines zakresu osi Y
  const padding = Math.max(5, (max - min) * 0.15);

  min -= padding;
  max += padding;

  const x = (i) =>
    left + i * chartWidth /
    Math.max(1, points.length - 1);

  const y = (value) =>
    top + (max - value) /
    (max - min) * chartHeight;

  // Linie siatki
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px Arial";

  for (let i = 0; i <= 4; i++) {
    const value = min + (max - min) * i / 4;
    const yy = y(value);

    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(width - right, yy);
    ctx.stroke();

    ctx.fillText(value.toFixed(0), 10, yy + 4);
  }

  // Linia wykresu
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 3;
  ctx.beginPath();

  points.forEach((point, i) => {
    const xx = x(i);
    const yy = y(point.raw);

    if (i === 0) {
      ctx.moveTo(xx, yy);
    } else {
      ctx.lineTo(xx, yy);
    }
  });

  ctx.stroke();

  // Opisy osi
  ctx.fillStyle = "#94a3b8";
  ctx.font = "13px Arial";

  ctx.fillText(
    "Odczyt touchRead(4)",
    left,
    15
  );

  ctx.fillText(
    "Kolejne pomiary →",
    width / 2 - 60,
    height - 12
  );
}

// ==========================================
// EKSPORT DO CSV
// ==========================================

function exportCSV() {
  if (measurements.length === 0) {
    showError("Brak danych do eksportu.");
    return;
  }

  const rows = [
    [
      "Data i czas",
      "Wartosc czujnika",
      "Stan dotyku",
      "Licznik dotkniec"
    ]
  ];

  measurements.forEach(m => {
    rows.push([
      m.timestamp.toISOString(),
      m.raw,
      m.touch,
      m.count
    ]);
  });

  // Separator ; jest wygodny w polskim Excelu
  const csv = "\uFEFF" +
    rows.map(row => row.join(";")).join("\r\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "ESP32_BLE_Touch_Pomiary.csv";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

// ==========================================
// PRZYCISKI
// ==========================================

connectBtn.addEventListener("click", connectBLE);
disconnectBtn.addEventListener("click", disconnectBLE);
exportBtn.addEventListener("click", exportCSV);

// Początkowy wygląd strony
updateButtons();
drawChart();
