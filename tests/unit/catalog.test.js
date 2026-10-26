const catalog = require('../../seed/skillCatalog');
const { allCareers, allQuestions } = require('../../seed');
const existing = require('../../seed/skillsData');

describe('catalog integrity', () => {
  test('all pre-existing skill names are preserved (stable identifiers)', () => {
    const names = new Set(catalog.map(s => s.name));
    existing.forEach(s => expect(names.has(s.name)).toBe(true));
  });
  test('skill names and slugs are unique', () => {
    expect(new Set(catalog.map(s => s.name)).size).toBe(catalog.length);
    expect(new Set(catalog.map(s => s.slug)).size).toBe(catalog.length);
  });
  test('relations reference existing skills', () => {
    const names = new Set(catalog.map(s => s.name));
    catalog.forEach(s => [...s.relatedNames, ...s.prerequisiteNames].forEach(n => expect(names.has(n)).toBe(true)));
  });
  test('every question references a catalog skill, has 4 options and a valid answer', () => {
    const names = new Set(catalog.map(s => s.name));
    allQuestions.forEach(q => {
      expect(names.has(q.skillName)).toBe(true);
      expect(q.options).toHaveLength(4);
      expect(q.correctAnswer).toBeGreaterThanOrEqual(0); expect(q.correctAnswer).toBeLessThan(4);
      expect(new Set(q.options).size).toBe(4);
    });
  });
  test('new careers only require skills that have questions', () => {
    const withQ = new Set(allQuestions.map(q => q.skillName));
    allCareers.filter(c => !c._existing).forEach(c => c.requiredSkills.forEach(r => expect(withQ.has(r.skillName)).toBe(true)));
  });
  test('catalog covers 25+ careers', () => { expect(allCareers.length).toBeGreaterThanOrEqual(25); });
  test('answer positions are not trivially biased', () => {
    const d = [0, 0, 0, 0]; require('../../seed/questions/expansion').forEach(q => d[q.correctAnswer]++);
    d.forEach(n => expect(n / 188).toBeGreaterThan(0.1));
  });
});
