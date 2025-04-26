const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function updateAdminPassword() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'e22621960',
    database: 'game_account_system'
  });

  try {
    // 生成新的密碼哈希
    const password = 'admin123';
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    
    // 更新管理員密碼
    await connection.query(
      'UPDATE admin_users SET password = ? WHERE username = ?',
      [hash, 'admin']
    );
    
    console.log('Password updated successfully');
    
    // 驗證更新
    const [admins] = await connection.query('SELECT * FROM admin_users');
    console.log('Updated admin data:', admins);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

updateAdminPassword(); 