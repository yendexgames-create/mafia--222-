const path = require('path');
const express = require('express');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

// Load environment variables
const dotEnvPath = path.join(__dirname, '..', '.env');
const envResult = require('dotenv').config({ path: dotEnvPath });
if (envResult.error) {
  console.warn('dotenv: no .env loaded from', dotEnvPath, '-', String(envResult.error));
} else {
  console.log('.env loaded from', dotEnvPath);
}

// Configuration
const MONGODB_TLS_ALLOW_INVALID = String(process.env.MONGODB_TLS_ALLOW_INVALID || 'false').toLowerCase() === 'true';
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || '';

console.log('=== MafiaArena Server Starting ===');
console.log('Environment:', NODE_ENV);
console.log('Port:', PORT);
console.log('MongoDB URI present:', typeof MONGODB_URI === 'string' && MONGODB_URI.trim().length > 0 ? 'yes' : 'no');

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS for Railway
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin.includes('railway.app') || origin.includes('localhost')) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Static files
app.use(express.static(path.join(__dirname, '..', 'frontend'), {
  maxAge: NODE_ENV === 'production' ? '1d' : '0',
  etag: true,
  lastModified: true
}));

// Security headers
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  next();
});

// Utility functions
function hashPassword(p) { 
  return crypto.createHash('sha256').update(String(p)).digest('hex'); 
}

// Database connection
let client = null;
let usersCol = null;
let roomsCol = null;

async function connectMongoOrExit() {
  if (!MONGODB_URI) {
    console.error('FATAL: MONGODB_URI not set. Please set MONGODB_URI environment variable.');
    if (NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn('Running without database in development mode');
      return;
    }
  }

  try {
    console.log('Connecting to MongoDB...');
    const clientOptions = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      tls: MONGODB_TLS_ALLOW_INVALID ? undefined : true,
      tlsAllowInvalidCertificates: MONGODB_TLS_ALLOW_INVALID
    };

    client = new MongoClient(MONGODB_URI, clientOptions);
    await client.connect();
    const db = client.db();
    usersCol = db.collection('users');
    roomsCol = db.collection('rooms');
    
    // Create indexes
    await usersCol.createIndex({ email: 1 }, { unique: true });
    await roomsCol.createIndex({ id: 1 }, { unique: true });
    
    console.log('✅ Connected to MongoDB:', db.databaseName || '(unknown)');
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:', err && err.message ? err.message : err);
    if (NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn('⚠️ Running without database in development mode');
    }
  }
}

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      port: PORT,
      database: 'disconnected'
    };

    if (client) {
      try {
        await client.db().command({ ping: 1 });
        health.database = 'connected';
      } catch (dbErr) {
        health.database = 'error';
        health.db_error = dbErr.message;
      }
    }

    const statusCode = health.database === 'connected' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (e) {
    res.status(500).json({ 
      status: 'error', 
      error: e.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Fallback route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// API Routes
app.post('/api/register', async (req, res) => {
  try {
    if (!usersCol) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { name, surname, email, country, gender, password } = req.body || {};
    if (!name || !surname || !email || !country || !gender || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const doc = {
      name: String(name).trim(),
      surname: String(surname).trim(),
      email: String(email).trim().toLowerCase(),
      country: String(country).trim(),
      gender: String(gender).trim(),
      avatar: (String(name)[0] || 'U').toUpperCase(),
      level: 1,
      createdAt: new Date()
    };

    const passwordHash = hashPassword(password);
    await usersCol.insertOne(Object.assign({}, doc, { passwordHash }));
    return res.status(201).json({ ok: true, user: doc });
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ error: 'Email already exists' });
    console.error('Register error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    if (!usersCol) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    
    const u = await usersCol.findOne({ email: String(email).trim().toLowerCase() });
    if (!u) return res.status(401).json({ error: 'Invalid credentials' });
    if (u.passwordHash !== hashPassword(password)) return res.status(401).json({ error: 'Invalid credentials' });
    
    const userResp = { 
      name: u.name, 
      surname: u.surname, 
      email: u.email, 
      country: u.country, 
      level: u.level || 1, 
      avatar: u.avatar || (u.name ? u.name.charAt(0).toUpperCase() : 'U') 
    };
    return res.json({ ok: true, user: userResp });
  } catch (err) {
    console.error('Login error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Room APIs (only if database is available)
if (roomsCol) {
  // Add room endpoints here...
}

// Start server
async function startServer() {
  await connectMongoOrExit();

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: NODE_ENV === 'production' ? false : true,
      methods: ['GET', 'POST']
    }
  });

  // Socket.io handlers
  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);
    
    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
    });
  });

  // Error handling
  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use`);
    } else {
      console.error('Server error:', err);
    }
    process.exit(1);
  });

  // Start listening
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Environment: ${NODE_ENV}`);
    console.log(`🌐 Frontend available at: http://localhost:${PORT}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  if (client) {
    client.close().then(() => {
      console.log('MongoDB connection closed');
      process.exit(0);
    }).catch((err) => {
      console.error('Error closing MongoDB:', err);
      process.exit(1);
    });
  } else {
    process.exit(0);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
