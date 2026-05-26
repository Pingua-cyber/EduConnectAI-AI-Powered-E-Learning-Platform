require('dotenv').config();
const jwt = require('jsonwebtoken');

async function testEndpoint() {
    try {
        console.log("Generating a valid JWT token for Student Roshan (ID 29)...");
        
        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET is missing from .env!");
            return;
        }

        const token = jwt.sign(
            { id: 29, role: 'student' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        console.log("JWT Token generated:", token);
        console.log("Making fetch request to localhost:5041/ai/student/study-buddy...");

        const formData = new FormData();
        formData.append('term', 'hi');

        const response = await fetch('http://localhost:5041/ai/student/study-buddy', {
            method: 'POST',
            headers: {
                'Cookie': `token=${token}`
            },
            body: formData
        });

        console.log("Response Status:", response.status);
        console.log("Response Headers:", [...response.headers.entries()]);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error from endpoint:", errorText);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            console.log("Received chunk:", JSON.stringify(chunk));
            fullText += chunk;
        }

        console.log("\nFull response from live server:", JSON.stringify(fullText));

    } catch (err) {
        console.error("Error connecting to live server:", err.message);
    }
}

testEndpoint();
