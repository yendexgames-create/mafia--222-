# Railway Deployment Guide

## 🚀 Railway ga deploy qilish uchun tayyorlanish

### 1. Environment Variables (.env)
Railway da quyidagi environment variables larni o'rnatishingiz kerak:

```bash
PORT=3000
MONGODB_URI=mongodb+srv://your_username:your_password@cluster0.zcf33yo.mongodb.net/?appName=Cluster0
JWT_SECRET=your_super_secret_jwt_key_here_change_this_in_production
SESSION_SECRET=your_session_secret_here_change_this_in_production
ALLOW_IN_MEMORY=false
MONGODB_TLS_ALLOW_INVALID=true
NODE_ENV=production
```

### 2. Railway da deploy qilish

1. **Repository ni Railway ga ulash**
   - GitHub dagi repository ni Railway ga ulang
   - Yoki "Deploy from GitHub" tanlang

2. **Environment Variables ni sozlash**
   - Railway dashboard → Settings → Environment Variables
   - Yuqoridagi barcha variable larni qo'shing

3. **Build Settings**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Node Version: `18`

### 3. Muammolarni hal qilish

Agar crash bo'lsa:

1. **Log larni tekshiring**
   - Railway dashboard → Logs
   - Xatolikni toping va tuzating

2. **MongoDB connection**
   - MONGODB_URI to'g'ri ekanligini tekshiring
   - IP whitelist da Railway IP lari borligini tekshiring

3. **Port muammosi**
   - Railway avtomatik PORT beradi
   - `process.env.PORT` ishlatilganligiga ishonch hosil qiling

### 4. Health Check

Deploy qilingandan so'ng:
```bash
# Health check
curl https://your-app-name.railway.app/api/health
```

### 5. Frontend URL

Frontend quyidagi manzilda bo'ladi:
```
https://your-app-name.railway.app/
```

### 6. Debugging qilish

Agar ishlamasa:
1. Log larni o'qing
2. Environment variables larni tekshiring
3. MongoDB connection string ni tekshiring
4. Local da ishlayotganiga ishonch hosil qiling
