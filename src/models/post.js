const { pool } = require('../config/database');
const { isFollowing } = require('./user');

// Robust: Always store tags and image_urls as JSON arrays, return full post object with unique ID
const createPost = async (userId, { title, tags, image_urls }) => {
  // Ensure tags and image_urls are arrays
  const tagsArray = Array.isArray(tags) ? tags : [];
  const imageUrlsArray = Array.isArray(image_urls) ? image_urls : [];
  console.log('Saving post to DB:', { title, tags: tagsArray, image_urls: imageUrlsArray });
  const result = await pool.query(
    'INSERT INTO posts (user_id, title, tags, image_urls, created_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING *',
    [userId, title, JSON.stringify(tagsArray), JSON.stringify(imageUrlsArray)]
  );
  return result.rows[0];
};

const getPostsByUser = async (userId) => {
  const result = await pool.query('SELECT * FROM posts WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  const posts = result.rows;

  // Add views count to each post
  for (const post of posts) {
    const viewsResult = await pool.query(
      'SELECT COUNT(DISTINCT user_id) as count FROM post_views WHERE post_id = $1 AND user_id IS NOT NULL',
      [post.id]
    );
    post.views = parseInt(viewsResult.rows[0].count) || 0;
  }
  return posts;
};

// Updated getAllPosts to support search, filter, and sort
const getAllPosts = async (options = {}) => {
  let { q, tags, sort } = options;
  let query = 'SELECT * FROM posts';
  let where = [];
  let params = [];

  // Search by text in title
  if (q) {
    params.push(`%${q}%`);
    where.push(`LOWER(title) LIKE LOWER($${params.length})`);
  }

  // Filter by tags (comma-separated)
  if (tags) {
    let tagList = Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      // Use jsonb ?| array[...] for tags stored as JSON string
      const tagParams = tagList.map((_, i) => `$${params.length + i + 1}`).join(',');
      where.push(`tags::jsonb ?| array[${tagParams}]`);
      params.push(...tagList);
    }
  }

  if (where.length > 0) {
    query += ' WHERE ' + where.join(' AND ');
  }

  // Always order by created_at DESC in SQL
  query += ' ORDER BY created_at DESC';

  const result = await pool.query(query, params);
  let posts = result.rows;

  // Add views count to each post
  for (const post of posts) {
    const viewsResult = await pool.query(
      'SELECT COUNT(DISTINCT user_id) as count FROM post_views WHERE post_id = $1 AND user_id IS NOT NULL',
      [post.id]
    );
    post.views = parseInt(viewsResult.rows[0].count) || 0;
    // Parse tags and image_urls
    if (post.tags && typeof post.tags === 'string') {
      try { post.tags = JSON.parse(post.tags); } catch { post.tags = []; }
    }
    if (post.image_urls && typeof post.image_urls === 'string') {
      try { post.image_urls = JSON.parse(post.image_urls); } catch { post.image_urls = []; }
    }
  }

  // Sort in JS if needed
  if (sort === 'popular') {
    posts = posts.sort((a, b) => (b.views || 0) - (a.views || 0) || new Date(b.created_at) - new Date(a.created_at));
  } else if (sort === 'liked') {
    // If likes are not precomputed, set to 0
    posts = posts.sort((a, b) => (b.likes || 0) - (a.likes || 0) || new Date(b.created_at) - new Date(a.created_at));
  }

  console.log('Fetched posts:', posts.map(p => ({ id: p.id, title: p.title, tags: p.tags, image_urls: p.image_urls })));
  return posts;
};

const getPostById = async (id, userId = null) => {
  try {
    // Increment view count (only for authenticated users)
    await incrementPostViews(id, userId);
    
    // First get the basic post data
    const postResult = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);
    const post = postResult.rows[0];
    
    if (!post) {
      return null;
    }

    // Get user data
    const userResult = await pool.query('SELECT id, first_name, last_name, email FROM users WHERE id = $1', [post.user_id]);
    const user = userResult.rows[0];

    // Get profile data
    const profileResult = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [post.user_id]);
    const profile = profileResult.rows[0];

    // Get likes count
    const likesResult = await pool.query('SELECT COUNT(*) as count FROM post_likes WHERE post_id = $1', [id]);
    const likesCount = parseInt(likesResult.rows[0].count) || 0;

    // Check if current user has liked this post
    let userHasLiked = false;
    if (userId) {
      const userLikeResult = await pool.query(
        'SELECT id FROM post_likes WHERE post_id = $1 AND user_id = $2',
        [id, userId]
      );
      userHasLiked = userLikeResult.rows.length > 0;
      console.log(`User ${userId} has liked post ${id}: ${userHasLiked}`);
    } else {
      console.log('No user ID provided, userHasLiked set to false');
    }

    // Get views count (unique users who viewed the post)
    const viewsResult = await pool.query(`
      SELECT COUNT(DISTINCT user_id) as count 
      FROM post_views 
      WHERE post_id = $1 AND user_id IS NOT NULL
    `, [id]);
    const viewsCount = parseInt(viewsResult.rows[0].count) || 0;
    
    console.log(`Post ${id} has ${viewsCount} unique views`);
    
    // Debug: Let's also see all view records for this post
    const allViewsResult = await pool.query(`
      SELECT user_id, created_at 
      FROM post_views 
      WHERE post_id = $1 
      ORDER BY created_at DESC
    `, [id]);
    console.log(`All view records for post ${id}:`, allViewsResult.rows);

    // Parse tags if they're stored as JSON
    if (post.tags && typeof post.tags === 'string') {
      try {
        post.tags = JSON.parse(post.tags);
      } catch (e) {
        post.tags = [];
      }
    }
    
    // Parse image_urls if they're stored as JSON
    if (post.image_urls && typeof post.image_urls === 'string') {
      try {
        post.image_urls = JSON.parse(post.image_urls);
      } catch (e) {
        post.image_urls = [];
      }
    }
    
    // Structure user data
    post.user = {
      id: user?.id,
      first_name: user?.first_name,
      last_name: user?.last_name,
      email: user?.email,
      profile: profile ? {
        display_name: profile.display_name,
        profile_type: profile.profile_type,
        website: profile.website,
        contact_email: profile.contact_email,
        bio: profile.bio,
        expertise: profile.expertise,
        twitter: profile.twitter,
        instagram: profile.instagram,
        linkedin: profile.linkedin,
        facebook: profile.facebook
      } : null
    };
    
    // Add likes and views counts
    post.likes = likesCount;
    post.views = viewsCount;
    post.userHasLiked = userHasLiked; // Add this line
    
    // Check if current user has viewed this post
    post.userHasViewed = await hasUserViewedPost(id, userId);
    
    // Check if current user is following the post author
    let userIsFollowingAuthor = false;
    if (userId && post.user?.id && userId !== post.user.id) {
      userIsFollowingAuthor = await isFollowing(userId, post.user.id);
    }
    
    // Add follow state to user data
    if (post.user) {
      post.user.is_following = userIsFollowingAuthor;
    }
    
    console.log('Fetched post by ID:', { id: post.id, title: post.title, tags: post.tags, image_urls: post.image_urls });
    return post;
  } catch (error) {
    console.error('Error in getPostById:', error);
    throw error;
  }
};

const incrementPostViews = async (postId, userId) => {
  try {
    // Only increment view if user is authenticated
    if (!userId) {
      console.log('No user ID provided, skipping view increment');
      return; // Don't track views for anonymous users
    }
    
    console.log(`Incrementing view for post ${postId} by user ${userId}`);
    
    // Use INSERT ... ON CONFLICT DO NOTHING to handle unique constraint
    const result = await pool.query(
      'INSERT INTO post_views (post_id, user_id, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (post_id, user_id) DO NOTHING RETURNING id',
      [postId, userId]
    );
    
    if (result.rows.length > 0) {
      console.log(`View recorded for post ${postId} by user ${userId}`);
    } else {
      console.log(`User ${userId} already viewed post ${postId}`);
    }
  } catch (error) {
    console.error('Error incrementing post views:', error);
    // Don't throw error, just log it - views are not critical
  }
};

const hasUserViewedPost = async (postId, userId) => {
  try {
    if (!userId) {
      return false; // Anonymous users haven't viewed
    }
    
    const result = await pool.query(
      'SELECT id FROM post_views WHERE post_id = $1 AND user_id = $2',
      [postId, userId]
    );
    
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking if user viewed post:', error);
    return false;
  }
};

const likePost = async (postId, userId) => {
  try {
    console.log(`Like action: User ${userId} attempting to like/unlike post ${postId}`);
    
    // Check if user already liked the post
    const existingLike = await pool.query(
      'SELECT * FROM post_likes WHERE post_id = $1 AND user_id = $2',
      [postId, userId]
    );

    if (existingLike.rows.length > 0) {
      // Unlike the post
      console.log(`User ${userId} unliking post ${postId}`);
      await pool.query(
        'DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2',
        [postId, userId]
      );
      return { liked: false };
    } else {
      // Like the post
      console.log(`User ${userId} liking post ${postId}`);
      await pool.query(
        'INSERT INTO post_likes (post_id, user_id, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
        [postId, userId]
      );
      return { liked: true };
    }
  } catch (error) {
    console.error('Error in likePost:', error);
    throw error;
  }
};

module.exports = {
  createPost,
  getPostsByUser,
  getAllPosts,
  getPostById,
  likePost,
  incrementPostViews,
  hasUserViewedPost,
}; 