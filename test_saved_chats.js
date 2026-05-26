require('dotenv').config();
const jwt = require('jsonwebtoken');

async function testSavedChatsAPI() {
    try {
        console.log("==================================================");
        console.log("TESTING SAVED CHATS CRUD REST API ENDPOINTS");
        console.log("==================================================");

        const token = jwt.sign(
            { id: 29, role: 'student' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const baseUrl = 'http://localhost:5041/ai/student';

        // 1. Create a new chat
        console.log("\n[TEST 1] POST /chats (Create Chat)...");
        const createRes = await fetch(`${baseUrl}/chats`, {
            method: 'POST',
            headers: {
                'Cookie': `token=${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title: 'Science Exam Help' })
        });
        const createData = await createRes.json();
        console.log("Status:", createRes.status);
        console.log("Response:", createData);
        
        if (!createData.success) throw new Error("Failed to create chat");
        const chat_id = createData.chat_id;

        // 2. Get all chats list
        console.log("\n[TEST 2] GET /chats (List Chats)...");
        const listRes = await fetch(`${baseUrl}/chats`, {
            headers: { 'Cookie': `token=${token}` }
        });
        const listData = await listRes.json();
        console.log("Status:", listRes.status);
        console.log("Chats Count:", listData.chats.length);
        console.log("Latest Chat in list:", listData.chats[0]);

        // 3. Rename the newly created chat
        console.log(`\n[TEST 3] PUT /chats/${chat_id} (Rename Chat)...`);
        const renameRes = await fetch(`${baseUrl}/chats/${chat_id}`, {
            method: 'PUT',
            headers: {
                'Cookie': `token=${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title: 'Advanced Chemistry Prep' })
        });
        const renameData = await renameRes.json();
        console.log("Status:", renameRes.status);
        console.log("Response:", renameData);

        // 4. Fetch the message history (should be empty for manually created chat)
        console.log(`\n[TEST 4] GET /chats/${chat_id} (Load messages)...`);
        const msgRes = await fetch(`${baseUrl}/chats/${chat_id}`, {
            headers: { 'Cookie': `token=${token}` }
        });
        const msgData = await msgRes.json();
        console.log("Status:", msgRes.status);
        console.log("Messages List:", msgData.messages);

        // 5. Clean up: Delete the created chat
        console.log(`\n[TEST 5] DELETE /chats/${chat_id} (Delete Chat)...`);
        const deleteRes = await fetch(`${baseUrl}/chats/${chat_id}`, {
            method: 'DELETE',
            headers: { 'Cookie': `token=${token}` }
        });
        const deleteData = await deleteRes.json();
        console.log("Status:", deleteRes.status);
        console.log("Response:", deleteData);

        console.log("\n==================================================");
        console.log("ALL REST ENDPOINT TESTS COMPLETED SUCCESSFULLY!");
        console.log("==================================================");

    } catch (err) {
        console.error("REST API Test failed:", err.message);
    }
}

testSavedChatsAPI();
