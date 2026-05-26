const mysql = require('mysql2/promise');
require('dotenv').config();

async function initAssignments() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    console.log('Initializing Assignments Tables...');

    const createAssignmentsTable = `
        CREATE TABLE IF NOT EXISTS assignments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            subject_id INT NOT NULL,
            teacher_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            file_path VARCHAR(255),
            deadline DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
            FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `;

    const createSubmissionsTable = `
        CREATE TABLE IF NOT EXISTS submissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            assignment_id INT NOT NULL,
            student_id INT NOT NULL,
            file_path VARCHAR(255),
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            marks INT DEFAULT NULL,
            feedback TEXT,
            status ENUM('submitted', 'graded', 'late') DEFAULT 'submitted',
            FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `;

    try {
        await connection.query(createAssignmentsTable);
        console.log('Table "assignments" verified/created.');
        
        await connection.query(createSubmissionsTable);
        console.log('Table "submissions" verified/created.');

    } catch (err) {
        console.error('Error creating assignment tables:', err);
    } finally {
        await connection.end();
        console.log('Database initialization complete.');
    }
}

initAssignments();
