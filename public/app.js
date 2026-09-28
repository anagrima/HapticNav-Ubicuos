/* HapticNav — app.js */

// Navegador principal: lógica de rutas, geolocalización, voz y feedback háptico

"use strict";

// Estado central de la aplicación: variables y flags compartidos
const state = {
  roomId: null,
  destLat: null,
  destLng: null,
  selectedDestinationName: null,
  usingManualDestination: false,

  currentPos: null,
  lastDirection: null,

  stopTimer: null,
  isStopped: false,
  isListening: false,
  isSpeaking: false,
  hapticEnabled: true,

  socket: null,
  recognition: null,

  wrongCounter: 0,
  lastDistance: null,

  routeStarted: false,
  previewSteps: [],

  gpsIntervalId: null,
  isPollingGps: false,

  isRoutePaused: false,
  isRecalculatingRoute: false,

  routeData: null,
  routeCoords: [],
  routeSteps: [],
  currentStepIndex: 0,
  isFetchingRoute: false,
  hasInitialRoute: false,

  motionListenerAttached: false,
  lastMotionMagnitude: null,
  shakeCooldownUntil: 0,

  speechSynthUtterance: null,
};

const $ = (id) => document.getElementById(id);

const setupOverlay              = $("setup-overlay");
const previewScreen             = $("preview-screen");
const navUi                     = $("nav-ui");
const pauseOverlay              = $("pause-overlay");
const recalculatingOverlay      = $("recalculating-overlay");

const roomInput                 = $("room-input");
const destLat                   = $("dest-lat");
const destLng                   = $("dest-lng");

const roomError                 = $("room-error");
const destinationError          = $("destination-error");
const destLatError              = $("dest-lat-error");
const destLngError              = $("dest-lng-error");

const startBtn                  = $("start-btn");
const backBtn                   = $("back-btn");
const beginRouteBtn             = $("begin-route-btn");
const stopBtn                   = $("stop-btn");
const routeBackBtn              = $("route-back-btn");
const resumeBtn                 = $("resume-btn");
const finishBtn                 = $("finish-btn");

const connDot                   = $("conn-dot");
const connLabel                 = $("conn-label");
const roomTag                   = $("room-tag");
const previewRoomTag            = $("preview-room-tag");

const arrowIcon                 = $("arrow-icon");
const dirLabel                  = $("direction-label");
const distLabel                 = $("distance-label");
const alertBanner               = $("alert-banner");
const distVal                   = $("dist-val");
const timeVal                   = $("time-val");

const voiceFabWrapper           = $("voice-fab-wrapper");
const voiceBtn                  = $("voice-btn");

const pillGps                   = $("pill-gps");
const pillVoice                 = $("pill-voice");

const manualFields              = $("manual-destination-fields");
const toggleManualBtn           = $("toggle-manual-btn");
const selectedDestination       = $("selected-destination");
const presetButtons             = document.querySelectorAll(".preset-btn");

const previewDestinationName    = $("preview-destination-name");
const previewDestinationCoords  = $("preview-destination-coords");
const previewSteps              = $("preview-steps");

const DIRECTIONS = {
  LEFT:            { arrow: "←", label: "GIRA A LA IZQUIERDA", vibration: [300] },
  RIGHT:           { arrow: "→", label: "GIRA A LA DERECHA",   vibration: [300, 200, 300] },
  STRAIGHT:        { arrow: "↑", label: "CONTINÚA RECTO",      vibration: [120] },
  ARRIVED:         { arrow: "⬡", label: "HAS LLEGADO",         vibration: [650] },
  WRONG_DIRECTION: { arrow: "✕", label: "RUTA ERRÓNEA",        vibration: [100, 100, 100, 100, 100] },
};

const QUICK_MESSAGE_VIBRATION = [120, 80, 120, 80, 120];

// ==== HELPERS — ERRORS ====

function setFieldError(inputEl, errorEl, message) {
  // Añade marcador visual y texto de error en el formulario
  if (inputEl) inputEl.classList.add("input-error");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  }
}

function clearFieldError(inputEl, errorEl) {
  // Quita estilos de error y oculta el mensaje asociado
  if (inputEl) inputEl.classList.remove("input-error");
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  }
}

function clearAllFieldErrors() {
  // Restablece todos los campos de error del formulario
  clearFieldError(roomInput, roomError);
  clearFieldError(destLat, destLatError);
  clearFieldError(destLng, destLngError);
  if (destinationError) destinationError.classList.add("hidden");
}

function showDestinationError(message) {
  // Muestra un error relacionado con la selección del destino
  if (!destinationError) return;
  destinationError.textContent = message;
  destinationError.classList.remove("hidden");
}

function hideDestinationError() {
  // Oculta cualquier aviso de error del destino
  if (!destinationError) return;
  destinationError.textContent = "";
  destinationError.classList.add("hidden");
}

function setVoiceUiListening(listening) {
  // Actualiza la interfaz para mostrar el estado de escucha por voz
  if (listening) {
    voiceBtn?.classList.add("listening");
    voiceFabWrapper?.classList.add("voice-active");
    setPill(pillVoice, true);
  } else {
    voiceBtn?.classList.remove("listening");
    voiceFabWrapper?.classList.remove("voice-active");
    setPill(pillVoice, false);
  }
}

function stopSpeechIfAny() {
  // Detiene cualquier síntesis de voz actualmente en reproducción
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  state.isSpeaking = false;
  state.speechSynthUtterance = null;
}

function showRecalculatingOverlay() {
  // Muestra una superposición indicando que se está recalculando la ruta
  state.isRecalculatingRoute = true;
  recalculatingOverlay?.classList.remove("hidden");
}

function hideRecalculatingOverlay() {
  // Oculta la superposición de recálculo y restablece el estado asociado
  state.isRecalculatingRoute = false;
  recalculatingOverlay?.classList.add("hidden");
}

// ==== DESTINOS ====

// Maneja la selección de destinos predefinidos y el toggle para coordenadas manuales
presetButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    hideDestinationError();
    clearFieldError(destLat, destLatError);
    clearFieldError(destLng, destLngError);

    presetButtons.forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");

    state.destLat = parseFloat(btn.dataset.lat);
    state.destLng = parseFloat(btn.dataset.lng);
    state.selectedDestinationName = btn.textContent.trim();

    if (selectedDestination) {
      selectedDestination.textContent = `Destino: ${state.selectedDestinationName}`;
    }
  });
});

// Permite al usuario salir de la vista de acompañante y volver a la configuración inicial
if (toggleManualBtn) {
  toggleManualBtn.addEventListener("click", () => {
    hideDestinationError();
    clearFieldError(destLat, destLatError);
    clearFieldError(destLng, destLngError);

    state.usingManualDestination = !state.usingManualDestination;

    if (manualFields) {
      manualFields.classList.toggle("hidden", !state.usingManualDestination);
    }

    if (state.usingManualDestination) {
      toggleManualBtn.textContent = "Ocultar coordenadas manuales";
      if (selectedDestination && !state.selectedDestinationName && !getHasSelectedPreset()) {
        selectedDestination.textContent = "Introduce un destino manual";
      }
    } else {
      toggleManualBtn.textContent = "Usar coordenadas manuales";
      clearFieldError(destLat, destLatError);
      clearFieldError(destLng, destLngError);
    }
  });
}

if (roomInput) roomInput.addEventListener("input", () => clearFieldError(roomInput, roomError));
if (destLat) destLat.addEventListener("input", () => clearFieldError(destLat, destLatError));
if (destLng) destLng.addEventListener("input", () => clearFieldError(destLng, destLngError));

function getHasSelectedPreset() {
  // Comprueba si hay un botón de destino predefinido seleccionado
  return [...presetButtons].some(btn => btn.classList.contains("selected"));
}

function validateAndResolveDestination() {
  // Valida si hay un destino predefinido o coordenadas manuales válidas
  clearFieldError(destLat, destLatError);
  clearFieldError(destLng, destLngError);
  hideDestinationError();

  const hasPreset = getHasSelectedPreset();
  const latValue = destLat?.value?.trim() ?? "";
  const lngValue = destLng?.value?.trim() ?? "";

  const hasManualLat = latValue !== "";
  const hasManualLng = lngValue !== "";
  const hasAnyManual = hasManualLat || hasManualLng;
  const hasFullManual = hasManualLat && hasManualLng;

  if (hasFullManual) {
    const lat = parseFloat(latValue);
    const lng = parseFloat(lngValue);

    let valid = true;

    if (isNaN(lat)) {
      setFieldError(destLat, destLatError, "Introduce una latitud válida.");
      valid = false;
    }
    if (isNaN(lng)) {
      setFieldError(destLng, destLngError, "Introduce una longitud válida.");
      valid = false;
    }
    if (!valid) return false;

    state.destLat = lat;
    state.destLng = lng;
    state.selectedDestinationName = "Destino manual";

    if (selectedDestination) {
      selectedDestination.textContent = "Destino: Destino manual";
    }

    return true;
  }

  if (hasAnyManual && !hasFullManual) {
    if (!hasManualLat) setFieldError(destLat, destLatError, "Falta completar la latitud.");
    if (!hasManualLng) setFieldError(destLng, destLngError, "Falta completar la longitud.");
    showDestinationError("Completa ambas coordenadas manuales o usa un destino predefinido.");
    return false;
  }

  if (hasPreset && state.destLat != null && state.destLng != null) {
    return true;
  }

  showDestinationError("Selecciona un destino predefinido o introduce coordenadas manuales válidas.");
  return false;
}

// ==== SETUP ====

// Inicia la navegación: valida datos, muestra pantalla de preview y espera confirmación para arrancar ruta
startBtn.addEventListener("click", () => {
  clearAllFieldErrors();

  const room = roomInput.value.trim().toUpperCase();

  if (!room) {
    setFieldError(roomInput, roomError, "Introduce un código de sala.");
    return;
  }

  state.roomId = room;

  if (!validateAndResolveDestination()) return;

  buildPreviewSteps();
  showPreviewScreen();
});

backBtn.addEventListener("click", () => {
  previewScreen.classList.add("hidden");
  setupOverlay.classList.add("active");
});

beginRouteBtn.addEventListener("click", () => {
  previewScreen.classList.add("hidden");
  navUi.classList.remove("hidden");
  roomTag.textContent = state.roomId;
  state.routeStarted = true;
  state.isRoutePaused = false;

  distVal.textContent = "—";
  timeVal.textContent = "—";

  try {
    if (navigator.vibrate) navigator.vibrate(1);
  } catch (_) {}

  initSocket();
  initGeolocation();
  initVoiceRecognition();
  initDeviceMotion();
});

stopBtn.addEventListener("click", () => {
  pauseRoute("manual");
});

resumeBtn?.addEventListener("click", () => {
  resumeRoute("manual");
});

finishBtn?.addEventListener("click", () => {
  window.location.href = "/home.html";
});

routeBackBtn?.addEventListener("click", () => {
  leaveRouteAndGoToSetup();
});

// ==== PREVIEW ====

function showPreviewScreen() {
  // Muestra la pantalla de preview con detalles del destino y pasos de navegación antes de iniciar la ruta
  setupOverlay.classList.remove("active");
  previewScreen.classList.remove("hidden");

  previewRoomTag.textContent = state.roomId;
  previewDestinationName.textContent = state.selectedDestinationName || "Destino seleccionado";
  previewDestinationCoords.textContent = `${state.destLat.toFixed(5)}, ${state.destLng.toFixed(5)}`;

  renderPreviewSteps();
}

function buildPreviewSteps() {
  // Construye una lista de pasos informativos para mostrar en la pantalla de preview antes de iniciar la ruta
  state.previewSteps = [
    "La ruta se calcula automáticamente al iniciar.",
    "1 vibración = giro a la izquierda.",
    "2 vibraciones = giro a la derecha.",
    "Si te detienes 5 segundos, la indicación se repetirá.",
    "Botón de voz o agitar el móvil para hablarle a la app.",
    "Puedes decir: 'Pausar', 'Seguir' o 'Ayuda'.",
    "Puedes recibir mensajes de tu acompañante.",
    "Si te sales de la ruta, la app recalculará y avisará.",
    "Una vibración larga indicará llegada al destino."
  ];
}

function renderPreviewSteps() {
  // Actualiza la interfaz de preview con la lista de pasos informativos construida previamente
  previewSteps.innerHTML = "";

  state.previewSteps.forEach((step, index) => {
    const li = document.createElement("li");
    li.className = "preview-step-item";
    li.textContent = `${index + 1}. ${step}`;
    previewSteps.appendChild(li);
  });
}

// ==== PAUSE / RESUME ====

function pauseRoute(source = "manual") {
  // Pausa la navegación y notifica a los clientes conectados
  if (state.isRoutePaused || state.isRecalculatingRoute) return;

  state.isRoutePaused = true;
  stopGeolocationPolling();
  clearTimeout(state.stopTimer);
  stopSpeechIfAny();

  pauseOverlay?.classList.remove("hidden");
  emit("STOPPED", { timestamp: Date.now(), paused: true, source });
}

function resumeRoute(source = "manual") {
  // Reanuda la navegación y restablece las lecturas GPS
  if (!state.isRoutePaused || state.isRecalculatingRoute) return;

  state.isRoutePaused = false;
  pauseOverlay?.classList.add("hidden");

  initGeolocation();
  emit("MOVING", { timestamp: Date.now(), resumed: true, source });
}

function leaveRouteAndGoToSetup() {
  // Limpia el estado de la ruta y vuelve a la pantalla de configuración
  stopGeolocationPolling();
  clearTimeout(state.stopTimer);
  stopSpeechIfAny();
  hideRecalculatingOverlay();

  if (state.socket) {
    state.socket.disconnect();
    state.socket = null;
  }

  if (state.recognition) {
    try { state.recognition.stop(); } catch (_) {}
  }

  state.isRoutePaused = false;
  state.isRecalculatingRoute = false;
  state.routeStarted = false;
  state.isStopped = false;
  state.isPollingGps = false;
  state.lastDirection = null;
  state.currentPos = null;
  state.routeData = null;
  state.routeCoords = [];
  state.routeSteps = [];
  state.currentStepIndex = 0;
  state.hasInitialRoute = false;
  state.isFetchingRoute = false;
  state.lastDistance = null;
  state.wrongCounter = 0;
  state.lastMotionMagnitude = null;
  state.shakeCooldownUntil = 0;
  state.isListening = false;

  pauseOverlay?.classList.add("hidden");
  setVoiceUiListening(false);

  navUi.classList.add("hidden");
  previewScreen.classList.add("hidden");
  setupOverlay.classList.add("active");

  setConnStatus(false);
  hideAlert();

  arrowIcon.textContent = "—";
  dirLabel.textContent = "ESPERANDO GPS…";
  distLabel.textContent = "";
  distVal.textContent = "—";
  timeVal.textContent = "—";
}

// ==== SOCKET ====

function initSocket() {
  // Conecta con el servidor y anuncia el destino/rol del navegador
  if (state.socket?.connected) return;

  state.socket = io(window.location.origin, {
    transports: ["websocket", "polling"]
  });

  state.socket.on("connect", () => {
    setConnStatus(true);

    state.socket.emit("JOIN_AS_NAVIGATOR", {
      roomId: state.roomId
    });

    emit("DESTINATION_SET", {
      latitude: state.destLat,
      longitude: state.destLng,
      name: state.selectedDestinationName,
      timestamp: Date.now()
    });
  });

  state.socket.on("disconnect", () => setConnStatus(false));
  state.socket.on("connect_error", () => setConnStatus(false));

  state.socket.on("COMPANION_QUICK_MESSAGE", (data) => {
    handleCompanionQuickMessage(data);
  });
}

function handleCompanionQuickMessage(data) {
  // Muestra alerta breve y notifica con vibración y síntesis de voz si procede
  const msg = data?.message;
  if (!msg) return;

  showAlert(`📩 ${msg}`, false);

  setTimeout(() => {
    if (!state.isRoutePaused && !state.isRecalculatingRoute) hideAlert();
  }, 3500);

  if (!state.isListening) {
    vibrate(QUICK_MESSAGE_VIBRATION);
    speak(`Mensaje de tu acompañante. ${msg}`);
  }
}

function setConnStatus(online) {
  // Actualiza el indicador de estado de conexión en la interfaz
  connDot.className = "dot " + (online ? "dot-on" : "dot-off");
  connLabel.textContent = online ? "Conectado" : "Desconectado";
}

function emit(event, data) {
  // Envía un evento al servidor a través del socket, si la conexión está activa
  if (state.socket?.connected) {
    state.socket.emit(event, data);
  }
}

// ==== GEOLOCATION ====

function initGeolocation() {
  // Inicia lecturas periódicas del GPS y solicita la posición actual
  if (!navigator.geolocation) {
    showAlert("Geolocalización no disponible", false);
    return;
  }

  if (state.isPollingGps) return;

  requestCurrentPosition();
  state.gpsIntervalId = setInterval(requestCurrentPosition, 5000);
  state.isPollingGps = true;
}

function stopGeolocationPolling() {
  // Detiene las lecturas periódicas del GPS
  if (state.gpsIntervalId) {
    clearInterval(state.gpsIntervalId);
    state.gpsIntervalId = null;
  }
  state.isPollingGps = false;
}

function requestCurrentPosition() {
  // Solicita la posición actual al API de geolocalización del navegador
  navigator.geolocation.getCurrentPosition(
    onPosition,
    (err) => {
      console.warn("GPS error:", err.code, err.message, err);
      setPill(pillGps, false);
      showAlert("No se pudo acceder al GPS.", false);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    }
  );
}

async function onPosition(pos) {
  // Maneja nuevas lecturas GPS y decide si aplicar indicaciones o recalcular ruta
  if (state.isRoutePaused || state.isListening || state.isRecalculatingRoute) return;

  const { latitude: lat, longitude: lng } = pos.coords;
  state.currentPos = { lat, lng };

  setPill(pillGps, true);

  const straightDist = haversine(lat, lng, state.destLat, state.destLng);

  emit("POSITION_UPDATE", {
    latitude: lat,
    longitude: lng,
    timestamp: Date.now()
  });

  if (!state.hasInitialRoute) {
    await fetchAndStoreRoute(lat, lng, false);
  }

  if (state.routeCoords.length > 1) {
    const offRoute = isOffRoute(lat, lng);

    if (offRoute) {
      await recalculateRouteFromCurrentPosition("Te has salido de la ruta. Recalculando.");
    } else {
      updateStepIndex(lat, lng);
      const dir = getDirectionFromCurrentRouteStep(straightDist);
      if (state.lastDirection !== "WRONG_DIRECTION") {
        applyDirection(dir);
      } else if (dir === "ARRIVED") {
        applyDirection(dir);
      }
    }
  } else {
    detectWrongDirectionFallback(straightDist);
    const dir = calcDirectionFallback(lat, lng, state.destLat, state.destLng, straightDist);

    if (state.lastDirection !== "WRONG_DIRECTION") {
      applyDirection(dir);
    } else if (dir === "ARRIVED") {
      applyDirection(dir);
    }
  }

  const metrics = computeRemainingMetrics(straightDist);
  renderRemainingMetrics(metrics.distance, metrics.duration);

  onMovementDetected();
}

// Tiempo estimado simple en base a velocidad media caminando.
// Se actualiza dinámicamente según cambia la distancia al destino.
function computeRemainingMetrics(straightDistFallback) {
  // Calcula tiempo y distancia restante usando velocidad media de paseo
  const remainingDistance = straightDistFallback ?? 0;

  // Velocidad media caminando: 1.3 m/s ≈ 4.7 km/h
  const remainingDuration = remainingDistance / 1.3;

  return {
    distance: remainingDistance,
    duration: remainingDuration
  };
}

function renderRemainingMetrics(distanceMeters, durationSeconds) {
  // Actualiza la interfaz con distancia y tiempo estimado restantes
  distVal.textContent = formatDist(distanceMeters);
  timeVal.textContent = formatDuration(durationSeconds);
  distLabel.textContent = distanceMeters > 0 ? `a ${formatDist(distanceMeters)}` : "";
}

// ==== ROUTING ====

async function fetchAndStoreRoute(originLat, originLng, forceRecalc = false) {
  // Solicita ruta al servicio OSRM y guarda coordenadas y pasos en el estado
  if (state.isFetchingRoute) return;
  if (!forceRecalc && state.routeCoords.length > 1) return;

  state.isFetchingRoute = true;

  try {
    const url =
      `https://router.project-osrm.org/route/v1/foot/` +
      `${originLng},${originLat};${state.destLng},${state.destLat}` +
      `?overview=full&geometries=geojson&steps=true`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) {
      throw new Error("No se pudo obtener una ruta válida");
    }

    const route = data.routes[0];
    const leg = route.legs?.[0];

    state.routeData = route;
    state.routeCoords = (route.geometry?.coordinates || []).map(([lng, lat]) => ({ lat, lng }));
    state.routeSteps = leg?.steps || [];
    state.currentStepIndex = 0;
    state.hasInitialRoute = true;
    state.lastDistance = null;
    state.wrongCounter = 0;

    emit("ROUTE_DATA", {
      route: state.routeCoords.map(p => ({ latitude: p.lat, longitude: p.lng })),
      destination: {
        latitude: state.destLat,
        longitude: state.destLng,
        name: state.selectedDestinationName
      },
      timestamp: Date.now()
    });
  } catch (error) {
    console.error("Error obteniendo ruta OSRM:", error);
    showAlert("No se pudo calcular la ruta real. Usando modo básico.", false);
  } finally {
    state.isFetchingRoute = false;
  }
}

async function recalculateRouteFromCurrentPosition(voiceMessage = null) {
  // Fuerza recalculo de ruta desde la posición actual y actualiza la UI
  if (state.isRoutePaused || state.isRecalculatingRoute || !state.currentPos) return;

  stopGeolocationPolling();
  clearTimeout(state.stopTimer);

  try {
    showRecalculatingOverlay();
    applyDirection("WRONG_DIRECTION", true);

    if (voiceMessage) {
      speak(voiceMessage);
      await wait(3000);
    }

    state.routeCoords = [];
    state.routeSteps = [];
    state.routeData = null;
    state.hasInitialRoute = false;
    state.currentStepIndex = 0;
    state.lastDirection = null;

    await fetchAndStoreRoute(
      state.currentPos.lat,
      state.currentPos.lng,
      true
    );
  } catch (err) {
    console.error("Error recalculando ruta:", err);
    speak("No se pudo recalcular la ruta.");
  } finally {
    hideRecalculatingOverlay();
    initGeolocation();
  }
}

function updateStepIndex(lat, lng) {
  // Determina el índice del paso de ruta más cercano a la posición actual
  if (!state.routeSteps.length) return;

  let bestIndex = state.currentStepIndex;
  let bestDist = Infinity;

  for (let i = state.currentStepIndex; i < state.routeSteps.length; i++) {
    const m = state.routeSteps[i]?.maneuver?.location;
    if (!m || m.length < 2) continue;

    const stepLng = m[0];
    const stepLat = m[1];
    const d = haversine(lat, lng, stepLat, stepLng);

    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }

  state.currentStepIndex = bestIndex;
}

function getDirectionFromCurrentRouteStep(distToDestination) {
  // Interpreta el tipo de maniobra del paso actual y devuelve una dirección simple
  if (distToDestination < 15) return "ARRIVED";
  if (!state.routeSteps.length) return "STRAIGHT";

  const step = state.routeSteps[state.currentStepIndex];
  if (!step) return "STRAIGHT";

  const maneuver = step.maneuver || {};
  const modifier = (maneuver.modifier || "").toLowerCase();
  const type = (maneuver.type || "").toLowerCase();

  if (type === "arrive") return "ARRIVED";
  if (modifier.includes("left")) return "LEFT";
  if (modifier.includes("right")) return "RIGHT";

  return "STRAIGHT";
}

function isOffRoute(lat, lng) {
  // Calcula la mínima distancia desde la posición a la polilínea de la ruta
  if (!state.routeCoords.length) return false;

  let minDist = Infinity;

  for (const point of state.routeCoords) {
    const d = haversine(lat, lng, point.lat, point.lng);
    if (d < minDist) minDist = d;
  }

  return minDist > 35;
}

// ==== FALLBACK ====

function detectWrongDirectionFallback(currentDist) {
  // Fallback que detecta si la distancia al destino aumenta y cuenta errores
  if (state.lastDistance == null) {
    state.lastDistance = currentDist;
    return;
  }

  const increased = currentDist > state.lastDistance + 8;

  if (increased) state.wrongCounter++;
  else state.wrongCounter = 0;

  state.lastDistance = currentDist;

  if (state.wrongCounter >= 3) {
    state.wrongCounter = 0;
    applyDirection("WRONG_DIRECTION", true);

    setTimeout(() => {
      if (state.lastDirection === "WRONG_DIRECTION") {
        state.lastDirection = null;
      }
    }, 4000);
  }
}

function calcDirectionFallback(lat, lng, dLat, dLng, dist) {
  // Estima la dirección general hacia el destino usando bearing cuando no hay ruta
  if (dist < 15) return "ARRIVED";

  const bearing = calcBearing(lat, lng, dLat, dLng);

  if (dist < 50) return "STRAIGHT";
  if (bearing > 315 || bearing <= 45) return "STRAIGHT";
  if (bearing > 45 && bearing <= 135) return "RIGHT";
  if (bearing > 135 && bearing <= 225) return "STRAIGHT";
  return "LEFT";
}

// ==== DIRECCIONES ====

function applyDirection(dir, force = false) {
  // Aplica una dirección dada actualizando la UI, vibración y notificando al servidor
  if (state.isRoutePaused || state.isListening) return;
  if (dir === state.lastDirection && !force) return;

  state.lastDirection = dir;

  const cfg = DIRECTIONS[dir] || DIRECTIONS.STRAIGHT;
  setArrow(cfg.arrow, cfg.label);

  vibrate(cfg.vibration);

  emit("NEXT_DIRECTION", {
    direction: dir,
    timestamp: Date.now()
  });

  if (dir === "WRONG_DIRECTION") {
    showAlert("⚠ RUTA ERRÓNEA — Recalculando", true);
    emit("WRONG_DIRECTION", { timestamp: Date.now() });
  } else if (dir === "ARRIVED") {
    hideAlert();
    speak("Has llegado al destino.");
  } else {
    hideAlert();
  }
}

function repeatLastIndicationImmediate() {
  // Repite la última indicación visual y háptica de forma inmediata
  if (!state.lastDirection || state.isListening) return;

  const cfg = DIRECTIONS[state.lastDirection] || DIRECTIONS.STRAIGHT;
  setArrow(cfg.arrow, cfg.label);
  vibrate(cfg.vibration);
}

// ==== STOP ====

function onMovementDetected() {
  // Detecta paradas continuadas y notifica al servidor cuando el usuario se detiene
  clearTimeout(state.stopTimer);

  if (state.isStopped) {
    state.isStopped = false;
    emit("MOVING", { timestamp: Date.now() });
  }

  state.stopTimer = setTimeout(() => {
    state.isStopped = true;
    emit("STOPPED", { timestamp: Date.now() });
    repeatLastIndicationImmediate();
  }, 5000);
}

// ==== SHAKE PARA VOZ ====

function initDeviceMotion() {
  // Añade listener de movimiento para detectar sacudidas y actividad del dispositivo
  if (state.motionListenerAttached) return;
  state.motionListenerAttached = true;

  window.addEventListener("devicemotion", (e) => {
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;

    const x = acc.x || 0;
    const y = acc.y || 0;
    const z = acc.z || 0;
    const magnitude = Math.sqrt(x * x + y * y + z * z);

    detectShakeForVoice(magnitude);

    if (!state.isRoutePaused && !state.isListening && !state.isRecalculatingRoute && magnitude > 11.5) {
      onMovementDetected();
    }
  });
}

function detectShakeForVoice(magnitude) {
  // Detecta cambios bruscos en la aceleración para activar reconocimiento de voz
  const now = Date.now();

  if (state.lastMotionMagnitude == null) {
    state.lastMotionMagnitude = magnitude;
    return;
  }

  const delta = Math.abs(magnitude - state.lastMotionMagnitude);
  state.lastMotionMagnitude = magnitude;

  if (now < state.shakeCooldownUntil) return;
  if (delta < 14) return;

  state.shakeCooldownUntil = now + 2500;
  startVoiceRecognition();
}

// ==== VOZ ====

function initVoiceRecognition() {
  // Configura SpeechRecognition para comandos de voz en español
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SR) {
    console.warn("SpeechRecognition no disponible");
    setPill(pillVoice, false);
    return;
  }

  if (state.recognition) return;

  const rec = new SR();
  rec.lang = "es-ES";
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    state.isListening = true;
    setVoiceUiListening(true);
    stopSpeechIfAny();
  };

  rec.onresult = (e) => {
    const transcript = e.results[0][0].transcript.toLowerCase().trim();
    handleVoiceCommand(transcript);
  };

  rec.onend = () => {
    state.isListening = false;
    setVoiceUiListening(false);
  };

  rec.onerror = () => {
    state.isListening = false;
    setVoiceUiListening(false);
  };

  state.recognition = rec;
  setPill(pillVoice, false);

  voiceBtn?.addEventListener("click", () => {
    toggleVoiceRecognition();
  });
}

function toggleVoiceRecognition() {
  // Alterna el estado de escucha por voz iniciando o deteniendo el recognizer
  if (!state.recognition) return;

  if (state.isListening) {
    try {
      state.recognition.stop();
    } catch (_) {}
    return;
  }

  startVoiceRecognition();
}

function startVoiceRecognition() {
  // Inicia la grabación de voz si el recognizer está disponible y no está activo
  if (!state.recognition || state.isListening || state.isRecalculatingRoute) return;

  try {
    state.recognition.start();
  } catch (_) {}
}

function normalizeSpeech(text) {
  // Normaliza texto de voz eliminando acentos y espacios innecesarios
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getRemainingDistanceText() {
  // Obtiene el texto de distancia restante actual, si está disponible y es válido
  const raw = distVal?.textContent?.trim();
  return raw && raw !== "—" ? raw : null;
}

async function handleVoiceCommand(text) {
  // Interpreta comandos de voz básicos y ejecuta acciones como pausar o recalcular
  const normalized = normalizeSpeech(text);

  if (!normalized) return;

  emit("VOICE_COMMAND", {
    command: text,
    timestamp: Date.now()
  });

  if (
    normalized.includes("pausa ruta") ||
    normalized.includes("pausar ruta") ||
    normalized === "pausa" ||
    normalized === "pausar" ||
    normalized === "parar" ||
    normalized.includes("parar ruta")
  ) {
    if (state.isRoutePaused) return;
    pauseRoute("voice");
    return;
  }

  if (
    normalized.includes("reanudar ruta") ||
    normalized.includes("reanuda ruta") ||
    normalized.includes("continuar ruta") ||
    normalized.includes("continua ruta") ||
    normalized === "continuar" ||
    normalized === "reanudar" ||
    normalized === "reanuda" ||
    normalized === "continua"
  ) {
    if (!state.isRoutePaused) return;
    resumeRoute("voice");
    return;
  }

  if (
    normalized.includes("cuanto falta") ||
    normalized.includes("cuanto queda") ||
    normalized.includes("cuanta distancia") ||
    normalized === "distancia"
  ) {
    const remaining = getRemainingDistanceText();
    if (!remaining) return;

    speak(`Quedan ${remaining}.`);
    return;
  }

  if (
    normalized.includes("perdido") ||
    normalized.includes("ayuda")
  ) {
    if (state.isRoutePaused || state.isRecalculatingRoute) return;
    if (!state.currentPos) return;

    await recalculateRouteFromCurrentPosition("Recalculando la ruta.");
    return;
  }

  speak("Comando no reconocido.");
}

// ==== UI / VOZ / VIBRACIÓN ====

function vibrate(pattern) {
  // Envía patrón de vibración al dispositivo si está permitido y activo
  if (!state.hapticEnabled) return;
  if (!navigator.vibrate) return;
  if (!pattern || pattern.length === 0) return;
  if (state.isSpeaking || state.isListening) return;

  try {
    navigator.vibrate(0);
    navigator.vibrate(pattern);
  } catch (_) {}
}

function speak(text) {
  // Utiliza síntesis de voz para hablar un mensaje al usuario, si no hay reconocimiento activo
  if (!window.speechSynthesis) return;

  stopSpeechIfAny();

  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = "es-ES";
  utt.rate = 0.9;

  state.isSpeaking = true;
  state.speechSynthUtterance = utt;

  utt.onend = () => {
    state.isSpeaking = false;
    state.speechSynthUtterance = null;
  };

  utt.onerror = () => {
    state.isSpeaking = false;
    state.speechSynthUtterance = null;
  };

  window.speechSynthesis.speak(utt);
}

function setArrow(symbol, label) {
  // Actualiza el icono y la etiqueta de dirección en la interfaz
  arrowIcon.textContent = symbol;
  dirLabel.textContent = label;

  arrowIcon.classList.remove("pulse-anim");
  void arrowIcon.offsetWidth;
  arrowIcon.classList.add("pulse-anim");
}

function showAlert(msg, isError = true) {
  // Muestra un mensaje de alerta en la interfaz, con estilo de error o información según corresponda
  alertBanner.textContent = msg;
  alertBanner.className = "alert-banner" + (isError ? "" : " hidden");
  alertBanner.classList.remove("hidden");
}

function hideAlert() {
  // Oculta el mensaje de alerta
  alertBanner.classList.add("hidden");
}

function setPill(el, active) {
  // Activa o desactiva un indicador tipo "pill" en la interfaz según el estado dado
  if (!el) return;
  if (active) el.classList.add("active");
  else el.classList.remove("active");
}

function wait(ms) {
  // Devuelve una promesa que se resuelve después de un tiempo dado, útil para pausas en async/await
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==== GEO MATH ====

function haversine(lat1, lng1, lat2, lng2) {
  // Calcula distancia en metros entre dos coordenadas geográficas
  const R = 6371000;
  const dLat = deg2rad(lat2 - lat1);
  const dLng = deg2rad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) *
    Math.cos(deg2rad(lat2)) *
    Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcBearing(lat1, lng1, lat2, lng2) {
  // Calcula el rumbo entre dos puntos en grados desde norte verdadero
  const dLng = deg2rad(lng2 - lng1);

  const y = Math.sin(dLng) * Math.cos(deg2rad(lat2));
  const x =
    Math.cos(deg2rad(lat1)) * Math.sin(deg2rad(lat2)) -
    Math.sin(deg2rad(lat1)) *
    Math.cos(deg2rad(lat2)) *
    Math.cos(dLng);

  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function deg2rad(d) {
  // Convierte grados a radianes
  return d * Math.PI / 180;
}

function formatDist(m) {
  // Formatea una distancia en metros a un string legible, usando km si es apropiado
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function formatDuration(seconds) {
  // Formatea una duración en segundos a un string legible con horas y minutos
  const mins = Math.max(1, Math.ceil(seconds / 60));

  if (mins < 60) return `${mins} min`;

  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;

  if (remaining === 0) return `${hours} h`;
  return `${hours} h ${remaining} min`;
}
