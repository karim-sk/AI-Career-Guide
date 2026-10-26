const { parseResumeText, validateUpload, ResumeError } = require('../../backend/services/resumeParser');
const { index } = require('../helpers/catalog');

const RESUME = `Priya Sharma
priya@example.com | +91 98765 43210

TECHNICAL SKILLS
Languages: JavaScript, Python, SQL
Backend: Node.js, Express, REST APIs
Databases: MongoDB, Redis
Tools: Git, Docker, Figma

EXPERIENCE
Backend Developer Intern - Acme Tech
Jun 2022 - Dec 2022
- Built REST APIs with Express and MongoDB
Software Engineer, Globex
Jan 2023 - Dec 2024
• Developed microservices using Node.js and Docker

PROJECTS
Career Guide | Node.js
- Implemented JWT authentication
Notes App
- React front-end

EDUCATION
B.Tech in Computer Science, Anna University, 2018 - 2022

CERTIFICATIONS
- AWS Certified Cloud Practitioner`;

describe('resume parser', () => {
  const r = parseResumeText(RESUME, index, new Date('2025-06-01'));
  test('detects sections and name', () => {
    expect(r.parseStatus).toBe('parsed'); expect(r.fullName).toBe('Priya Sharma');
    expect(r.sectionsFound).toEqual(expect.arrayContaining(['skills', 'experience', 'projects', 'education', 'certifications']));
  });
  test('does NOT store contact details', () => { expect(JSON.stringify(r)).not.toMatch(/priya@example|98765/); });
  test('normalizes skills and distinguishes listed vs applied evidence', () => {
    const by = Object.fromEntries(r.skills.map(s => [s.name, s]));
    expect(by['Node.js'].evidence).toBe('applied');
    expect(by['Python'].evidence).toBe('listed');      // only in the skills list → a claim
    expect(by['Redis'].evidence).toBe('listed');
  });
  test('unknown tools go to unmappedSkills, not skills', () => {
    expect(r.unmappedSkills).toContain('figma'); expect(r.skills.map(s => s.name)).not.toContain('Figma');
  });
  test('experience years: union of ranges, internship counts half', () => {
    // 2 years full-time + 6 months internship × 0.5 = 2.25
    expect(r.totalExperienceYears).toBeGreaterThanOrEqual(2); expect(r.totalExperienceYears).toBeLessThan(3);
    expect(r.experience.find(e => e.isInternship)).toBeTruthy();
  });
  test('education level and certifications', () => {
    expect(r.education[0].level).toBe('bachelor'); expect(r.certifications[0]).toMatch(/AWS Certified/);
  });
  test('projects extracted with their technologies', () => {
    expect(r.projects.map(p => p.name)).toEqual(expect.arrayContaining(['Career Guide', 'Notes App']));
  });
  test('text with almost no content is flagged failed (e.g. scanned PDF)', () => {
    expect(parseResumeText('  ', index).parseStatus).toBe('failed');
  });
});

describe('upload validation (magic bytes, not client MIME)', () => {
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 32)]);
  test('accepts a PDF', () => expect(validateUpload(pdf, 'application/pdf', 'cv.pdf')).toBe('pdf'));
  test('rejects PDF content with wrong extension', () => expect(() => validateUpload(pdf, 'application/pdf', 'cv.docx')).toThrow(ResumeError));
  test('rejects executables renamed to .pdf', () => {
    expect(() => validateUpload(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300, 1)]), 'application/pdf', 'cv.pdf')).toThrow(/Unsupported/);
  });
  test('rejects generic zip files posing as docx', () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(300, 1)]);
    expect(() => validateUpload(zip, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'cv.docx')).toThrow(/not a valid Word/);
  });
  test('rejects empty uploads', () => expect(() => validateUpload(Buffer.alloc(0), '', 'a.pdf')).toThrow(ResumeError));
});
