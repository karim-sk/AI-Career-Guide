const { extractSkills, normalizeTerm } = require('../../backend/services/skillNormalizer');
const { index } = require('../helpers/catalog');
const names = text => [...extractSkills(text, index).values()].map(s => s.name).sort();

describe('skill normalizer', () => {
  test.each(['Node', 'Node.js', 'NodeJS', 'node js', 'nodejs'])('"%s" → Node.js', t => {
    expect(normalizeTerm(t, index).map(x => x.name)).toContain('Node.js');
  });
  test('REST API synonyms collapse to one skill', () => {
    expect(names('Designed RESTful APIs and REST API design')).toEqual(['REST API']);
  });
  test('multiple skills from prose', () => {
    expect(names('Built services with Express and MongoDB, deployed with Docker and GitHub Actions')).toEqual(
      expect.arrayContaining(['Express.js', 'MongoDB', 'Docker', 'GitHub Actions']));
  });
  test('ambiguous words are NOT matched inside prose', () => {
    const r = names('We go to market fast. Excel at teamwork. Strong monitoring of goals, a C-level sponsor.');
    expect(r).not.toContain('Go'); expect(r).not.toContain('Excel'); expect(r).not.toContain('C');
  });
  test('ambiguous names ARE matched as standalone list items', () => {
    expect(names('Skills: Python, Go, C, SQL')).toEqual(expect.arrayContaining(['Python', 'Go', 'C', 'SQL']));
  });
  test('java is not matched inside javascript', () => {
    const r = names('JavaScript developer'); expect(r).toContain('JavaScript'); expect(r).not.toContain('Java');
  });
  test('C++ and C# are recognised', () => { expect(names('Experience in C++ and C#')).toEqual(expect.arrayContaining(['C++', 'C#'])); });
  test('unknown term yields nothing', () => { expect(normalizeTerm('Figma', index)).toEqual([]); });
});
