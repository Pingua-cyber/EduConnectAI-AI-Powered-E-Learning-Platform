const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { authenticate, isTeacher, isStudent } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Teacher route: Only accessible to teachers
router.post('/teacher/generate-mcq', authenticate, isTeacher, aiController.generateQuestions);

// Student route: Only accessible to students
router.post('/student/study-buddy', authenticate, isStudent, upload.array('chat_files', 10), aiController.askStudyBuddy);

// Student Saved Chat routes
router.get('/student/chats', authenticate, isStudent, aiController.getSavedChats);
router.post('/student/chats', authenticate, isStudent, aiController.createChat);
router.get('/student/chats/:id', authenticate, isStudent, aiController.getChatMessages);
router.put('/student/chats/:id', authenticate, isStudent, aiController.renameChat);
router.delete('/student/chats/:id', authenticate, isStudent, aiController.deleteChat);

module.exports = router;
