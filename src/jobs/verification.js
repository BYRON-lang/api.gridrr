const { pool } = require('../config/database');
const { getFollowerCount } = require('../models/user');
const { getPostsByUser } = require('../models/post');

// Count total likes for all posts by user
async function getTotalLikes(userId) {
  const posts = await getPostsByUser(userId);
  if (!posts.length) return 0;
  const postIds = posts.map(p => p.id);
  const likesResult = await pool.query(
    'SELECT COUNT(*) as total_likes FROM post_likes WHERE post_id = ANY($1::int[])',
    [postIds.length > 0 ? postIds : [0]]
  );
  return parseInt(likesResult.rows[0].total_likes) || 0;
}

async function checkAndRequestVerificationForUser(userId) {
  const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = userRes.rows[0];
  if (!user || user.verified || user.verification_requested) return;

  const postCount = (await getPostsByUser(userId)).length;
  const followerCount = await getFollowerCount(userId);
  const likeCount = await getTotalLikes(userId);

  if (postCount >= 100 && followerCount >= 1000 && likeCount >= 1000) {
    await pool.query('UPDATE users SET verification_requested = TRUE WHERE id = $1', [userId]);
  }
}

// Run for all users
async function checkAllUsersForVerification() {
  const usersRes = await pool.query('SELECT id FROM users WHERE verified = FALSE AND verification_requested = FALSE');
  for (const row of usersRes.rows) {
    await checkAndRequestVerificationForUser(row.id);
  }
}

module.exports = {
  checkAndRequestVerificationForUser,
  checkAllUsersForVerification,
};
