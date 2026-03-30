const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');
const { authenticate, isAdmin } = require('../middleware/auth');

// Get all users (admin only)
router.get('/users', authenticate, isAdmin, async (req, res) => {
    try {
        const client = new MongoClient(process.env.MONGODB_URI);
        await client.connect();
        const db = client.db();
        const users = await db.collection('users')
            .find({}, { projection: { password: 0 } }) // Exclude passwords
            .toArray();
        
        res.json({ users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user (admin only)
router.put('/users/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Prevent changing sensitive fields
        delete updates._id;
        delete updates.password;
        delete updates.email; // Email changes should be a separate flow with verification

        const client = new MongoClient(process.env.MONGODB_URI);
        await client.connect();
        const db = client.db();
        
        const result = await db.collection('users').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'User updated successfully' });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete user (admin only)
router.delete('/users/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const client = new MongoClient(process.env.MONGODB_URI);
        await client.connect();
        const db = client.db();
        
        const result = await db.collection('users').deleteOne({
            _id: new ObjectId(id)
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get audit logs (admin only)
router.get('/audit-logs', authenticate, isAdmin, async (req, res) => {
    try {
        const client = new MongoClient(process.env.MONGODB_URI);
        await client.connect();
        const db = client.db();
        
        // Create audit logs collection if it doesn't exist
        const logs = await db.collection('audit_logs')
            .find()
            .sort({ timestamp: -1 })
            .limit(100)
            .toArray();

        res.json({ logs });
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
