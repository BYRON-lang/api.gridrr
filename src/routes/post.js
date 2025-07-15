const express = require('express');
const jwt = require('jsonwebtoken');
const { createPost, getAllPosts, getPostById, likePost, getPostsByUser, createComment, getCommentsByPostId } = require('../models/post');
const auth = require('./auth');
const authenticateToken = auth.authenticateToken;
const multer = require('multer');
const { bucket } = require('../config/firebase');
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// Redesigned: Create a new post with multiple image upload, validation, and robust error handling
router.post(
  '/',
  authenticateToken,
  upload.array('images', 10), // up to 10 images
  async (req, res) => {
    console.log('POST /api/posts route hit');
    console.log('Headers:', req.headers);
    console.log('User:', req.user);
    console.log('Body:', req.body);
    console.log('Files:', req.files);
    try {
      const userId = req.user.userId;
      const { title } = req.body;
      let { tags } = req.body;
      let image_urls = [];

      // Validation: require title and at least one image
      if (!title || typeof title !== 'string' || !title.trim()) {
        console.log('Validation failed: Missing title');
        return res.status(400).json({ success: false, error: 'Title is required.' });
      }
      if (!req.files || req.files.length === 0) {
        console.log('Validation failed: No images uploaded');
        return res.status(400).json({ success: false, error: 'At least one image is required.' });
      }

      // Parse tags robustly
      if (tags) {
        try {
          tags = JSON.parse(tags);
          if (!Array.isArray(tags)) throw new Error();
        } catch {
          tags = tags.split(',').map(t => t.trim()).filter(Boolean);
        }
      } else {
        tags = [];
      }
      console.log('Parsed tags:', tags);

      // Upload images to Firebase Storage
      for (const file of req.files) {
        const filePath = `posts/${Date.now()}_${file.originalname}`;
        const blob = bucket.file(filePath);
        const blobStream = blob.createWriteStream({
          metadata: {
            contentType: file.mimetype,
            cacheControl: 'public, max-age=31536000',
          },
        });
        blobStream.end(file.buffer);
        await new Promise((resolve, reject) => {
          blobStream.on('finish', resolve);
          blobStream.on('error', reject);
        });
        // Construct Firebase Storage download URL
        const encodedPath = encodeURIComponent(filePath);
        const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`;
        image_urls.push(downloadUrl);
        console.log('Uploaded image to:', downloadUrl);
      }

      // Create post in DB
      const post = await createPost(userId, { title: title.trim(), tags, image_urls });
      console.log('Post created:', post);
      res.status(201).json({ success: true, data: post });
    } catch (error) {
      console.error('Create post error:', error);
      res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }
);

// Get all posts with search, filter, and sort
router.get('/', async (req, res) => {
  try {
    const { q, tags, sort } = req.query;
    const posts = await getAllPosts({ q, tags, sort });
    // Only send necessary fields
    const minimalPosts = posts.map(post => ({
      id: post.id,
      title: post.title,
      tags: post.tags,
      image_urls: post.image_urls,
      created_at: post.created_at,
      views: post.views,
      likes: post.likes || 0,
    }));
    res.json(minimalPosts);
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get posts by user ID
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const posts = await getPostsByUser(userId);
    // Only send necessary fields
    const minimalPosts = posts.map(post => ({
      id: post.id,
      title: post.title,
      tags: post.tags,
      image_urls: post.image_urls,
      created_at: post.created_at,
      views: post.views,
      likes: post.likes || 0,
    }));
    res.json(minimalPosts);
  } catch (error) {
    console.error('Get user posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test endpoint to check database tables
router.get('/test', async (req, res) => {
  try {
    const { pool } = require('../config/database');
    
    // Check if tables exist
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('posts', 'post_likes', 'post_views', 'users', 'profiles')
    `);
    
    const existingTables = tablesResult.rows.map(row => row.table_name);
    
    // Check if there are any posts
    const postsResult = await pool.query('SELECT COUNT(*) as count FROM posts');
    const postsCount = postsResult.rows[0].count;
    
    res.json({
      tables: existingTables,
      postsCount: parseInt(postsCount),
      message: 'Database check completed'
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to check view counts for a specific post
router.get('/debug/:id/views', async (req, res) => {
  try {
    const { id } = req.params;
    const { pool } = require('../config/database');
    
    // Get all view records for this post
    const viewsResult = await pool.query(`
      SELECT pv.*, u.first_name, u.last_name 
      FROM post_views pv 
      LEFT JOIN users u ON pv.user_id = u.id 
      WHERE pv.post_id = $1 
      ORDER BY pv.created_at DESC
    `, [id]);
    
    // Get unique user count
    const uniqueViewsResult = await pool.query(`
      SELECT COUNT(DISTINCT user_id) as count 
      FROM post_views 
      WHERE post_id = $1 AND user_id IS NOT NULL
    `, [id]);
    
    // Get total view count (including anonymous)
    const totalViewsResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM post_views 
      WHERE post_id = $1
    `, [id]);
    
    res.json({
      postId: id,
      uniqueUserViews: parseInt(uniqueViewsResult.rows[0].count) || 0,
      totalViews: parseInt(totalViewsResult.rows[0].count) || 0,
      viewRecords: viewsResult.rows,
      message: 'View debug info'
    });
  } catch (error) {
    console.error('View debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single post by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Fetching post with ID:', id);
    
    // Extract user ID from auth header if present
    let userId = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        userId = decoded.userId;
      } catch (tokenError) {
        console.log('Invalid token, proceeding as anonymous user');
      }
    }
    
    const post = await getPostById(id, userId);
    console.log('Post result:', post ? 'Found' : 'Not found');
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(post);
  } catch (error) {
    console.error('Get post error details:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Like a post
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const result = await likePost(id, userId);
    res.json(result);
  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get comments for a post
router.get('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { comments, total } = await getCommentsByPostId(id, limit, offset);
    res.json({ success: true, data: comments, total });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Add a comment to a post
router.post('/:id/comments', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { content } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Content is required.' });
    }
    const comment = await createComment(id, userId, content.trim());
    res.status(201).json({ success: true, data: comment });
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router; 