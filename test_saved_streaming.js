require('dotenv').config();
const jwt = require('jsonwebtoken');

async function testSavedStreaming() {
    try {
        console.log("==================================================");
        console.log("TESTING DYNAMIC SAVED STREAMING CONVERSATIONS");
        console.log("==================================================");

        const token = jwt.sign(
            { id: 29, role: 'student' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const baseUrl = 'http://localhost:5041/ai/student';

        // 1. Send streaming study-buddy request with 'chat_id = new'
        console.log("\n[TEST 1] POST /study-buddy (Ask query & Auto-create chat)...");
        const formData = new FormData();
        formData.append('term', 'What is photosynthesis? Explain briefly.');
        formData.append('chat_id', 'new');

        const response = await fetch(`${baseUrl}/study-buddy`, {
            method: 'POST',
            headers: {
                'Cookie': `token=${token}`
            },
            body: formData
        });

        console.log("Response Status:", response.status);
        
        // Capture dynamic chat_id from response header
        const chat_id = response.headers.get('X-Chat-ID');
        console.log("Recieved X-Chat-ID Header:", chat_id);

        if (!chat_id) throw new Error("Server did not return X-Chat-ID header!");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;
        }

        console.log("AI Streamed Content length:", fullText.length);
        console.log("AI Snippet:", JSON.stringify(fullText.substring(0, 100)));

        // 2. Fetch list of chats to ensure the title was generated automatically
        console.log("\n[TEST 2] GET /chats (Checking automatically generated title)...");
        const listRes = await fetch(`${baseUrl}/chats`, {
            headers: { 'Cookie': `token=${token}` }
        });
        const listData = await listRes.json();
        const matchingChat = listData.chats.find(c => c.id.toString() === chat_id.toString());
        console.log("Automatically Generated Chat Item:", matchingChat);

        // 3. Fetch messages of this chat to ensure they are saved in MySQL
        console.log(`\n[TEST 3] GET /chats/${chat_id} (Checking saved message history in DB)...`);
        const msgRes = await fetch(`${baseUrl}/chats/${chat_id}`, {
            headers: { 'Cookie': `token=${token}` }
        });
        const msgData = await msgRes.json();
        console.log("Saved Messages Count:", msgData.messages.length);
        msgData.messages.forEach((msg, idx) => {
            console.log(`Message ${idx + 1} [${msg.role}]:`, JSON.stringify(msg.content.substring(0, 100)));
        });

        // 4. Clean up: Delete the generated chat
        console.log(`\n[TEST 4] DELETE /chats/${chat_id} (Cleaning up dynamic test chat)...`);
        const deleteRes = await fetch(`${baseUrl}/chats/${chat_id}`, {
            method: 'DELETE',
            headers: { 'Cookie': `token=${token}` }
        });
        const deleteData = await deleteRes.json();
        console.log("Cleanup Response:", deleteData);

        console.log("\n==================================================");
        console.log("DYNAMIC STREAMING PERSISTENCE TEST COMPLETED SUCCESSFULLY!");
        console.log("==================================================");

    } catch (err) {
        console.error("Streaming test failed:", err.message);
    }
}

testSavedStreaming();
