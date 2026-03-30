const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
	username: { type: String, required: true, unique: true },
	email: { type: String, required: true, unique: true },
	passwordHash: { type: String, required: true }, // bcrypt hash
	role: { type: String, default: 'user' },
	status: { type: String, default: 'active' },
	createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
