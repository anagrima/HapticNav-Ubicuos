/* HapticNav — server.js */

// Servidor Express y Socket.IO: maneja salas y sincronización en tiempo real

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, "public"), { index: false }));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

// Mapa de salas: cada sala mantiene su estado y participantes
const rooms = {};

function createInitialState() {
  // Estado inicial compartido por cada sala (posiciones, ruta, destino, etc.)
  return {
    position: null,
    direction: null,
    stopped: false,
    wrongDirection: false,
    destination: null,
    route: null
  };
}

function ensureRoom(roomId) {
  // Asegura que exista una sala con el ID dado, creando una nueva si es necesario
  if (!rooms[roomId]) {
    rooms[roomId] = {
      navigatorId: null,
      companions: new Set(),
      state: createInitialState()
    };
  }
  return rooms[roomId];
}

// Maneja nuevas conexiones Socket.IO y registra eventos y handlers por socket
io.on("connection", (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  // Evento para unirse como navegador principal y compartir rol con la sala
  socket.on("JOIN_AS_NAVIGATOR", ({ roomId }) => {
    const room = ensureRoom(roomId);

    socket.join(roomId);
    socket.data.role = "navigator";
    socket.data.roomId = roomId;

    room.navigatorId = socket.id;

    console.log(`[NAV] ${socket.id} joined room ${roomId}`);
    socket.emit("JOINED", { role: "navigator", roomId });

    io.to(roomId).emit("NAVIGATOR_ONLINE", { navigatorId: socket.id });
  });

  // Evento para unirse como acompañante y recibir snapshot del estado
  socket.on("JOIN_AS_COMPANION", ({ roomId }) => {
    const room = ensureRoom(roomId);

    socket.join(roomId);
    socket.data.role = "companion";
    socket.data.roomId = roomId;

    room.companions.add(socket.id);

    console.log(`[COMP] ${socket.id} joined room ${roomId}`);
    socket.emit("JOINED", { role: "companion", roomId });

    socket.emit("STATE_SNAPSHOT", room.state);

    if (room.navigatorId) {
      socket.emit("NAVIGATOR_ONLINE", { navigatorId: room.navigatorId });
    } else {
      socket.emit("ROOM_EMPTY");
    }
  });

  // Actualiza el destino compartido en el estado de la sala y reemite el evento
  socket.on("DESTINATION_SET", (data) => {
    const { roomId } = socket.data;
    if (!roomId) return;

    const room = ensureRoom(roomId);
    room.state.destination = data;
    socket.to(roomId).emit("DESTINATION_SET", data);
  });

  // Actualiza datos de la ruta y opcionalmente el destino, luego reemite
  socket.on("ROUTE_DATA", (data) => {
    const { roomId } = socket.data;
    if (!roomId) return;

    const room = ensureRoom(roomId);
    room.state.route = data.route || null;

    if (data.destination) {
      room.state.destination = data.destination;
    }

    socket.to(roomId).emit("ROUTE_DATA", data);
  });

  // Recibe actualizaciones de posición del navegador y las guarda en el estado
  socket.on("POSITION_UPDATE", (data) => {
    const { roomId } = socket.data;
    if (!roomId) return;

    const room = ensureRoom(roomId);
    room.state.position = data;
    socket.to(roomId).emit("POSITION_UPDATE", data);
  });

  // Recibe y propaga la siguiente indicación de dirección
  socket.on("NEXT_DIRECTION", (data) => {
    const { roomId } = socket.data;
    if (!roomId) return;

    const room = ensureRoom(roomId);
    room.state.direction = data;
    socket.to(roomId).emit("NEXT_DIRECTION", data);
  });

  // Marca el estado detenido del usuario y notifica a la sala
  socket.on("STOPPED", (data) => {
    const { roomId } = socket.data;
    if (!roomId) return;

    const room = ensureRoom(roomId);
    room.state.stopped = true;
    socket.to(roomId).emit("STOPPED", data);
  });

  // Marca que el usuario se ha puesto en movimiento y notifica a la sala
  socket.on("MOVING", (data) => {
    const { roomId } = socket.data;
    if (!roomId) return;

    const room = ensureRoom(roomId);
    room.state.stopped = false;
    socket.to(roomId).emit("MOVING", data);
  });

  // Reenvía comandos de voz a los demás clientes de la sala
  socket.on("VOICE_COMMAND", (data) => {
    const { roomId } = socket.data;
    if (!roomId) return;
    socket.to(roomId).emit("VOICE_COMMAND", data);
  });

  // Indica que se detectó una dirección errónea y lo marca temporalmente
  socket.on("WRONG_DIRECTION", (data) => {
    const { roomId } = socket.data;
    if (!roomId) return;

    const room = ensureRoom(roomId);
    room.state.wrongDirection = true;
    socket.to(roomId).emit("WRONG_DIRECTION", data);

    setTimeout(() => {
      if (rooms[roomId]) rooms[roomId].state.wrongDirection = false;
    }, 5000);
  });

  // Maneja mensajes rápidos enviados por un acompañante hacia el navegador
  socket.on("COMPANION_QUICK_MESSAGE", (data) => {
    const { roomId, role } = socket.data;
    if (!roomId || role !== "companion") return;

    const room = ensureRoom(roomId);
    if (!room.navigatorId) {
      socket.emit("ROOM_EMPTY");
      return;
    }

    io.to(room.navigatorId).emit("COMPANION_QUICK_MESSAGE", {
      message: data.message,
      timestamp: data.timestamp || Date.now(),
      from: socket.id
    });
  });

  // Limpia referencias y notifica a la sala cuando un cliente se desconecta
  socket.on("disconnect", () => {
    const { roomId, role } = socket.data;
    if (!roomId || !rooms[roomId]) {
      console.log(`[DISCONNECT] ${socket.id} (${role || "unknown"})`);
      return;
    }

    const room = rooms[roomId];

    if (role === "navigator") {
      room.navigatorId = null;
      io.to(roomId).emit("NAVIGATOR_OFFLINE");
      io.to(roomId).emit("ROOM_EMPTY");
    }

    if (role === "companion") {
      room.companions.delete(socket.id);
    }

    if (!room.navigatorId && room.companions.size === 0) {
      delete rooms[roomId];
    }

    console.log(`[DISCONNECT] ${socket.id} (${role || "unknown"})`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🧭 HapticNav server running → http://localhost:${PORT}`);
  console.log("\nPara cerrar el servidor: presiona Ctrl+C\n");
});

// Manejo de salida limpia (Ctrl+C -> SIGINT, y SIGTERM)
function gracefulShutdown() {
  console.log("Cerrando servidor de forma segura...\n");

  try {
    // Cerrar conexiones de Socket.IO
    if (io) {
      try { io.close(); } catch (e) { /* ignore */ }
    }

    // Cerrar servidor HTTP
    server.close(() => {
      console.log("Servidor cerrado");
      process.exit(0);
    });

    // Forzar cierre si no termina en 5s
    setTimeout(() => {
      console.error("Forzando cierre del proceso\n");
      process.exit(1);
    }, 5000);
  } catch (err) {
    console.error("\nError durante el cierre:", err);
    process.exit(1);
  }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);