-- 創建資料庫（如果不存在）
CREATE DATABASE IF NOT EXISTS game_account_system;
USE game_account_system;

-- 創建管理員表
CREATE TABLE IF NOT EXISTS admin_users (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'super_admin') DEFAULT 'admin',
    created_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 創建每日禮物資格表
CREATE TABLE IF NOT EXISTS daily_gift_eligible_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    account_id VARCHAR(50) NOT NULL,
    eligible_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_account_date (account_id, eligible_date)
);

-- 插入初始超級管理員
-- 密碼是 admin123 的 bcrypt 哈希值
INSERT INTO admin_users (id, username, password, role) 
VALUES (
    'admin-initial',
    'admin',
    '$2a$10$9t2C0M1RSKWzXSlFydifpOLqBrjsETWOHGrhqTQrGOHrORB7doaSO',
    'super_admin'
) ON DUPLICATE KEY UPDATE password = VALUES(password), role = 'super_admin';

-- Create WebAccount table
CREATE TABLE IF NOT EXISTS WebAccount (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    status ENUM('active', 'inactive', 'banned') DEFAULT 'active',
    last_login TIMESTAMP NULL,
    role ENUM('user', 'admin', 'super_admin') DEFAULT 'user'
);

-- Add indexes
CREATE INDEX idx_username ON WebAccount(username);
CREATE INDEX idx_email ON WebAccount(email);
CREATE INDEX idx_status ON WebAccount(status);

-- Insert a default admin account (password: admin123)
INSERT INTO WebAccount (username, password, email, role) 
VALUES ('admin', '$2a$10$your_hashed_password', 'admin@example.com', 'super_admin')
ON DUPLICATE KEY UPDATE id=id;

-- 禮包碼表
CREATE TABLE IF NOT EXISTS gift_codes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  type ENUM('normal', 'specific') NOT NULL DEFAULT 'normal',
  rewards TEXT NOT NULL,
  specific_accounts TEXT,
  expiry_date DATETIME NOT NULL,
  check_creation_time BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 兌換記錄表
CREATE TABLE IF NOT EXISTS gift_code_redemptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code_id INT NOT NULL,
  account_id INT NOT NULL,
  character_id INT NOT NULL,
  character_name VARCHAR(50) NOT NULL,
  redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_redemption (code_id, account_id),
  FOREIGN KEY (code_id) REFERENCES gift_codes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 操作日誌表
CREATE TABLE IF NOT EXISTS gift_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  action_type ENUM('create', 'redeem', 'delete', 'extend', 'error') NOT NULL,
  code_id INT,
  code VARCHAR(50),
  account_id INT,
  character_id INT,
  character_name VARCHAR(50),
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (code_id) REFERENCES gift_codes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; 