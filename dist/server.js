const express = require('express');
const http = require('http');
const {
  Server
} = require('socket.io');
const cors = require('cors');
require('dotenv').config();
const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Enable CORS for Express
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));
app.get('/', (req, res) => {
  res.json({
    message: 'Socket.IO server is running'
  });
});

// Store waiting users and room mappings
let waitingUsers = [];
let rooms = {};
let activeRooms = {};
io.on('connection', socket => {
  console.log(`User connected: ${socket.id}`);

  // Function to pair users
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
        io.to(roomName).emit('paired', {
          message: 'You are now connected with a stranger!'
        });
        console.log(`Paired: ${user1} and ${user2}`);
      }
    }
  }

  // Add user to waiting queue
  waitingUsers.push(socket.id);
  socket.emit('waiting', {
    message: 'Looking for a stranger...'
  });
  pairUsers();

  // Handle messages
  socket.on('chat message', data => {
    const roomName = rooms[socket.id];
    if (roomName) {
      socket.to(roomName).emit('chat message', {
        message: data.message,
        sender: 'stranger'
      });
    }
  });

  // Handle typing
  socket.on('typing', data => {
    const roomName = rooms[socket.id];
    if (roomName) {
      socket.to(roomName).emit('typing', {
        isTyping: data.isTyping
      });
    }
  });

  // Handle find next
  socket.on('find next', () => {
    const roomName = rooms[socket.id];
    if (roomName) {
      socket.to(roomName).emit('stranger left', {
        message: 'Stranger has disconnected.'
      });
      socket.leave(roomName);
      const roomUsers = activeRooms[roomName];
      if (roomUsers) {
        roomUsers.forEach(userId => delete rooms[userId]);
        delete activeRooms[roomName];
      }
    }
    waitingUsers = waitingUsers.filter(id => id !== socket.id);
    waitingUsers.push(socket.id);
    socket.emit('waiting', {
      message: 'Looking for a new stranger...'
    });
    pairUsers();
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const roomName = rooms[socket.id];
    if (roomName) {
      socket.to(roomName).emit('stranger left', {
        message: 'Stranger has disconnected.'
      });
      delete rooms[socket.id];
      delete activeRooms[roomName];
    }
    waitingUsers = waitingUsers.filter(id => id !== socket.id);
  });
});
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});