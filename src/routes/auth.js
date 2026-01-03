const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const email = require('../services/email');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { email: userEmail, password, name } = req.body;

        // Validate input
        if (!userEmail || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        // Check if user already exists
        const existingUser = db.users.findByEmail(userEmail);
        if (existingUser) {
            return res.status(400).json({ error: 'An account with this email already exists' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const userId = uuidv4();
        db.users.create(userId, userEmail, passwordHash, name || '');

        // Send welcome email (if configured)
        if (await email.isConfigured()) {
            await email.sendWelcomeEmail(userEmail, name || 'there');
        }

        res.status(201).json({
            success: true,
            user: {
                id: userId,
                email: userEmail,
                name: name || ''
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Failed to create account' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email: userEmail, password } = req.body;

        // Validate input
        if (!userEmail || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find user
        const user = db.users.findByEmail(userEmail);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // In a real app, you'd create a JWT token here
        // For simplicity, we're returning the user ID
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                subscription_status: user.subscription_status,
                subscription_plan: user.subscription_plan
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get current user (for session check)
router.get('/me', (req, res) => {
    // In a real app, you'd verify the JWT token here
    const userId = req.headers['x-user-id'];
    
    if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = db.users.findById(userId);
    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }

    res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan
    });
});

module.exports = router;
