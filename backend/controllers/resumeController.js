const crypto = require('crypto');
const Resume = require('../models/Resume');
const Skill = require('../models/Skill');
const parser = require('../services/resumeParser');
const storage = require('../services/resumeStorage');
const { getIndex } = require('../services/skillNormalizer');
const { isId, httpError } = require('../utils/ids');

const EDU_LEVELS = ['highschool', 'diploma', 'bachelor', 'master', 'phd', 'other'];

const publicView = r => r && ({
  _id: r._id, originalName: r.originalName, fileType: r.fileType, size: r.size, uploadedAt: r.uploadedAt,
  fileRetained: !!(r.storage && r.storage.provider === 'gridfs' && r.storage.fileId),
  parseStatus: r.parseStatus, parseError: r.parseError, fullName: r.fullName, education: r.education,
  experience: r.experience, totalExperienceYears: r.totalExperienceYears, projects: r.projects,
  certifications: r.certifications, achievements: r.achievements, skills: r.skills, unmappedSkills: r.unmappedSkills,
  reviewStatus: r.reviewStatus, reviewedAt: r.reviewedAt
});

// POST /api/resume  (multipart field "resume")
exports.upload = async (req, res, next) => {
  try {
    if (!req.file) throw httpError(400, 'No file uploaded. Attach a PDF or DOCX in the "resume" field.');
    const buffer = req.file.buffer;
    const fileType = parser.validateUpload(buffer, req.file.mimetype, req.file.originalname);
    const text = await parser.extractText(buffer, fileType);
    const index = await getIndex();
    const parsed = parser.parseResumeText(text, index);

    if (parsed.parseStatus === 'failed') {
      throw httpError(422, parsed.warnings[parsed.warnings.length - 1] || 'No readable text found in this document.');
    }

    const existing = await Resume.findOne({ userId: req.user._id });
    const stored = await storage.save(buffer, req.file.originalname, { userId: String(req.user._id), fileType });

    const fields = {
      originalName: String(req.file.originalname).replace(/[^\w.\- ]+/g, '_').slice(0, 120),
      mimeType: fileType === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileType, size: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      storage: stored, parseStatus: parsed.parseStatus, parseError: '',
      fullName: parsed.fullName, education: parsed.education, experience: parsed.experience,
      totalExperienceYears: parsed.totalExperienceYears, projects: parsed.projects,
      certifications: parsed.certifications, achievements: parsed.achievements,
      skills: parsed.skills, unmappedSkills: parsed.unmappedSkills,
      reviewStatus: 'pending', reviewedAt: null, uploadedAt: new Date()
    };

    let resume;
    try {
      resume = await Resume.findOneAndUpdate({ userId: req.user._id }, { $set: fields }, { upsert: true, new: true, setDefaultsOnInsert: true });
    } catch (e) { await storage.remove(stored); throw e; }
    if (existing) await storage.remove(existing.storage);      // replace → old file deleted

    res.status(201).json({
      success: true,
      message: 'Resume analysed. Please review the extracted details — they are only used for job matching after you confirm them.',
      warnings: parsed.warnings, resume: publicView(resume)
    });
  } catch (err) { next(err); }
};

// GET /api/resume
exports.get = async (req, res, next) => {
  try {
    const resume = await Resume.findOne({ userId: req.user._id });
    res.json({ success: true, resume: publicView(resume) || null });
  } catch (err) { next(err); }
};

// PATCH /api/resume/review — user corrections + confirmation
exports.review = async (req, res, next) => {
  try {
    const resume = await Resume.findOne({ userId: req.user._id });
    if (!resume) throw httpError(404, 'No resume found. Upload one first.');
    const b = req.body || {};

    if (b.skills !== undefined) {
      if (!Array.isArray(b.skills) || b.skills.length > 150 || !b.skills.every(isId)) throw httpError(400, 'skills must be an array of skill ids.');
      const unique = [...new Set(b.skills)];
      const catalog = await Skill.find({ _id: { $in: unique } }).select('name').lean();
      const byId = new Map(catalog.map(s => [String(s._id), s.name]));
      const current = new Map(resume.skills.map(s => [String(s.skillId), s]));
      resume.skills = unique.filter(id => byId.has(id)).map(id => {
        const old = current.get(id);
        return old ? { skillId: old.skillId, name: old.name, sources: old.sources, evidence: old.evidence, userAdded: old.userAdded }
                   : { skillId: id, name: byId.get(id), sources: ['user'], evidence: 'listed', userAdded: true };
      });
    }
    if (b.totalExperienceYears !== undefined) {
      const y = Number(b.totalExperienceYears);
      if (!Number.isFinite(y) || y < 0 || y > 50) throw httpError(400, 'totalExperienceYears must be between 0 and 50.');
      resume.totalExperienceYears = Math.round(y * 10) / 10;
    }
    if (b.certifications !== undefined) {
      if (!Array.isArray(b.certifications) || b.certifications.length > 20) throw httpError(400, 'certifications must be an array (max 20).');
      resume.certifications = b.certifications.filter(c => typeof c === 'string').map(c => c.trim().slice(0, 160)).filter(Boolean);
    }
    if (b.education !== undefined) {
      if (!Array.isArray(b.education) || b.education.length > 6) throw httpError(400, 'education must be an array (max 6).');
      resume.education = b.education.filter(e => e && typeof e === 'object').map(e => ({
        degree: String(e.degree || '').slice(0, 160), institution: String(e.institution || '').slice(0, 160),
        raw: String(e.raw || e.degree || '').slice(0, 200), level: EDU_LEVELS.includes(e.level) ? e.level : 'other'
      }));
    }
    if (b.confirm === true) { resume.reviewStatus = 'confirmed'; resume.reviewedAt = new Date(); }
    else if (b.confirm === false) { resume.reviewStatus = 'pending'; resume.reviewedAt = null; }

    await resume.save();
    res.json({ success: true, message: resume.reviewStatus === 'confirmed' ? 'Resume confirmed. It will now be used for job matching.' : 'Changes saved.', resume: publicView(resume) });
  } catch (err) { next(err); }
};

// GET /api/resume/file — owner-only download of the stored original
exports.download = async (req, res, next) => {
  try {
    const resume = await Resume.findOne({ userId: req.user._id });
    if (!resume) throw httpError(404, 'No resume found.');
    const stream = storage.openDownload(resume.storage);
    if (!stream) throw httpError(404, 'The original file is not retained (RESUME_STORAGE=none).');
    res.setHeader('Content-Type', resume.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${resume.originalName.replace(/"/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    stream.on('error', () => { if (!res.headersSent) res.status(404).end(); else res.end(); });
    stream.pipe(res);
  } catch (err) { next(err); }
};

// DELETE /api/resume
exports.remove = async (req, res, next) => {
  try {
    const resume = await Resume.findOneAndDelete({ userId: req.user._id });
    if (resume) await storage.remove(resume.storage);
    res.json({ success: true, message: resume ? 'Resume deleted. Extracted data and the stored file were removed.' : 'No resume to delete.' });
  } catch (err) { next(err); }
};
