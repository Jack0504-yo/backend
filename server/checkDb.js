const mysql = require('mysql2/promise');

async function checkDatabase() {
  const connection = await mysql.createConnection({
    host: '103.88.33.228',
    port: 3306,
    user: 'admin',
    password: 'NmezXzXSGCGKnksYFEPQ',
    database: 'tms'
  });

  try {
    // First check if we can connect to the database
    console.log('Attempting to connect to database...');
    await connection.query('SELECT 1');
    console.log('Successfully connected to database!');

    // Check if tables exist
    const [tables] = await connection.query('SHOW TABLES');
    console.log('Available tables:', tables);

  } catch (error) {
    console.error('Database connection error:', error);
  } finally {
    await connection.end();
  }
}

checkDatabase(); 