/**
 * Skill normalizer — maps free text ("NodeJS", "Node js", "node.js") to canonical catalog skills.
 *
 *  • buildIndex(skills)      pure, builds the lookup structures (unit-testable without a DB)
 *  • extractSkills(text,idx) finds catalog skills mentioned in free text
 *  • normalizeTerm(term,idx) maps ONE term (e.g. a tag) to catalog skills
 *  • getIndex()              DB-backed, cached (invalidate with resetIndexCache)
 *
 * Ambiguity policy: short or common-word names (C, Go, R-like, "Monitoring", "Excel"…) and any alias of ≤2 characters
 * are matched ONLY when they stand alone as a list item ("Skills: Python, Go, C"), never inside prose.
 * This avoids turning "go to market" into a Go claim. Nothing in a resume is *verified* by this module — it only
 * identifies which catalog skill a piece of text refers to.
 */

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compact = s => s.toLowerCase().replace(/[\s.\-_/]+/g, '');
const clean = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.:;,]+$/, '');

function termToPattern(term) {
  // flexible whitespace/hyphen inside multi-word terms
  return escapeRe(term).replace(/\\?[ ]+/g, '[\\s\\-]+').replace(/ /g, '[\\s\\-]+');
}

function buildIndex(skills) {
  const byId = new Map();
  const termMap = new Map();     // exact normalized term → Set(skillId)
  const compactMap = new Map();  // compact form → Set(skillId)
  const listOnly = new Map();    // standalone-list-item terms → Set(skillId)
  const entries = [];

  const add = (map, key, id) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(id); };

  for (const sk of skills) {
    const id = String(sk._id || sk.id || sk.name);
    byId.set(id, { id, name: sk.name, category: sk.category || '' });

    const name = clean(sk.name);
    const aliases = (sk.aliases || []).map(clean).filter(Boolean);
    const all = [...new Set([name, ...aliases])];
    const freeTerms = [];

    for (const t of all) {
      add(termMap, t, id);
      add(compactMap, compact(t), id);
      const isName = t === name;
      const short = t.length <= 2 && /^[a-z0-9]+$/.test(t);   // 'js','ml','ts' are list-only; 'c#','c++' are distinctive
      if (short || (sk.ambiguous && isName)) add(listOnly, t, id);
      else freeTerms.push(t);
    }

    if (freeTerms.length) {
      freeTerms.sort((a, b) => b.length - a.length);
      const pattern = freeTerms.map(termToPattern).join('|');
      entries.push({ id, regex: new RegExp(`(?<![a-z0-9+#])(?:${pattern})(?![a-z0-9+#])`, 'gi') });
    }
  }
  return { byId, termMap, compactMap, listOnly, entries };
}

function splitListItems(text) {
  return String(text || '')
    .split(/[\n\r,;|•·●▪◦►▶■□●○–—]+|\s[-/]\s|[()]/)
    .map(item => {
      let t = item.trim();
      const colon = t.indexOf(':');
      if (colon > -1 && colon <= 32) t = t.slice(colon + 1).trim();   // strip "Languages:" labels
      return clean(t.replace(/^[-*>\d.)\s]+/, ''));
    })
    .filter(t => t && t.length <= 40);
}

/** Returns Map(skillId → { skillId, name, count, viaList }) */
function extractSkills(text, index) {
  const found = new Map();
  if (!text || !index) return found;
  const body = String(text);
  const touch = (id, viaList, n = 1) => {
    const cur = found.get(id);
    const meta = index.byId.get(id);
    if (cur) { cur.count += n; cur.viaList = cur.viaList && viaList; }
    else found.set(id, { skillId: id, name: meta.name, count: n, viaList });
  };

  for (const e of index.entries) {
    e.regex.lastIndex = 0;
    const m = body.match(e.regex);
    if (m) touch(e.id, false, m.length);
  }
  for (const item of splitListItems(body)) {
    const ids = index.listOnly.get(item);
    if (ids) ids.forEach(id => { if (!found.has(id)) touch(id, true); });
  }
  return found;
}

/** Map one term (tag, skills-list entry) to catalog skills. Returns [{skillId,name}]. */
function normalizeTerm(term, index) {
  if (!term || !index) return [];
  const t = clean(term);
  let ids = index.termMap.get(t) || index.compactMap.get(compact(t));
  if (!ids) return [];
  return [...ids].map(id => ({ skillId: id, name: index.byId.get(id).name }));
}

// ── DB-backed cached index ───────────────────────────────────────────────────
let cached = null, cachedAt = 0;
const TTL_MS = 5 * 60 * 1000;

async function getIndex() {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  const Skill = require('../models/Skill');
  const skills = await Skill.find({}).select('name category aliases ambiguous').lean();
  cached = buildIndex(skills);
  cachedAt = Date.now();
  return cached;
}
function resetIndexCache() { cached = null; cachedAt = 0; }

module.exports = { buildIndex, extractSkills, normalizeTerm, splitListItems, getIndex, resetIndexCache, compact, clean };
