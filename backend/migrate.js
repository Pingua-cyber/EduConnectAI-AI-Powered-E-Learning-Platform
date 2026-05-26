const pool = require('./config/db');
const fs = require('fs');
const path = require('path');

async function migrate() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8');
        const statements = sql.split(';').filter(stmt => stmt.trim() !== '');

        // Just to ensure clean state for this demo upgrade, we drop existing tables
        // Warning: This deletes all data!
        console.log("Dropping old tables...");
        await pool.query('SET FOREIGN_KEY_CHECKS = 0');
        await pool.query('DROP TABLE IF EXISTS scores');
        await pool.query('DROP TABLE IF EXISTS quizzes');
        await pool.query('DROP TABLE IF EXISTS materials');
        await pool.query('DROP TABLE IF EXISTS courses');
        await pool.query('DROP TABLE IF EXISTS subjects');
        await pool.query('DROP TABLE IF EXISTS users');
        await pool.query('SET FOREIGN_KEY_CHECKS = 1');

        console.log("Applying schema...");
        for (let stmt of statements) {
            if (stmt.trim()) {
                await pool.query(stmt);
            }
        }
        console.log("Migration complete!");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
