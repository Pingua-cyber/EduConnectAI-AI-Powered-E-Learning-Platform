const pool = require('./config/db');
const bcrypt = require('bcryptjs');

async function seed() {
    try {
        console.log("Starting database seed...");

        // 1. Create test users
        const hashedPassword = await bcrypt.hash('password123', 10);

        // Teacher
        const [teacherResult] = await pool.query(
            'INSERT IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            ['Ravi Kumar', 'ravi@example.com', hashedPassword, 'teacher']
        );
        const teacher_id = teacherResult.insertId || 1;

        // Student
        const [studentResult] = await pool.query(
            'INSERT IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            ['Amit Singh', 'amit@example.com', hashedPassword, 'student']
        );
        const student_id = studentResult.insertId || 2;

        console.log(`✓ Users created/verified (teacher_id: ${teacher_id}, student_id: ${student_id})`);

        // 2. Create test subjects
        const [subject1] = await pool.query(
            'INSERT IGNORE INTO subjects (name, teacher_id) VALUES (?, ?)',
            ['Computer Networks', teacher_id]
        );
        const subject_id_1 = subject1.insertId || 1;

        const [subject2] = await pool.query(
            'INSERT IGNORE INTO subjects (name, teacher_id) VALUES (?, ?)',
            ['Machine Learning', teacher_id]
        );
        const subject_id_2 = subject2.insertId || 2;

        console.log(`✓ Subjects created (subject_id: ${subject_id_1}, ${subject_id_2})`);

        // 3. Create test courses
        const [course1] = await pool.query(
            'INSERT IGNORE INTO courses (subject_id, teacher_id, title, description) VALUES (?, ?, ?, ?)',
            [subject_id_1, teacher_id, 'OSI Model & Protocols', 'Understanding OSI model layers and networking protocols']
        );
        const course_id_1 = course1.insertId || 1;

        const [course2] = await pool.query(
            'INSERT IGNORE INTO courses (subject_id, teacher_id, title, description) VALUES (?, ?, ?, ?)',
            [subject_id_1, teacher_id, 'TCP/IP Stack', 'Deep dive into TCP/IP networking']
        );
        const course_id_2 = course2.insertId || 2;

        const [course3] = await pool.query(
            'INSERT IGNORE INTO courses (subject_id, teacher_id, title, description) VALUES (?, ?, ?, ?)',
            [subject_id_2, teacher_id, 'Supervised Learning', 'Introduction to supervised machine learning algorithms']
        );
        const course_id_3 = course3.insertId || 3;

        console.log(`✓ Courses created (course_ids: ${course_id_1}, ${course_id_2}, ${course_id_3})`);

        // 4. Create test materials
        await pool.query(
            'INSERT IGNORE INTO materials (course_id, title, type, video_url) VALUES (?, ?, ?, ?)',
            [course_id_1, 'OSI Model Explained', 'video', 'https://www.youtube.com/embed/LANW3m7UgWs']
        );

        await pool.query(
            'INSERT IGNORE INTO materials (course_id, title, type, video_url) VALUES (?, ?, ?, ?)',
            [course_id_1, 'Networking Basics', 'video', 'https://www.youtube.com/embed/3QhU9jd03a0']
        );

        console.log(`✓ Materials created`);

        console.log("\n✅ Database seeded successfully!");
        console.log("\n📝 Test Credentials:");
        console.log("   Teacher: ravi@example.com / password123");
        console.log("   Student: amit@example.com / password123");
        
        await pool.end();
        process.exit(0);

    } catch (err) {
        console.error("❌ Seeding failed:", err.message);
        process.exit(1);
    }
}

seed();
