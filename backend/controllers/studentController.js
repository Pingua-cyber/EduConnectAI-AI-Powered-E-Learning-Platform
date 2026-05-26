const pool = require('../config/db');

exports.getDashboard = async (req, res) => {
    try {
        const student_id = req.user.id;
        
        let scores = [];
        let subjects = [];
        let enrolledCount = 0;

        try {
            // Fetch recent scores/grades
            const [scoresResult] = await pool.query(`
                SELECT s.score, q.title as quiz_title, c.title as course_title 
                FROM scores s 
                JOIN quizzes q ON s.quiz_id = q.id 
                JOIN courses c ON q.course_id = c.id 
                WHERE s.student_id = ? 
                ORDER BY s.created_at DESC LIMIT 5
            `, [student_id]);
            scores = scoresResult;

            // Fetch all available subjects EXCEPT those hidden by this specific student
            const [subjectsResult] = await pool.query(`
                SELECT s.*, u.name as teacher_name, COUNT(c.id) as course_count
                FROM subjects s
                JOIN users u ON s.teacher_id = u.id
                LEFT JOIN courses c ON c.subject_id = s.id
                LEFT JOIN hidden_student_subjects hss ON hss.subject_id = s.id AND hss.student_id = ?
                WHERE hss.id IS NULL
                GROUP BY s.id
                ORDER BY s.created_at DESC
            `, [student_id]);
            subjects = subjectsResult;

            // Get total enrolled subjects (subjects where student took a quiz)
            const [enrolled] = await pool.query(`
                SELECT COUNT(DISTINCT s.id) as count
                FROM subjects s
                JOIN courses c ON c.subject_id = s.id
                JOIN quizzes q ON q.course_id = c.id
                JOIN scores sc ON sc.quiz_id = q.id
                LEFT JOIN hidden_student_courses hsc ON hsc.course_id = c.id AND hsc.student_id = ?
                WHERE sc.student_id = ? AND hsc.id IS NULL
            `, [student_id, student_id]);
            enrolledCount = enrolled[0].count || 0;
        } catch (dbErr) {
            console.error("Student Dashboard DB Warning (Tables might be missing):", dbErr.message);
        }


        let notifications = [];
        try {
            const [notifResult] = await pool.query(`
                SELECT * FROM notifications 
                WHERE user_id = ? AND is_read = FALSE 
                ORDER BY created_at DESC
            `, [student_id]);
            notifications = notifResult;
        } catch (dbErr) {
            console.error("Notifications Fetch Warning:", dbErr.message);
        }

        // Fetch student's overall average score
        let averageScore = 0;
        try {
            const [avgResult] = await pool.query('SELECT AVG(score) as avg FROM scores WHERE student_id = ?', [student_id]);
            averageScore = Math.round(avgResult[0].avg || 0);
        } catch (err) {}

        // Calculate Study Streak (days with at least one score)
        let studyStreak = 0;
        try {
            const [streakResult] = await pool.query(`
                SELECT COUNT(DISTINCT DATE(created_at)) as streak 
                FROM scores 
                WHERE student_id = ? 
                AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            `, [student_id]);
            studyStreak = streakResult[0].streak || 0;
        } catch (err) {}

        // Generate AI Insight
        let aiInsight = {
            title: "Analyzing your progress...",
            message: "Keep learning to unlock personalized AI insights!",
            type: "info"
        };

        if (averageScore >= 80) {
            aiInsight = {
                title: "Academic Excellence!",
                message: "You're consistently performing at a high level. Consider taking on more advanced elective courses.",
                type: "success"
            };
        } else if (averageScore >= 50) {
            aiInsight = {
                title: "Solid Foundation",
                message: "You're doing well! Focusing on reviewing your last 2 quiz mistakes could push you above 80%.",
                type: "warning"
            };
        } else if (averageScore > 0) {
            aiInsight = {
                title: "Focus Required",
                message: "Don't worry! Try using the AI Tutor to clarify concepts in your most recent courses.",
                type: "error"
            };
        }

        // Calculate Badges (Moved here to avoid ReferenceError)
        let badges = [];
        if (enrolledCount > 0) badges.push({ name: 'Starter', icon: 'auto_awesome', color: 'text-blue-400', desc: 'Started your journey' });
        if (averageScore >= 80) badges.push({ name: 'Scholar', icon: 'workspace_premium', color: 'text-yellow-400', desc: 'High achiever' });
        if (studyStreak >= 3) badges.push({ name: 'Relentless', icon: 'local_fire_department', color: 'text-orange-500', desc: '3+ Day Streak' });
        if (enrolledCount >= 5) badges.push({ name: 'Polymath', icon: 'menu_book', color: 'text-purple-400', desc: '5+ Subjects' });
        if (scores.length >= 10) badges.push({ name: 'Veteran', icon: 'military_tech', color: 'text-red-400', desc: '10+ Quizzes taken' });

        // Fetch top 2 upcoming upcoming deadlines
        const [deadlinesResult] = await pool.query(`
            SELECT a.title, a.deadline, s.name as subject_name
            FROM assignments a
            JOIN subjects s ON a.subject_id = s.id
            LEFT JOIN submissions sub ON a.id = sub.assignment_id AND sub.student_id = ?
            WHERE sub.id IS NULL AND a.deadline > NOW()
            ORDER BY a.deadline ASC
            LIMIT 2
        `, [student_id]);

        res.render('student/dashboard', { 
            user: req.user, 
            scores: scores, 
            subjects: subjects,
            enrolledCount: enrolledCount,
            notifications: notifications,
            averageScore: averageScore,
            studyStreak: studyStreak,
            aiInsight: aiInsight,
            badges: badges,
            deadlines: deadlinesResult
        });

    } catch (err) {
        console.error("Critical Student Dashboard Error:", err);
        res.status(500).send("Critical error loading dashboard");
    }
};

exports.getAssignments = async (req, res) => {
    try {
        const student_id = req.user.id;
        const [assignments] = await pool.query(`
            SELECT a.*, s.name as subject_name, sub.status, sub.marks, sub.feedback
            FROM assignments a
            JOIN subjects s ON a.subject_id = s.id
            LEFT JOIN submissions sub ON a.id = sub.assignment_id AND sub.student_id = ?
            ORDER BY a.deadline ASC
        `, [student_id]);

        res.render('student/assignments', {
            user: req.user,
            assignments: assignments
        });
    } catch (err) {
        console.error("Error fetching student assignments:", err);
        res.status(500).send("Error loading assignments");
    }
};

exports.submitAssignment = async (req, res) => {
    try {
        const assignmentId = req.params.id;
        const student_id = req.user.id;
        const file_path = req.file ? `/uploads/submissions/${req.file.filename}` : null;

        if (!file_path) {
            return res.status(400).send("No file uploaded");
        }

        // Check if deadline passed
        const [assignment] = await pool.query('SELECT deadline FROM assignments WHERE id = ?', [assignmentId]);
        const status = new Date() > new Date(assignment[0].deadline) ? 'late' : 'submitted';

        // Upsert submission
        const [existing] = await pool.query('SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ?', [assignmentId, student_id]);
        
        if (existing.length > 0) {
            await pool.execute(
                'UPDATE submissions SET file_path = ?, status = ?, submitted_at = CURRENT_TIMESTAMP WHERE id = ?',
                [file_path, status, existing[0].id]
            );
        } else {
            await pool.execute(
                'INSERT INTO submissions (assignment_id, student_id, file_path, status) VALUES (?, ?, ?, ?)',
                [assignmentId, student_id, file_path, status]
            );
        }

        res.redirect('/student/assignments');
    } catch (err) {
        console.error("Error submitting assignment:", err);
        res.status(500).send("Error submitting assignment");
    }
};

exports.getCourses = async (req, res) => {
    try {
        const student_id = req.user.id;
        // Fetch all courses EXCEPT those hidden by this specific student
        const [courses] = await pool.query(`
            SELECT c.* 
            FROM courses c
            LEFT JOIN hidden_student_courses hsc ON hsc.course_id = c.id AND hsc.student_id = ?
            WHERE hsc.id IS NULL
            ORDER BY c.created_at DESC
        `, [student_id]);
        res.render('student/courses', { user: req.user, courses });
    } catch (err) {
        console.error("Error fetching all courses:", err);
        res.status(500).send("Error fetching courses");
    }
};

exports.getMyLearning = async (req, res) => {
    try {
        const student_id = req.user.id;

        // Fetch courses the student has interacted with (taken quizzes in)
        const [activeCourses] = await pool.query(`
            SELECT DISTINCT c.id, c.title, c.description, s.name as subject_name
            FROM courses c
            JOIN subjects s ON c.subject_id = s.id
            JOIN quizzes q ON q.course_id = c.id
            JOIN scores sc ON sc.quiz_id = q.id
            LEFT JOIN hidden_student_courses hsc ON hsc.course_id = c.id AND hsc.student_id = ?
            WHERE sc.student_id = ? AND hsc.id IS NULL
        `, [student_id, student_id]);

        // Fetch the student's recent quiz scores
        const [quizScores] = await pool.query(`
            SELECT q.title as quiz_title, c.title as course_title, sc.score, sc.created_at
            FROM scores sc
            JOIN quizzes q ON sc.quiz_id = q.id
            JOIN courses c ON q.course_id = c.id
            WHERE sc.student_id = ?
            ORDER BY sc.created_at DESC
        `, [student_id]);

        // Calculate overall average score
        let averageScore = 0;
        if (quizScores.length > 0) {
            const total = quizScores.reduce((sum, item) => sum + item.score, 0);
            averageScore = Math.round(total / quizScores.length);
        }

        res.render('student/my-learning', {
            user: req.user,
            activeCourses: activeCourses,
            quizScores: quizScores,
            averageScore: averageScore
        });
    } catch (err) {
        console.error("Error fetching My Learning data:", err);
        res.status(500).send("Error loading My Learning");
    }
};

exports.getSubjectCourses = async (req, res) => {
    try {
        const subject_id = req.params.id;
        const [subject] = await pool.query('SELECT s.*, u.name as teacher_name FROM subjects s JOIN users u ON s.teacher_id = u.id WHERE s.id = ?', [subject_id]);
        
        if(subject.length === 0) return res.status(404).send("Subject not found");

        const [courses] = await pool.query('SELECT * FROM courses WHERE subject_id = ? ORDER BY created_at DESC', [subject_id]);
        
        // Eager fetch all materials/links for each topic/course to show in a classroom style
        for (let i = 0; i < courses.length; i++) {
            const [materials] = await pool.query('SELECT * FROM materials WHERE course_id = ?', [courses[i].id]);
            courses[i].materials = materials;
        }
        
        res.render('student/subject', { user: req.user, subject: subject[0], courses });
    } catch (err) {
        console.error("Student fetch subject topics error:", err);
        res.status(500).send("Error fetching courses");
    }
};

exports.getCourseDetail = async (req, res) => {
    try {
        const courseId = req.params.id;
        
        const [course] = await pool.execute('SELECT * FROM courses WHERE id = ?', [courseId]);
        if (course.length === 0) {
            return res.status(404).send("Course Not Found");
        }

        const [materials] = await pool.execute('SELECT * FROM materials WHERE course_id = ? ORDER BY created_at DESC', [courseId]);
        const [quizzes] = await pool.execute('SELECT * FROM quizzes WHERE course_id = ? ORDER BY created_at DESC', [courseId]);

        // Check if student has already taken these quizzes
        const student_id = req.user.id;
        const [scores] = await pool.execute('SELECT quiz_id, score FROM scores WHERE student_id = ?', [student_id]);
        
        // Map scores to quizzes
        const scoreMap = {};
        scores.forEach(s => scoreMap[s.quiz_id] = s.score);

        quizzes.forEach(q => {
            q.student_score = scoreMap[q.id] !== undefined ? scoreMap[q.id] : null;
        });

        res.render('student/course-detail', { 
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

exports.takeQuiz = async (req, res) => {
    try {
        const { id, quizId } = req.params;
        const student_id = req.user.id;
        
        // Check if already taken
        const [existingScore] = await pool.execute('SELECT * FROM scores WHERE student_id = ? AND quiz_id = ?', [student_id, quizId]);
        if (existingScore.length > 0) {
            return res.status(400).send("You have already taken this quiz.");
        }

        const [course] = await pool.execute('SELECT title FROM courses WHERE id = ?', [id]);
        const [quiz] = await pool.execute('SELECT * FROM quizzes WHERE id = ?', [quizId]);

        if (quiz.length === 0) {
            return res.status(404).send("Quiz Not Found");
        }

        const questions = typeof quiz[0].questions_json === 'string' ? JSON.parse(quiz[0].questions_json) : quiz[0].questions_json;

        res.render('student/quiz', {
            user: req.user,
            courseId: id,
            courseTitle: course[0].title,
            quiz: quiz[0],
            questions
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading quiz");
    }
};

exports.submitQuiz = async (req, res) => {
    try {
        const { id, quizId } = req.params;
        const student_id = req.user.id;
        const answers = req.body; // { q0: 'Answer 1', q1: 'Answer 2' }

        const [quiz] = await pool.execute('SELECT * FROM quizzes WHERE id = ?', [quizId]);
        if (quiz.length === 0) {
            return res.status(404).json({ error: "Quiz Not Found" });
        }

        const questions = typeof quiz[0].questions_json === 'string' ? JSON.parse(quiz[0].questions_json) : quiz[0].questions_json;
        
        let score = 0;
        const total = questions.length;

        questions.forEach((q, index) => {
            const studentAns = answers[`q${index}`];
            if (studentAns === q.answer) {
                score++;
            }
        });

        const percentage = Math.round((score / total) * 100);

        // Save score
        await pool.execute('INSERT INTO scores (student_id, quiz_id, score) VALUES (?, ?, ?)', [student_id, quizId, percentage]);

        res.json({ success: true, score: percentage, message: `You scored ${percentage}%` });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getAiTutor = (req, res) => {
    res.render('student/ai-tutor', { user: req.user });
};

exports.markNotificationsRead = async (req, res) => {
    try {
        const student_id = req.user.id;
        await pool.execute('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [student_id]);
        res.json({ success: true });
    } catch (err) {
        console.error("Error marking notifications as read:", err);
        res.status(500).json({ success: false });
    }
};

exports.removeCourse = async (req, res) => {
    try {
        const student_id = req.user.id;
        const course_id = req.params.id;

        // Instead of deleting scores, we mark the course as hidden for this student
        await pool.execute(`
            INSERT IGNORE INTO hidden_student_courses (student_id, course_id)
            VALUES (?, ?)
        `, [student_id, course_id]);

        res.json({ success: true, message: "Course removed from your active list. Progress preserved." });
    } catch (err) {
        console.error("Error hiding course:", err);
        res.status(500).json({ success: false, error: "Failed to remove course" });
    }
};

exports.removeSubject = async (req, res) => {
    try {
        const student_id = req.user.id;
        const subject_id = req.params.id;

        await pool.execute(`
            INSERT IGNORE INTO hidden_student_subjects (student_id, subject_id)
            VALUES (?, ?)
        `, [student_id, subject_id]);

        res.json({ success: true, message: "Subject removed from your explorer." });
    } catch (err) {
        console.error("Error hiding subject:", err);
        res.status(500).json({ success: false, error: "Failed to remove subject" });
    }
};
