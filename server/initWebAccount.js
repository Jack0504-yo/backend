const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs').promises;
const path = require('path');

async function initializeWebAccount() {
    const connection = await mysql.createConnection({
        host: '103.88.33.228',
        port: 3306,
        user: 'admin',
        password: 'NmezXzXSGCGKnksYFEPQ',
        database: 'tms'
    });

    try {
        console.log('Creating WebAccount table...');
        
        // Create the table
        const createTableSQL = `
        CREATE TABLE IF NOT EXISTS WebAccount (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            email VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            status ENUM('active', 'inactive', 'banned') DEFAULT 'active',
            last_login TIMESTAMP NULL,
            role ENUM('user', 'admin', 'super_admin') DEFAULT 'user',
            INDEX idx_username (username),
            INDEX idx_email (email),
            INDEX idx_status (status)
        )`;
        
        await connection.query(createTableSQL);
        console.log('WebAccount table created successfully with indexes');

        // Insert default admin account
        console.log('Creating default admin account...');
        const hashedPassword = await bcrypt.hash('e22621960', 10);
        const insertAdminSQL = `
        INSERT INTO WebAccount (username, password, email, role) 
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE password = VALUES(password)`;
        
        await connection.query(insertAdminSQL, [
            'e1994061202',
            hashedPassword,
            'admin@example.com',
            'super_admin'
        ]);
        console.log('Default admin account created successfully');

        console.log('Database initialization completed successfully!');
    } catch (error) {
        console.error('Error initializing database:', error);
    } finally {
        await connection.end();
    }
}

initializeWebAccount(); 