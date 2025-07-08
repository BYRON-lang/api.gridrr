const { pool } = require('../config/database');

const getProfileByUserId = async (userId, currentUserId = null) => {
  const result = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  const profile = result.rows[0];
  
  if (profile) {
    // Get follower and following counts
    const followerCount = await getFollowerCount(userId);
    const followingCount = await getFollowingCount(userId);
    
    // Check if current user is following this profile
    let isFollowing = false;
    if (currentUserId && currentUserId !== userId) {
      isFollowing = await checkIsFollowing(currentUserId, userId);
    }
    
    return {
      ...profile,
      follower_count: followerCount,
      following_count: followingCount,
      is_following: isFollowing
    };
  }
  
  return profile;
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

const checkIsFollowing = async (followerId, followingId) => {
  const result = await pool.query(
    'SELECT id FROM user_follows WHERE follower_id = $1 AND following_id = $2',
    [followerId, followingId]
  );
  return result.rows.length > 0;
};

const upsertProfile = async (userId, profile) => {
  const {
    display_name,
    profile_type,
    website,
    contact_email,
    bio,
    expertise,
    avatar_url,
    twitter,
    instagram,
    linkedin,
    facebook
  } = profile;
  const result = await pool.query(
    `INSERT INTO profiles (user_id, display_name, profile_type, website, contact_email, bio, expertise, avatar_url, twitter, instagram, linkedin, facebook, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       profile_type = EXCLUDED.profile_type,
       website = EXCLUDED.website,
       contact_email = EXCLUDED.contact_email,
       bio = EXCLUDED.bio,
       expertise = EXCLUDED.expertise,
       avatar_url = EXCLUDED.avatar_url,
       twitter = EXCLUDED.twitter,
       instagram = EXCLUDED.instagram,
       linkedin = EXCLUDED.linkedin,
       facebook = EXCLUDED.facebook,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [userId, display_name, profile_type, website, contact_email, bio, expertise, avatar_url, twitter, instagram, linkedin, facebook]
  );
  return result.rows[0];
};

module.exports = {
  getProfileByUserId,
  upsertProfile,
}; 