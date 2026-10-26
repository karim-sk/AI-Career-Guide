/**
 * Resume parsing.
 *  validateUpload(buffer, mimetype, name)  → 'pdf' | 'docx'  (magic-byte checks; the client MIME type is NOT trusted)
 *  extractText(buffer, fileType)           → plain text (never executes anything in the document)
 *  parseResumeText(text, skillIndex)       → structured data (no contact details are extracted or stored)
 *
 * Output is a *claim set* for the user to review — nothing here marks a skill as verified.
 */
const { extractSkills, normalizeTerm, splitListItems } = require('./skillNormalizer');

const MAX_TEXT_CHARS = 120000;
const MAX_PDF_PAGES = 15;

class ResumeError extends Error {
  constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; this.expose = true; }
}

// ── File validation / text extraction ────────────────────────────────────────
function validateUpload(buffer, mimetype = '', originalName = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 100) throw new ResumeError('The uploaded file is empty or too small.');
  const isPdf = buffer.slice(0, 5).toString('latin1') === '%PDF-';
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05);
  const ext = String(originalName).toLowerCase().split('.').pop();

  if (isPdf) {
    if (ext && ext !== 'pdf') throw new ResumeError('File extension does not match its content (expected .pdf).');
    return 'pdf';
  }
  if (isZip) {
    // A real .docx is an OOXML zip containing word/document.xml; other zips (and macro-enabled variants) are rejected.
    const hasWordDoc = buffer.includes(Buffer.from('word/document.xml'));
    const hasContentTypes = buffer.includes(Buffer.from('[Content_Types].xml'));
    if (!hasWordDoc || !hasContentTypes) throw new ResumeError('This archive is not a valid Word (.docx) document.');
    if (ext && ext !== 'docx') throw new ResumeError('File extension does not match its content (expected .docx).');
    return 'docx';
  }
  throw new ResumeError('Unsupported file type. Please upload a PDF or DOCX resume.', 415);
}

async function extractText(buffer, fileType) {
  try {
    if (fileType === 'pdf') {
      return normalizeText(await extractPdfText(buffer));
    }
    if (fileType === 'docx') {
      const mammoth = require('mammoth');
      const res = await mammoth.extractRawText({ buffer });
      return normalizeText(res.value);
    }
  } catch (err) {
    throw new ResumeError('We could not read this document. It may be corrupted or password-protected.', 422);
  }
  throw new ResumeError('Unsupported file type.', 415);
}

let pdfjsPromise = null;
/** pdfjs-dist ≥ 4 is ESM-only → dynamic import. Its optional canvas polyfill warnings are irrelevant (text extraction only). */
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const w = console.warn, l = console.log;
      console.warn = console.log = () => {};
      try { return await import('pdfjs-dist/legacy/build/pdf.mjs'); } finally { console.warn = w; console.log = l; }
    })();
  }
  return pdfjsPromise;
}

/** PDF text via pdfjs-dist (maintained). Scripts/eval in the PDF are never executed (isEvalSupported:false). */
async function extractPdfText(buffer) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true, useSystemFonts: false,
    verbosity: 0, stopAtErrors: false, disableAutoFetch: true, disableStream: true
  });
  const pdf = await task.promise;
  try {
    const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
    let out = '';
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let lastY = null;
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        const y = item.transform ? item.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) out += '\n';
        out += item.str + (item.hasEOL ? '\n' : (item.str && !item.str.endsWith(' ') ? ' ' : ''));
        if (y !== null) lastY = y;
      }
      out += '\n\n';
      page.cleanup();
      if (out.length > MAX_TEXT_CHARS) break;
    }
    return out;
  } finally { try { await pdf.destroy(); } catch (e) { /* ignore */ } }
}

function normalizeText(t) {
  return String(t || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, MAX_TEXT_CHARS)
    .trim();
}

// ── Section detection ────────────────────────────────────────────────────────
const SECTION_PATTERNS = [
  ['skills',         /^(?:technical\s+|key\s+|core\s+)?(?:skills?|skill\s*set|technologies|tech\s*stack|competencies|core\s+competencies|tools(?:\s*&\s*technologies)?|technical\s+proficiency)$/i],
  ['education',      /^(?:education(?:al)?(?:\s+(?:background|qualifications?))?|academics?|academic\s+(?:background|qualifications?)|qualifications?)$/i],
  ['experience',     /^(?:(?:work|professional|relevant|industry)\s+experience|experience|employment(?:\s+history)?|work\s+history|internships?|internship\s+experience)$/i],
  ['projects',       /^(?:(?:academic|personal|key|major|technical)\s+)?projects?(?:\s+experience)?$/i],
  ['certifications', /^(?:certifications?(?:\s+(?:&|and)\s+(?:courses|training|licenses?))?|licenses?(?:\s*&\s*certifications?)?|courses|training|certificates?)$/i],
  ['achievements',   /^(?:achievements?|awards?(?:\s*&\s*honou?rs)?|honou?rs|accomplishments|extra[-\s]?curricular(?:\s+activities)?)$/i],
  ['summary',        /^(?:summary|professional\s+summary|profile|career\s+objective|objective|about(?:\s+me)?)$/i]
];

function detectHeading(line) {
  const raw = line.trim();
  if (!raw || raw.length > 120) return null;
  // Either a bare heading ("SKILLS", "Technical Skills:") or "Heading: inline content"
  const colon = raw.search(/[:：]/);
  const head = (colon > -1 ? raw.slice(0, colon) : raw).trim();
  const rest = colon > -1 ? raw.slice(colon + 1).trim() : '';
  if (!head || head.length > 45 || !/^[A-Za-z&/, \-]+$/.test(head)) return null;
  for (const [name, re] of SECTION_PATTERNS) {
    if (re.test(head)) return { name, inline: rest };
  }
  return null;
}

function splitSections(text) {
  const lines = text.split('\n');
  const sections = { header: [] };
  let current = 'header';
  for (const line of lines) {
    const h = detectHeading(line);
    if (h) {
      current = h.name;
      if (!sections[current]) sections[current] = [];
      if (h.inline) sections[current].push(h.inline);
      continue;
    }
    if (!sections[current]) sections[current] = [];
    sections[current].push(line);
  }
  return sections;
}

// ── Name ─────────────────────────────────────────────────────────────────────
function extractName(headerLines) {
  for (const line of headerLines.slice(0, 6)) {
    const t = line.trim();
    if (!t || t.length > 50) continue;
    if (/[0-9@:/\\|]|http|www\./i.test(t)) continue;
    const words = t.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every(w => /^[A-Za-z.'\-]+$/.test(w))) continue;
    if (/resume|curriculum|vitae|engineer|developer|analyst|manager/i.test(t)) continue;
    return t;
  }
  return '';
}

// ── Education ────────────────────────────────────────────────────────────────
const LEVEL_RULES = [
  ['phd',        /\b(ph\.?\s?d|doctorate|doctoral)\b/i],
  ['master',     /\b(m\.?\s?tech|m\.?\s?sc|m\.?\s?c\.?\s?a|m\.?\s?b\.?\s?a|m\.?\s?e\b|master'?s?|msc|mtech|mca|mba|m\.s\.)\b/i],
  ['bachelor',   /\b(b\.?\s?tech|b\.?\s?sc|b\.?\s?c\.?\s?a|b\.?\s?com|bachelor'?s?|btech|bsc|bca|b\.s\.)(?![a-z])/i],
  ['bachelor',   /\bB\.?E\.?(?=[\s,]|$)|\bB\.?A\.?(?=[\s,]|$)/],   // uppercase-only: "B.E", "BA" (avoid the word "be")
  ['diploma',    /\b(diploma|associate'?s?\s+degree|polytechnic)\b/i],
  ['highschool', /\b(high\s+school|hsc|ssc|12th|10th|higher\s+secondary|secondary\s+school|a-levels?)\b/i]
];
const INSTITUTION_RE = /\b(university|college|institute|school|academy|polytechnic|iit|nit|iiit)\b/i;

function extractEducation(lines) {
  const items = lines.map(l => l.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const line = items[i];
    const rule = LEVEL_RULES.find(([, re]) => re.test(line));
    if (!rule) continue;
    const neighbour = [items[i - 1], items[i + 1]].find(l => l && INSTITUTION_RE.test(l));
    const institution = INSTITUTION_RE.test(line) ? line : (neighbour || '');
    out.push({ degree: line.slice(0, 160), institution: institution.slice(0, 160), raw: line.slice(0, 200), level: rule[0] });
    if (out.length >= 6) break;
  }
  return out;
}

// ── Experience ───────────────────────────────────────────────────────────────
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const DATE_RE = `(?:${MONTH_RE}\\s+\\d{4}|\\d{1,2}[\\/\\-]\\d{4}|\\d{4})`;
const RANGE_RE = new RegExp(`(${DATE_RE})\\s*(?:-|–|—|to)\\s*(${DATE_RE}|present|current|now|ongoing|till\\s+date)`, 'i');

function toMonthIndex(str, isEnd, nowDate) {
  const s = str.trim().toLowerCase();
  if (/^(present|current|now|ongoing|till\s+date)$/.test(s)) return nowDate.getFullYear() * 12 + nowDate.getMonth();
  let m = s.match(new RegExp(`^(${MONTH_RE})\\s+(\\d{4})$`));
  if (m) return parseInt(m[2], 10) * 12 + MONTHS.indexOf(m[1].slice(0, 3));
  m = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m) return parseInt(m[2], 10) * 12 + Math.min(11, Math.max(0, parseInt(m[1], 10) - 1));
  m = s.match(/^(\d{4})$/);
  if (m) return parseInt(m[1], 10) * 12 + 6;     // year-only → mid-year (conservative)
  return null;
}

function mergeIntervals(intervals) {
  const sorted = intervals.filter(i => i && i[1] >= i[0]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([...iv]);
  }
  return merged;
}

function extractExperience(lines, index, nowDate = new Date()) {
  const items = lines.map(l => l.trim());
  const entries = [];
  let cur = null;

  const startEntry = (i, range) => {
    const head = [items[i - 1], items[i]].filter(Boolean).join(' ');
    cur = { title: '', company: '', durationText: range[0], start: null, end: null, bodyLines: [], head };
    const s = toMonthIndex(range[1], false, nowDate), e = toMonthIndex(range[2], true, nowDate);
    if (s != null && e != null && e >= s) { cur.start = s; cur.end = e; }
    const label = items[i].replace(RANGE_RE, '').replace(/[|•\-–—,()]+\s*$/g, '').trim() || (items[i - 1] || '');
    const parts = label.split(/\s+(?:at|@|\||–|—|-)\s+|,\s+/);
    cur.title = (parts[0] || '').slice(0, 100);
    cur.company = (parts[1] || '').slice(0, 100);
    entries.push(cur);
  };

  items.forEach((line, i) => {
    const m = line.match(RANGE_RE);
    if (m) startEntry(i, m);
    else if (cur && line) cur.bodyLines.push(line);
  });

  const ft = [], intern = [];
  const result = entries.slice(0, 12).map(e => {
    const isInternship = /intern(ship)?\b|trainee|apprentice/i.test(e.head);
    const months = e.start != null ? Math.max(1, e.end - e.start) : 0;
    if (e.start != null) (isInternship ? intern : ft).push([e.start, e.end]);
    const skills = [...extractSkills(e.bodyLines.join('\n') + ' ' + e.title, index).keys()];
    return { title: e.title, company: e.company, durationText: e.durationText, years: Math.round((months / 12) * 10) / 10, isInternship, skills,
             _text: e.bodyLines.join('\n') + ' ' + e.title };
  });

  const ftMonths = mergeIntervals(ft).reduce((a, [s, e]) => a + (e - s), 0);
  const internMonths = mergeIntervals(intern).reduce((a, [s, e]) => a + (e - s), 0);
  // Policy: full-time months count 1×; internship months count 0.5×
  let total = (ftMonths + internMonths * 0.5) / 12;
  return { entries: result, totalYears: Math.min(50, Math.round(total * 10) / 10) };
}

// ── Projects / certs / achievements ──────────────────────────────────────────
const BULLET_RE = /^\s*[•\-*▪●◦►■○–—]\s+/;

function extractProjects(lines, index) {
  const projects = [];
  let cur = null;
  let lastWasBullet = true;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { lastWasBullet = true; continue; }
    const isBullet = BULLET_RE.test(line);
    const looksLikeTitle = !isBullet && line.length <= 110 && lastWasBullet;
    if (looksLikeTitle) {
      cur = { name: line.split(/\s*[|–—]\s*|\s+-\s+|:\s/)[0].slice(0, 80), body: [line] };
      projects.push(cur);
    } else if (cur) {
      cur.body.push(line.replace(BULLET_RE, ''));
    }
    lastWasBullet = isBullet || !looksLikeTitle;
    if (!isBullet && !looksLikeTitle) lastWasBullet = false;
  }
  return projects.slice(0, 12).map(p => {
    const text = p.body.join('\n');
    return { name: p.name, description: text.slice(0, 500), skills: [...extractSkills(text, index).keys()], _text: text };
  });
}

function extractList(lines, limit, maxLen = 160) {
  return lines.map(l => l.trim().replace(BULLET_RE, '')).filter(l => l && l.length >= 3 && l.length <= maxLen).slice(0, limit);
}

// ── Main ─────────────────────────────────────────────────────────────────────
function parseResumeText(text, index, nowDate = new Date()) {
  const clean = normalizeText(text);
  const sections = splitSections(clean);
  const warnings = [];

  const skillMap = new Map();   // id → {skillId,name,sources:Set,evidence}
  const addSkill = (id, source, applied) => {
    const meta = index.byId.get(id);
    if (!meta) return;
    let s = skillMap.get(id);
    if (!s) { s = { skillId: id, name: meta.name, sources: new Set(), evidence: 'listed' }; skillMap.set(id, s); }
    s.sources.add(source);
    if (applied) s.evidence = 'applied';
  };

  // Skills section: free-text + list-item normalization
  const unmapped = new Set();
  const skillsText = (sections.skills || []).join('\n');
  for (const id of extractSkills(skillsText, index).keys()) addSkill(id, 'skills_section', false);
  for (const item of splitListItems(skillsText)) {
    if (item.split(' ').length > 3) continue;
    const hits = normalizeTerm(item, index);
    if (hits.length) hits.forEach(h => addSkill(h.skillId, 'skills_section', false));
    else if (/^[a-z][a-z0-9 .+#\-/]{1,28}$/.test(item)) unmapped.add(item);
  }

  const summaryText = (sections.summary || []).join('\n');
  for (const id of extractSkills(summaryText, index).keys()) addSkill(id, 'summary', false);

  const exp = extractExperience(sections.experience || [], index, nowDate);
  exp.entries.forEach(e => e.skills.forEach(id => addSkill(id, e.isInternship ? 'experience' : 'experience', true)));

  const projects = extractProjects(sections.projects || [], index);
  projects.forEach(p => p.skills.forEach(id => addSkill(id, 'project', true)));

  const certifications = extractList(sections.certifications || [], 20);
  // certifications also mentioned outside their own section
  const certLines = clean.split('\n').filter(l => /\bcertif(?:ied|ication|icate)\b/i.test(l) && l.length <= 160).map(l => l.trim().replace(BULLET_RE, ''));
  certLines.forEach(l => { if (!certifications.includes(l) && certifications.length < 20) certifications.push(l); });
  for (const c of certifications) for (const id of extractSkills(c, index).keys()) addSkill(id, 'certification', false);

  const achievements = extractList(sections.achievements || [], 15);
  const education = extractEducation(sections.education || []);

  // Fallback total years: "5+ years of experience" phrasing
  let totalYears = exp.totalYears;
  if (!totalYears) {
    const m = clean.match(/(\d{1,2}(?:\.\d)?)\s*\+?\s*years?\s+(?:of\s+)?(?:professional\s+|work\s+|industry\s+|relevant\s+)?experience/i);
    if (m) totalYears = Math.min(40, parseFloat(m[1]));
  }

  const sectionsFound = Object.keys(sections).filter(k => k !== 'header' && sections[k].some(l => l.trim()));
  if (!sectionsFound.length) warnings.push('No standard sections (Skills, Education, Experience…) were detected; results may be incomplete.');

  const skills = [...skillMap.values()]
    .map(s => ({ skillId: s.skillId, name: s.name, sources: [...s.sources], evidence: s.evidence, userAdded: false }))
    .sort((a, b) => a.name.localeCompare(b.name));

  let parseStatus = 'parsed';
  if (clean.length < 80) parseStatus = 'failed';
  else if (!skills.length || !sectionsFound.length) parseStatus = 'partial';
  if (parseStatus === 'failed') warnings.push('Very little text could be extracted. Scanned/image-only PDFs are not supported — upload a text-based PDF or DOCX.');

  return {
    parseStatus, warnings,
    fullName: extractName(sections.header || []),
    education,
    experience: exp.entries.map(({ _text, ...e }) => e),
    totalExperienceYears: totalYears || 0,
    projects: projects.map(({ _text, ...p }) => p),
    certifications, achievements, skills,
    unmappedSkills: [...unmapped].slice(0, 25),
    sectionsFound
  };
}

module.exports = { validateUpload, extractText, parseResumeText, normalizeText, ResumeError, splitSections, MAX_PDF_PAGES };
