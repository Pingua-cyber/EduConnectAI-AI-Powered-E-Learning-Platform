const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function fixDb() {
    try {
        console.log("Connecting without selecting a specific database first...");
        const initPool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            waitForConnections: true,
            connectionLimit: 1,
            queueLimit: 0
        });

        // 1. Create DB if missing
        await initPool.query('CREATE DATABASE IF NOT EXISTS educonnect_db');
        await initPool.end(); // close

        console.log("Database ensured. Now switching context and building tables...");

        // 2. Connect to the DB
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'educonnect_db',
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0
        });

        const sql = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8');
        const statements = sql.split(';').filter(stmt => stmt.trim() !== '');

        // 3. DO NOT use prepared statements (execute), use text protocol (query)
        for (let stmt of statements) {
            if (stmt.trim()) {
                await pool.query(stmt);
            }
        }
        
        console.log("All tables created successfully (or they already exist).");
        await pool.end();
        process.exit(0);

    } catch (err) {
        console.error("Critical Error applying schema:", err);
        process.exit(1);
    }
}

fixDb();
