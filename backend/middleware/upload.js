const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const materialsDir = path.join(__dirname, '../../frontend/public/uploads/materials');
const profilesDir = path.join(__dirname, '../../frontend/public/uploads/profiles');
const assignmentsDir = path.join(__dirname, '../../frontend/public/uploads/assignments');
const submissionsDir = path.join(__dirname, '../../frontend/public/uploads/submissions');
const chatDir = path.join(__dirname, '../../frontend/public/uploads/chat');

[materialsDir, profilesDir, assignmentsDir, submissionsDir, chatDir].forEach(dir => {
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Set Storage Engine
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    if (file.fieldname === 'profile_image') {
        cb(null, profilesDir);
    } else if (file.fieldname === 'assignment_file') {
        cb(null, assignmentsDir);
    } else if (file.fieldname === 'submission_file') {
        cb(null, submissionsDir);
    } else if (file.fieldname === 'chat_file' || file.fieldname === 'chat_files') {
        cb(null, chatDir);
    } else {
        cb(null, materialsDir);
    }
  },
  filename: function(req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

// Init Upload
const upload = multer({
  storage: storage,
  limits: { fileSize: 50000000 }, // 50MB limit
  fileFilter: function(req, file, cb){
    checkFileType(file, cb);
  }
});

// Check File Type
function checkFileType(file, cb){
  // Allowed ext
  const filetypes = /pdf|mp4|mkv|webm|jpg|jpeg|png|gif|doc|docx|txt|text/;
  // Check ext
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  // Check mime
  const mimetype = filetypes.test(file.mimetype);

  if(mimetype && extname){
    return cb(null,true);
  } else {
    cb('Error: File type not supported!');
  }
}

module.exports = upload;
