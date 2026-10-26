/**
 * Career expansion. Existing careers (seed/careersData.js) are NOT redefined — their requiredSkills are left
 * exactly as they are so existing assessments/results stay valid. We only attach `family` + `aliases`.
 * New careers reference ONLY skills that have assessment questions (verified by `npm run seed:report`).
 *
 * Consolidated roles (kept as aliases rather than duplicate careers):
 *   Machine Learning Engineer → AI/ML Engineer     API Developer → Backend Developer
 *   Software Engineer → Software Developer          Software Test Engineer → QA Engineer
 *   Smart-contract/Blockchain overlap is split: 'Blockchain Developer' (existing) vs 'Smart Contract Developer' (new)
 */
const existingCareerMeta = {
  'Full Stack Developer':  { family: 'Web',            aliases: ['full-stack developer', 'fullstack developer', 'full stack engineer', 'mern stack developer', 'web developer', 'software engineer full stack'] },
  'Frontend Developer':    { family: 'Web',            aliases: ['front-end developer', 'front end developer', 'ui developer', 'react developer', 'frontend engineer', 'javascript developer', 'web ui developer'] },
  'Backend Developer':     { family: 'Web',            aliases: ['back-end developer', 'back end developer', 'api developer', 'node.js developer', 'nodejs developer', 'backend engineer', 'server-side developer'] },
  'Data Scientist':        { family: 'Data & AI',      aliases: ['data science', 'senior data scientist', 'junior data scientist', 'applied scientist'] },
  'Data Analyst':          { family: 'Data & AI',      aliases: ['data analytics', 'junior data analyst', 'business analyst', 'reporting analyst', 'analytics engineer'] },
  'AI/ML Engineer':        { family: 'Data & AI',      aliases: ['machine learning engineer', 'ml engineer', 'ai engineer', 'artificial intelligence engineer', 'deep learning engineer', 'nlp engineer', 'computer vision engineer'] },
  'Cybersecurity Analyst': { family: 'Security',       aliases: ['security analyst', 'soc analyst', 'information security analyst', 'cyber security analyst', 'infosec analyst'] },
  'Cloud Engineer':        { family: 'Cloud & DevOps', aliases: ['cloud developer', 'aws engineer', 'cloud infrastructure engineer', 'cloud architect', 'azure engineer'] },
  'Software Developer':    { family: 'Software',       aliases: ['software engineer', 'software development engineer', 'sde', 'application developer', 'programmer', 'associate software engineer', 'software developer engineer'] },
  'Blockchain Developer':  { family: 'Blockchain',     aliases: ['web3 developer', 'blockchain engineer', 'dapp developer', 'solidity developer'] }
};

const C = (title, icon, family, description, avgSalary, jobDemand, aliases, skills) => ({
  title, icon, family, description, avgSalary, jobDemand, aliases,
  requiredSkills: skills.map(([skillName, requiredLevel, priority, category]) => ({ skillName, requiredLevel, priority, category: category || '' }))
});

const newCareers = [
  C('Java Developer', '☕', 'Software', 'Build robust backend and enterprise applications with Java and Spring.', '$85,000 - $135,000', 'very-high',
    ['java engineer', 'java backend developer', 'java software engineer', 'spring developer', 'j2ee developer', 'java full stack developer'],
    [['Java', 80, 'critical', 'Language'], ['Spring Boot', 70, 'high', 'Backend'], ['Object-Oriented Programming', 75, 'high', 'Fundamentals'], ['SQL', 65, 'high', 'Database'], ['REST API', 70, 'high', 'Backend'], ['Data Structures', 65, 'medium', 'Fundamentals'], ['Unit Testing', 60, 'medium', 'Testing'], ['Git', 60, 'medium', 'DevOps']]),
  C('Python Developer', '🐍', 'Software', 'Develop applications, services and automation with Python.', '$80,000 - $130,000', 'very-high',
    ['python engineer', 'python backend developer', 'python software engineer', 'django developer', 'flask developer', 'fastapi developer'],
    [['Python', 85, 'critical', 'Language'], ['REST API', 70, 'high', 'Backend'], ['SQL', 65, 'high', 'Database'], ['Data Structures', 65, 'high', 'Fundamentals'], ['Algorithms', 60, 'medium', 'Fundamentals'], ['Unit Testing', 60, 'medium', 'Testing'], ['Git', 60, 'medium', 'DevOps'], ['Linux', 50, 'medium', 'DevOps']]),
  C('Mobile App Developer', '📱', 'Mobile', 'Create Android and cross-platform mobile applications.', '$80,000 - $130,000', 'high',
    ['mobile developer', 'android developer', 'flutter developer', 'mobile application developer', 'mobile engineer', 'ios developer', 'react native developer', 'mobile app engineer'],
    [['Android Development', 70, 'high', 'Mobile'], ['Flutter', 70, 'high', 'Mobile'], ['REST API', 70, 'high', 'Backend'], ['Object-Oriented Programming', 65, 'high', 'Fundamentals'], ['Data Structures', 60, 'medium', 'Fundamentals'], ['Git', 60, 'medium', 'DevOps'], ['Algorithms', 55, 'medium', 'Fundamentals']]),
  C('QA Engineer', '🧪', 'Quality', 'Ensure software quality through test design, automation and defect analysis.', '$55,000 - $100,000', 'high',
    ['quality assurance engineer', 'software test engineer', 'software tester', 'test engineer', 'qa analyst', 'qa tester', 'quality engineer', 'manual tester', 'qa'],
    [['Test Automation', 65, 'high', 'Testing'], ['Unit Testing', 60, 'high', 'Testing'], ['REST API', 60, 'high', 'Backend'], ['SQL', 60, 'high', 'Database'], ['Agile', 60, 'medium', 'Tools'], ['Git', 55, 'medium', 'DevOps'], ['JavaScript', 50, 'medium', 'Language']]),
  C('Automation Test Engineer', '🤖', 'Quality', 'Build and maintain automated test frameworks and CI test suites.', '$65,000 - $110,000', 'high',
    ['sdet', 'software development engineer in test', 'test automation engineer', 'automation engineer', 'qa automation engineer', 'selenium tester', 'automation tester'],
    [['Test Automation', 80, 'critical', 'Testing'], ['JavaScript', 65, 'high', 'Language'], ['Python', 60, 'high', 'Language'], ['CI/CD', 65, 'high', 'DevOps'], ['REST API', 65, 'high', 'Backend'], ['Unit Testing', 65, 'high', 'Testing'], ['Git', 60, 'medium', 'DevOps'], ['Design Patterns', 50, 'medium', 'Fundamentals']]),
  C('DevOps Engineer', '🚀', 'Cloud & DevOps', 'Automate build, delivery and infrastructure to ship software reliably.', '$90,000 - $145,000', 'very-high',
    ['devops', 'devops specialist', 'release engineer', 'build and release engineer', 'platform engineer', 'devops consultant', 'devsecops engineer', 'cloud devops engineer'],
    [['Linux', 75, 'critical', 'DevOps'], ['Docker', 80, 'critical', 'DevOps'], ['Kubernetes', 65, 'high', 'DevOps'], ['CI/CD', 80, 'critical', 'DevOps'], ['Git', 70, 'high', 'DevOps'], ['Bash', 65, 'high', 'Language'], ['Infrastructure as Code', 65, 'high', 'DevOps'], ['AWS Fundamentals', 60, 'medium', 'Cloud'], ['Monitoring', 55, 'medium', 'DevOps']]),
  C('Cloud Support Engineer', '🛟', 'Cloud & DevOps', 'Troubleshoot customer cloud workloads and guide them to resolution.', '$60,000 - $105,000', 'high',
    ['cloud support associate', 'cloud support', 'aws support engineer', 'cloud operations engineer', 'cloud technical support', 'cloud support specialist'],
    [['AWS Fundamentals', 65, 'critical', 'Cloud'], ['Linux', 65, 'high', 'DevOps'], ['Networking', 65, 'high', 'Security'], ['Technical Support', 65, 'high', 'Tools'], ['SQL', 50, 'medium', 'Database'], ['Bash', 50, 'medium', 'Language'], ['Docker', 45, 'medium', 'DevOps']]),
  C('Site Reliability Engineer', '📟', 'Cloud & DevOps', 'Keep large-scale services reliable through automation, monitoring and incident management.', '$100,000 - $160,000', 'high',
    ['sre', 'reliability engineer', 'production engineer', 'site reliability', 'infrastructure engineer'],
    [['Linux', 80, 'critical', 'DevOps'], ['Site Reliability', 70, 'critical', 'DevOps'], ['Monitoring', 75, 'high', 'DevOps'], ['Kubernetes', 70, 'high', 'DevOps'], ['Docker', 70, 'high', 'DevOps'], ['Python', 65, 'high', 'Language'], ['Networking', 65, 'high', 'Security'], ['Infrastructure as Code', 65, 'medium', 'DevOps'], ['System Design', 60, 'medium', 'Architecture']]),
  C('Security Engineer', '🛡️', 'Security', 'Design and implement security controls, secure systems and application defences.', '$95,000 - $150,000', 'high',
    ['application security engineer', 'appsec engineer', 'cloud security engineer', 'devsecops', 'information security engineer', 'security software engineer'],
    [['Web Security', 75, 'critical', 'Security'], ['Cryptography Fundamentals', 65, 'high', 'Security'], ['Networking', 70, 'high', 'Security'], ['Linux', 65, 'high', 'DevOps'], ['Vulnerability Assessment', 65, 'high', 'Security'], ['Python', 60, 'medium', 'Language'], ['Authentication', 65, 'high', 'Backend'], ['Incident Response', 55, 'medium', 'Security']]),
  C('Data Engineer', '🔧', 'Data & AI', 'Build and operate the pipelines and warehouses that power analytics and ML.', '$95,000 - $150,000', 'very-high',
    ['data engineering', 'big data engineer', 'etl developer', 'analytics engineer', 'data platform engineer', 'data warehouse engineer', 'pipeline engineer'],
    [['SQL', 85, 'critical', 'Database'], ['Python', 80, 'critical', 'Language'], ['Data Pipelines', 75, 'critical', 'Data'], ['Database Design', 65, 'high', 'Database'], ['Pandas', 60, 'medium', 'Data'], ['Linux', 55, 'medium', 'DevOps'], ['Git', 55, 'medium', 'DevOps'], ['AWS Fundamentals', 55, 'medium', 'Cloud']]),
  C('AI Engineer', '🧠', 'Data & AI', 'Build applications powered by LLMs, retrieval and machine-learning models.', '$100,000 - $170,000', 'very-high',
    ['generative ai engineer', 'llm engineer', 'genai engineer', 'applied ai engineer', 'ai developer', 'ai application developer', 'prompt engineer', 'ai software engineer'],
    [['Python', 80, 'critical', 'Language'], ['Generative AI', 75, 'critical', 'AI/ML'], ['Machine Learning', 65, 'high', 'AI/ML'], ['REST API', 65, 'high', 'Backend'], ['Model Deployment', 55, 'medium', 'AI/ML'], ['Docker', 50, 'medium', 'DevOps'], ['Git', 55, 'medium', 'DevOps']]),
  C('Database Administrator', '🗃️', 'Data & AI', 'Operate, secure, tune and back up production databases.', '$75,000 - $125,000', 'medium',
    ['dba', 'database engineer', 'sql dba', 'sql server dba', 'oracle dba', 'postgresql dba', 'mysql dba', 'database developer', 'database specialist'],
    [['SQL', 85, 'critical', 'Database'], ['Database Design', 75, 'critical', 'Database'], ['PostgreSQL', 70, 'high', 'Database'], ['Linux', 60, 'high', 'DevOps'], ['Bash', 50, 'medium', 'Language'], ['Cybersecurity', 50, 'medium', 'Security'], ['Cloud', 45, 'medium', 'Cloud']]),
  C('Smart Contract Developer', '📜', 'Blockchain', 'Write, test and audit smart contracts for decentralized applications.', '$100,000 - $170,000', 'high',
    ['solidity engineer', 'smart contract engineer', 'smart contract auditor', 'ethereum developer', 'evm developer', 'blockchain smart contract developer'],
    [['Solidity', 80, 'critical', 'Blockchain'], ['Smart Contracts', 75, 'critical', 'Blockchain'], ['Blockchain', 70, 'high', 'Blockchain'], ['Cryptography Fundamentals', 60, 'high', 'Security'], ['JavaScript', 60, 'medium', 'Language'], ['TypeScript', 55, 'medium', 'Language'], ['Git', 55, 'medium', 'DevOps'], ['Data Structures', 55, 'medium', 'Fundamentals']]),
  C('Network Engineer', '🌐', 'Infrastructure', 'Design, configure and troubleshoot enterprise networks.', '$65,000 - $115,000', 'medium',
    ['network administrator', 'network support engineer', 'network operations engineer', 'ccna engineer', 'network analyst', 'network technician', 'noc engineer'],
    [['Networking', 85, 'critical', 'Security'], ['Network Administration', 80, 'critical', 'Fundamentals'], ['Linux', 60, 'high', 'DevOps'], ['Cybersecurity', 55, 'medium', 'Security'], ['Bash', 45, 'medium', 'Language'], ['Python', 45, 'medium', 'Language']]),
  C('Systems Engineer', '🖧', 'Infrastructure', 'Plan, deploy and maintain servers, operating systems and internal platforms.', '$70,000 - $120,000', 'medium',
    ['systems administrator', 'system administrator', 'sysadmin', 'linux administrator', 'it systems engineer', 'infrastructure administrator', 'systems analyst', 'it engineer'],
    [['Linux', 80, 'critical', 'DevOps'], ['Networking', 65, 'high', 'Security'], ['Bash', 65, 'high', 'Language'], ['Network Administration', 55, 'medium', 'Fundamentals'], ['Cybersecurity', 50, 'medium', 'Security'], ['Monitoring', 55, 'medium', 'DevOps'], ['Docker', 45, 'medium', 'DevOps']]),
  C('Technical Support Engineer', '🎧', 'Infrastructure', 'Resolve complex customer and internal technical issues across systems and software.', '$50,000 - $90,000', 'high',
    ['technical support specialist', 'application support engineer', 'it support engineer', 'support engineer', 'it support specialist', 'desktop support engineer', 'help desk engineer', 'customer support engineer', 'product support engineer'],
    [['Technical Support', 75, 'critical', 'Tools'], ['Networking', 60, 'high', 'Security'], ['Linux', 55, 'high', 'DevOps'], ['SQL', 55, 'high', 'Database'], ['Network Administration', 45, 'medium', 'Fundamentals'], ['Bash', 40, 'medium', 'Language']]),
  C('Business Intelligence Developer', '📉', 'Data & AI', 'Model data and build dashboards and reports that drive business decisions.', '$70,000 - $120,000', 'high',
    ['bi developer', 'bi analyst', 'power bi developer', 'tableau developer', 'bi engineer', 'reporting developer', 'business intelligence analyst', 'dashboard developer'],
    [['SQL', 85, 'critical', 'Database'], ['Data Visualization', 80, 'critical', 'Data'], ['Data Analysis', 75, 'high', 'AI/ML'], ['Database Design', 60, 'medium', 'Database'], ['Statistics', 55, 'medium', 'Data'], ['Python', 50, 'medium', 'Language']]),
  C('MLOps Engineer', '♻️', 'Data & AI', 'Operationalise ML: training pipelines, deployment, monitoring and governance.', '$100,000 - $165,000', 'high',
    ['ml ops engineer', 'machine learning platform engineer', 'ml infrastructure engineer', 'ml platform engineer', 'machine learning operations'],
    [['Python', 80, 'critical', 'Language'], ['Machine Learning', 65, 'high', 'AI/ML'], ['Model Deployment', 75, 'critical', 'AI/ML'], ['Docker', 75, 'high', 'DevOps'], ['Kubernetes', 60, 'high', 'DevOps'], ['CI/CD', 65, 'high', 'DevOps'], ['Data Pipelines', 60, 'medium', 'Data'], ['Git', 60, 'medium', 'DevOps']])
];

module.exports = { existingCareerMeta, newCareers };
