const path = require('path');
const express = require('express');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const dotenv = require('dotenv');
const http = require('http');                       // NEW: HTTP module
const { Server } = require('socket.io');            // NEW: socket.io server
// ensure we load the .env from project root (one level above server/)
const dotEnvPath = path.join(__dirname, '..', '.env');
const envResult = require('dotenv').config({ path: dotEnvPath });
if (envResult.error) {
  console.warn('dotenv: no .env loaded from', dotEnvPath, '-', String(envResult.error));
} else {
  console.log('.env loaded from', dotEnvPath);
}

// define TLS diagnostic flag (ensure it's available before connectMongoOrExit uses it)
const MONGODB_TLS_ALLOW_INVALID = String(process.env.MONGODB_TLS_ALLOW_INVALID || 'false').toLowerCase() === 'true';
console.log('MONGODB_URI present:', typeof process.env.MONGODB_URI === 'string' && process.env.MONGODB_URI.trim().length > 0 ? 'yes' : 'no', (process.env.MONGODB_URI || '').trim() ? `(length ${process.env.MONGODB_URI.trim().length})` : '');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || '';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// simple hash (use bcrypt in production)
function hashPassword(p){ return crypto.createHash('sha256').update(String(p)).digest('hex'); }

// connect to MongoDB (fail fast if not configured)
let client = null;
let usersCol = null;
let roomsCol = null; // NEW: rooms collection

async function connectMongoOrExit(){
  if(!MONGODB_URI){
    console.error('FATAL: MONGODB_URI not set. Copy .env.example -> .env and set MONGODB_URI. Exiting.');
    process.exit(1);
  }
  try{
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(); // DB picked from URI or default
    usersCol = db.collection('users');
    roomsCol = db.collection('rooms'); // NEW
    await usersCol.createIndex({ email: 1 }, { unique: true });
    await roomsCol.createIndex({ id: 1 }, { unique: true }); // NEW - ensure unique id index
    console.log('Connected to MongoDB:', db.databaseName || '(unknown)');
  }catch(err){
    console.error('FATAL: Failed to connect to MongoDB Atlas:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

// add diagnostic helpers for SRV/A/TLS debugging
const dns = require('dns').promises;
const tls = require('tls');

async function runTLSDiagnostics(uri) {
	// extract host from mongodb+srv or standard URI
	try {
		const m = uri.match(/@([^/]+)(?:\/|$)/);
		const hostPart = m ? m[1] : uri;
		// for SRV, host is like cluster0.zcf33yo.mongodb.net (may include replicaSet suffix)
		const host = hostPart.split(',')[0].split(':')[0];
		console.log('Diagnostics: resolving SRV for', host);
		let srvRecords = [];
		try {
			srvRecords = await dns.resolveSrv('_mongodb._tcp.' + host);
			console.log('SRV records:', srvRecords.map(r=>`${r.name}:${r.port}`));
		} catch(e){ console.warn('No SRV records or SRV lookup failed:', String(e.message || e)); }

		const targets = [];
		if(srvRecords && srvRecords.length){
			for(const r of srvRecords){
				targets.push({ host: r.name, port: r.port });
			}
		} else {
			// fall back to the host itself (default mongodb+srv ports)
			targets.push({ host, port: 27017 });
		}

		for(const t of targets){
			// resolve A records for each target
			try{
				const addrs = await dns.resolve4(t.host);
				console.log(`A records for ${t.host}:`, addrs);
				for(const ip of addrs){
					await tryTLSConnect(ip, t.port, host);
				}
			}catch(e){
				console.warn(`Failed to resolve A records for ${t.host}:`, String(e.message || e));
				// still attempt TLS to hostname (may rely on DNS)
				await tryTLSConnect(t.host, t.port, host);
			}
		}
	} catch(e){
		console.warn('Diagnostics failure:', String(e && e.message ? e.message : e));
	}
}

function tryTLSConnect(hostOrIp, port, sniServername){
	return new Promise((resolve)=> {
		const opts = { host: hostOrIp, port: port, servername: sniServername, rejectUnauthorized: true, timeout: 6000 };
		const sock = tls.connect(opts, function(){
			console.log(`TLS handshake succeeded to ${hostOrIp}:${port} (SNI=${sniServername})`);
			sock.end();
			resolve();
		});
		sock.on('error', (err)=>{
			console.warn(`TLS handshake error to ${hostOrIp}:${port} (SNI=${sniServername}):`, err && err.message ? err.message : err);
			resolve();
		});
		sock.setTimeout(6000, ()=> { console.warn(`TLS connect timeout to ${hostOrIp}:${port}`); sock.destroy(); resolve(); });
	});
}

// health
app.get('/api/health', async (req,res)=>{
  try{
    if(!client) return res.status(503).json({ ok:false, mongo:'disconnected' });
    await client.db().command({ ping:1 });
    return res.json({ ok:true, mongo:'connected' });
  }catch(e){ return res.status(503).json({ ok:false, mongo:'disconnected', error:String(e) }); }
});

// register
app.post('/api/register', async (req,res)=>{
  try{
    const { name, surname, email, country, gender, password } = req.body || {};
    if(!name || !surname || !email || !country || !gender || !password){
      return res.status(400).json({ error:'Missing fields' });
    }
    const doc = {
      name: String(name).trim(),
      surname: String(surname).trim(),
      email: String(email).trim().toLowerCase(),
      country: String(country).trim(),
      gender: String(gender).trim(),
      avatar: (String(name)[0]||'U').toUpperCase(),
      level: 1,
      createdAt: new Date()
    };
    const passwordHash = hashPassword(password);
    await usersCol.insertOne(Object.assign({}, doc, { passwordHash }));
    return res.status(201).json({ ok:true, user: doc });
  }catch(err){
    if(err && err.code === 11000) return res.status(409).json({ error:'Email already exists' });
    console.error('Register error', err);
    return res.status(500).json({ error:'Server error' });
  }
});

// login
app.post('/api/login', async (req,res)=>{
  try{
    const { email, password } = req.body || {};
    if(!email || !password) return res.status(400).json({ error:'Email and password required' });
    const u = await usersCol.findOne({ email: String(email).trim().toLowerCase() });
    if(!u) return res.status(401).json({ error:'Invalid credentials' });
    if(u.passwordHash !== hashPassword(password)) return res.status(401).json({ error:'Invalid credentials' });
    const userResp = { name: u.name, surname: u.surname, email: u.email, country: u.country, level: u.level || 1, avatar: u.avatar || (u.name?u.name.charAt(0).toUpperCase():'U') };
    return res.json({ ok:true, user: userResp });
  }catch(err){
    console.error('Login error', err);
    return res.status(500).json({ error:'Server error' });
  }
});

// Replace previous server start with HTTP server + io (move this to after connectMongoOrExit)
(async ()=>{
  await connectMongoOrExit();

  // create HTTP server and Socket.IO
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { /* cors: { origin: '*' } */ });

  const creatorSocketMap = new Map(); // roomId -> socketId
  const socketCreatorMap = new Map(); // socketId -> roomId

  // Socket handlers
  io.on('connection', (socket)=>{
    // allow clients to subscribe to room channels
    socket.on('subscribe', (roomId)=> { socket.join('room:' + roomId); });
    socket.on('unsubscribe', (roomId)=> { socket.leave('room:' + roomId); });

    // register this socket as the creator for a room (called from game.html by creator)
    socket.on('registerCreator', async ({ roomId, creatorId }) => {
      try {
        if (!roomId) return;
        
        // Check if the room exists and the creator matches
        const room = await roomsCol.findOne({ id: String(roomId) });
        if (!room) {
          console.log(`Room ${roomId} not found for creator registration`);
          return;
        }
        
        // Only allow the actual creator to register as creator
        if (room.creatorId !== creatorId) {
          console.log(`Creator ID mismatch for room ${roomId}`);
          return;
        }
        
        // Clean up any previous registration for this room
        const oldSocketId = creatorSocketMap.get(roomId);
        if (oldSocketId) {
          socketCreatorMap.delete(oldSocketId);
        }
        
        // Register the new socket as the creator
        creatorSocketMap.set(roomId, socket.id);
        socketCreatorMap.set(socket.id, { roomId, creatorId });
        
        // ensure socket also joins its room channel
        socket.join('room:' + roomId);
        console.log(`Socket ${socket.id} registered as creator for room ${roomId}`);
        
        // Notify all clients in the room that the host is back
        io.to('room:' + roomId).emit('hostReconnected', { roomId });
      } catch (e) { 
        console.warn('registerCreator error', e && e.message); 
      }
    });

    socket.on('disconnect', async () => {
      const creatorInfo = socketCreatorMap.get(socket.id);
      if (!creatorInfo) return;
      
      const { roomId, creatorId } = creatorInfo;
      
      try {
        // Remove socket mappings
        socketCreatorMap.delete(socket.id);
        creatorSocketMap.delete(roomId);
        
        // Find the room in the database
        const room = await roomsCol.findOne({ id: String(roomId) });
        if (!room) return;
        
        // Only delete the room if it's not password-protected
        if (!room.password) {
          await roomsCol.deleteOne({ id: String(roomId) });
          
          // Notify all clients in the room that it's closed
          io.to('room:' + roomId).emit('roomClosed', { 
            roomId, 
            reason: 'host_left', 
            message: 'Server egasi chiqib ketdi' 
          });
          
          // Notify everyone to update their room lists
          io.emit('roomDeleted', { roomId });
          console.log(`Room ${roomId} deleted because creator disconnected`);
        } else {
          // For password-protected rooms, just notify that the host left
          io.to('room:' + roomId).emit('hostDisconnected', { 
            roomId,
            message: 'Server egasi chiqib ketdi. Xona parol bilan himoyalangan, shuning uchun yopilmaydi.'
          });
        }
      } catch (e) {
        console.error('Error handling creator disconnect:', e && e.message);
      }
    });
  });

  // --- Rooms API (new) ---
  app.get('/api/rooms', async (req, res) => {
    try {
      const list = await roomsCol.find({}).sort({ createdAt: -1 }).toArray();
      const safe = list.map(r => ({
        id: r.id,
        name: r.name,
        size: r.size,
        joined: Array.isArray(r.joined) ? r.joined.length : 0,
        locked: !!(r.password && String(r.password).length),
        createdAt: r.createdAt
      }));
      res.json(safe);
    } catch(err){ console.error(err); res.status(500).json({ error:'Failed to list rooms' }); }
  });

  app.get('/api/rooms/:id', async (req, res) => {
    try {
      const r = await roomsCol.findOne({ id: String(req.params.id) });
      if(!r) return res.status(404).json({ error: 'Not found' });
      const copy = Object.assign({}, r); delete copy.password;
      res.json(copy);
    } catch(err){ console.error(err); res.status(500).json({ error:'Failed to get room' }); }
  });

  app.post('/api/rooms', async (req, res) => {
    try {
      const { name, size, password, host, creatorName, creatorId } = req.body || {};
      if(!name) return res.status(400).json({ error: 'Name required' });
      const room = {
        id: Date.now().toString(),
        name,
        size: Number(size) || 8,
        host: host || creatorName || 'Host',
        creatorName: creatorName || 'Host',
        creatorId: creatorId || ('guest_' + Date.now()),
        password: password ? String(password) : '',
        invited: [],
        joined: [ creatorName || 'Host' ],
        createdAt: new Date()
      };
      await roomsCol.insertOne(room);
      // emit to all clients
      io.emit('roomCreated', { id: room.id, name: room.name, size: room.size, joined: room.joined.length, password: !!room.password });
      // Respond with room id (creator will be redirected)
      res.json({ ok:true, id: room.id, ...room });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Create failed' }); }
  });

  app.post('/api/rooms/:id/join', async (req, res) => {
    try {
      const { name, password, creatorId } = req.body || {};
      const room = await roomsCol.findOne({ id: String(req.params.id) });
      if(!room) return res.status(404).json({ error: 'Ushbu xona topilmadi' });
      
      // Prevent joining own game
      if (room.creatorId === creatorId) {
        return res.status(400).json({ error: "O'z xonangizga qo'shila olmaysiz" });
      }
      
      // Check password if room is locked
      if(room.password && room.password !== (password || '')) {
        return res.status(403).json({ error: 'Noto\'g\'ri parol' });
      }
      
      // Check if room is full
      if (Array.isArray(room.joined) && room.joined.length >= room.size) {
        return res.status(400).json({ error: 'Xona to\'la' });
      }
      
      // Prevent duplicates
      const already = Array.isArray(room.joined) && room.joined.includes(name);
      if(!already) {
        const updated = await roomsCol.findOneAndUpdate(
          { id: room.id },
          { $addToSet: { joined: name } },
          { returnDocument: 'after' }
        );
        const newRoom = updated.value || room;
        io.emit('roomUpdated', { 
          roomId: room.id, 
          room: { 
            id: newRoom.id, 
            name: newRoom.name, 
            size: newRoom.size, 
            joined: newRoom.joined.length, 
            password: !!newRoom.password 
          } 
        });
        io.to('room:' + room.id).emit('playerJoined', { roomId: room.id, name });
      }
      return res.json({ ok: true, roomId: room.id });
    } catch (err) { 
      console.error(err); 
      res.status(500).json({ error: 'Qo\'shilishda xatolik' }); 
    }
  });

  // update room (change password) - only creator allowed
  app.patch('/api/rooms/:id', async (req, res) => {
    try {
      const id = String(req.params.id);
      const { creatorId, password } = req.body || {};
      if(!creatorId) return res.status(400).json({ error: 'creatorId required' });
      const room = await roomsCol.findOne({ id });
      if(!room) return res.status(404).json({ error: 'Room not found' });
      if(String(room.creatorId) !== String(creatorId)) return res.status(403).json({ error: 'Not authorized' });
      const newVal = password ? String(password) : '';
      await roomsCol.updateOne({ id }, { $set: { password: newVal } });
      const payload = { id: room.id, locked: !!newVal };
      io.emit('roomUpdated', { roomId: id, room: payload });
      return res.json({ ok:true, room: payload });
    } catch(err) { console.error(err); return res.status(500).json({ error: 'Update failed' }); }
  });

  // delete room - only creator allowed
  app.delete('/api/rooms/:id', async (req, res) => {
    try {
      const id = String(req.params.id);
      const { creatorId } = req.body || {};
      if(!creatorId) return res.status(400).json({ error: 'creatorId required' });
      const room = await roomsCol.findOne({ id });
      if(!room) return res.status(404).json({ error: 'Room not found' });
      if(String(room.creatorId) !== String(creatorId)) return res.status(403).json({ error: 'Not authorized' });
      await roomsCol.deleteOne({ id });
      io.to('room:' + id).emit('roomClosed', { roomId: id, reason: 'owner_deleted', message: 'Server egasi tomonidan yopildi' });
      io.emit('roomDeleted', { roomId: id });
      return res.json({ ok:true });
    } catch(err) { console.error(err); return res.status(500).json({ error: 'Delete failed' }); }
  });

  // Clean up empty rooms periodically
  setInterval(async () => {
    try {
      const rooms = await roomsCol.find({}).toArray();
      const now = new Date();
      
      for (const room of rooms) {
        const roomAge = now - new Date(room.createdAt);
        const isPasswordProtected = !!room.password;
        const isEmpty = !Array.isArray(room.joined) || room.joined.length === 0;
        const isOld = roomAge > 3600000; // 1 hour
        
        // Remove room if it's empty and either old or not password-protected
        if (isEmpty && (!isPasswordProtected || isOld)) {
          await roomsCol.deleteOne({ id: room.id });
          io.emit('roomDeleted', { roomId: room.id });
          console.log(`Cleaned up room: ${room.id}`);
        }
      }
    } catch (err) {
      console.error('Error cleaning up rooms:', err);
    }
  }, 5 * 60 * 1000); // Check every 5 minutes

  // start server
  httpServer.listen(PORT, ()=> console.log(`Server listening ${PORT} with Socket.IO`));

  // graceful shutdown
  process.on('SIGINT', async ()=>{ try{ if(client) await client.close(); }catch(e){} process.exit(0); });
})();
