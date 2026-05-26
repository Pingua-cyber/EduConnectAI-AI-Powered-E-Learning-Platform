const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const profileController = require('../controllers/profileController');
const { authenticate, isStudent } = require('../middleware/auth');
const upload = require('../middleware/upload');

// All routes require authentication and student role
router.use(authenticate, isStudent);

// Profile
router.get('/profile', profileController.getProfile);
router.post('/profile/upload-image', upload.single('profile_image'), profileController.updateProfileImage);
router.post('/profile/change-password', profileController.changePassword);

// Dashboard (Subject Explorer)
router.get('/dashboard', studentController.getDashboard);

// AI Tutor Page
router.get('/ai-tutor', studentController.getAiTutor);

// All Courses View
router.get('/courses', studentController.getCourses);

// My Learning
router.get('/my-learning', studentController.getMyLearning);

// View Courses in a Subject
router.get('/subject/:id', studentController.getSubjectCourses);

// View Course Details (Materials & Quizzes)
router.get('/course/:id', studentController.getCourseDetail);

// Take Quiz
router.get('/course/:id/quiz/:quizId', studentController.takeQuiz);
router.post('/course/:id/quiz/:quizId/submit', studentController.submitQuiz);
router.post('/course/:id/remove', studentController.removeCourse);
router.post('/subject/:id/remove', studentController.removeSubject);
router.post('/notifications/mark-read', studentController.markNotificationsRead);

// Assignments
router.get('/assignments', studentController.getAssignments);
router.post('/assignment/:id/submit', upload.single('submission_file'), studentController.submitAssignment);

module.exports = router;
