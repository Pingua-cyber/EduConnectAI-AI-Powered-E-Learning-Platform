const pool = require('../config/db');
const emailService = require('../services/emailService');

async function sendDashboardNotification(title, message, type) {
    try {
        const [students] = await pool.query('SELECT id FROM users WHERE role = "student"');
        if (students.length > 0) {
            const values = students.map(s => [s.id, title, message, type]);
            await pool.query('INSERT INTO notifications (user_id, title, message, type) VALUES ?', [values]);
        }
    } catch (err) {
        console.error("Failed to send dashboard notification:", err);
    }
}

exports.getDashboard = async (req, res) => {
    try {
        const teacher_id = req.user.id;
        
        let subjects = [];
        let totalCourses = 0;
        let activeStudents = 0;
        let recentActivity = [];

        try {
            // Fetch all subjects created by this teacher
            const [subjResult] = await pool.query('SELECT * FROM subjects WHERE teacher_id = ? ORDER BY created_at DESC', [teacher_id]);
            subjects = subjResult;

            // Total courses across all subjects
            const [courses] = await pool.query(`
                SELECT COUNT(c.id) as total_courses 
                FROM courses c 
                JOIN subjects s ON c.subject_id = s.id 
                WHERE s.teacher_id = ?
            `, [teacher_id]);
            totalCourses = courses[0].total_courses || 0;
            
            // Active students
            const [students] = await pool.query(`
                SELECT COUNT(DISTINCT sc.student_id) as active_students 
                FROM scores sc 
                JOIN quizzes q ON sc.quiz_id = q.id 
                JOIN courses c ON q.course_id = c.id 
                JOIN subjects s ON c.subject_id = s.id
                WHERE s.teacher_id = ?
            `, [teacher_id]);
            activeStudents = students[0].active_students || 0;

            // Fetch recent scores for student/analytics section
            const [recentScores] = await pool.query(`
                SELECT sc.score, u.name as student_name, c.title as course_title, sc.created_at
                FROM scores sc
                JOIN users u ON sc.student_id = u.id
                JOIN quizzes q ON sc.quiz_id = q.id
                JOIN courses c ON q.course_id = c.id
                JOIN subjects s ON c.subject_id = s.id
                WHERE s.teacher_id = ?
                ORDER BY sc.created_at DESC
                LIMIT 5
            `, [teacher_id]);
            recentActivity = recentScores;

            // AI Insight: Top & Bottom Performing Courses
            const [performanceData] = await pool.query(`
                SELECT c.title, AVG(sc.score) as avg_score, COUNT(sc.id) as total_attempts
                FROM scores sc
                JOIN quizzes q ON sc.quiz_id = q.id
                JOIN courses c ON q.course_id = c.id
                JOIN subjects s ON c.subject_id = s.id
                WHERE s.teacher_id = ?
                GROUP BY c.id
                ORDER BY avg_score DESC
            `, [teacher_id]);

            let bestCourse = "N/A";
            let needsAttention = "N/A";
            let avgClassScore = 0;
            let aiTip = "Loading AI Insights..."; // Temporary placeholder

            if (performanceData && performanceData.length > 0) {
                bestCourse = performanceData[0].title;
                needsAttention = performanceData[performanceData.length - 1].title;
                
                if (performanceData.length === 1 && parseFloat(performanceData[0].avg_score) >= 75) {
                    needsAttention = "None (Good Standing)";
                }

                avgClassScore = Math.round(performanceData.reduce((acc, curr) => acc + parseFloat(curr.avg_score), 0) / performanceData.length);
            }

            req.aiTeachingInsight = {
                bestCourse,
                needsAttention,
                avgClassScore,
                tip: aiTip
            };

        } catch (dbErr) {
            console.error("Teacher Dashboard DB Warning:", dbErr.message);
        }

        res.render('teacher/dashboard', { 
            user: req.user,
            subjects: subjects,
            totalCourses: totalCourses,
            activeStudents: activeStudents,
            recentActivity: recentActivity || [],
            aiTeachingInsight: req.aiTeachingInsight || { bestCourse: 'N/A', needsAttention: 'N/A', avgClassScore: 0, tip: 'Loading...' }
        });
    } catch (err) {
        console.error("Critical Teacher Dashboard Error:", err);
        res.status(500).send("Critical error loading dashboard");
    }
};

exports.createAssignment = async (req, res) => {
    try {
        const { subject_id, title, description, deadline } = req.body;
        const teacher_id = req.user.id;
        const file_path = req.file ? `/uploads/assignments/${req.file.filename}` : null;

        if (!subject_id || !title || !deadline) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        await pool.execute(
            'INSERT INTO assignments (subject_id, teacher_id, title, description, file_path, deadline) VALUES (?, ?, ?, ?, ?, ?)',
            [subject_id, teacher_id, title, description, file_path, deadline]
        );

        // Notify students
        await sendDashboardNotification('New Assignment', `A new assignment "${title}" has been posted.`, 'info');

        res.redirect('/teacher/dashboard');
    } catch (err) {
        console.error("Error creating assignment:", err);
        res.status(500).send("Error creating assignment");
    }
};

exports.getAiInsight = async (req, res) => {
    try {
        const teacher_id = req.user.id;
        
        const [performanceData] = await pool.query(`
            SELECT c.title, AVG(sc.score) as avg_score
            FROM scores sc
            JOIN quizzes q ON sc.quiz_id = q.id
            JOIN courses c ON q.course_id = c.id
            JOIN subjects s ON c.subject_id = s.id
            WHERE s.teacher_id = ?
            GROUP BY c.id
            ORDER BY avg_score DESC
        `, [teacher_id]);

        if (!performanceData || performanceData.length === 0) {
            return res.json({ tip: "Create courses and assign quizzes to unlock AI-powered teaching insights." });
        }

        let bestCourse = performanceData[0].title;
        let needsAttention = performanceData[performanceData.length - 1].title;
        if (performanceData.length === 1 && parseFloat(performanceData[0].avg_score) >= 75) {
            needsAttention = "None (Good Standing)";
        }
        let avgClassScore = Math.round(performanceData.reduce((acc, curr) => acc + parseFloat(curr.avg_score), 0) / performanceData.length);

        const aiService = require('../services/aiService');
        const aiTip = await aiService.getTeacherInsight(bestCourse, needsAttention, avgClassScore);
        
        res.json({ tip: aiTip });
    } catch (err) {
        console.error("Error generating AI insight:", err);
        res.json({ tip: "Unable to generate insights at this moment." });
    }
};

exports.getCourses = async (req, res) => {
    try {
        const teacher_id = req.user.id;
        
        // Fetch subjects for the Create Course modal dropdown
        const [subjects] = await pool.query('SELECT * FROM subjects WHERE teacher_id = ? ORDER BY name ASC', [teacher_id]);

        // Fetch courses with their subject names
        const [courses] = await pool.query(`
            SELECT c.*, s.name as subject_name 
            FROM courses c
            JOIN subjects s ON c.subject_id = s.id
            WHERE s.teacher_id = ?
            ORDER BY c.created_at DESC
        `, [teacher_id]);

        res.render('teacher/courses', {
            user: req.user,
            courses: courses,
            subjects: subjects
        });
    } catch (err) {
        console.error("Error fetching courses:", err);
        res.status(500).send("Error loading courses");
    }
};

exports.getAssignments = async (req, res) => {
    try {
        const teacher_id = req.user.id;
        const [assignments] = await pool.query(`
            SELECT a.*, s.name as subject_name, 
            (SELECT COUNT(*) FROM submissions WHERE assignment_id = a.id) as submission_count
            FROM assignments a
            JOIN subjects s ON a.subject_id = s.id
            WHERE a.teacher_id = ?
            ORDER BY a.deadline ASC
        `, [teacher_id]);

        res.render('teacher/assignments', {
            user: req.user,
            assignments: assignments
        });
    } catch (err) {
        console.error("Error fetching assignments:", err);
        res.status(500).send("Error loading assignments");
    }
};

exports.getAssignmentSubmissions = async (req, res) => {
    try {
        const assignmentId = req.params.id;
        const teacher_id = req.user.id;

        // Verify ownership
        const [assignment] = await pool.query('SELECT * FROM assignments WHERE id = ? AND teacher_id = ?', [assignmentId, teacher_id]);
        if (assignment.length === 0) return res.status(403).send("Unauthorized");

        const [submissions] = await pool.query(`
            SELECT s.*, u.name as student_name, u.email as student_email
            FROM submissions s
            JOIN users u ON s.student_id = u.id
            WHERE s.assignment_id = ?
            ORDER BY s.submitted_at DESC
        `, [assignmentId]);

        res.render('teacher/submissions', {
            user: req.user,
            assignment: assignment[0],
            submissions: submissions
        });
    } catch (err) {
        console.error("Error fetching submissions:", err);
        res.status(500).send("Error loading submissions");
    }
};

exports.gradeSubmission = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { marks, feedback } = req.body;
        const teacher_id = req.user.id;

        // Verify the submission belongs to an assignment owned by the teacher
        const [submission] = await pool.query(`
            SELECT s.*, a.title as assignment_title
            FROM submissions s
            JOIN assignments a ON s.assignment_id = a.id
            WHERE s.id = ? AND a.teacher_id = ?
        `, [submissionId, teacher_id]);

        if (submission.length === 0) return res.status(403).json({ error: "Unauthorized" });

        await pool.execute(
            'UPDATE submissions SET marks = ?, feedback = ?, status = "graded" WHERE id = ?',
            [marks, feedback, submissionId]
        );

        // Notify student
        await pool.execute(
            'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
            [submission[0].student_id, 'Assignment Graded', `Your submission for "${submission[0].assignment_title}" has been graded.`, 'success']
        );

        res.json({ success: true, message: "Graded successfully" });
    } catch (err) {
        console.error("Error grading submission:", err);
        res.status(500).json({ error: "Error grading submission" });
    }
};

exports.deleteAssignment = async (req, res) => {
    try {
        const { id } = req.params;
        const teacher_id = req.user.id;

        // Verify assignment belongs to this teacher
        const [assignment] = await pool.query('SELECT * FROM assignments WHERE id = ? AND teacher_id = ?', [id, teacher_id]);
        if (assignment.length === 0) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        // Handle file deletion if exists
        if (assignment[0].file_path) {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, '../../frontend/public', assignment[0].file_path);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // Get submission files to delete them from file system
        const [submissions] = await pool.query('SELECT file_path FROM submissions WHERE assignment_id = ? AND file_path IS NOT NULL', [id]);
        for (const sub of submissions) {
            if (sub.file_path) {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(__dirname, '../../frontend/public', sub.file_path);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
        }

        // Delete submissions first (in case ON DELETE CASCADE is missing)
        await pool.execute('DELETE FROM submissions WHERE assignment_id = ?', [id]);
        
        // Finally, delete the assignment
        await pool.execute('DELETE FROM assignments WHERE id = ?', [id]);

        res.redirect('/teacher/assignments');
    } catch (err) {
        console.error("Error deleting assignment:", err);
        res.status(500).send("Error deleting assignment");
    }
};

exports.getStudents = async (req, res) => {
    try {
        const teacher_id = req.user.id;
        
        // Fetch all distinct students who took quizzes in the teacher's courses
        const [students] = await pool.query(`
            SELECT 
                u.id as student_id,
                u.name as student_name,
                u.email as student_email,
                COUNT(sc.id) as quizzes_taken,
                ROUND(AVG(sc.score)) as avg_score,
                MAX(sc.created_at) as last_active
            FROM users u
            JOIN scores sc ON u.id = sc.student_id
            JOIN quizzes q ON sc.quiz_id = q.id
            JOIN courses c ON q.course_id = c.id
            JOIN subjects s ON c.subject_id = s.id
            WHERE s.teacher_id = ? AND u.role = 'student'
            GROUP BY u.id
            ORDER BY last_active DESC
        `, [teacher_id]);

        res.render('teacher/students', {
            user: req.user,
            students: students
        });
    } catch (err) {
        console.error("Error fetching students list:", err);
        res.status(500).send("Error loading students");
    }
};

exports.getAnalytics = async (req, res) => {
    try {
        const teacher_id = req.user.id;

        // Fetch basic stats
        const [totalCourses] = await pool.query('SELECT COUNT(*) as count FROM courses WHERE teacher_id = ?', [teacher_id]);
        const [totalStudents] = await pool.query(`
            SELECT COUNT(DISTINCT sc.student_id) as count
            FROM scores sc
            JOIN quizzes q ON sc.quiz_id = q.id
            JOIN courses c ON q.course_id = c.id
            WHERE c.teacher_id = ?
        `, [teacher_id]);

        // Fetch average score per course
        const [courseAverages] = await pool.query(`
            SELECT c.title as course_name, ROUND(AVG(sc.score)) as avg_score
            FROM courses c
            LEFT JOIN quizzes q ON q.course_id = c.id
            LEFT JOIN scores sc ON sc.quiz_id = q.id
            WHERE c.teacher_id = ?
            GROUP BY c.id
            HAVING avg_score IS NOT NULL
        `, [teacher_id]);

        // Fetch score distribution
        const [scoreDistribution] = await pool.query(`
            SELECT 
                SUM(CASE WHEN sc.score >= 90 THEN 1 ELSE 0 END) as 'A',
                SUM(CASE WHEN sc.score >= 80 AND sc.score < 90 THEN 1 ELSE 0 END) as 'B',
                SUM(CASE WHEN sc.score >= 70 AND sc.score < 80 THEN 1 ELSE 0 END) as 'C',
                SUM(CASE WHEN sc.score >= 60 AND sc.score < 70 THEN 1 ELSE 0 END) as 'D',
                SUM(CASE WHEN sc.score < 60 THEN 1 ELSE 0 END) as 'F'
            FROM scores sc
            JOIN quizzes q ON sc.quiz_id = q.id
            JOIN courses c ON q.course_id = c.id
            WHERE c.teacher_id = ?
        `, [teacher_id]);

        res.render('teacher/analytics', {
            user: req.user,
            totalCourses: totalCourses[0].count,
            totalStudents: totalStudents[0].count,
            courseAverages: courseAverages,
            distribution: scoreDistribution[0]
        });
    } catch (err) {
        console.error("Error loading analytics:", err);
        res.status(500).send("Error loading analytics");
    }
};

exports.createSubject = async (req, res) => {
    try {
        const { name } = req.body;
        const teacher_id = req.user.id;
        if (!name) return res.status(400).json({ error: "Name is required" });
        
        // Prevent duplicates
        const [existing] = await pool.query('SELECT id FROM subjects WHERE name = ? AND teacher_id = ?', [name, teacher_id]);
        if (existing.length > 0) {
            return res.status(400).json({ error: "A subject with this name already exists" });
        }
        
        const [result] = await pool.execute('INSERT INTO subjects (name, teacher_id) VALUES (?, ?)', [name, teacher_id]);
        
        // Create notifications for all students
        await sendDashboardNotification('New Subject Added', `A new subject "${name}" has been added.`, 'subject');

        res.json({ success: true, id: result.insertId, name: name });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error creating subject" });
    }
};

exports.getSubjectCourses = async (req, res) => {
    try {
        const subjectId = req.params.subjectId;
        const teacher_id = req.user.id;

        // Verify ownership
        const [subject] = await pool.query('SELECT id, name FROM subjects WHERE id = ? AND teacher_id = ?', [subjectId, teacher_id]);
        if (subject.length === 0) return res.status(403).json({ error: "Unauthorized" });

        const [courses] = await pool.query('SELECT * FROM courses WHERE subject_id = ? ORDER BY created_at DESC', [subjectId]);
        
        if (courses.length === 0) {
            return res.json({ success: true, subject: subject[0], courses: [] });
        }
        res.json({ success: true, subject: subject[0], courses: courses });
    } catch (err) {
        console.error('Error fetching courses:', err);
        res.status(500).json({ error: "Error fetching courses" });
    }
};

exports.createCourse = async (req, res) => {
    try {
        console.log('Course Data Received:', req.body);
        const { subject_id, title, description } = req.body;
        const teacher_id = req.user.id;

        if (!subject_id || !title) {
            return res.status(400).json({ error: 'subject_id and title are required' });
        }

        // Ensure subject belongs to teacher
        const [subject] = await pool.query('SELECT id FROM subjects WHERE id = ? AND teacher_id = ?', [subject_id, teacher_id]);
        if (subject.length === 0) {
            return res.status(403).json({ error: 'Unauthorized or subject not found' });
        }

        // Prevent duplicates
        const [existing] = await pool.query('SELECT id FROM courses WHERE title = ? AND subject_id = ?', [title, subject_id]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'A course with this title already exists in this subject' });
        }

        // EXPLICIT INSERT INTO courses mapping subject_id and teacher_id
        const [result] = await pool.query(
            'INSERT INTO courses (title, description, subject_id, teacher_id) VALUES (?, ?, ?, ?)', 
            [title, description || '', subject_id, teacher_id]
        );

        // Create notifications for all students
        await sendDashboardNotification('New Course Published', `A new course "${title}" is now available.`, 'subject');

        // Send Email Notification (Async, don't await so it doesn't block response)
        emailService.sendNotificationToAllStudents(
            `New Course Alert: ${title}`,
            `<h1>New Course Added!</h1><p>A new course "<strong>${title}</strong>" has been published on EduConnectAI.</p><p>Log in to your dashboard to check it out!</p>`
        ).catch(console.error);

        res.json({ success: true });
    } catch (err) {
        console.error('Error creating course:', err);
        res.status(500).json({ success: false, error: "Error creating course" });
    }
};

exports.deleteCourse = async (req, res) => {
    try {
        const courseId = req.params.id;
        const teacher_id = req.user.id;

        // Verify ownership
        const [course] = await pool.query(`
            SELECT c.id FROM courses c
            JOIN subjects s ON c.subject_id = s.id
            WHERE c.id = ? AND s.teacher_id = ?
        `, [courseId, teacher_id]);

        if (course.length === 0) {
            return res.status(403).json({ error: 'Unauthorized or course not found' });
        }

        // Delete course. Cascade delete handles materials, quizzes, scores, hidden states
        await pool.query('DELETE FROM courses WHERE id = ?', [courseId]);

        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({ success: true });
        }

        const referrer = req.get('Referrer') || '/teacher/courses';
        res.redirect(referrer);
    } catch (err) {
        console.error('Error deleting course:', err);
        res.status(500).send("Error deleting course");
    }
};

exports.getCourseDetail = async (req, res) => {
    try {
        const courseId = req.params.id;
        const teacher_id = req.user.id;

        // Verify the course belongs to a subject owned by the teacher
        const [course] = await pool.execute(`
            SELECT c.* 
            FROM courses c
            JOIN subjects s ON c.subject_id = s.id
            WHERE c.id = ? AND s.teacher_id = ?
        `, [courseId, teacher_id]);
        
        if (course.length === 0) {
            return res.status(403).send("Unauthorized or Course Not Found");
        }

        const [materials] = await pool.execute('SELECT * FROM materials WHERE course_id = ? ORDER BY created_at DESC', [courseId]);
        const [quizzes] = await pool.execute('SELECT * FROM quizzes WHERE course_id = ? ORDER BY created_at DESC', [courseId]);

        res.render('teacher/course-detail', { 
            user: req.user, 
            course: course[0], 
            materials, 
            quizzes 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching course details");
    }
};

exports.uploadMaterial = async (req, res) => {
    try {
        const courseId = req.params.id;
        const teacher_id = req.user.id;
        const { material_title, video_url } = req.body;
        
        // Verify ownership
        const [course] = await pool.execute(`
            SELECT c.id FROM courses c
            JOIN subjects s ON c.subject_id = s.id
            WHERE c.id = ? AND s.teacher_id = ?
        `, [courseId, teacher_id]);
        
        if (course.length === 0) {
            return res.status(403).send("Unauthorized");
        }

        // Multer upload resolution
        let type, path = null, url = null;
        
        if (req.file) {
            type = req.file.mimetype.includes('video') ? 'video' : 'pdf';
            path = `/uploads/materials/${req.file.filename}`;
        } else if (video_url) {
            type = 'video';
            url = video_url;
        } else {
            return res.status(400).send("No file or Video URL provided");
        }

        const mTitle = material_title || 'Untitled Material';

        await pool.execute('INSERT INTO materials (course_id, title, type, path, video_url) VALUES (?, ?, ?, ?, ?)', [courseId, mTitle, type, path, url]);
        
        await sendDashboardNotification('New Material Uploaded', `New material "${mTitle}" has been uploaded.`, 'material');

        res.redirect(`/teacher/course/${courseId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error uploading material");
    }
};

exports.saveQuiz = async (req, res) => {
    try {
        const courseId = req.params.id;
        const { title, questions_json, deadline } = req.body;
        const teacher_id = req.user.id;

        const [course] = await pool.execute(`
            SELECT c.id FROM courses c
            JOIN subjects s ON c.subject_id = s.id
            WHERE c.id = ? AND s.teacher_id = ?
        `, [courseId, teacher_id]);
        if (course.length === 0) {
            return res.status(403).send("Unauthorized");
        }

        await pool.execute(
            'INSERT INTO quizzes (course_id, title, questions_json, deadline) VALUES (?, ?, ?, ?)', 
            [courseId, title, JSON.stringify(questions_json), deadline || null]
        );
        
        // Create notifications for all students
        await sendDashboardNotification('New Quiz Assigned', `A new quiz "${title}" has been assigned.`, 'quiz');
        
        // Send Email Notification (Async, don't await)
        emailService.sendNotificationToAllStudents(
            `New Quiz Available: ${title}`,
            `<h1>Test Your Knowledge!</h1><p>A new quiz "<strong>${title}</strong>" is now available for you to take.</p><p>Log in to EduConnectAI to start the quiz!</p>`
        ).catch(console.error);
        
        res.json({ success: true, message: 'Quiz saved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error saving quiz" });
    }
};

exports.deleteMaterial = async (req, res) => {
    try {
        const courseId = req.params.id;
        const materialId = req.params.materialId;
        const teacher_id = req.user.id;

        // Verify ownership through course -> subject -> teacher
        const [material] = await pool.execute(`
            SELECT m.id, m.path
            FROM materials m
            JOIN courses c ON m.course_id = c.id
            JOIN subjects s ON c.subject_id = s.id
            WHERE m.id = ? AND c.id = ? AND s.teacher_id = ?
        `, [materialId, courseId, teacher_id]);

        if (material.length === 0) {
            return res.status(403).json({ error: "Unauthorized or Material not found" });
        }

        // Delete file from filesystem if it exists
        if (material[0].path) {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, '../../frontend/public', material[0].path);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // Delete from database
        await pool.execute('DELETE FROM materials WHERE id = ?', [materialId]);

        res.json({ success: true, message: 'Material deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error deleting material" });
    }
};

exports.editMaterial = async (req, res) => {
    try {
        const courseId = req.params.id;
        const materialId = req.params.materialId;
        const { title } = req.body;
        const teacher_id = req.user.id;

        if (!title) return res.status(400).json({ error: "Title is required" });

        // Verify ownership through course -> subject -> teacher
        const [material] = await pool.execute(`
            SELECT m.id
            FROM materials m
            JOIN courses c ON m.course_id = c.id
            JOIN subjects s ON c.subject_id = s.id
            WHERE m.id = ? AND c.id = ? AND s.teacher_id = ?
        `, [materialId, courseId, teacher_id]);

        if (material.length === 0) {
            return res.status(403).json({ error: "Unauthorized or Material not found" });
        }

        // Update title
        await pool.execute('UPDATE materials SET title = ? WHERE id = ?', [title, materialId]);

        res.json({ success: true, message: 'Material updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error updating material" });
    }
};

exports.getQuizScores = async (req, res) => {
    try {
        const quizId = req.params.id;
        const teacher_id = req.user.id;

        // Verify ownership
        const [quiz] = await pool.execute(`
            SELECT q.*, c.title as course_title, c.id as course_id
            FROM quizzes q
            JOIN courses c ON q.course_id = c.id
            JOIN subjects s ON c.subject_id = s.id
            WHERE q.id = ? AND s.teacher_id = ?
        `, [quizId, teacher_id]);

        if (quiz.length === 0) {
            return res.status(403).send("Unauthorized or Quiz Not Found");
        }

        // Get scores for this quiz
        const [scores] = await pool.execute(`
            SELECT sc.score, sc.created_at, u.name as student_name, u.email as student_email
            FROM scores sc
            JOIN users u ON sc.student_id = u.id
            WHERE sc.quiz_id = ?
            ORDER BY sc.score DESC, sc.created_at DESC
        `, [quizId]);

        res.render('teacher/quiz-scores', {
            user: req.user,
            quiz: quiz[0],
            scores: scores
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching quiz scores");
    }
};

exports.deleteSubject = async (req, res) => {
    try {
        const subjectId = req.params.id;
        const teacher_id = req.user.id;

        // Verify ownership
        const [subject] = await pool.query('SELECT id FROM subjects WHERE id = ? AND teacher_id = ?', [subjectId, teacher_id]);
        if (subject.length === 0) return res.status(403).json({ error: "Unauthorized" });

        await pool.query('DELETE FROM subjects WHERE id = ?', [subjectId]);
        res.json({ success: true, message: "Subject deleted successfully" });
    } catch (err) {
        console.error("Error deleting subject:", err);
        res.status(500).json({ error: "Error deleting subject" });
    }
};
