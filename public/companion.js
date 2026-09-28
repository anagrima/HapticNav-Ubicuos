/* HapticNav — companion.js */

// Vista acompañante: recibe actualizaciones del navegador principal y muestra el mapa

"use strict";

const $ = (id) => document.getElementById(id);

const setupOverlay = $("setup-overlay");
const compUi       = $("comp-ui");
const roomInput    = $("room-input");
const roomError    = $("room-error");
const joinBtn      = $("join-btn");
const exitBtn      = $("exit-btn");

const connDot      = $("conn-dot");
const connLabel    = $("conn-label");
const roomTag      = $("room-tag");

const compArrow    = $("comp-arrow");
const compDirLabel = $("comp-dir-label");
const cLat         = $("c-lat");
const cLng         = $("c-lng");
const cTs          = $("c-ts");

const stateStopped  = $("state-stopped");
const stateWrong    = $("state-wrong");
const stateArrived  = $("state-arrived");

const eventLog        = $("event-log");
const emptyRoomBanner = $("empty-room-banner");
const quickMsgButtons = document.querySelectorAll(".quick-msg-btn");

const DIRECTIONS = {
  LEFT:            { arrow: "←", label: "GIRA A LA IZQUIERDA" },
  RIGHT:           { arrow: "→", label: "GIRA A LA DERECHA" },
  STRAIGHT:        { arrow: "↑", label: "CONTINÚA RECTO" },
  ARRIVED:         { arrow: "⬡", label: "HA LLEGADO" },
  WRONG_DIRECTION: { arrow: "✕", label: "RUTA ERRÓNEA ⚠" },
};

let socket = null;
let map = null;
let userMarker = null;
let destMarker = null;
let routeLine = null;

// ==== HELPERS ERRORES ====

function setFieldError(inputEl, errorEl, message) {
  // Marca un campo como erróneo y muestra el mensaje asociado
  if (inputEl) inputEl.classList.add("input-error");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  }
}

function clearFieldError(inputEl, errorEl) {
  // Elimina marca de error y oculta el mensaje del campo
  if (inputEl) inputEl.classList.remove("input-error");
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  }
}

// ==== SETUP ====

// Maneja el evento de unirse a una sala, validando el código y estableciendo la conexión
joinBtn.addEventListener("click", () => {
  const room = roomInput.value.trim().toUpperCase();

  if (!room) {
    setFieldError(roomInput, roomError, "Introduce un código de sala.");
    return;
  }

  clearFieldError(roomInput, roomError);

  setupOverlay.classList.remove("active");
  compUi.classList.remove("hidden");
  roomTag.textContent = room;

  initSocket(room);
});

roomInput?.addEventListener("input", () => {
  clearFieldError(roomInput, roomError);
});

if (exitBtn) {
  exitBtn.addEventListener("click", () => {
    leaveCompanionView();
  });
}

// Maneja los botones de mensajes rápidos, enviando el mensaje asociado al servidor y mostrando una notificación en el log
quickMsgButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const message = btn.dataset.message;
    if (!socket?.connected || !message) return;

    socket.emit("COMPANION_QUICK_MESSAGE", {
      message,
      timestamp: Date.now()
    });

    logEvent(`Mensaje enviado: ${message}`, "ev-info");
  });
});

// ==== SALIR ====

function leaveCompanionView() {
  // Cierra la vista de acompañante y limpia recursos y estado local
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  if (map) {
    map.remove();
    map = null;
  }

  userMarker = null;
  destMarker = null;
  routeLine = null;

  roomTag.textContent = "";
  roomInput.value = "";

  compArrow.textContent = "—";
  compDirLabel.textContent = "Sin datos";
  cLat.textContent = "—";
  cLng.textContent = "—";
  cTs.textContent = "Sin señal GPS";

  setStateIndicator(stateStopped, null);
  setStateIndicator(stateWrong, null);
  setStateIndicator(stateArrived, null);

  eventLog.innerHTML = "";
  setConnStatus(false);
  setEmptyRoomVisible(false);
  clearFieldError(roomInput, roomError);

  compUi.classList.add("hidden");
  setupOverlay.classList.add("active");
}

// ==== SOCKET ====

function initSocket(roomId) {
  // Conecta al servidor usando websocket o polling según disponibilidad
  socket = io(window.location.origin, {
    transports: ["websocket", "polling"]
  });

  socket.on("connect", () => {
    setConnStatus(true);
    socket.emit("JOIN_AS_COMPANION", { roomId });
    logEvent("Conectado como acompañante", "ev-info");
    initMap();
  });

  socket.on("disconnect", () => {
    setConnStatus(false);
    setEmptyRoomVisible(true);
    logEvent("Desconectado del servidor", "ev-warn");
  });

  socket.on("ROOM_EMPTY", () => {
    setEmptyRoomVisible(true);
    logEvent("No hay nadie en esta sala", "ev-warn");
  });

  socket.on("NAVIGATOR_ONLINE", () => {
    setEmptyRoomVisible(false);
    logEvent("Usuario principal conectado", "ev-ok");
  });

  socket.on("NAVIGATOR_OFFLINE", () => {
    setEmptyRoomVisible(true);
    logEvent("Usuario principal desconectado", "ev-warn");
  });

  socket.on("STATE_SNAPSHOT", (snap) => {
    if (snap.position) updatePosition(snap.position);
    if (snap.direction) updateDirection(snap.direction);
    if (snap.stopped) updateStopped(true);
    if (snap.destination) updateDestination(snap.destination);
    if (snap.wrongDirection) {
      setStateIndicator(stateWrong, "state-on-wrong");
    }
    if (snap.route?.length) {
      updateRoute(snap.route);
    }
  });

  socket.on("POSITION_UPDATE", (data) => {
    updatePosition(data);
  });

  socket.on("NEXT_DIRECTION", (data) => {
    updateDirection(data);
  });

  socket.on("STOPPED", () => {
    updateStopped(true);
    logEvent("Usuario detenido", "ev-warn");
  });

  socket.on("MOVING", () => {
    updateStopped(false);
    logEvent("Usuario en movimiento", "ev-info");
  });

  socket.on("WRONG_DIRECTION", () => {
    setStateIndicator(stateWrong, "state-on-wrong");
    logEvent("Ruta errónea detectada", "ev-warn");
    setTimeout(() => setStateIndicator(stateWrong, null), 5000);
  });

  socket.on("VOICE_COMMAND", (data) => {
    if (!data?.command) return;
    logEvent(`Comando voz: "${data.command}"`, "ev-info");
  });

  socket.on("DESTINATION_SET", (data) => {
    updateDestination(data);
    logEvent("Destino recibido", "ev-info");
  });

  socket.on("ROUTE_DATA", (data) => {
    if (data.destination) updateDestination(data.destination);
    if (Array.isArray(data.route)) updateRoute(data.route);
    logEvent("Ruta actualizada", "ev-ok");
  });
}

// ==== MAP ====

function initMap() {
  // Crea el mapa Leaflet y añade la capa de teselas OpenStreetMap
  if (map) return;

  map = L.map("map").setView([40.55166, -4.01202], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
}

function updateMap(lat, lng) {
  // Actualiza marcador del usuario y centra el mapa en la nueva posición
  if (!map) return;

  if (!userMarker) {
    userMarker = L.marker([lat, lng]).addTo(map).bindPopup("Usuario");
    map.setView([lat, lng], 16);
  } else {
    userMarker.setLatLng([lat, lng]);
    map.panTo([lat, lng]);
  }
}

function updateDestination(data) {
  // Establece o actualiza el marcador del destino en el mapa
  if (!map) initMap();
  if (typeof data.latitude !== "number" || typeof data.longitude !== "number") return;

  if (!destMarker) {
    destMarker = L.marker([data.latitude, data.longitude]).addTo(map).bindPopup(data.name || "Destino");
  } else {
    destMarker.setLatLng([data.latitude, data.longitude]);
    if (data.name) destMarker.bindPopup(data.name);
  }
}

function updateRoute(routePoints) {
  // Dibuja o actualiza la polilínea que representa la ruta en el mapa
  if (!map || !Array.isArray(routePoints) || routePoints.length < 2) return;

  const latLngs = routePoints
    .filter(p => typeof p.latitude === "number" && typeof p.longitude === "number")
    .map(p => [p.latitude, p.longitude]);

  if (latLngs.length < 2) return;

  if (routeLine) {
    routeLine.setLatLngs(latLngs);
  } else {
    routeLine = L.polyline(latLngs, { weight: 5 }).addTo(map);
  }

  try {
    map.fitBounds(routeLine.getBounds(), { padding: [20, 20] });
  } catch (_) {}
}

// ==== UPDATERS ====

function updatePosition(data) {
  // Actualiza los valores mostrados de latitud, longitud y hora de actualización
  cLat.textContent = data.latitude?.toFixed(6) ?? "—";
  cLng.textContent = data.longitude?.toFixed(6) ?? "—";

  if (typeof data.latitude === "number" && typeof data.longitude === "number") {
    updateMap(data.latitude, data.longitude);
  }

  if (data.timestamp) {
    const d = new Date(data.timestamp);
    cTs.textContent = `Actualizado ${d.toLocaleTimeString("es-ES")}`;
  }
}

function updateDirection(data) {
  // Muestra la flecha y etiqueta según la dirección recibida
  const cfg = DIRECTIONS[data.direction] || DIRECTIONS.STRAIGHT;
  compArrow.textContent = cfg.arrow;
  compDirLabel.textContent = cfg.label;

  logEvent(`Indicación: ${cfg.label}`, "ev-info");

  if (data.direction === "ARRIVED") {
    setStateIndicator(stateArrived, "state-on-arrived");
  }
}

function updateStopped(stopped) {
  // Muestra o oculta el indicador de usuario detenido
  setStateIndicator(stateStopped, stopped ? "state-on-stop" : null);
}

function setStateIndicator(el, activeClass) {
  // Ajusta la clase del indicador para mostrar su estado activo o inactivo
  el.className = "state-indicator " + (activeClass ?? "state-off");
}

function setEmptyRoomVisible(visible) {
  // Muestra u oculta el banner que indica que la sala está vacía
  if (!emptyRoomBanner) return;
  if (visible) emptyRoomBanner.classList.remove("hidden");
  else emptyRoomBanner.classList.add("hidden");
}

// ==== LOG ====

function logEvent(msg, cls = "") {
  // Añade una entrada al log de eventos y mantiene la lista limitada
  const li = document.createElement("li");
  li.className = cls;
  const now = new Date().toLocaleTimeString("es-ES");
  li.textContent = `[${now}] ${msg}`;
  eventLog.prepend(li);

  while (eventLog.children.length > 12) {
    eventLog.removeChild(eventLog.lastChild);
  }
}

// ==== CONN STATUS ====

function setConnStatus(online) {
  // Actualiza indicador visual de estado de conexión
  connDot.className = "dot " + (online ? "dot-on" : "dot-off");
  connLabel.textContent = online ? "Conectado" : "Desconectado";
}