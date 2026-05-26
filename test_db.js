const pool = require('./backend/config/db');

async function run() {
    try {
        const [users] = await pool.query("SELECT id, name, email, role FROM users");
        console.log("Users in Database:", users);
        await pool.end();
    } catch (err) {
        console.error("Database connection failed:", err.message);
    }
}

run();
