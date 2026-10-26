/** Raw provider job → JobListing fields. Deterministic; uses only provider-supplied text. Nothing is invented. */
const crypto = require('crypto');
const { extractSkills } = require('../skillNormalizer');
const { levelFromText } = require('../evidenceService');
const { safeUrl } = require('./http');

const MAX_DESC = 9000;

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&middot;': '·', '&ndash;': '–', '&mdash;': '—', '&rsquo;': '’', '&lsquo;': '‘' };
function htmlToText(html) {
  return String(html || '')
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>|<\/(p|div|li|h[1-6]|ul|ol|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|middot|ndash|mdash|rsquo|lsquo|#39);/g, m => ENTITIES[m] || ' ')
    .replace(/&#(\d+);/g, (_, n) => { const c = parseInt(n, 10); return c > 31 && c < 65536 ? String.fromCharCode(c) : ' '; })
    .replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function detectWorkMode(raw, text) {
  const t = `${raw.title} ${raw.location} ${text.slice(0, 1500)}`.toLowerCase();
  if (/\bhybrid\b/.test(t)) return 'hybrid';
  if (raw.remote === true || /\b(remote|work from home|wfh|anywhere)\b/.test(`${raw.title} ${raw.location}`.toLowerCase())) return 'remote';
  if (/\bfully remote\b|\b100% remote\b|\bremote[- ]first\b/.test(t)) return 'remote';
  if (/\bon[- ]?site\b|\bin[- ]office\b|\bonsite\b/.test(t)) return 'onsite';
  return 'unknown';
}

function detectEmployment(raw, text) {
  const t = `${raw.employmentType} ${raw.title}`.toLowerCase();
  if (/intern/.test(t)) return 'internship';
  if (/part[- _]?time/.test(t)) return 'part-time';
  if (/contract|freelance|temporary/.test(t)) return 'contract';
  if (/full[- _]?time|permanent/.test(t)) return 'full-time';
  return '';
}

function detectLevel(title) {
  const t = String(title).toLowerCase();
  if (/\b(intern|internship|trainee|apprentice)\b/.test(t)) return 'intern';
  if (/\b(lead|principal|staff|architect|head of)\b/.test(t)) return 'lead';
  if (/\b(senior|sr\.?)\b/.test(t)) return 'senior';
  if (/\b(junior|jr\.?|entry[- ]level|graduate|fresher|associate)\b/.test(t)) return 'junior';
  if (/\b(mid|intermediate)\b/.test(t)) return 'mid';
  return 'unknown';
}

function detectYears(text) {
  const lines = text.split('\n').filter(l => /experience|exp\b|years/i.test(l));
  for (const l of lines) {
    let m = l.match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i);
    if (m && +m[2] >= +m[1] && +m[2] <= 40) return { minYears: +m[1], maxYears: +m[2] };
    m = l.match(/(\d{1,2})\s*(?:\+|plus)?\s*(?:years?|yrs?)/i);
    if (m && +m[1] <= 40) return { minYears: +m[1], maxYears: null };
  }
  return { minYears: null, maxYears: null };
}

function detectEducation(text) {
  const lines = text.split('\n').filter(l => /degree|bachelor|master|ph\.?d|b\.?tech|graduate|diploma/i.test(l));
  let best = null; const rank = { diploma: 1, bachelor: 2, master: 3, phd: 4 };
  for (const l of lines) {
    const lv = levelFromText(l);
    if (lv && lv !== 'highschool' && (!best || rank[lv] > rank[best])) best = lv;
  }
  return best || 'unknown';
}

const LEAD_PREFERRED_RE = /(preferred(?:\s+(?:skills|qualifications))?|nice[\s-]to[\s-]have|good[\s-]to[\s-]have|bonus(?:\s+points)?|desirable)/i;
const TRAIL_PREFERRED_RE = /(\ba plus\b|\bis a plus\b|\boptional\b|would be (?:great|nice|an advantage)|\ban advantage\b)/i;
const REQUIRED_RE = /(requirements?|qualifications?|must[\s-]have|what you(?:'|’)?ll need|what we(?:'|’)?re looking for|required|responsibilities|skills|you have|about you)/i;

function sentences(line) { return line.split(/(?<=[.!?;])\s+/).map(x => x.trim()).filter(Boolean); }

function classifySkills(text, title, tags, index) {
  const required = new Map(), preferred = new Map();
  const put = (map, str) => extractSkills(str, index).forEach((v, id) => { if (!map.has(id)) map.set(id, v.name); });

  put(required, `${title}\n${(tags || []).join('\n')}`);
  let mode = 'required';                       // persists across lines after a short "Nice to have:" style heading
  for (const line of text.split('\n')) {
    const lineShort = line.length <= 90;
    for (const sent of sentences(line)) {
      const lead = sent.search(LEAD_PREFERRED_RE);
      if (lead >= 0) {
        put(mode === 'preferred' ? preferred : required, sent.slice(0, lead));
        const after = sent.slice(lead);
        put(preferred, after);
        // A bare heading ("Nice to have:") switches the mode for the following bullet lines
        if (lineShort && extractSkills(after, index).size === 0) mode = 'preferred';
      } else if (TRAIL_PREFERRED_RE.test(sent)) {
        put(preferred, sent);
      } else if (sent.length <= 90 && REQUIRED_RE.test(sent)) {
        mode = 'required';
        put(required, sent);
      } else {
        put(mode === 'preferred' ? preferred : required, sent);
      }
    }
  }
  for (const id of required.keys()) preferred.delete(id);   // required wins
  const toList = m => [...m.entries()].map(([skillId, name]) => ({ skillId, name }));
  return { required: toList(required), preferred: toList(preferred) };
}

function dedupeKey(title, company, location) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return crypto.createHash('sha1').update(`${norm(title)}|${norm(company)}|${norm(location).split(' ')[0] || ''}`).digest('hex');
}

function normalizeJob(raw, index) {
  if (!raw || !raw.title || !raw.externalId) return null;
  const isSample = !!raw.isSample;
  const applyUrl = isSample ? null : safeUrl(raw.applyUrl);
  const sourceUrl = isSample ? null : safeUrl(raw.sourceUrl || raw.applyUrl);
  if (!isSample && !applyUrl) return null;      // never surface a listing without a real link

  const text = htmlToText(raw.description).slice(0, MAX_DESC);
  const title = htmlToText(raw.title).slice(0, 200);
  const exp = detectYears(text);
  const level = detectLevel(title);
  const { required, preferred } = classifySkills(text, title, raw.tags, index);

  return {
    provider: raw.provider, externalId: String(raw.externalId), title,
    company: htmlToText(raw.company).slice(0, 150), description: text,
    location: String(raw.location || '').slice(0, 150),
    workMode: detectWorkMode(raw, text), employmentType: detectEmployment(raw, text),
    experience: { minYears: exp.minYears, maxYears: exp.maxYears, level },
    educationRequirement: detectEducation(text),
    requiredSkills: required, preferredSkills: preferred,
    tags: (raw.tags || []).map(String).slice(0, 12),
    salary: raw.salary ? { min: raw.salary.min ?? null, max: raw.salary.max ?? null, currency: raw.salary.currency || '', period: raw.salary.period || '' } : { min: null, max: null, currency: '', period: '' },
    postedAt: raw.postedAt && !isNaN(new Date(raw.postedAt)) ? new Date(raw.postedAt) : null,
    applyUrl, sourceUrl, isSample,
    dedupeKey: dedupeKey(title, raw.company, raw.location)
  };
}

module.exports = { normalizeJob, htmlToText, detectWorkMode, detectYears, detectEducation, detectLevel, classifySkills, dedupeKey };
