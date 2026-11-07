const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { ExpressPeerServer } = require('peer');
const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(origin => origin.trim());
const corsOptions = { origin: allowedOrigins.includes('*') ? '*' : allowedOrigins, methods: ['GET', 'POST'] };

app.use(cors(corsOptions));
app.use(express.json());

const io = new Server(server, { cors: corsOptions });

// Mount the PeerJS signaling server under /peerjs. The browser client must use
// the same path and connect to this server's public HTTPS origin.
const peerServer = ExpressPeerServer(server, { debug: process.env.NODE_ENV !== 'production', path: '/' });
app.use('/peerjs', peerServer);

app.get('/', (req, res) => res.send('Video Conference Signaling Server is running.'));

app.get('/rooms/:roomId', async (req, res) => {
  const { roomId } = req.params;
  if (!sql) return res.status(503).json({ error: 'Room database is not configured' });
  try {
    const rooms = await sql`SELECT * FROM rooms WHERE room_id = ${roomId}`;
    if (rooms.length === 0) return res.status(404).json({ error: 'Room not found' });
    const participants = await sql`SELECT * FROM participants WHERE room_id = ${roomId} AND left_at IS NULL`;
    res.json({ room: rooms[0], participants });
  } catch (err) {
    console.error('Room lookup failed:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/rooms', async (req, res) => {
  if (!sql) return res.status(503).json({ error: 'Room database is not configured' });
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
    console.error('Room list failed:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join-room', async (roomId, peerId) => {
    if (typeof roomId !== 'string' || !roomId.trim() || typeof peerId !== 'string' || !peerId.trim()) {
      socket.emit('room-error', 'Invalid room or peer ID.');
      return;
    }

    const normalizedRoomId = roomId.trim();
    const normalizedPeerId = peerId.trim();
    if (socket.data.roomId === normalizedRoomId && socket.data.peerId === normalizedPeerId) return;

    if (socket.data.roomId) socket.leave(socket.data.roomId);
    socket.data.roomId = normalizedRoomId;
    socket.data.peerId = normalizedPeerId;
    await socket.join(normalizedRoomId);

    // Tell the newcomer about everyone already in the room. Without this,
    // only people who join later are announced and a late joiner sees no one.
    const roomSockets = await io.in(normalizedRoomId).fetchSockets();
    const existingPeerIds = roomSockets
      .filter(roomSocket => roomSocket.id !== socket.id && roomSocket.data.peerId)
      .map(roomSocket => roomSocket.data.peerId);
    socket.emit('existing-users', existingPeerIds);
    socket.to(normalizedRoomId).emit('user-connected', normalizedPeerId);

    if (sql) {
      try {
        await sql`INSERT INTO rooms (room_id) VALUES (${normalizedRoomId}) ON CONFLICT (room_id) DO UPDATE SET last_active = NOW()`;
        await sql`INSERT INTO participants (room_id, peer_id) VALUES (${normalizedRoomId}, ${normalizedPeerId})`;
      } catch (err) {
        // WebRTC room signaling should still work if optional room history DB is unavailable.
        console.error('DB error on join:', err);
      }
    }
    console.log(`Peer ${normalizedPeerId} joined room ${normalizedRoomId}`);
  });

  socket.on('disconnect', async () => {
    const { roomId, peerId } = socket.data;
    if (!roomId || !peerId) return;
    socket.to(roomId).emit('user-disconnected', peerId);
    if (sql) {
      try {
        await sql`UPDATE participants SET left_at = NOW() WHERE room_id = ${roomId} AND peer_id = ${peerId} AND left_at IS NULL`;
      } catch (err) {
        console.error('DB error on disconnect:', err);
      }
    }
    console.log(`Peer ${peerId} disconnected from room ${roomId}`);
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Video conference signaling server listening on port ${PORT}`));
