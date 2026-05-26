const express = require('express');
const router = express.Router();
const { authenticate, isTeacher, isStudent } = require('../middleware/auth');

// Make sure unauthenticated root requests go to login
router.get('/', (req, res) => {
    res.redirect('/auth/login');
});



module.exports = router;
