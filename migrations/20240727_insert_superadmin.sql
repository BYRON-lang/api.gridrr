-- Insert superadmin user (default password: Admin123)
-- IMPORTANT: Change the password hash for production!
INSERT INTO admin_users (email, password_hash, name, role)
VALUES (
  'admin@gridrr.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'Super Admin',
  'superadmin'
)
ON CONFLICT (email) DO NOTHING; 