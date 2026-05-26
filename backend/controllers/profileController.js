const pool = require('../config/db');
const bcrypt = require('bcryptjs');

exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const [user] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        
        if (user.length === 0) return res.status(404).send("User not found");

        const viewPath = req.user.role === 'teacher' ? 'teacher/profile' : 'student/profile';
        res.render(viewPath, { user: user[0] });
    } catch (err) {
        console.error("Error fetching profile:", err);
        res.status(500).send("Error loading profile");
    }
};

exports.updateProfileImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send("No image uploaded");
        }

        const userId = req.user.id;
        const imagePath = `/uploads/profiles/${req.file.filename}`;

        await pool.execute('UPDATE users SET profile_image = ? WHERE id = ?', [imagePath, userId]);

        const redirectPath = req.user.role === 'teacher' ? '/teacher/profile' : '/student/profile';
        res.redirect(redirectPath);
    } catch (err) {
        console.error("Error updating profile image:", err);
        res.status(500).send("Error updating image");
    }
};

exports.changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    try {
        const [users] = await pool.query('SELECT password FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

        const user = users[0];
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Current password is incorrect' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        console.error("Error changing password:", err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
