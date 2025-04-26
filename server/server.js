const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3002;

// Middleware
app.use(cors()); // Allow all origins in development
app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  console.log('Request headers:', req.headers);
  next();
});

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Ensure required tables exist
async function ensureTablesExist() {
  try {
    // Check and create gift_logs table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gift_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        action_type VARCHAR(50) NOT NULL,
        code_id INT NOT NULL,
        code VARCHAR(100) NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (code_id) REFERENCES gift_codes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('Tables checked and created if needed');
  } catch (error) {
    console.error('Error ensuring tables exist:', error);
  }
}

// Test database connection
pool.getConnection()
  .then((connection) => {
    console.log('Database connection established successfully');
    connection.release();
    // Ensure tables exist after connection is established
    return ensureTablesExist();
  })
  .catch((err) => {
    console.error('Error connecting to the database:', err);
  });

// JWT Secret
const JWT_SECRET = 'your-super-secret-jwt-key';

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: '未提供認證令牌' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Token verification error:', err);
      return res.status(403).json({ message: '無效的認證令牌' });
    }

    req.user = user;
    next();
  });
};

// 測試資料庫連接
app.get('/api/test-connection', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    await connection.query('SELECT 1');
    connection.release();
    res.json({ success: true, message: '資料庫連接成功' });
  } catch (error) {
    console.error('資料庫連接錯誤:', error);
    res.status(500).json({ success: false, message: '資料庫連接失敗', error: error.message });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt:', { username });

  if (!username || !password) {
    console.log('Missing credentials');
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    // Query to get admin user from WebAccount table
    const [rows] = await pool.query('SELECT * FROM WebAccount WHERE username = ?', [username]);

    console.log('Found users:', rows.length);

    if (rows.length === 0) {
      console.log('User not found');
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = rows[0];
    console.log('Comparing passwords...');

    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log('Password valid:', isValidPassword);

    if (!isValidPassword) {
      console.log('Invalid password');
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Update last login time
    await pool.query('UPDATE WebAccount SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    console.log('Login successful for user:', user.username);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// 添加合格帳號 API
app.post('/api/eligible-accounts', async (req, res) => {
  try {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ success: false, message: '缺少帳號 ID' });
    }

    // 獲取當前日期 (YYYY-MM-DD)
    const today = new Date().toISOString().slice(0, 10);

    // 檢查是否已存在
    const [existing] = await pool.query(
      'SELECT account_id FROM daily_gift_eligible_accounts WHERE account_id = ? AND eligible_date = ?',
      [accountId, today]
    );

    if (existing.length > 0) {
      return res.json({ success: true, message: '帳號已有資格' });
    }

    // 添加新資格
    await pool.query(
      'INSERT INTO daily_gift_eligible_accounts (account_id, eligible_date) VALUES (?, ?)',
      [accountId, today]
    );

    res.json({ success: true, message: '成功添加帳號資格' });
  } catch (error) {
    console.error('添加資格錯誤:', error);
    res.status(500).json({ success: false, message: '資料庫操作失敗' });
  }
});

// 更新推文狀態 API
app.put('/api/posts/:postId/status', async (req, res) => {
  try {
    const { postId } = req.params;
    const { status } = req.body;

    if (!postId || !status) {
      return res.status(400).json({ success: false, message: '缺少必要參數' });
    }

    // 更新貼文狀態
    await pool.query('UPDATE posts SET status = ? WHERE id = ?', [status, postId]);

    res.json({ success: true, message: '成功更新貼文狀態' });
  } catch (error) {
    console.error('更新推文狀態錯誤:', error);
    res.status(500).json({ success: false, message: '資料庫操作失敗' });
  }
});

// 獲取管理員列表
app.get('/api/admin/list', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: '權限不足' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, username, email, role, created_at, last_login FROM WebAccount WHERE role IN ("admin", "super_admin")'
    );
    res.json(rows);
  } catch (error) {
    console.error('獲取管理員列表錯誤:', error);
    res.status(500).json({ message: '內部服務器錯誤' });
  }
});

// 根據用戶名獲取管理員
app.get('/api/admin/by-username/:username', authenticateToken, async (req, res) => {
  console.log('Checking admin by username:', req.params.username);
  console.log('Request user:', req.user);

  if (req.user.role !== 'super_admin') {
    console.log('Permission denied: User is not super_admin');
    return res.status(403).json({ message: '權限不足' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, username, email, role, created_at, last_login FROM WebAccount WHERE username = ? AND role IN ("admin", "super_admin")',
      [req.params.username]
    );

    console.log('Query result:', rows);

    if (rows.length === 0) {
      console.log('Admin not found');
      return res.status(404).json({ message: '管理員不存在' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('獲取管理員錯誤:', error);
    res.status(500).json({ message: '內部服務器錯誤' });
  }
});

// 創建管理員
app.post('/api/admin/create', authenticateToken, async (req, res) => {
  console.log('Creating admin, request body:', req.body);
  console.log('Request user:', req.user);

  if (req.user.role !== 'super_admin') {
    console.log('Permission denied: User is not super_admin');
    return res.status(403).json({ message: '權限不足' });
  }

  const { username, password, email, role } = req.body;

  if (!username || !password || !role) {
    console.log('Missing required fields:', {
      username: !!username,
      password: !!password,
      role: !!role,
    });
    return res.status(400).json({ message: '缺少必要參數' });
  }

  try {
    // 檢查用戶名是否已存在
    console.log('Checking if username exists:', username);
    const [existing] = await pool.query('SELECT id FROM WebAccount WHERE username = ?', [username]);

    if (existing.length > 0) {
      console.log('Username already exists');
      return res.status(400).json({ message: '用戶名已存在' });
    }

    console.log('Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log('Inserting new admin into database...');
    const [result] = await pool.query(
      'INSERT INTO WebAccount (username, password, email, role, created_by) VALUES (?, ?, ?, ?, ?)',
      [username, hashedPassword, email || null, role, req.user.id]
    );

    console.log('Admin created successfully:', { id: result.insertId, username, role });

    res.status(201).json({
      id: result.insertId,
      username,
      email,
      role,
    });
  } catch (error) {
    console.error('創建管理員錯誤:', error);
    console.error('Error details:', {
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
    });
    res.status(500).json({
      message: '內部服務器錯誤',
      error: error.message,
      sqlMessage: error.sqlMessage,
    });
  }
});

// 更新管理員
app.put('/api/admin/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: '權限不足' });
  }

  const { email, role } = req.body;
  const adminId = req.params.id;

  try {
    const [result] = await pool.query(
      'UPDATE WebAccount SET email = ?, role = ? WHERE id = ? AND role IN ("admin", "super_admin")',
      [email, role, adminId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '管理員不存在' });
    }

    res.json({ message: '更新成功' });
  } catch (error) {
    console.error('更新管理員錯誤:', error);
    res.status(500).json({ message: '內部服務器錯誤' });
  }
});

// 刪除管理員
app.delete('/api/admin/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: '權限不足' });
  }

  const adminId = req.params.id;

  try {
    const [result] = await pool.query(
      'DELETE FROM WebAccount WHERE id = ? AND role IN ("admin", "super_admin")',
      [adminId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '管理員不存在' });
    }

    res.json({ message: '刪除成功' });
  } catch (error) {
    console.error('刪除管理員錯誤:', error);
    res.status(500).json({ message: '內部服務器錯誤' });
  }
});

// 修改管理員密碼
app.put('/api/admin/:id/password', authenticateToken, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const adminId = req.params.id;

  // 只允許超級管理員或本人修改密碼
  if (req.user.role !== 'super_admin' && req.user.id !== parseInt(adminId)) {
    return res.status(403).json({ message: '權限不足' });
  }

  try {
    // 獲取當前密碼
    const [rows] = await pool.query('SELECT password FROM WebAccount WHERE id = ?', [adminId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: '管理員不存在' });
    }

    // 如果不是超級管理員，需要驗證舊密碼
    if (req.user.role !== 'super_admin') {
      const isValidPassword = await bcrypt.compare(oldPassword, rows[0].password);
      if (!isValidPassword) {
        return res.status(400).json({ message: '舊密碼錯誤' });
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query('UPDATE WebAccount SET password = ? WHERE id = ?', [hashedPassword, adminId]);

    res.json({ message: '密碼修改成功' });
  } catch (error) {
    console.error('修改密碼錯誤:', error);
    res.status(500).json({ message: '內部服務器錯誤' });
  }
});

// 禮包碼相關 API
app.get('/api/gift-codes', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;

    // 分離查詢以提高穩定性
    const [rows] = await pool.query(
      `SELECT id, code, type, rewards, specific_accounts, expiry_date, check_creation_time, created_at
       FROM gift_codes
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );

    // 單獨查詢兌換次數
    for (let row of rows) {
      const [count] = await pool.query(
        `SELECT COUNT(*) as redeem_count FROM gift_code_redemptions WHERE code_id = ?`,
        [row.id]
      );
      row.redeem_count = count[0].redeem_count;
    }

    const [total] = await pool.query('SELECT COUNT(*) as total FROM gift_codes');

    res.json({
      data: rows,
      total: total[0].total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('獲取禮包碼列表錯誤:', {
      message: error.message,
      stack: error.stack,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
    });
    res.status(500).json({
      message: '獲取禮包碼列表失敗',
      error: process.env.NODE_ENV === 'development' ? error.message : '內部服務器錯誤',
    });
  }
});

app.post('/api/gift-codes', authenticateToken, async (req, res) => {
  try {
    const { code, type, rewards, specific_accounts, expiry_date, check_creation_time } = req.body;

    const result = await pool.query(
      `INSERT INTO gift_codes 
       (code, type, rewards, specific_accounts, expiry_date, check_creation_time)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [code, type, rewards, specific_accounts, expiry_date, check_creation_time]
    );

    // 記錄操作日誌
    await pool.query(
      `INSERT INTO gift_logs
       (action_type, code_id, code, details)
       VALUES ('create', ?, ?, ?)`,
      [result.insertId, code, '創建新禮包碼']
    );

    res.json({
      message: '創建禮包碼成功',
      id: result.insertId,
    });
  } catch (error) {
    console.error('創建禮包碼錯誤:', error);
    res.status(500).json({ message: '創建禮包碼失敗' });
  }
});

app.delete('/api/gift-codes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 獲取禮包碼信息用於日誌
    const [codeInfo] = await pool.query('SELECT code FROM gift_codes WHERE id = ?', [id]);

    if (!codeInfo.length) {
      return res.status(404).json({ message: '禮包碼不存在' });
    }

    await pool.query('DELETE FROM gift_codes WHERE id = ?', [id]);

    // 記錄操作日誌
    await pool.query(
      `INSERT INTO gift_logs
       (action_type, code_id, code, details)
       VALUES ('delete', ?, ?, ?)`,
      [id, codeInfo[0].code, '刪除禮包碼']
    );

    res.json({ message: '刪除禮包碼成功' });
  } catch (error) {
    console.error('刪除禮包碼錯誤:', error);
    res.status(500).json({ message: '刪除禮包碼失敗' });
  }
});

app.patch('/api/gift-codes/:id/extend', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { expiryDate } = req.body;

    // 獲取禮包碼信息用於日誌
    const [codeInfo] = await pool.query('SELECT code FROM gift_codes WHERE id = ?', [id]);

    if (!codeInfo.length) {
      return res.status(404).json({ message: '禮包碼不存在' });
    }

    await pool.query('UPDATE gift_codes SET expiry_date = ? WHERE id = ?', [expiryDate, id]);

    // 記錄操作日誌
    await pool.query(
      `INSERT INTO gift_logs
       (action_type, code_id, code, details)
       VALUES ('extend', ?, ?, ?)`,
      [id, codeInfo[0].code, `延長有效期至 ${expiryDate}`]
    );

    res.json({ message: '延長有效期成功' });
  } catch (error) {
    console.error('延長有效期錯誤:', error);
    res.status(500).json({ message: '延長有效期失敗' });
  }
});

// 更新禮包碼的特定帳號列表
app.patch('/api/gift-codes/:id/accounts', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { specific_accounts } = req.body;

    console.log('更新帳號請求:', { id, specific_accounts: !!specific_accounts });

    if (!id || !specific_accounts) {
      return res.status(400).json({ success: false, message: '缺少必要參數' });
    }

    // 獲取禮包碼信息用於日誌和檢查
    const [codeInfo] = await pool.query('SELECT code, type FROM gift_codes WHERE id = ?', [id]);

    if (!codeInfo.length) {
      return res.status(404).json({ message: '禮包碼不存在' });
    }

    // 檢查禮包碼類型是否為特定帳號類型
    if (codeInfo[0].type !== 'specific') {
      return res.status(400).json({ message: '只有特定帳號類型的禮包碼才能更新帳號列表' });
    }

    // 更新禮包碼的特定帳號列表
    const [updateResult] = await pool.query(
      'UPDATE gift_codes SET specific_accounts = ? WHERE id = ?', 
      [specific_accounts, id]
    );
    console.log('更新結果:', updateResult);

    try {
      // 記錄操作日誌
      await pool.query(
        `INSERT INTO gift_logs
         (action_type, code_id, code, details)
         VALUES ('update_accounts', ?, ?, ?)`,
        [id, codeInfo[0].code, '更新特定帳號列表']
      );
      console.log('記錄日誌成功');
    } catch (logError) {
      // 只記錄錯誤但不中斷操作
      console.error('記錄日誌錯誤:', logError);
    }

    res.json({ success: true, message: '更新帳號列表成功' });
  } catch (error) {
    console.error('更新帳號列表錯誤:', error);
    console.error('詳細錯誤信息:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      sqlMessage: error.sqlMessage
    });
    res.status(500).json({ 
      success: false, 
      message: '更新帳號列表失敗', 
      error: error.message,
      sqlMessage: error.sqlMessage
    });
  }
});

app.get('/api/gift-codes/:id/redemptions', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT * FROM gift_code_redemptions
         WHERE code_id = ?
         ORDER BY redeemed_at DESC
         LIMIT ? OFFSET ?`,
        [id, pageSize, offset]
      ),
      pool.query('SELECT COUNT(*) as total FROM gift_code_redemptions WHERE code_id = ?', [id]),
    ]);

    res.json({
      data: rows,
      total: total[0].total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('獲取兌換記錄錯誤:', error);
    res.status(500).json({ message: '獲取兌換記錄失敗' });
  }
});

app.get('/api/gift-codes/:id/logs', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT * FROM gift_logs
         WHERE code_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [id, pageSize, offset]
      ),
      pool.query('SELECT COUNT(*) as total FROM gift_logs WHERE code_id = ?', [id]),
    ]);

    res.json({
      data: rows,
      total: total[0].total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('獲取操作日誌錯誤:', error);
    res.status(500).json({ message: '獲取操作日誌失敗' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
  });
});

// 啟動服務器
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Local access URL: http://localhost:${port}`);
  console.log(`Network access URL: http://103.88.33.228:${port}`);
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use`);
  } else {
    console.error('Server error:', error);
  }
});

// Handle process termination
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT. Closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});