const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Admins only.' });
  }
};

// Apply auth and admin middleware to all routes
router.use(authenticateToken);
router.use(isAdmin);

// Get all users with pagination and search
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        u.email, 
        u.created_at,
        u.updated_at,
        p.avatar_url,
        p.display_name,
        p.profile_type,
        p.bio,
        p.expertise,
        p.website,
        p.twitter,
        p.instagram,
        p.linkedin,
        p.facebook
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
    `;
    const queryParams = [];
    const whereClauses = [];
    
    // Add search condition
    if (search) {
      queryParams.push(`%${search}%`);
      whereClauses.push(`(u.email ILIKE $${queryParams.length} OR u.first_name ILIKE $${queryParams.length} OR u.last_name ILIKE $${queryParams.length} OR p.display_name ILIKE $${queryParams.length})`);
    }
    
    // Add WHERE clause if there are any conditions
    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ');
    }
    
    // Add pagination
    query += ` ORDER BY u.created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);
    
    // Execute the query
    const result = await pool.query(query, queryParams);
    
    // Get follower counts for each user
    const userIds = result.rows.map(user => user.id);
    let followerCounts = {};
    if (userIds.length > 0) {
      const followerQuery = `
        SELECT 
          uf.following_id as user_id,
          COUNT(uf.follower_id) as followers,
          (SELECT COUNT(*) FROM user_follows WHERE follower_id = uf.following_id) as following
        FROM user_follows uf
        WHERE uf.following_id = ANY($1)
        GROUP BY uf.following_id
      `;
      const followerResult = await pool.query(followerQuery, [userIds]);
      followerCounts = followerResult.rows.reduce((acc, row) => {
        acc[row.user_id] = { followers: parseInt(row.followers), following: parseInt(row.following) };
        return acc;
      }, {});
    }
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM users u LEFT JOIN profiles p ON u.id = p.user_id';
    if (whereClauses.length > 0) {
      countQuery += ' WHERE ' + whereClauses.join(' AND ');
    }
    const countResult = await pool.query(countQuery, queryParams.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);
    
    res.json({
      data: result.rows.map(user => {
        const userFollowers = followerCounts[user.id] || { followers: 0, following: 0 };
        return {
          id: user.id,
          name: user.display_name || `${user.first_name} ${user.last_name}`.trim(),
          email: user.email,
          username: user.email.split('@')[0],
          role: user.profile_type || 'user',
          status: 'active', // Default status since we don't have status field
          avatar: user.avatar_url,
          country: '', // No country field in current schema
          joinedOn: user.created_at,
          lastLogin: user.updated_at, // Using updated_at as last activity
          followers: userFollowers.followers,
          following: userFollowers.following,
          bio: user.bio,
          expertise: user.expertise,
          website: user.website,
          social: {
            twitter: user.twitter,
            instagram: user.instagram,
            linkedin: user.linkedin,
            facebook: user.facebook
          }
        };
      }),
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Add new admin user (superadmin only)
router.post('/users', async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Only superadmin can create admin users' });
    }
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Email, password, and name are required' });
    }
    const existing = await pool.query('SELECT id FROM admin_users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Admin user with this email already exists' });
    }
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO admin_users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role',
      [email, hashedPassword, name, role || 'admin']
    );
    res.status(201).json({ message: 'Admin user created', user: result.rows[0] });
  } catch (error) {
    console.error('Error creating admin user:', error);
    res.status(500).json({ message: 'Error creating admin user' });
  }
});

// Update user status (placeholder - since we don't have status field)
router.patch('/users/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // For now, just return success since we don't have status field
    // TODO: Add status field to users table if needed
    const result = await pool.query(
      'SELECT id, email FROM users WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ 
      message: 'User status updated successfully (status field not implemented)',
      user: result.rows[0] 
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Error updating user status' });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // First check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Delete user (cascading deletes should handle related records)
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
});

// Get total registered user count
router.get('/live-users', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM users');
    res.json({ liveUserCount: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Error fetching user count:', error);
    res.status(500).json({ message: 'Error fetching user count' });
  }
});

// Record analytics data
router.post('/analytics', async (req, res) => {
  const { userId, country, page, referrer, userAgent, app, deviceType } = req.body;
  try {
    await pool.query(
      'INSERT INTO analytics (user_id, country, page, referrer, user_agent, app, deviceType) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [userId || null, country, page, referrer, userAgent, app || 'gridrr', deviceType || 'desktop']
    );
    res.status(201).json({ message: 'Analytics recorded' });
  } catch (error) {
    console.error('Error recording analytics:', error);
    res.status(500).json({ message: 'Error recording analytics' });
  }
});

// Get analytics overview stats
router.get('/analytics/overview', async (req, res) => {
  try {
    // Only count analytics for the main app
    const app = 'gridrr';
    // Total visits (all time)
    const totalVisits = await pool.query('SELECT COUNT(*) FROM analytics WHERE app = $1', [app]);
    // Top countries
    const topCountries = await pool.query('SELECT country, COUNT(*) as count FROM analytics WHERE app = $1 GROUP BY country ORDER BY count DESC LIMIT 5', [app]);
    // Active users today (unique user_id or by IP if anonymous)
    const activeUsersToday = await pool.query(`SELECT COUNT(DISTINCT user_id) FROM analytics WHERE app = $1 AND timestamp >= NOW() - INTERVAL '1 day'`, [app]);
    // Recent visits (for table)
    const recent = await pool.query('SELECT * FROM analytics WHERE app = $1 ORDER BY timestamp DESC LIMIT 10', [app]);
    // Visits for graph (last 90d, 30d, 7d) split by deviceType
    const visits90dRaw = await pool.query(`
      SELECT DATE_TRUNC('day', timestamp) AS day, deviceType, COUNT(*) as count
      FROM analytics
      WHERE app = $1 AND timestamp >= NOW() - INTERVAL '90 days'
      GROUP BY day, deviceType
      ORDER BY day ASC
    `, [app]);
    const visits30dRaw = await pool.query(`
      SELECT DATE_TRUNC('day', timestamp) AS day, deviceType, COUNT(*) as count
      FROM analytics
      WHERE app = $1 AND timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY day, deviceType
      ORDER BY day ASC
    `, [app]);
    const visits7dRaw = await pool.query(`
      SELECT DATE_TRUNC('day', timestamp) AS day, deviceType, COUNT(*) as count
      FROM analytics
      WHERE app = $1 AND timestamp >= NOW() - INTERVAL '7 days'
      GROUP BY day, deviceType
      ORDER BY day ASC
    `, [app]);
    // Helper to format visits by day/device
    function formatVisits(raw, days) {
      const map = {};
      raw.forEach(row => {
        const day = row.day.toISOString().split('T')[0];
        if (!map[day]) map[day] = { day, desktop: 0, mobile: 0 };
        map[day][row.devicetype === 'mobile' ? 'mobile' : 'desktop'] = parseInt(row.count);
      });
      // Fill missing days with 0s
      const result = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().split('T')[0];
        result.push(map[dayStr] || { day: dayStr, desktop: 0, mobile: 0 });
      }
      return result;
    }
    const visits90d = formatVisits(visits90dRaw.rows, 90);
    const visits30d = formatVisits(visits30dRaw.rows, 30);
    const visits7d = formatVisits(visits7dRaw.rows, 7);
    // Posts by category aggregation
    const postsByCategoryRaw = await pool.query(`
      SELECT tag as category, COUNT(*) as count
      FROM (
        SELECT jsonb_array_elements_text(tags::jsonb) as tag
        FROM posts
        WHERE tags IS NOT NULL AND tags != 'null'
      ) t
      GROUP BY tag
      ORDER BY count DESC
      LIMIT 10
    `);
    const postsByCategory = postsByCategoryRaw.rows.map(row => ({ name: row.category, value: parseInt(row.count) }));

    // Total users
    const users = await pool.query('SELECT COUNT(*) FROM users');
    // Total posts
    const posts = await pool.query('SELECT COUNT(*) FROM posts');
    // Trending posts (top liked in last 7 days)
    const trendingRaw = await pool.query(`
      SELECT p.*, COUNT(l.id) AS like_count, 
             COALESCE(pr.display_name, u.email) AS username
      FROM posts p
      LEFT JOIN post_likes l ON p.id = l.post_id AND l.created_at >= NOW() - INTERVAL '7 days'
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN profiles pr ON p.user_id = pr.user_id
      GROUP BY p.id, username
      ORDER BY like_count DESC
      LIMIT 5
    `);
    // For each trending post, fetch comments, views, and parse tags/images
    const trendingPosts = await Promise.all(trendingRaw.rows.map(async (p) => {
      // Comments count
      const commentsRes = await pool.query('SELECT COUNT(*) FROM comments WHERE post_id = $1', [p.id]);
      // Views count
      const viewsRes = await pool.query('SELECT COUNT(DISTINCT user_id) FROM post_views WHERE post_id = $1', [p.id]);
      // Parse tags
      let tags = [];
      if (p.tags && typeof p.tags === 'string') {
        try { tags = JSON.parse(p.tags); } catch { tags = []; }
      } else if (Array.isArray(p.tags)) {
        tags = p.tags;
      }
      // Parse image_urls
      let image = '';
      if (p.image_urls && typeof p.image_urls === 'string') {
        try { const arr = JSON.parse(p.image_urls); image = arr?.[0] || ''; } catch { image = ''; }
      } else if (Array.isArray(p.image_urls)) {
        image = p.image_urls[0] || '';
      }
      return {
        id: p.id,
        title: p.title,
        tags,
        image,
        username: p.username,
        like_count: parseInt(p.like_count) || 0,
        comments: parseInt(commentsRes.rows[0].count) || 0,
        views: parseInt(viewsRes.rows[0].count) || 0
      };
    }));
    res.json({
      totalUsers: parseInt(users.rows[0].count),
      totalPosts: parseInt(posts.rows[0].count),
      activeUsersToday: parseInt(activeUsersToday.rows[0].count),
      totalVisits: parseInt(totalVisits.rows[0].count),
      topCountries: topCountries.rows,
      trendingPosts: trendingPosts, // Fixed: trendingPosts is already an array
      visitsGraph: {
        last90d: visits90d.rows,
        last30d: visits30d.rows,
        last7d: visits7d.rows
      },
      postsByCategory,
      recent: recent.rows
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    res.status(500).json({ message: 'Error fetching analytics overview' });
  }
});

module.exports = router;
