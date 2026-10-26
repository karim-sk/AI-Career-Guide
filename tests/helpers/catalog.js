const { buildIndex } = require('../../backend/services/skillNormalizer');
const cat = require('../../seed/skillCatalog');
const skills = cat.map((s, i) => ({ _id: 'sk' + String(i).padStart(3, '0'), name: s.name, category: s.category, aliases: s.aliases, ambiguous: s.ambiguous }));
const index = buildIndex(skills);
const id = name => skills.find(s => s.name === name)._id;
module.exports = { skills, index, id };
