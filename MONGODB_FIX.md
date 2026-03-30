# Railway MongoDB Connection Fix

## 🔧 MongoDB Connection Issues on Railway

### Problem
```
❌ Failed to connect to MongoDB: querySrv ENOTFOUND _mongodb._tcp.cluster0.zcf33yo.mongodb.net
```

### Solutions

#### 1. **Check Railway Environment Variables**
In Railway dashboard → Settings → Environment Variables:

```bash
# REQUIRED - Replace with your actual MongoDB URI
MONGODB_URI=mongodb+srv://your_username:your_password@cluster0.zcf33yo.mongodb.net/?appName=Cluster0

# OPTIONAL - Allow running without database
ALLOW_IN_MEMORY=true

# OPTIONAL - TLS settings
MONGODB_TLS_ALLOW_INVALID=true
```

#### 2. **MongoDB Atlas IP Whitelist**
1. Go to MongoDB Atlas
2. Network Access → IP Whitelist
3. Add: `0.0.0.0/0` (allows all IPs)
4. Or add Railway's specific IP ranges

#### 3. **Alternative: Use Standard MongoDB URI**
If SRV fails, try standard format:

```bash
# Instead of:
MONGODB_URI=mongodb+srv://user:pass@cluster0.zcf33yo.mongodb.net/db

# Try:
MONGODB_URI=mongodb://user:pass@cluster0-shard-00-00.zcf33yo.mongodb.net:27017,cluster0-shard-00-01.zcf33yo.mongodb.net:27017,cluster0-shard-00-02.zcf33yo.mongodb.net:27017/db?ssl=true&replicaSet=atlas-xyz&authSource=admin
```

#### 4. **Quick Fix: Run Without Database**
Set this in Railway environment variables:
```bash
ALLOW_IN_MEMORY=true
```

This allows the server to start without MongoDB (for testing only).

### Testing the Fix

1. Update environment variables in Railway
2. Redeploy the application
3. Check logs for connection status

### Expected Success Message
```
✅ Connected to MongoDB: your_database_name
📊 Database collections ready
🚀 Server running on port 8080
```

### If Still Failing

1. **Verify MongoDB Atlas cluster is running**
2. **Check username/password are correct**
3. **Ensure cluster name matches exactly**
4. **Try creating a new database user**
5. **Contact Railway support if DNS issues persist**

### Environment Variables Template
Copy this to Railway environment variables:

```bash
PORT=8080
NODE_ENV=production
MONGODB_URI=mongodb+srv://your_username:your_password@cluster0.zcf33yo.mongodb.net/?appName=Cluster0
JWT_SECRET=your_secret_key_here
SESSION_SECRET=your_session_secret_here
ALLOW_IN_MEMORY=true
MONGODB_TLS_ALLOW_INVALID=true
```
