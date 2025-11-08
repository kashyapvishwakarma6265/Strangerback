const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "https://stranger-xi.vercel.app",
  
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error('CORS Policy violation'), false);
    }
    return callback(null, true);
  },
  credentials: true,
}));

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  maxHttpBufferSize: 100 * 1024 * 1024
});

app.get('/', (req, res) => {
  res.json({ message: 'Socket.IO server is running' });
});

let waitingUsers = [];
let rooms = {};
let activeRooms = {};

io.on('connection', (socket) => {
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
      }
    }
  }

  waitingUsers.push(socket.id);
  socket.emit('waiting', { message: 'Looking for a stranger...' });
  pairUsers();

  socket.on('chat message', (data) => {
    const roomName = rooms[socket.id];
    if (roomName) {
      // Attach unique id if not present
      if (!data.id) data.id = Date.now().toString() + Math.random().toString(36).slice(2);

      // Tell sender it's sent
      socket.emit('message status', { id: data.id, status: 'sent' });

      // Relay message to receiver
      socket.to(roomName).emit('chat message', { ...data, sender: 'stranger' });

      // Tell sender delivered (right after relaying)
      socket.emit('message status', { id: data.id, status: 'delivered' });
    }
  });

  // Seen/read status: when receiver opens a message, call this
  socket.on('message seen', (data) => {
    const roomName = rooms[socket.id];
    if (roomName && data?.id) {
      socket.to(roomName).emit('message status', { id: data.id, status: 'seen' });
    }
  });

  socket.on('typing', (data) => {
    const roomName = rooms[socket.id];
    if (roomName) socket.to(roomName).emit('typing', { isTyping: data.isTyping });
  });

  socket.on('find next', () => {
    const roomName = rooms[socket.id];
    if (roomName) {
      socket.to(roomName).emit('stranger left', { message: 'Stranger has disconnected.' });
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
