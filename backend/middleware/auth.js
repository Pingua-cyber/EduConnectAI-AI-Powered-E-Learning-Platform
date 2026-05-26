const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const authenticate = async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.redirect('/auth/login');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Fetch fresh user data from DB (to get profile_image etc)
        const [users] = await pool.query('SELECT id, name, email, role, profile_image FROM users WHERE id = ?', [decoded.id]);
        
        if (users.length === 0) {
            res.clearCookie('token');
            return res.redirect('/auth/login');
        }

        req.user = users[0];
        next();
    } catch (err) {
        res.clearCookie('token');
        return res.redirect('/auth/login');
    }
};

const isTeacher = (req, res, next) => {
    if (req.user && req.user.role === 'teacher') {
        next();
    } else {
        res.status(403).send('Access Denied: Teacher permissions required.');
    }
};

const isStudent = (req, res, next) => {
    if (req.user && req.user.role === 'student') {
        next();
    } else {
        res.status(403).send('Access Denied: Student permissions required.');
    }
};

module.exports = { authenticate, isTeacher, isStudent };
