const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/server');
const mammoth = require('mammoth');
const fs = require('fs');
require('dotenv').config();

// Initialize Gemini API with key from .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

// List of candidate models in order of preference
const candidateModels = [
    process.env.GEMINI_MODEL,       // Allow user-specified override
    "gemini-2.5-flash",             // Extremely modern, high speed, and robust
    "gemini-2.5-flash-lite",        // Excellent light model fallback
    "gemini-3.1-flash-lite",        // Futuristic preview fallback
    "gemini-flash-lite-latest",     // General light fallback
    "gemini-flash-latest"           // Default fallback
].filter(Boolean);

let currentModelIndex = 0;

/**
 * Get currently selected model name
 */
function getModelName() {
    return candidateModels[currentModelIndex] || "gemini-2.5-flash";
}

/**
 * Rotate to the next model in candidate list when quota is exceeded
 */
function rotateModel() {
    currentModelIndex = (currentModelIndex + 1) % candidateModels.length;
    console.log(`[Gemini Router] Quota issue detected. Switching active model to "${getModelName()}"`);
}

/**
 * Helper to identify if an error is quota / rate limit related (429)
 */
function isQuotaError(err) {
    if (!err) return false;
    const msg = (err.message || "").toLowerCase();
    return msg.includes("429") || msg.includes("quota") || msg.includes("limit") || msg.includes("rate");
}

/**
 * Teacher functionality: Generate Multiple-Choice Questions based on a topic
 */
exports.generateMCQs = async (topic, count = 5) => {
    const safeCount = Math.min(Math.max(parseInt(count, 10) || 5, 1), 50);
    const prompt = `Generate ${safeCount} multiple-choice questions for the following course topic: "${topic}". 
                    Format the response purely as a JSON array where each object has "question" (string), "options" (an array of 4 strings), and "answer" (the exactly matching string from options).
                    Return ONLY valid JSON and no other text or explanation.`;

    const maxRetries = candidateModels.length;
    let attempts = 0;

    while (attempts < maxRetries) {
        try {
            const modelName = getModelName();
            const model = genAI.getGenerativeModel({ model: modelName });
            
            const result = await model.generateContent(prompt);
            const response = await result.response;
            let text = response.text();

            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(text);
        } catch (error) {
            console.warn(`[MCQ Generation] Model "${getModelName()}" failed:`, error.message);
            if (isQuotaError(error) && attempts < maxRetries - 1) {
                rotateModel();
                attempts++;
            } else {
                throw new Error("Failed to generate questions due to Gemini API rate limits. Please try again shortly.");
            }
        }
    }
};

/**
 * Teacher functionality: Generate Dashboard Insight
 */
exports.getTeacherInsight = async (bestCourse, worstCourse, avgScore) => {
    if (avgScore === 0) return "Create courses and assign quizzes to unlock AI-powered teaching insights.";

    const prompt = `You are an AI teaching assistant. The teacher's class average is ${avgScore}%. Their best performing course is "${bestCourse}", and the one needing most attention is "${worstCourse}". Provide a very short, encouraging 1-sentence tip (max 12 words) on what to focus on.`;
    
    const maxRetries = candidateModels.length;
    let attempts = 0;

    while (attempts < maxRetries) {
        try {
            const modelName = getModelName();
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return (await result.response).text().trim().replace(/"/g, '');
        } catch (error) {
            console.warn(`[Teacher Insight] Model "${getModelName()}" failed:`, error.message);
            if (isQuotaError(error) && attempts < maxRetries - 1) {
                rotateModel();
                attempts++;
            } else {
                break;
            }
        }
    }
    return "Review recent quiz scores to identify student knowledge gaps.";
};

/**
 * Student functionality: Ask Lumina AI to explain a term or analyze multiple files
 */
exports.getStudyBuddyStream = async function* (term, files = []) {
    const uploadedFiles = [];
    const extractedWordTexts = [];
    const uploadPromises = [];

    // 1. Parallel File uploading / extraction (Done ONCE)
    for (const file of files) {
        const filePath = file.path;
        const mimeType = file.mimetype;
        const originalName = file.originalname;

        if (mimeType.includes("wordprocessingml") || mimeType.includes("msword") || filePath.endsWith('.docx') || filePath.endsWith('.doc')) {
            uploadPromises.push((async () => {
                try {
                    const textResult = await mammoth.extractRawText({ path: filePath });
                    extractedWordTexts.push(`[File: ${originalName}]\n${textResult.value}`);
                } catch (err) {
                    console.error(`[Lumina AI Service] Mammoth extraction failed for ${originalName}:`, err);
                    extractedWordTexts.push(`[File: ${originalName}]\n(Text extraction failed: ${err.message})`);
                }
            })());
        } else if (mimeType.includes("text/plain") || filePath.endsWith('.txt')) {
            uploadPromises.push((async () => {
                try {
                    const textContent = fs.readFileSync(filePath, 'utf8');
                    extractedWordTexts.push(`[File: ${originalName}]\n${textContent}`);
                } catch (err) {
                    console.error(`[Lumina AI Service] Text extraction failed for ${originalName}:`, err);
                    extractedWordTexts.push(`[File: ${originalName}]\n(Text extraction failed: ${err.message})`);
                }
            })());
        } else {
            uploadPromises.push((async () => {
                try {
                    const uploadResponse = await fileManager.uploadFile(filePath, {
                        mimeType: mimeType,
                        displayName: originalName,
                    });
                    uploadedFiles.push({
                        name: uploadResponse.file.name,
                        mimeType: uploadResponse.file.mimeType,
                        fileUri: uploadResponse.file.uri
                    });
                } catch (err) {
                    console.error(`[Lumina AI Service] FileManager upload failed for ${originalName}:`, err);
                    throw err;
                }
            })());
        }
    }

    try {
        if (uploadPromises.length > 0) {
            await Promise.all(uploadPromises);
        }

        // Build parts array once
        const parts = [];
        for (const uf of uploadedFiles) {
            parts.push({
                fileData: {
                    mimeType: uf.mimeType,
                    fileUri: uf.fileUri
                }
            });
        }

        let promptText = `You are Lumina AI, powered by the highly advanced Gemini 3.5 Pro architectural core. You act as an elite academic mentor, research analyst, and multi-disciplinary expert with futuristic conceptual intelligence.
USER QUERY: "${term || "Please analyze the attached files and provide detailed insights."}"

CRITICAL INTELLECTUAL DIRECTIONS (GEMINI 3.5 PROTOCOL):
1. FUTURISTIC THINKING & STEP-BY-STEP REASONING: Approach every query with supreme analytical rigor. Map out complex logic step-by-step. Show a clear, transparent "Thinking Process" block at the start of highly technical or multi-part queries.
2. ELITE COMPREHENSION & HIGH-FIDELITY SYNTHESIS: Perform deep, high-fidelity analyses of all provided documents, images, and text. Identify hidden relationships, compare viewpoints, resolve contradictions, and cite source materials seamlessly.
3. PROFESSIONAL STRUCTURE: Output gorgeous, production-grade markdown layouts. Utilize bold semantic headings, clean bullet points, mathematical LaTeX expressions where relevant, side-by-side markdown comparison tables, and highlighted syntax-specific code blocks.
4. MAXIMUM ACADEMIC DEPTH: Do not provide brief, basic, or superficial answers. Deliver deep, thorough, and highly conceptual explanations, defining underlying mechanisms and teaching concepts so the student gains true academic mastery.
5. SUGGESTIONS AND FOLLOW-UPS: You MUST always conclude your response with a horizontal rule (---), followed by a header "### 💡 Suggested Follow-ups:", and exactly 3 highly relevant, specific, and contextual follow-up prompt questions for the student. Formulate them as clickable prompt options, using exactly this format:
* **Ask:** "Contextual prompt question 1?"
* **Ask:** "Contextual prompt question 2?"
* **Ask:** "Contextual prompt question 3?"
Ensure these suggestions are tailored directly to your explanation and invite the student to explore deeper, request a quiz on the content, or see a real-world analogy.`;

        if (extractedWordTexts.length > 0) {
            promptText += `\n\n--- EXTRACTED DOCUMENT TEXTS ---\n`;
            extractedWordTexts.forEach(textBlock => {
                promptText += `${textBlock}\n\n`;
            });
        }
        parts.push({ text: promptText });

        // 2. Reactive model failover loop
        const maxRetries = candidateModels.length;
        let attempts = 0;
        let success = false;

        while (attempts < maxRetries && !success) {
            try {
                const modelName = getModelName();
                console.log(`[Lumina AI] Attempting stream with model: "${modelName}" (Attempt ${attempts + 1}/${maxRetries})`);
                const model = genAI.getGenerativeModel({ model: modelName });
                
                const resultStream = await model.generateContentStream(parts);
                
                for await (const chunk of resultStream.stream) {
                    const chunkText = chunk.text();
                    if (chunkText) {
                        yield chunkText;
                    }
                }
                success = true; // Stream completed successfully!
            } catch (error) {
                console.warn(`[Lumina AI Stream] Model "${getModelName()}" failed:`, error.message);
                if (isQuotaError(error) && attempts < maxRetries - 1) {
                    rotateModel();
                    attempts++;
                } else {
                    throw error; // Throw other errors immediately, or if we are out of retries
                }
            }
        }
    } catch (err) {
        console.error("[Lumina AI Service] Execution failed:", err.message);
        yield "\n\n[ERROR: Failed to fetch Lumina AI explanation: " + err.message + "]\n\n[TIP: All available Gemini models have exceeded their daily free-tier quota. Please try again shortly or configure a custom GEMINI_MODEL in the system configuration.]";
    } finally {
        // Clean up temporary uploads from Gemini File Manager in parallel
        if (uploadedFiles.length > 0) {
            uploadedFiles.forEach(uf => {
                fileManager.deleteFile(uf.name).catch(e => 
                    console.error(`[Lumina AI CleanUp] Error deleting ${uf.name}:`, e.message)
                );
            });
        }
    }
};
