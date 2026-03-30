const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// Middleware: verify token and require admin role
async function authMiddleware(req, res, next) {
	const auth = req.headers.authorization;
	if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
	const token = auth.split(' ')[1];
	try {
		const payload = jwt.verify(token, JWT_SECRET);
		// payload should contain role
		if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
		req.user = payload;
		next();
	} catch (e) {
		return res.status(401).json({ error: 'Invalid token' });
	}
}

// POST /api/admin/login
router.post('/login', async (req, res) => {
	const { username, password } = req.body || {};
	if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

	// find user
	const user = await User.findOne({ username: username.toLowerCase() });
	if (!user) return res.status(401).json({ error: 'Invalid username or password' });

	const ok = await bcrypt.compare(password, user.passwordHash);
	if (!ok) return res.status(401).json({ error: 'Invalid username or password' });

	// ensure admin role
	if (user.role !== 'admin') return res.status(403).json({ error: 'Not an admin' });

	const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
	return res.json({ token });
});

// GET /api/admin/users
router.get('/users', authMiddleware, async (req, res) => {
	const users = await User.find().select('username email role status passwordHash');
	// Note: passwordHash returned — not plaintext. For security, consider omitting.
	res.json(users);
});

// PUT /api/admin/users/:id
router.put('/users/:id', authMiddleware, async (req, res) => {
	const updates = {};
	const allowed = ['username','email','role','status'];
	allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
	try {
		const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('username email role status passwordHash');
		if (!user) return res.status(404).json({ error: 'User not found' });
		res.json(user);
	} catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', authMiddleware, async (req, res) => {
	try {
		await User.findByIdAndDelete(req.params.id);
		res.json({ ok: true });
	} catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', authMiddleware, async (req, res) => {
	const { newPassword } = req.body || {};
	if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password too short' });
	try {
		const hash = await bcrypt.hash(newPassword, 10);
		const user = await User.findByIdAndUpdate(req.params.id, { passwordHash: hash }, { new: true }).select('username email role status');
		if (!user) return res.status(404).json({ error: 'User not found' });
		res.json({ ok: true });
	} catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
