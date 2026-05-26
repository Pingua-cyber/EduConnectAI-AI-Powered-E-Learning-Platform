const pool = require('../config/db');

async function run() {
    try {
        console.log("[Migration] Safe schema update for Saved AI Conversations...");
        
        // 1. Create ai_chats table if not exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ai_chats (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id INT NOT NULL,
                title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log("-> Table 'ai_chats' ensured.");

        // 2. Create ai_messages table if not exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ai_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                chat_id INT NOT NULL,
                role ENUM('user', 'ai') NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chat_id) REFERENCES ai_chats(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log("-> Table 'ai_messages' ensured.");

        console.log("[Migration] All AI tables Ensured Successfully!");
        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error("Migration script failed:", err.message);
        process.exit(1);
    }
}

run();
