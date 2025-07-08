const { pool } = require('../config/database');

const createUser = async (firstName, lastName, email, hashedPassword, acceptedTerms) => {
  const result = await pool.query(
    'INSERT INTO users (first_name, last_name, email, password, accepted_terms) VALUES ($1, $2, $3, $4, $5) RETURNING id, first_name, last_name, email, accepted_terms',
    [firstName, lastName, email, hashedPassword, acceptedTerms]
  );
  return result.rows[0];
};

const findUserByEmail = async (email) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0];
};

const findUserById = async (id) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0];
};

const updateUserById = async (id, { firstName, lastName, email }) => {
  const result = await pool.query(
    'UPDATE users SET first_name = $1, last_name = $2, email = $3 WHERE id = $4 RETURNING id, first_name, last_name, email',
    [firstName, lastName, email, id]
  );
  return result.rows[0];
};

const updateUserPasswordById = async (id, hashedPassword) => {
  const result = await pool.query(
    'UPDATE users SET password = $1 WHERE id = $2 RETURNING id, email',
    [hashedPassword, id]
  );
  return result.rows[0];
};

const followUser = async (followerId, userId) => {
  // Check if already following
  const existingFollow = await pool.query(
    'SELECT * FROM user_follows WHERE follower_id = $1 AND following_id = $2',
    [followerId, userId]
  );

  if (existingFollow.rows.length > 0) {
    // Unfollow
    await pool.query(
      'DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, userId]
    );
    return { following: false };
  } else {
    // Follow
    await pool.query(
      'INSERT INTO user_follows (follower_id, following_id, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
      [followerId, userId]
    );
    return { following: true };
  }
};

const getFollowerCount = async (userId) => {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM user_follows WHERE following_id = $1',
    [userId]
  );
  return parseInt(result.rows[0].count) || 0;
};

const getFollowingCount = async (userId) => {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM user_follows WHERE follower_id = $1',
    [userId]
  );
  return parseInt(result.rows[0].count) || 0;
};

const isFollowing = async (followerId, followingId) => {
  const result = await pool.query(
    'SELECT id FROM user_follows WHERE follower_id = $1 AND following_id = $2',
    [followerId, followingId]
  );
  return result.rows.length > 0;
};

const getFollowers = async (userId, limit = 10, offset = 0) => {
  const result = await pool.query(`
    SELECT u.id, u.first_name, u.last_name, u.email, p.display_name, p.avatar_url, p.expertise
    FROM user_follows uf
    JOIN users u ON uf.follower_id = u.id
    LEFT JOIN profiles p ON u.id = p.user_id
    WHERE uf.following_id = $1
    ORDER BY uf.created_at DESC
    LIMIT $2 OFFSET $3
  `, [userId, limit, offset]);
  return result.rows;
};

const getFollowing = async (userId, limit = 10, offset = 0) => {
  const result = await pool.query(`
    SELECT u.id, u.first_name, u.last_name, u.email, p.display_name, p.avatar_url, p.expertise
    FROM user_follows uf
    JOIN users u ON uf.following_id = u.id
    LEFT JOIN profiles p ON u.id = p.user_id
    WHERE uf.follower_id = $1
    ORDER BY uf.created_at DESC
    LIMIT $2 OFFSET $3
  `, [userId, limit, offset]);
  return result.rows;
};

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  updateUserById,
  updateUserPasswordById,
  followUser,
  getFollowerCount,
  getFollowingCount,
  isFollowing,
  getFollowers,
  getFollowing,
}; 