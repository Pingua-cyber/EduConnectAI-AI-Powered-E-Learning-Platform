require('dotenv').config();
const aiService = require('./backend/services/aiService');

async function run() {
    try {
        console.log("Running stream test with 'What is photosynthesis?'...");
        const stream = await aiService.getStudyBuddyStream("What is photosynthesis?");
        let fullResponse = "";
        for await (const chunk of stream) {
            console.log("Chunk received:", JSON.stringify(chunk));
            fullResponse += chunk;
        }
        console.log("\nFull response:", JSON.stringify(fullResponse));
    } catch (err) {
        console.error("Stream test encountered error:", err);
    }
}

run();
