const nodemailer = require('nodemailer');
const pool = require('../config/db');

// Create a reusable transporter using Ethereal (for development)
// In production, you would use a real SMTP service like SendGrid, AWS SES, or Gmail.
let transporter;

async function initTransporter() {
    if (!transporter) {
        try {
            // Generate ethereal test account on the fly
            let testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email",
                port: 465,
                secure: true, 
                auth: {
                    user: testAccount.user, 
                    pass: testAccount.pass, 
                },
            });
            console.log("Email service initialized with Ethereal.");
        } catch (error) {
            console.error("Failed to initialize email transporter:", error);
        }
    }
    return transporter;
}

exports.sendNotificationToAllStudents = async (subject, htmlContent) => {
    try {
        const t = await initTransporter();
        if (!t) return;

        // Fetch all students
        const [students] = await pool.query('SELECT email FROM users WHERE role = "student"');
        
        if (students.length === 0) {
            console.log("No students to email.");
            return;
        }

        const emailAddresses = students.map(s => s.email).join(', ');

        let info = await t.sendMail({
            from: '"EduConnectAI Admin" <admin@educonnectai.com>', 
            to: emailAddresses, // Bcc is usually better for bulk, but this is a demo
            subject: subject,
            html: htmlContent, 
        });

        console.log("Message sent: %s", info.messageId);
        // Preview only available when sending through an Ethereal account
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    } catch (error) {
        console.error("Error sending email notification:", error);
    }
};
