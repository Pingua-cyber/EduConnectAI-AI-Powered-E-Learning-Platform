require('dotenv').config();
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

async function testMultipleUploads() {
    console.log("==================================================");
    console.log("TESTING MULTIPLE FILE UPLOADS & REASONING");
    console.log("==================================================");

    // Create temporary text files for the test
    const file1Path = path.join(__dirname, 'temp_quote.txt');
    const file2Path = path.join(__dirname, 'temp_author.txt');

    fs.writeFileSync(file1Path, "Topic: Quantum Physics. Core concept: Entanglement allows particles to share states instantaneously across distances.");
    fs.writeFileSync(file2Path, "Topic: Quantum Physics. History: Einstein famously called quantum entanglement 'spooky action at a distance' because he doubted its completeness.");

    console.log("[TEST PREPARATION] Created temporary files:");
    console.log(" - temp_quote.txt");
    console.log(" - temp_author.txt");

    try {
        const token = jwt.sign(
            { id: 29, role: 'student' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const baseUrl = 'http://localhost:5041/ai/student';

        console.log("\n[TEST 1] POST /study-buddy with 2 attached files...");
        
        const formData = new FormData();
        formData.append('term', 'Compare the two attached files. What are the key concepts explained, who said what, and why did they say it? Use step-by-step thinking to analyze both.');
        formData.append('chat_id', 'new');

        // Read files into Blobs for Node fetch
        const file1Content = fs.readFileSync(file1Path);
        const file2Content = fs.readFileSync(file2Path);

        const file1Blob = new Blob([file1Content], { type: 'text/plain' });
        const file2Blob = new Blob([file2Content], { type: 'text/plain' });

        formData.append('chat_files', file1Blob, 'temp_quote.txt');
        formData.append('chat_files', file2Blob, 'temp_author.txt');

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
        console.log("Received X-Chat-ID Header:", chat_id);

        if (!chat_id) throw new Error("Server did not return X-Chat-ID header!");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        console.log("\n--- AI STREAMED RESPONSE CHUNKS ---");
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            process.stdout.write(chunk);
            fullText += chunk;
        }
        console.log("\n-----------------------------------\n");

        console.log("AI Streamed Content length:", fullText.length);

        // Verify database persistence
        console.log(`\n[TEST 2] GET /chats/${chat_id} (Checking saved multi-file user prompt & AI reasoning in DB)...`);
        const msgRes = await fetch(`${baseUrl}/chats/${chat_id}`, {
            headers: { 'Cookie': `token=${token}` }
        });
        const msgData = await msgRes.json();
        console.log("Saved Messages Count:", msgData.messages.length);
        msgData.messages.forEach((msg, idx) => {
            console.log(`\nMessage ${idx + 1} [${msg.role}]:`);
            console.log(msg.content.substring(0, 300) + (msg.content.length > 300 ? "..." : ""));
        });

        // Clean up chat from database
        console.log(`\n[TEST 3] DELETE /chats/${chat_id} (Cleaning up dynamic test chat)...`);
        const deleteRes = await fetch(`${baseUrl}/chats/${chat_id}`, {
            method: 'DELETE',
            headers: { 'Cookie': `token=${token}` }
        });
        const deleteData = await deleteRes.json();
        console.log("Cleanup Response:", deleteData);

        console.log("\n==================================================");
        console.log("MULTIPLE FILE UPLOAD & REASONING TEST COMPLETED SUCCESSFULLY!");
        console.log("==================================================");

    } catch (err) {
        console.error("\n[TEST FAILURE]:", err.message);
    } finally {
        // Clean up temporary local files
        try {
            if (fs.existsSync(file1Path)) fs.unlinkSync(file1Path);
            if (fs.existsSync(file2Path)) fs.unlinkSync(file2Path);
            console.log("\n[TEST CLEANUP] Deleted temporary local files.");
        } catch (e) {
            console.error("Failed to delete temp local files:", e.message);
        }
    }
}

testMultipleUploads();
