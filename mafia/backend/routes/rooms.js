const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// Mock rooms database (in production, use MongoDB)
let rooms = [
  {
    id: 'room1',
    name: 'Beginner Room',
    size: 6,
    players: [],
    password: null,
    isPrivate: false,
    creatorId: 'admin',
    creatorName: 'Admin',
    createdAt: new Date(),
    status: 'waiting'
  },
  {
    id: 'room2',
    name: 'Private Game',
    size: 8,
    players: [],
    password: '1234',
    isPrivate: true,
    creatorId: 'user1',
    creatorName: 'Player1',
    createdAt: new Date(),
    status: 'waiting'
  }
];

// Get all rooms
router.get('/', (req, res) => {
  try {
    const roomsWithPlayerCount = rooms.map(room => ({
      ...room,
      playerCount: room.players.length,
      isFull: room.players.length >= room.size,
      password: undefined // Don't send password to client
    }));
    
    res.json(roomsWithPlayerCount);
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new room
router.post('/', authMiddleware, (req, res) => {
  try {
    const { name, size, password, host } = req.body;
    const user = req.user;

    // Validation
    if (!name || !size || !host) {
      return res.status(400).json({ 
        error: 'Name, size, and host are required' 
      });
    }

    if (size < 4 || size > 12) {
      return res.status(400).json({ 
        error: 'Room size must be between 4 and 12' 
      });
    }

    // Create room
    const room = {
      id: 'room_' + Date.now(),
      name: name.trim(),
      size: parseInt(size),
      players: [],
      password: password || null,
      isPrivate: !!password,
      creatorId: user.id,
      creatorName: user.name || host,
      createdAt: new Date(),
      status: 'waiting'
    };

    rooms.push(room);

    res.status(201).json({
      message: 'Room created successfully',
      room: {
        ...room,
        password: undefined,
        playerCount: 0,
        isFull: false
      }
    });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Join room
router.post('/:id/join', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { name, password } = req.body;
    const user = req.user;

    const room = rooms.find(r => r.id === id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if room is full
    if (room.players.length >= room.size) {
      return res.status(400).json({ error: 'Room is full' });
    }

    // Check password for private rooms
    if (room.isPrivate && room.password !== password) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Check if player already in room
    const existingPlayer = room.players.find(p => p.id === user.id);
    if (existingPlayer) {
      return res.status(400).json({ error: 'Already in room' });
    }

    // Add player to room
    const player = {
      id: user.id,
      name: name || user.name,
      joinedAt: new Date(),
      isReady: false
    };

    room.players.push(player);

    res.json({
      message: 'Joined room successfully',
      room: {
        ...room,
        password: undefined,
        playerCount: room.players.length,
        isFull: room.players.length >= room.size
      }
    });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Leave room
router.post('/:id/leave', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const room = rooms.find(r => r.id === id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Remove player from room
    room.players = room.players.filter(p => p.id !== user.id);

    // Delete room if empty and not created by admin
    if (room.players.length === 0 && room.creatorId !== 'admin') {
      rooms = rooms.filter(r => r.id !== id);
      return res.json({ message: 'Room deleted (empty)' });
    }

    res.json({
      message: 'Left room successfully',
      room: {
        ...room,
        password: undefined,
        playerCount: room.players.length,
        isFull: false
      }
    });
  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update room (only creator)
router.patch('/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const user = req.user;

    const room = rooms.find(r => r.id === id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if user is room creator
    if (room.creatorId !== user.id) {
      return res.status(403).json({ error: 'Only room creator can update room' });
    }

    // Update password
    if (password !== undefined) {
      room.password = password || null;
      room.isPrivate = !!password;
    }

    res.json({
      message: 'Room updated successfully',
      room: {
        ...room,
        password: undefined,
        playerCount: room.players.length,
        isFull: room.players.length >= room.size
      }
    });
  } catch (error) {
    console.error('Update room error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete room (only creator)
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const roomIndex = rooms.findIndex(r => r.id === id);
    if (roomIndex === -1) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const room = rooms[roomIndex];

    // Check if user is room creator
    if (room.creatorId !== user.id) {
      return res.status(403).json({ error: 'Only room creator can delete room' });
    }

    rooms.splice(roomIndex, 1);

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get room details
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const room = rooms.find(r => r.id === id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({
      ...room,
      password: undefined,
      playerCount: room.players.length,
      isFull: room.players.length >= room.size
    });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
