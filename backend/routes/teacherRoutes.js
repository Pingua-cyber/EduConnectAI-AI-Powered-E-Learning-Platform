const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController');
const profileController = require('../controllers/profileController');
const { authenticate, isTeacher } = require('../middleware/auth');
const upload = require('../middleware/upload');

// All routes require authentication and teacher role
router.use(authenticate, isTeacher);

// Profile
router.get('/profile', profileController.getProfile);
router.post('/profile/upload-image', upload.single('profile_image'), profileController.updateProfileImage);
router.post('/profile/change-password', profileController.changePassword);

// Dashboard - Fetch subjects
router.get('/dashboard', teacherController.getDashboard);
router.get('/api/insight', teacherController.getAiInsight);

// View Students
router.get('/students', teacherController.getStudents);

// Analytics
router.get('/analytics', teacherController.getAnalytics);

// Subject APIs (AJAX)
router.post('/subject/create', teacherController.createSubject);
router.delete('/subject/delete/:id', teacherController.deleteSubject);
router.get('/courses/:subjectId', teacherController.getSubjectCourses);

// Manage Courses
router.get('/courses', teacherController.getCourses);
router.post('/course/create', teacherController.createCourse);
router.post('/course/:id/delete', teacherController.deleteCourse);

// Course Detail view (Manage materials & quizzes)
router.get('/course/:id', teacherController.getCourseDetail);

// Upload Materials
router.post('/course/:id/upload', upload.single('material'), teacherController.uploadMaterial);

// Delete Material
router.delete('/course/:id/material/:materialId', teacherController.deleteMaterial);

// Edit Material
router.put('/course/:id/material/:materialId', teacherController.editMaterial);

router.post('/course/:id/quiz/save', teacherController.saveQuiz);

// View Quiz Scores
router.get('/quiz/:id/scores', teacherController.getQuizScores);

// Assignments
router.get('/assignments', teacherController.getAssignments);
router.post('/assignment/create', upload.single('assignment_file'), teacherController.createAssignment);
router.post('/assignment/:id/delete', teacherController.deleteAssignment);
router.get('/assignment/:id/submissions', teacherController.getAssignmentSubmissions);
router.post('/assignment/grade/:submissionId', teacherController.gradeSubmission);

module.exports = router;
