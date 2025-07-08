const express = require('express');
const { getProfileByUserId, upsertProfile } = require('../models/profile');
const { getFollowers, getFollowing, followUser } = require('../models/user');
const auth = require('./auth');
const authenticateToken = auth.authenticateToken;

const router = express.Router();

// Get current user's profile
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const profile = await getProfileByUserId(userId, userId);
    res.json(profile || {});
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get another user's profile
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    let currentUserId = null;
    
    // Extract current user ID from auth header if present
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        currentUserId = decoded.userId;
      } catch (tokenError) {
        // Invalid token, proceed as anonymous user
      }
    }
    
    const profile = await getProfileByUserId(userId, currentUserId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create or update current user's profile
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const profile = req.body;
    const updatedProfile = await upsertProfile(userId, profile);
    res.json(updatedProfile);
  } catch (error) {
    console.error('Upsert profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's followers
router.get('/:userId/followers', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    const followers = await getFollowers(userId, parseInt(limit), parseInt(offset));
    res.json(followers);
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's following
router.get('/:userId/following', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    const following = await getFollowing(userId, parseInt(limit), parseInt(offset));
    res.json(following);
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Follow/unfollow a user
router.post('/:userId/follow', authenticateToken, async (req, res) => {
  try {
    const followerId = req.user.userId;
    const { userId } = req.params;
    
    if (followerId === userId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }
    
    const result = await followUser(followerId, userId);
    res.json(result);
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 