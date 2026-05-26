require('dotenv').config();
const aiService = require('./backend/services/aiService');
const fs = require('fs');
const path = require('path');

async function test() {
    try {
        const dummyPath = path.join(__dirname, 'dummy.pdf');
        fs.writeFileSync(dummyPath, "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"); // fake pdf
        
        console.log("Testing with unsupported file...");
        const res2 = await aiService.getStudyBuddyExplanation("What does the file say?", dummyPath, "application/pdf");
        console.log("File result:", res2);
    } catch(e) {
        console.error("File test failed:", e);
    }
}

test();
