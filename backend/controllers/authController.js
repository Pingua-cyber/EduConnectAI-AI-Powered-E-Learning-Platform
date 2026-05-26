const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

exports.getLogin = (req, res) => {
    res.render('login', { error: null });
};

exports.postLogin = async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.render('login', { error: 'Invalid email or password' });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('login', { error: 'Invalid email or password' });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        // Set HTTP-only Cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Redirect based on role
        if (user.role === 'teacher') {
            res.redirect('/teacher/dashboard');
        } else {
            res.redirect('/student/dashboard');
        }
    } catch (err) {
        console.error(err);
        res.render('login', { error: 'Server error during login' });
    }
};

exports.getRegister = (req, res) => {
    res.render('register', { error: null });
};

exports.postRegister = async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        // Check if user already exists
        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.render('register', { error: 'Email already registered' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert into database
        await db.query(
            'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            [name, email, hashedPassword, role || 'student']
        );

        res.redirect('/auth/login');
    } catch (err) {
        console.error('Registration Error Details:', err);
        res.render('register', { error: 'Server error during registration' });
    }
};

exports.logout = (req, res) => {
    res.clearCookie('token');
    res.redirect('/auth/login');
};

exports.getForgotPassword = (req, res) => {
    res.render('forgot-password', { error: null, success: null });
};

exports.postForgotPassword = async (req, res) => {
    const { email, name, new_password, confirm_password } = req.body;
    
    if (new_password !== confirm_password) {
        return res.render('forgot-password', { error: 'Passwords do not match.', success: null });
    }

    try {
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.render('forgot-password', { error: 'No account found with that email.', success: null });
        }

        const user = users[0];
        
        // Security check: Verify the provided name matches the registered name
        if (user.name.toLowerCase() !== name.toLowerCase()) {
            return res.render('forgot-password', { error: 'Authentication failed. Name does not match the registered account.', success: null });
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        await db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

        res.render('forgot-password', { error: null, success: 'Password reset successfully! You can now log in.' });
    } catch (err) {
        console.error('Password Reset Error:', err);
        res.render('forgot-password', { error: 'Server error during password reset.', success: null });
    }
};
