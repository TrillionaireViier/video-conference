const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { ExpressPeerServer } = require('peer');
const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const sql = neon(process.env.DATABASE_URL);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));

app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// PeerJS Server
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/myapp'
});
app.use('/peerjs', peerServer);

app.get('/', (req, res) => {
  res.send('Video Conference Signaling Server is running.');
});

// GET /rooms/:id — info about a room
app.get('/rooms/:roomId', async (req, res) => {
  const { roomId } = req.params;
  try {
    const rooms = await sql`SELECT * FROM rooms WHERE room_id = ${roomId}`;
    if (rooms.length === 0) return res.status(404).json({ error: 'Room not found' });

    const participants = await sql`
      SELECT * FROM participants WHERE room_id = ${roomId} AND left_at IS NULL
    `;
    res.json({ room: rooms[0], participants });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// GET /rooms — list all active rooms
app.get('/rooms', async (req, res) => {
  try {
    const rooms = await sql`
      SELECT r.*, COUNT(p.id) FILTER (WHERE p.left_at IS NULL) AS active_participants
      FROM rooms r
      LEFT JOIN participants p ON p.room_id = r.room_id
      GROUP BY r.id
      ORDER BY r.last_active DESC
    `;
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Socket.io for room signaling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join-room', async (roomId, userId) => {
    socket.join(roomId);
    console.log(`User ${userId} joined room ${roomId}`);

    try {
      // Upsert room
      await sql`
        INSERT INTO rooms (room_id) VALUES (${roomId})
        ON CONFLICT (room_id) DO UPDATE SET last_active = NOW()
      `;
      // Record participant
      await sql`
        INSERT INTO participants (room_id, peer_id) VALUES (${roomId}, ${userId})
      `;
    } catch (err) {
      console.error('DB error on join:', err);
    }

    socket.to(roomId).emit('user-connected', userId);

    socket.on('disconnect', async () => {
      console.log(`User ${userId} disconnected from room ${roomId}`);
      socket.to(roomId).emit('user-disconnected', userId);

      try {
        await sql`
          UPDATE participants SET left_at = NOW()
          WHERE room_id = ${roomId} AND peer_id = ${userId} AND left_at IS NULL
        `;
      } catch (err) {
        console.error('DB error on disconnect:', err);
      }
    });
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
