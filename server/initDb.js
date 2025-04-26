const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

async function initializeDatabase() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'e22621960'  // 請將這裡改為您設置的 MySQL root 密碼
  });

  try {
    // 讀取 SQL 文件
    const sqlFile = await fs.readFile(path.join(__dirname, 'init.sql'), 'utf8');
    const statements = sqlFile.split(';').filter(stmt => stmt.trim());

    // 執行每個 SQL 語句
    for (let statement of statements) {
      if (statement.trim()) {
        await connection.query(statement);
        console.log('執行 SQL:', statement.trim().slice(0, 50) + '...');
      }
    }

    console.log('資料庫初始化完成！');
  } catch (error) {
    console.error('初始化錯誤:', error);
  } finally {
    await connection.end();
  }
}

initializeDatabase(); 