const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true
  },
  // Key Fix: Allow large video/audio blobs!
  maxHttpBufferSize: 100 * 1024 * 1024 // 100 MB
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Socket.IO server is running' });
});

// State: waiting queue and room mappings
let waitingUsers = [];
let rooms = {};
let activeRooms = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  function pairUsers() {
    if (waitingUsers.length >= 2) {
      const user1 = waitingUsers.shift();
      const user2 = waitingUsers.shift();
      const roomName = `room-${user1}-${user2}`;
      rooms[user1] = roomName;
      rooms[user2] = roomName;
      activeRooms[roomName] = [user1, user2];

      const socket1 = io.sockets.sockets.get(user1);
      const socket2 = io.sockets.sockets.get(user2);

      if (socket1 && socket2) {
        socket1.join(roomName);
        socket2.join(roomName);
        io.to(roomName).emit('paired', { message: 'You are now connected with a stranger!', roomId: roomName });
        console.log(`Paired: ${user1} and ${user2}`);
      }
    }
  }

  waitingUsers.push(socket.id);
  socket.emit('waiting', { message: 'Looking for a stranger...' });
  pairUsers();

  // Relay userName and all data from frontend to paired stranger
  socket.on('chat message', (data) => {
    const roomName = rooms[socket.id];
    if (roomName) {
      console.log(`[chat] Relaying message from ${socket.id} -> room ${roomName}, type: ${data.type}, size: ${(data.mediaUrl ? data.mediaUrl.length : 0)} bytes`);
      socket.to(roomName).emit('chat message', {
        ...data,
        sender: 'stranger',
      });
    }
  });

  socket.on('typing', (data) => {
    const roomName = rooms[socket.id];
    if (roomName) {
      socket.to(roomName).emit('typing', { isTyping: data.isTyping });
    }
  });

  socket.on('find next', () => {
    const roomName = rooms[socket.id];
    if (roomName) {
      socket.to(roomName).emit('stranger left', {
        message: 'Stranger has disconnected.',
      });
      socket.leave(roomName);
      const roomUsers = activeRooms[roomName];
      if (roomUsers) {
        roomUsers.forEach((userId) => delete rooms[userId]);
        delete activeRooms[roomName];
      }
    }
    waitingUsers = waitingUsers.filter((id) => id !== socket.id);
    waitingUsers.push(socket.id);
    socket.emit('waiting', { message: 'Looking for a new stranger...' });
    pairUsers();
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const roomName = rooms[socket.id];
    if (roomName) {
      socket.to(roomName).emit('stranger left', { message: 'Stranger has disconnected.' });
      delete rooms[socket.id];
      delete activeRooms[roomName];
    }
    waitingUsers = waitingUsers.filter((id) => id !== socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
