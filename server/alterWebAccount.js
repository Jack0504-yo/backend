const mysql = require('mysql2/promise');

async function alterWebAccountTable() {
    const connection = await mysql.createConnection({
        host: '103.88.33.228',
        port: 3306,
        user: 'admin',
        password: 'NmezXzXSGCGKnksYFEPQ',
        database: 'tms'
    });

    try {
        console.log('Adding created_by column to WebAccount table...');
        
        // Add created_by column
        const alterTableSQL = `
        ALTER TABLE WebAccount 
        ADD COLUMN created_by INT,
        ADD FOREIGN KEY (created_by) REFERENCES WebAccount(id)`;
        
        await connection.query(alterTableSQL);
        console.log('created_by column added successfully');

    } catch (error) {
        console.error('Error altering table:', error);
    } finally {
        await connection.end();
    }
}

alterWebAccountTable(); 