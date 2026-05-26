const aiService = require('../services/aiService');
const pool = require('../config/db');

// Helper to generate a smart, short conversation title
function generateTitle(text) {
    if (!text) return "New Conversation";
    const cleanText = text.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const words = cleanText.split(/\s+/);
    if (words.length <= 4) {
        return cleanText || "New Conversation";
    }
    return words.slice(0, 4).join(" ") + "...";
}

// Handles Teacher MCQs generation request
exports.generateQuestions = async (req, res) => {
    const { topic, count } = req.body;
    try {
        if (!topic) {
            return res.status(400).json({ error: 'Topic is required.' });
        }
        const questions = await aiService.generateMCQs(topic, count);
        res.json({ success: true, questions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Handles Student Study Buddy request
exports.askStudyBuddy = async (req, res) => {
    const { term } = req.body;
    let { chat_id } = req.body;
    const student_id = req.user.id;

    try {
        const files = req.files || [];

        if (!term && files.length === 0) {
            return res.status(400).send('ERROR: Term or files are required.');
        }

        // If no chat_id is provided or it is a new chat request
        if (!chat_id || chat_id === 'new' || chat_id === 'null' || chat_id === 'undefined') {
            const title = generateTitle(term || (files.length > 0 ? files[0].originalname : "New Conversation"));
            const [chatResult] = await pool.query(
                'INSERT INTO ai_chats (student_id, title) VALUES (?, ?)',
                [student_id, title]
            );
            chat_id = chatResult.insertId;
        }

        // Save Student's User Message to database
        let userMsg = term || "";
        if (files.length > 0) {
            const fileListStr = files.map(f => `[Uploaded file: ${f.originalname}]`).join(", ");
            userMsg = term ? `${term} (Attached: ${fileListStr})` : `Uploaded files for analysis: ${fileListStr}`;
        }
        
        await pool.query(
            'INSERT INTO ai_messages (chat_id, role, content) VALUES (?, ?, ?)',
            [chat_id, 'user', userMsg]
        );

        // Expose chat_id to frontend via headers
        res.setHeader('X-Chat-ID', chat_id.toString());
        res.setHeader('Access-Control-Expose-Headers', 'X-Chat-ID');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        const stream = await aiService.getStudyBuddyStream(term, files);
        
        let isAborted = false;
        req.on('close', () => {
            isAborted = true;
        });

        let fullText = "";
        for await (const chunk of stream) {
            if (isAborted || req.socket?.destroyed) {
                console.log("[Lumina AI] Connection closed by user. Stopping stream.");
                break;
            }
            res.write(chunk);
            fullText += chunk;
        }

        // Save AI's response to database if streaming completed successfully
        if (!isAborted && !req.socket?.destroyed && fullText.trim()) {
            await pool.query(
                'INSERT INTO ai_messages (chat_id, role, content) VALUES (?, ?, ?)',
                [chat_id, 'ai', fullText]
            );
        }

        res.end();
    } catch (err) {
        console.error("Study Buddy streaming error:", err);
        if (!res.headersSent) {
            res.status(500).send("ERROR: " + err.message);
        } else {
            res.end("\n\n[ERROR: " + err.message + "]");
        }
    }
};

// GET all chats for logged-in student
exports.getSavedChats = async (req, res) => {
    const student_id = req.user.id;
    try {
        const [chats] = await pool.query(
            'SELECT id, title, created_at FROM ai_chats WHERE student_id = ? ORDER BY created_at DESC',
            [student_id]
        );
        res.json({ success: true, chats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// POST Create new chat conversation session manually
exports.createChat = async (req, res) => {
    const student_id = req.user.id;
    const { title } = req.body;
    try {
        const [result] = await pool.query(
            'INSERT INTO ai_chats (student_id, title) VALUES (?, ?)',
            [student_id, title || 'New Conversation']
        );
        res.json({ success: true, chat_id: result.insertId, title: title || 'New Conversation' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// GET all messages in a specific chat
exports.getChatMessages = async (req, res) => {
    const student_id = req.user.id;
    const { id } = req.params;
    try {
        // Verify chat belongs to this student
        const [chat] = await pool.query('SELECT student_id FROM ai_chats WHERE id = ?', [id]);
        if (chat.length === 0) {
            return res.status(404).json({ success: false, error: 'Chat not found.' });
        }
        if (chat[0].student_id !== student_id) {
            return res.status(403).json({ success: false, error: 'Access denied.' });
        }

        const [messages] = await pool.query(
            'SELECT role, content, created_at FROM ai_messages WHERE chat_id = ? ORDER BY id ASC',
            [id]
        );
        res.json({ success: true, messages });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// PUT Rename chat conversation title
exports.renameChat = async (req, res) => {
    const student_id = req.user.id;
    const { id } = req.params;
    const { title } = req.body;
    try {
        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, error: 'Title is required.' });
        }
        const [result] = await pool.query(
            'UPDATE ai_chats SET title = ? WHERE id = ? AND student_id = ?',
            [title.trim(), id, student_id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Chat not found or access denied.' });
        }
        res.json({ success: true, message: 'Chat renamed successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// DELETE a specific chat conversation
exports.deleteChat = async (req, res) => {
    const student_id = req.user.id;
    const { id } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM ai_chats WHERE id = ? AND student_id = ?',
            [id, student_id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Chat not found or access denied.' });
        }
        res.json({ success: true, message: 'Chat deleted successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
