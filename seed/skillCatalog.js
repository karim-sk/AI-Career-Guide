/**
 * Expanded skill catalog.
 *  - EXISTING skills (seed/skillsData.js) keep their exact names → their MongoDB _ids never change.
 *    Here we only ADD metadata (aliases, relations, resources) to them.
 *  - NEW skills are appended.
 * Helper S(name, category, description, aliases, opts)
 *   opts.ambiguous : short/common word — only matched when it stands alone in a list item (e.g. "Skills: Go, C, R")
 *   opts.related   : names of related skills     opts.pre : names of prerequisite skills
 *   opts.res       : [[title, url, type]] curated, stable root-level URLs only
 */
const existing = require('./skillsData');

const CATEGORY_ICON = {
  Frontend: '🎨', Backend: '⚙️', Database: '🗄️', Language: '💻', DevOps: '🚀', 'AI/ML': '🤖', Security: '🔒',
  Fundamentals: '🏗️', Blockchain: '⛓️', Cloud: '☁️', Testing: '🧪', Mobile: '📱', Data: '📊', Architecture: '🧩', Tools: '🛠️'
};

const S = (name, category, description, aliases = [], opts = {}) =>
  ({ name, category, description, aliases, ...opts });

// ── Metadata for skills that already exist (names MUST NOT change) ───────────
const existingMeta = {
  'HTML':            { aliases: ['html5', 'markup'] },
  'CSS':             { aliases: ['css3', 'styling', 'sass', 'scss', 'tailwind', 'tailwind css', 'bootstrap'] },
  'JavaScript':      { aliases: ['js', 'es6', 'ecmascript', 'vanilla js', 'es2015'], related: ['TypeScript', 'Node.js', 'React'] },
  'React':           { aliases: ['react.js', 'reactjs', 'react js', 'redux', 'next.js', 'nextjs'], pre: ['JavaScript', 'HTML', 'CSS'], res: [['React docs', 'https://react.dev/', 'documentation']] },
  'Node.js':         { aliases: ['node', 'nodejs', 'node js', 'node.js'], pre: ['JavaScript'], res: [['Node.js docs', 'https://nodejs.org/en/docs/', 'documentation']] },
  'Express.js':      { aliases: ['express', 'expressjs', 'express js'], pre: ['Node.js'], res: [['Express', 'https://expressjs.com/', 'documentation']] },
  'MongoDB':         { aliases: ['mongo', 'mongo db', 'nosql', 'mongodb atlas'], res: [['MongoDB docs', 'https://www.mongodb.com/docs/', 'documentation']] },
  'SQL':             { aliases: ['t-sql', 'pl/sql', 'sql queries', 'sql analytics', 'relational databases', 'rdbms'], res: [['SQLZoo', 'https://sqlzoo.net/', 'practice']] },
  'Python':          { aliases: ['python3', 'python 3', 'py'], res: [['Python docs', 'https://docs.python.org/3/', 'documentation']] },
  'Java':            { aliases: ['java se', 'java 8', 'java 11', 'java 17', 'core java', 'j2ee', 'jvm'], related: ['Spring Boot', 'Object-Oriented Programming'] },
  'C++':             { aliases: ['cpp', 'c plus plus'] },
  'Git':             { aliases: ['version control', 'git version control', 'gitflow', 'source control'], res: [['Git docs', 'https://git-scm.com/doc', 'documentation']] },
  'REST API':        { aliases: ['rest apis', 'restful', 'restful api', 'restful apis', 'rest api design', 'api design', 'web services', 'api development'], related: ['Authentication', 'API Testing'], res: [['MDN HTTP', 'https://developer.mozilla.org/en-US/docs/Web/HTTP', 'documentation']] },
  'Data Structures': { aliases: ['dsa', 'data structure', 'data structures and algorithms'] },
  'Algorithms':      { aliases: ['algorithm', 'algorithmic', 'competitive programming'] },
  'Machine Learning':{ aliases: ['ml', 'machine-learning', 'supervised learning', 'unsupervised learning'], pre: ['Python', 'Statistics'] },
  'Deep Learning':   { aliases: ['neural networks', 'neural network', 'cnn', 'rnn', 'transformers', 'deep neural networks'], pre: ['Machine Learning'] },
  'Data Analysis':   { aliases: ['data analytics', 'exploratory data analysis', 'eda', 'data analyst'] },
  'Cloud':           { aliases: ['cloud computing', 'cloud platforms', 'cloud infrastructure', 'gcp', 'google cloud', 'azure', 'microsoft azure', 'aws'], related: ['AWS Fundamentals'] },
  'Docker':          { aliases: ['dockerfile', 'docker compose', 'docker-compose', 'containers', 'containerization', 'containerisation', 'containerized'], res: [['Docker docs', 'https://docs.docker.com/', 'documentation']] },
  'Cybersecurity':   { aliases: ['cyber security', 'information security', 'infosec', 'network security', 'security fundamentals'] },
  'Networking':      { aliases: ['networking fundamentals', 'computer networks', 'tcp/ip', 'tcp ip', 'dns', 'routing and switching', 'ccna'] },
  'Blockchain':      { aliases: ['blockchain fundamentals', 'distributed ledger', 'dlt'] },
  'Solidity':        { aliases: ['solidity language'], res: [['Solidity docs', 'https://docs.soliditylang.org/', 'documentation']] },
  'TypeScript':      { aliases: ['ts'], pre: ['JavaScript'] }
};

// ── New skills ────────────────────────────────────────────────────────────────
const added = [
  // Languages
  S('C', 'Language', 'C programming language', ['c programming', 'c language', 'ansi c'], { ambiguous: true }),
  S('C#', 'Language', 'C# language for .NET', ['csharp', 'c sharp', '.net', 'dotnet', 'asp.net', '.net core'], { related: ['Object-Oriented Programming'] }),
  S('Go', 'Language', 'Go (Golang) language', ['golang', 'go lang', 'go programming'], { ambiguous: true }),
  S('Rust', 'Language', 'Rust systems language', ['rust lang', 'rustlang'], { ambiguous: true }),
  S('PHP', 'Language', 'PHP server-side language', ['laravel', 'php 8', 'symfony', 'wordpress']),
  S('Bash', 'Language', 'Bash / shell scripting', ['shell scripting', 'shell script', 'bash scripting', 'sh scripting'], { related: ['Linux'] }),
  S('PowerShell', 'Language', 'PowerShell scripting', ['powershell scripting', 'ps1']),
  S('Kotlin', 'Language', 'Kotlin for Android and backend', ['kotlin android']),
  S('Swift', 'Language', 'Swift for iOS/macOS', ['swiftui', 'swift ios'], { ambiguous: true }),
  S('Dart', 'Language', 'Dart language (Flutter)', ['dart lang']),
  // Frontend
  S('Responsive Design', 'Frontend', 'Layouts that adapt to screen sizes', ['responsive web design', 'mobile-first', 'media queries', 'flexbox', 'css grid'], { pre: ['CSS'] }),
  S('Accessibility', 'Frontend', 'Web accessibility (WCAG, ARIA)', ['a11y', 'wcag', 'aria', 'web accessibility'], { ambiguous: true }),
  S('Vue', 'Frontend', 'Vue.js framework', ['vue.js', 'vuejs', 'vue js', 'nuxt', 'nuxt.js', 'vuex', 'pinia'], { pre: ['JavaScript'] }),
  S('Angular', 'Frontend', 'Angular framework', ['angularjs', 'angular js', 'angular 2+', 'rxjs'], { pre: ['TypeScript'] }),
  S('Frontend Testing', 'Testing', 'Component and UI testing', ['react testing library', 'testing library', 'component testing', 'enzyme', 'vitest', 'storybook']),
  S('State Management', 'Frontend', 'Client-side state management', ['redux toolkit', 'zustand', 'mobx', 'context api', 'ngrx']),
  S('DOM Manipulation', 'Frontend', 'Working with the browser DOM', ['javascript dom', 'dom', 'dom api'], { ambiguous: true }),
  // Backend
  S('Authentication', 'Backend', 'Authentication and session/token handling', ['jwt', 'json web token', 'json web tokens', 'oauth', 'oauth2', 'oauth 2.0', 'sso', 'passport.js', 'authentication and authorization', 'authorization', 'auth']),
  S('API Validation', 'Backend', 'Validating and sanitizing API input', ['input validation', 'request validation', 'joi', 'express-validator', 'zod']),
  S('Error Handling', 'Backend', 'Robust error handling patterns', ['exception handling', 'error handling middleware'], { ambiguous: true }),
  S('Pagination', 'Backend', 'Paginating API results', ['cursor pagination', 'offset pagination'], { ambiguous: true }),
  S('API Documentation', 'Backend', 'Documenting APIs', ['swagger', 'openapi', 'open api', 'postman collections', 'api docs']),
  S('Web Security', 'Security', 'Securing web applications', ['owasp', 'owasp top 10', 'xss', 'csrf', 'sql injection', 'secure coding', 'application security', 'appsec', 'web application security'], { related: ['Cybersecurity'] }),
  S('Background Jobs', 'Backend', 'Queues and scheduled jobs', ['job queue', 'message queue', 'bull', 'bullmq', 'celery', 'rabbitmq', 'kafka', 'cron jobs', 'task queue', 'sqs']),
  S('GraphQL', 'Backend', 'GraphQL APIs', ['graph ql', 'apollo', 'apollo server']),
  S('Spring Boot', 'Backend', 'Spring Boot framework for Java', ['spring', 'spring framework', 'spring mvc', 'spring cloud', 'hibernate', 'jpa', 'microservices with spring'], { pre: ['Java'] }),
  S('Django', 'Backend', 'Django web framework', ['django rest framework', 'drf'], { pre: ['Python'] }),
  S('Flask', 'Backend', 'Flask micro-framework', ['flask api', 'fastapi', 'fast api'], { pre: ['Python'] }),
  S('Microservices', 'Architecture', 'Microservice architecture', ['microservice', 'micro-services', 'service-oriented architecture', 'soa', 'service oriented'], { related: ['System Design', 'Docker'] }),
  // Databases
  S('Mongoose', 'Database', 'Mongoose ODM for MongoDB', ['mongoose odm'], { pre: ['MongoDB'] }),
  S('PostgreSQL', 'Database', 'PostgreSQL relational database', ['postgres', 'postgre sql', 'psql', 'pg'], { pre: ['SQL'], res: [['PostgreSQL docs', 'https://www.postgresql.org/docs/', 'documentation']] }),
  S('MySQL', 'Database', 'MySQL / MariaDB', ['mariadb', 'my sql'], { pre: ['SQL'] }),
  S('SQLite', 'Database', 'SQLite embedded database', ['sqlite3'], { pre: ['SQL'] }),
  S('Redis', 'Database', 'Redis in-memory data store / cache', ['redis cache', 'caching', 'memcached', 'in-memory cache'], { res: [['Redis docs', 'https://redis.io/docs/', 'documentation']] }),
  S('Database Design', 'Database', 'Schema design, normalization, data modeling', ['data modeling', 'data modelling', 'schema design', 'database modeling', 'normalization', 'er diagram', 'erd', 'database schema'], { pre: ['SQL'] }),
  S('Query Optimization', 'Database', 'Indexing and query performance', ['indexing', 'database indexing', 'query tuning', 'performance tuning', 'explain plan', 'database optimization'], { pre: ['SQL'] }),
  S('Transactions', 'Database', 'ACID transactions and isolation', ['acid', 'database transactions', 'isolation levels'], { ambiguous: true }),
  // Software engineering & testing
  S('Object-Oriented Programming', 'Fundamentals', 'OOP principles', ['oop', 'oops', 'object oriented', 'object-oriented', 'object oriented programming', 'solid principles']),
  S('Design Patterns', 'Fundamentals', 'Common software design patterns', ['gang of four', 'gof patterns', 'creational patterns', 'mvc', 'singleton', 'factory pattern', 'observer pattern']),
  S('GitHub', 'Tools', 'GitHub collaboration', ['github pull requests', 'pull requests', 'gitlab', 'bitbucket'], { pre: ['Git'] }),
  S('Unit Testing', 'Testing', 'Unit testing and TDD', ['unit tests', 'tdd', 'test driven development', 'test-driven development', 'junit', 'pytest', 'mocha', 'xunit', 'nunit', 'mockito']),
  S('Integration Testing', 'Testing', 'Integration / contract testing', ['integration tests', 'supertest', 'contract testing', 'e2e testing', 'end-to-end testing', 'end to end testing'], { pre: ['Unit Testing'] }),
  S('Jest', 'Testing', 'Jest test framework', ['jestjs', 'jest testing'], { pre: ['JavaScript'], res: [['Jest docs', 'https://jestjs.io/docs/getting-started', 'documentation']] }),
  S('API Testing', 'Testing', 'Testing REST APIs', ['postman', 'rest assured', 'restassured', 'api test automation', 'soapui', 'insomnia'], { pre: ['REST API'], res: [['Postman learning', 'https://learning.postman.com/', 'tutorial']] }),
  S('Test Automation', 'Testing', 'Automated UI/API test suites', ['selenium', 'cypress', 'playwright', 'webdriver', 'appium', 'testng', 'robot framework', 'test automation framework', 'automation testing', 'automated testing', 'qa automation']),
  S('Manual Testing', 'Testing', 'Test planning, cases and exploratory testing', ['test cases', 'test plans', 'exploratory testing', 'regression testing', 'qa testing', 'bug reporting', 'test case design', 'stlc', 'software testing', 'quality assurance']),
  S('Debugging', 'Fundamentals', 'Systematic debugging', ['root cause analysis', 'rca', 'debugging skills'], { ambiguous: true }),
  S('Clean Code', 'Fundamentals', 'Readable, maintainable code', ['code quality', 'refactoring', 'clean architecture', 'maintainable code'], { ambiguous: true }),
  S('System Design', 'Architecture', 'Designing scalable systems', ['software architecture', 'distributed systems', 'scalability', 'high availability', 'low level design', 'high level design', 'hld', 'lld', 'system architecture', 'scalable systems', 'load balancing', 'solution architecture'], { related: ['Redis', 'Database Design', 'Microservices'] }),
  S('Agile', 'Tools', 'Agile / Scrum practices', ['scrum', 'kanban', 'agile methodologies', 'agile development', 'sprint planning']),
  // Cloud & DevOps
  S('Linux', 'DevOps', 'Linux administration and CLI', ['unix', 'linux administration', 'ubuntu', 'centos', 'rhel', 'red hat', 'linux command line', 'linux/unix'], { related: ['Bash'] }),
  S('Kubernetes', 'DevOps', 'Kubernetes orchestration', ['k8s', 'kubectl', 'helm', 'eks', 'aks', 'gke', 'container orchestration', 'openshift'], { pre: ['Docker', 'Linux'], res: [['Kubernetes docs', 'https://kubernetes.io/docs/', 'documentation']] }),
  S('CI/CD', 'DevOps', 'Continuous integration and delivery', ['ci cd', 'cicd', 'ci/cd pipelines', 'continuous integration', 'continuous delivery', 'continuous deployment', 'jenkins', 'gitlab ci', 'circleci', 'travis ci', 'azure devops', 'build pipelines', 'devops pipelines'], { pre: ['Git'] }),
  S('GitHub Actions', 'DevOps', 'GitHub Actions workflows', ['github workflows', 'gh actions'], { pre: ['CI/CD'] }),
  S('AWS Fundamentals', 'Cloud', 'Core AWS services', ['aws', 'amazon web services', 'aws cloud', 'aws services', 'aws certified', 'cloudformation', 'aws cloud practitioner'], { pre: ['Cloud'], res: [['AWS getting started', 'https://aws.amazon.com/getting-started/', 'tutorial']] }),
  S('AWS Lambda', 'Cloud', 'Serverless on AWS Lambda', ['lambda functions', 'serverless', 'serverless framework', 'aws serverless', 'azure functions', 'cloud functions'], { pre: ['AWS Fundamentals'] }),
  S('Amazon S3', 'Cloud', 'Object storage on S3', ['s3', 'aws s3', 's3 buckets', 'object storage', 'blob storage'], { ambiguous: true }),
  S('Amazon EC2', 'Cloud', 'Virtual machines on EC2', ['ec2', 'aws ec2', 'virtual machines', 'compute instances']),
  S('Amazon RDS', 'Cloud', 'Managed databases on RDS', ['rds', 'aws rds', 'aurora', 'dynamodb', 'managed databases']),
  S('AWS IAM', 'Cloud', 'AWS identity and access management', ['iam', 'iam roles', 'iam policies', 'aws identity']),
  S('Monitoring', 'DevOps', 'Monitoring and observability', ['observability', 'prometheus', 'grafana', 'datadog', 'new relic', 'cloudwatch', 'application monitoring', 'splunk', 'nagios', 'alerting', 'apm', 'sentry'], { ambiguous: true }),
  S('Logging', 'DevOps', 'Centralized logging', ['elk', 'elk stack', 'elasticsearch', 'logstash', 'kibana', 'log management', 'loki', 'fluentd', 'opensearch'], { ambiguous: true }),
  S('Infrastructure as Code', 'DevOps', 'Provisioning infrastructure with code', ['iac', 'terraform', 'ansible', 'pulumi', 'cloudformation templates', 'configuration management', 'bicep', 'arm templates'], { res: [['Terraform docs', 'https://developer.hashicorp.com/terraform/docs', 'documentation']] }),
  S('Deployment', 'DevOps', 'Deploying and releasing applications', ['deployments', 'release management', 'blue green deployment', 'canary deployment', 'heroku', 'vercel', 'netlify', 'nginx'], { ambiguous: true }),
  S('Environment Configuration', 'DevOps', 'Config, secrets and environments', ['environment variables', 'secrets management', 'dotenv', 'config management'], { ambiguous: true }),
  S('Site Reliability', 'DevOps', 'SRE practices: SLOs, incidents, reliability', ['sre', 'site reliability engineering', 'slo', 'sla', 'error budgets', 'on-call', 'incident management', 'postmortems', 'reliability engineering']),
  // Data & AI
  S('Pandas', 'Data', 'Data manipulation with pandas', ['pandas dataframe', 'dataframes', 'pandas library'], { pre: ['Python'], res: [['pandas docs', 'https://pandas.pydata.org/docs/', 'documentation']] }),
  S('NumPy', 'Data', 'Numerical computing with NumPy', ['numpy arrays', 'numerical python'], { pre: ['Python'], res: [['NumPy docs', 'https://numpy.org/doc/', 'documentation']] }),
  S('Data Visualization', 'Data', 'Charts, dashboards and storytelling', ['data visualisation', 'matplotlib', 'seaborn', 'plotly', 'power bi', 'powerbi', 'tableau', 'looker', 'looker studio', 'data viz', 'd3', 'd3.js', 'qlik'], { related: ['Data Analysis'] }),
  S('Statistics', 'Data', 'Descriptive and inferential statistics', ['statistical analysis', 'hypothesis testing', 'statistical modeling', 'a/b testing', 'regression analysis', 'probability', 'probability and statistics', 'statistical methods'], { ambiguous: true }),
  S('Scikit-learn', 'AI/ML', 'ML with scikit-learn', ['sklearn', 'scikit learn', 'scikitlearn', 'regression', 'classification', 'model evaluation', 'feature engineering', 'xgboost', 'random forest'], { pre: ['Python', 'Machine Learning'] }),
  S('PyTorch', 'AI/ML', 'Deep learning with PyTorch', ['torch'], { pre: ['Deep Learning'] }),
  S('TensorFlow', 'AI/ML', 'Deep learning with TensorFlow', ['keras', 'tf'], { pre: ['Deep Learning'] }),
  S('Natural Language Processing', 'AI/ML', 'NLP', ['nlp', 'text mining', 'spacy', 'nltk', 'hugging face', 'huggingface', 'text classification', 'named entity recognition'], { pre: ['Machine Learning'] }),
  S('Generative AI', 'AI/ML', 'Generative AI, LLM applications', ['genai', 'gen ai', 'generative ai', 'llm', 'llms', 'large language models', 'large language model', 'rag', 'retrieval augmented generation', 'langchain', 'llamaindex', 'vector databases', 'vector database', 'embeddings', 'openai api', 'gpt', 'llm apis', 'llm api', 'prompt engineering', 'fine-tuning llms', 'chatgpt'], { pre: ['Python', 'Machine Learning'] }),
  S('Model Deployment', 'AI/ML', 'Deploying and serving ML models', ['mlops', 'ml ops', 'model serving', 'mlflow', 'kubeflow', 'sagemaker', 'model monitoring', 'ml pipelines', 'ml deployment', 'bentoml'], { pre: ['Machine Learning', 'Docker'] }),
  S('Data Pipelines', 'Data', 'ETL and data pipelines', ['etl', 'elt', 'data pipeline', 'airflow', 'apache airflow', 'dbt', 'data engineering', 'data warehouse', 'data warehousing', 'snowflake', 'redshift', 'bigquery', 'apache spark', 'pyspark', 'hadoop', 'databricks', 'kafka streams', 'data lake'], { pre: ['SQL', 'Python'] }),
  S('Excel', 'Tools', 'Spreadsheet analysis (Excel / Sheets)', ['microsoft excel', 'ms excel', 'advanced excel', 'google sheets', 'pivot tables', 'vlookup', 'spreadsheets'], { ambiguous: true }),
  S('Business Intelligence', 'Data', 'BI reporting and modelling', ['bi', 'bi developer', 'business intelligence', 'ssrs', 'ssis', 'ssas', 'dax', 'olap', 'bi tools'], { ambiguous: true }),
  // Security
  S('Cryptography Fundamentals', 'Security', 'Hashing, encryption, PKI', ['cryptography', 'encryption', 'pki', 'tls', 'ssl', 'public key cryptography', 'hashing', 'digital signatures']),
  S('Vulnerability Assessment', 'Security', 'Finding and triaging vulnerabilities', ['vulnerability management', 'vulnerability scanning', 'nessus', 'nmap', 'qualys', 'penetration testing', 'pentesting', 'pen testing', 'ethical hacking', 'burp suite', 'metasploit', 'owasp zap', 'red team', 'vapt']),
  S('Security Monitoring', 'Security', 'SIEM and detection', ['siem', 'soc', 'soc analyst', 'splunk es', 'threat detection', 'threat hunting', 'log analysis', 'edr', 'intrusion detection', 'ids/ips', 'qradar', 'sentinel', 'security operations']),
  S('Incident Response', 'Security', 'Handling security incidents', ['ir', 'incident handling', 'digital forensics', 'dfir', 'forensics', 'malware analysis', 'threat intelligence'], { ambiguous: true }),
  S('Identity and Access Management', 'Security', 'IAM concepts and tooling', ['iam security', 'access management', 'active directory', 'okta', 'rbac', 'least privilege', 'mfa', 'multi-factor authentication', 'azure ad', 'entra id', 'privileged access management', 'pam']),
  // Mobile
  S('Flutter', 'Mobile', 'Cross-platform mobile with Flutter', ['flutter framework', 'flutter app', 'flutter development'], { pre: ['Dart'] }),
  S('React Native', 'Mobile', 'Cross-platform mobile with React Native', ['react-native', 'expo'], { pre: ['React'] }),
  S('Android Development', 'Mobile', 'Native Android development', ['android', 'android sdk', 'android studio', 'jetpack compose', 'android app development'], { pre: ['Kotlin'] }),
  S('iOS Development', 'Mobile', 'Native iOS development', ['ios', 'xcode', 'uikit', 'ios app development', 'cocoa touch', 'objective-c'], { pre: ['Swift'], ambiguous: true }),
  S('Mobile UI', 'Mobile', 'Mobile UI design and layout', ['mobile ui design', 'material design', 'human interface guidelines', 'mobile ui/ux']),
  S('Mobile API Integration', 'Mobile', 'Consuming APIs from mobile apps', ['retrofit', 'alamofire', 'dio', 'mobile networking', 'firebase', 'push notifications'], { pre: ['REST API'] }),
  S('Mobile Testing', 'Testing', 'Testing mobile apps', ['mobile test automation', 'espresso', 'xcuitest', 'device testing', 'mobile app testing']),
  // Blockchain
  S('Smart Contracts', 'Blockchain', 'Smart contract development', ['smart contract', 'smart contract development', 'ethereum', 'evm', 'hardhat', 'foundry', 'truffle', 'openzeppelin', 'erc-20', 'erc20', 'erc-721', 'nft'], { pre: ['Solidity'] }),
  S('Web3 Concepts', 'Blockchain', 'Web3 fundamentals and tooling', ['web3', 'web3.js', 'ethers.js', 'ethers', 'defi', 'dao', 'layer 2', 'ipfs'], { pre: ['Blockchain'] }),
  S('Wallet Integration', 'Blockchain', 'Wallet connection and signing', ['metamask', 'walletconnect', 'wallet connect', 'web3 wallets', 'wagmi']),
  S('Smart Contract Testing', 'Blockchain', 'Testing & auditing contracts', ['smart contract auditing', 'smart contract audit', 'smart contract security', 'slither', 'fuzzing'], { pre: ['Smart Contracts'] }),
  S('Decentralized Applications', 'Blockchain', 'Building dApps', ['dapp', 'dapps', 'decentralized apps', 'decentralised applications', 'decentralized application'], { pre: ['Smart Contracts', 'JavaScript'] }),
  S('Blockchain Security', 'Blockchain', 'Common smart contract vulnerabilities', ['reentrancy', 'smart contract vulnerabilities'], { pre: ['Smart Contracts'] }),
  // IT support & systems (for support/systems/network careers)
  S('Technical Support', 'Tools', 'Troubleshooting users and systems', ['it support', 'help desk', 'helpdesk', 'desktop support', 'technical support', 'customer support engineering', 'service desk', 'itil', 'ticketing systems', 'servicenow', 'zendesk', 'l1 support', 'l2 support', 'application support']),
  S('Windows Server', 'DevOps', 'Windows Server administration', ['windows administration', 'active directory administration', 'group policy', 'windows server 2019', 'microsoft 365 administration', 'windows 10', 'powershell administration']),
  S('Virtualization', 'DevOps', 'Hypervisors and virtual infrastructure', ['vmware', 'vsphere', 'hyper-v', 'kvm', 'esxi', 'virtual machine', 'virtualisation', 'proxmox', 'virtualbox']),
  S('Network Administration', 'Fundamentals', 'Switches, routers, firewalls', ['cisco', 'routers', 'switches', 'firewalls', 'vlan', 'vpn', 'bgp', 'ospf', 'network troubleshooting', 'palo alto', 'fortinet', 'wireshark', 'load balancers', 'network engineer', 'sd-wan'])
];

// Resolve names in `related` / `pre`, build final catalog entries
function build() {
  const out = [];
  for (const e of existing) {
    const m = existingMeta[e.name] || {};
    out.push({ ...e, aliases: m.aliases || [], related: m.related || [], pre: m.pre || [], res: m.res || [], ambiguous: false });
  }
  const seen = new Set(out.map(s => s.name));
  for (const a of added) {
    if (seen.has(a.name)) throw new Error(`Duplicate skill in catalog: ${a.name}`);
    seen.add(a.name);
    out.push({ related: [], pre: [], res: [], ambiguous: false, ...a, icon: a.icon || CATEGORY_ICON[a.category] || '💡' });
  }
  return out.map(s => ({
    name: s.name,
    category: s.category,
    description: s.description || '',
    icon: s.icon || CATEGORY_ICON[s.category] || '💡',
    slug: s.name.toLowerCase().replace(/\+\+/g, 'pp').replace(/#/g, 'sharp').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    aliases: [...new Set((s.aliases || []).map(x => x.toLowerCase()))],
    ambiguous: !!s.ambiguous,
    relatedNames: s.related || [],
    prerequisiteNames: s.pre || [],
    resources: (s.res || []).map(([title, url, type]) => ({ title, url, type }))
  }));
}

module.exports = build();
