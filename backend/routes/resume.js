const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const ctrl = require('../controllers/resumeController');
const { protect } = require('../middleware/auth');

const MAX_MB = parseFloat(process.env.RESUME_MAX_MB) || 5;
const upload = multer({
  storage: multer.memoryStorage(),                       // never written to the local filesystem
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(pdf|docx)$/i.test(file.originalname || '');
    cb(ok ? null : Object.assign(new Error('Only .pdf and .docx files are accepted.'), { statusCode: 415 }), ok);
  }
});
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many resume uploads. Please wait a few minutes.' }
});

const handleUpload = (req, res, next) => upload.single('resume')(req, res, err => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: `File too large. Maximum size is ${MAX_MB} MB.` });
  if (err instanceof multer.MulterError) return res.status(400).json({ success: false, message: 'Invalid upload.' });
  next(err);
});

router.post('/', protect, uploadLimiter, handleUpload, ctrl.upload);
router.get('/', protect, ctrl.get);
router.patch('/review', protect, ctrl.review);
router.get('/file', protect, ctrl.download);
router.delete('/', protect, ctrl.remove);

module.exports = router;
