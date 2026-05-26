const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const aiRoutes = require('./routes/aiRoutes');
const indexRoutes = require('./routes/index');
const teacherRoutes = require('./routes/teacherRoutes');
const studentRoutes = require('./routes/studentRoutes');

const app = express();

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../frontend/views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Global Locals Middleware
app.use((req, res, next) => {
    const parts = req.path.split('/');
    res.locals.activePage = parts[2] || '';
    next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/ai', aiRoutes);
app.use('/', indexRoutes);
app.use('/teacher', teacherRoutes);
app.use('/student', studentRoutes);

// Base route / Landing
app.get('/', (req, res) => {
    res.redirect('/auth/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`EduConnect AI server running on http://localhost:${PORT}`);
});