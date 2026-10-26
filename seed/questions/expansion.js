/**
 * Assessment questions for the expanded catalog.
 * Each skill gets 2 easy + 1 medium + 1 hard question (bank can be extended freely — the seed is idempotent).
 * q(skill, difficulty, question, [4 options], correctIndex, explanation)
 */
// Options are written with the correct answer in any position; we apply a DETERMINISTIC shuffle
// (seeded by the question text) so the answer position is not predictable, yet stays identical on every
// seed run (keeps the upsert idempotent).
function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffleOptions(question, options, correctAnswer) {
  const rand = rng(hashStr(question));
  const idx = options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return { options: idx.map(i => options[i]), correctAnswer: idx.indexOf(correctAnswer) };
}
const q = (skillName, difficulty, question, options, correctAnswer, explanation) => {
  const sh = shuffleOptions(question, options, correctAnswer);
  return { skillName, difficulty, question, options: sh.options, correctAnswer: sh.correctAnswer, explanation, points: 1 };
};

module.exports = [
  // ── Docker ──────────────────────────────────────────────────────────────
  q('Docker','easy','What is a Docker image?',['A running container instance','A read-only template used to create containers','A virtual machine disk','A network driver'],1,'An image is an immutable template; containers are running instances created from it.'),
  q('Docker','easy','Which file defines the steps used to build a Docker image?',['docker-compose.yml','package.json','Dockerfile','.dockerignore'],2,'A Dockerfile lists instructions (FROM, COPY, RUN, CMD…) used by docker build.'),
  q('Docker','medium','Which command publishes container port 3000 on host port 8080?',['docker run -p 8080:3000 app','docker run -p 3000:8080 app','docker run --expose 8080 app','docker run -h 8080:3000 app'],0,'-p HOST:CONTAINER maps host port 8080 to container port 3000.'),
  q('Docker','hard','Why copy package.json and run npm install BEFORE copying the rest of the source in a Node Dockerfile?',['It makes npm run faster at runtime','To leverage layer caching so dependencies are not reinstalled when only source code changes','Docker requires package.json first','It reduces the final image to zero size'],1,'Layers are cached in order; keeping the dependency layer above the frequently-changing source layer avoids repeated installs.'),

  // ── Networking ──────────────────────────────────────────────────────────
  q('Networking','easy','Which protocol translates domain names into IP addresses?',['DHCP','DNS','ARP','FTP'],1,'DNS resolves hostnames to IP addresses.'),
  q('Networking','easy','Which layer of the OSI model does IP operate at?',['Data Link','Transport','Network','Application'],2,'IP is a Layer 3 (Network layer) protocol.'),
  q('Networking','medium','What is the main difference between TCP and UDP?',['TCP is connectionless and faster','TCP is reliable and connection-oriented; UDP is connectionless with no delivery guarantee','UDP guarantees ordering','They differ only in port numbers'],1,'TCP provides reliable ordered delivery; UDP trades reliability for low latency.'),
  q('Networking','hard','A host with IP 192.168.10.77/26 belongs to which network address?',['192.168.10.0','192.168.10.64','192.168.10.76','192.168.10.128'],1,'/26 gives blocks of 64 addresses: 0,64,128,192. 77 lies in the 64–127 block.'),

  // ── Java ────────────────────────────────────────────────────────────────
  q('Java','easy','Which keyword is used to inherit from a class in Java?',['implements','inherits','extends','super'],2,'A class uses extends to inherit from another class.'),
  q('Java','easy','What does JVM stand for?',['Java Variable Method','Java Virtual Machine','Java Visual Manager','Joint Voice Module'],1,'The JVM executes compiled Java bytecode.'),
  q('Java','medium','What is the difference between == and .equals() for Strings in Java?',['No difference','== compares references; equals() compares content','== compares content; equals() compares references','equals() only works on numbers'],1,'== checks object identity, equals() checks logical equality.'),
  q('Java','hard','Which collection offers O(1) average lookup by key and does NOT maintain insertion order?',['LinkedHashMap','TreeMap','HashMap','ArrayList'],2,'HashMap provides average O(1) get/put with no ordering guarantee.'),

  // ── C++ ─────────────────────────────────────────────────────────────────
  q('C++','easy','Which operator is used to access a member through a pointer in C++?',['.','->','::','&'],1,'-> dereferences a pointer and accesses a member.'),
  q('C++','easy','What does delete do in C++?',['Removes a file','Frees memory allocated with new','Deletes a variable name','Clears the console'],1,'delete releases heap memory obtained with new.'),
  q('C++','medium','What is RAII?',['A sorting algorithm','Binding resource lifetime to object lifetime','A template library','A compiler flag'],1,'Resource Acquisition Is Initialization ties resource cleanup to destructors.'),
  q('C++','hard','Which smart pointer expresses sole ownership?',['shared_ptr','weak_ptr','unique_ptr','auto_ptr'],2,'unique_ptr owns its object exclusively and is move-only.'),

  // ── Deep Learning ───────────────────────────────────────────────────────
  q('Deep Learning','easy','What is an activation function used for in a neural network?',['To load data','To introduce non-linearity','To store weights','To split data'],1,'Non-linear activations let networks model complex functions.'),
  q('Deep Learning','easy','Which algorithm is used to update weights by propagating error gradients?',['Backpropagation','K-means','Apriori','Binary search'],0,'Backpropagation computes gradients of the loss w.r.t. weights.'),
  q('Deep Learning','medium','Which architecture is most associated with image tasks?',['Convolutional Neural Network','Linear regression','Decision stump','Naive Bayes'],0,'CNNs exploit spatial structure through convolutions.'),
  q('Deep Learning','hard','What does dropout primarily help with?',['Speeding up inference','Reducing overfitting','Increasing learning rate','Normalizing inputs'],1,'Dropout randomly disables units during training, acting as regularization.'),

  // ── Linux ───────────────────────────────────────────────────────────────
  q('Linux','easy','Which command lists files in a directory?',['dir /w','ls','show','list'],1,'ls lists directory contents.'),
  q('Linux','easy','Which command changes file permissions?',['chown','chmod','chgrp','umask -r'],1,'chmod modifies permission bits.'),
  q('Linux','medium','What does chmod 640 file give?',['rw- for owner, r-- for group, --- for others','rwx for owner only','rw- for everyone','r-- for owner, rw- for group'],0,'6=rw-, 4=r--, 0=---.'),
  q('Linux','hard','Which command shows the processes listening on TCP ports (modern tool)?',['ss -ltnp','ping -t','cat /etc/hosts','df -h'],0,'ss -ltnp lists listening TCP sockets with process info.'),

  // ── Kubernetes ──────────────────────────────────────────────────────────
  q('Kubernetes','easy','What is the smallest deployable unit in Kubernetes?',['Node','Pod','Service','Namespace'],1,'A Pod wraps one or more containers.'),
  q('Kubernetes','easy','Which tool is the standard CLI for Kubernetes?',['kubectl','kubeadm-run','kdocker','helmctl'],0,'kubectl talks to the Kubernetes API server.'),
  q('Kubernetes','medium','Which resource maintains a desired number of identical Pod replicas and supports rolling updates?',['Deployment','ConfigMap','Secret','Ingress'],0,'A Deployment manages ReplicaSets for declarative updates.'),
  q('Kubernetes','hard','What is the purpose of a Service in Kubernetes?',['Build images','Provide stable networking/discovery for a set of Pods','Store secrets','Schedule nodes'],1,'Services give Pods a stable virtual IP/DNS name and load balancing.'),

  // ── CI/CD ───────────────────────────────────────────────────────────────
  q('CI/CD','easy','What does CI stand for?',['Continuous Integration','Code Inspection','Central Interface','Container Isolation'],0,'CI automatically builds and tests changes on every commit.'),
  q('CI/CD','easy','Which is a typical CI pipeline step?',['Run automated tests','Print documentation','Reboot developer laptops','Delete the repository'],0,'Pipelines build, test, and package code automatically.'),
  q('CI/CD','medium','What is the difference between continuous delivery and continuous deployment?',['None','Delivery keeps releases deployable with a manual approval; deployment releases automatically to production','Deployment needs manual QA only','Delivery only covers testing'],1,'Continuous deployment removes the manual release gate.'),
  q('CI/CD','hard','Which practice best prevents secrets leaking from a CI pipeline?',['Hard-code them in the workflow file','Store them in the platform secret store and inject at runtime','Echo them in logs for debugging','Commit .env files'],1,'Use encrypted secret storage and avoid printing secrets.'),

  // ── GitHub Actions ──────────────────────────────────────────────────────
  q('GitHub Actions','easy','Where are GitHub Actions workflows defined?',['.github/workflows/*.yml','actions.json in root','package.json scripts','Settings page only'],0,'Workflows are YAML files in .github/workflows.'),
  q('GitHub Actions','easy','Which keyword triggers a workflow on pushes?',['on: push','run: push','when: commit','trigger: git'],0,'The on: key defines triggering events.'),
  q('GitHub Actions','medium','What does uses: actions/checkout@v4 do?',['Installs Node','Checks out the repository code onto the runner','Deploys the app','Creates a branch'],1,'The checkout action clones the repo into the runner workspace.'),
  q('GitHub Actions','hard','How should a workflow access an API key?',['Hard-code it','Reference ${{ secrets.NAME }}','Put it in the README','Pass via URL'],1,'Use repository/environment secrets.'),

  // ── System Design ───────────────────────────────────────────────────────
  q('System Design','easy','What is the main purpose of a load balancer?',['Encrypt data','Distribute incoming traffic across multiple servers','Store session data','Compile code'],1,'Load balancers spread requests to improve availability and scalability.'),
  q('System Design','easy','What does caching primarily improve?',['Read latency and backend load','Password strength','Compile time','Disk size'],0,'Caches serve frequently-read data quickly.'),
  q('System Design','medium','What does horizontal scaling mean?',['Adding more machines/instances','Adding more RAM to one machine','Rewriting in a new language','Splitting code into files'],0,'Scale-out adds nodes; scale-up makes one node bigger.'),
  q('System Design','hard','According to the CAP theorem, during a network partition a distributed store must trade off between:',['Consistency and Availability','Cost and Performance','Latency and Throughput','Security and Usability'],0,'Under partition you must choose consistency or availability.'),

  // ── Unit Testing ────────────────────────────────────────────────────────
  q('Unit Testing','easy','What does a unit test verify?',['A small piece of code in isolation','The entire production environment','Network cabling','Database backups'],0,'Unit tests exercise single units (functions/classes).'),
  q('Unit Testing','easy','What is a test assertion?',['A statement that checks actual vs expected result','A deployment script','A database index','A UI colour'],0,'Assertions fail the test when expectations are not met.'),
  q('Unit Testing','medium','Why use mocks in unit tests?',['To isolate the unit from external dependencies','To make tests slower','To avoid assertions','To test the OS'],0,'Mocks replace collaborators so tests are deterministic and fast.'),
  q('Unit Testing','hard','What does TDD stand for and what is the cycle?',['Test-Driven Development: red → green → refactor','Total Data Deletion: drop → drop → drop','Type-Driven Design: type → compile → ship','Test Deployment Duty: build → ship → test'],0,'Write a failing test, make it pass, refactor.'),

  // ── Jest ────────────────────────────────────────────────────────────────
  q('Jest','easy','Which Jest function groups related tests?',['describe','group','suite.run','collect'],0,'describe creates a test block.'),
  q('Jest','easy','Which matcher checks deep equality of objects?',['toBe','toEqual','toBeTruthy','toContain'],1,'toEqual recursively compares values; toBe uses Object.is.'),
  q('Jest','medium','How do you mock a function in Jest?',['jest.fn()','jest.mock.fn','new Mock()','mock()'],0,'jest.fn() creates a mock function you can inspect.'),
  q('Jest','hard','How do you test an async function that returns a Promise?',['Return the promise or use async/await in the test','Use setTimeout only','Tests cannot be async','Use console.log'],0,'Jest waits for returned promises/async tests.'),

  // ── Test Automation ─────────────────────────────────────────────────────
  q('Test Automation','easy','Which tool automates browser interactions for testing?',['Selenium','Photoshop','Excel','Nginx'],0,'Selenium (and Playwright/Cypress) drive real browsers.'),
  q('Test Automation','easy','What is a regression test?',['A test confirming existing functionality still works after changes','A test for new colours','A load test only','A manual-only review'],0,'Regression tests detect unintended breakage.'),
  q('Test Automation','medium','What is the Page Object Model?',['A pattern encapsulating page elements and actions in classes','A database model','A CSS framework','A deployment tool'],0,'POM reduces duplication and eases maintenance.'),
  q('Test Automation','hard','What commonly causes flaky UI tests?',['Hard-coded sleeps/timing assumptions and unstable selectors','Too many assertions','Using version control','Writing comments'],0,'Use explicit waits and stable locators.'),

  // ── Object-Oriented Programming ─────────────────────────────────────────
  q('Object-Oriented Programming','easy','Which OOP principle hides internal state behind methods?',['Encapsulation','Recursion','Compilation','Normalization'],0,'Encapsulation restricts direct access to internal data.'),
  q('Object-Oriented Programming','easy','What is inheritance?',['A class deriving properties/behaviour from another','Copying files','Database joins','Looping'],0,'Subclasses reuse and extend parent classes.'),
  q('Object-Oriented Programming','medium','What is polymorphism?',['Same interface, different behaviour per type','Multiple databases','Many files','Faster loops'],0,'Overriding lets calls resolve to type-specific implementations.'),
  q('Object-Oriented Programming','hard','What does the Liskov Substitution Principle state?',['Subtypes must be usable wherever the base type is expected without breaking behaviour','Classes should have one reason to change','Depend on abstractions','Prefer composition always'],0,'The L in SOLID.'),

  // ── Design Patterns ─────────────────────────────────────────────────────
  q('Design Patterns','easy','Which pattern ensures only one instance of a class?',['Singleton','Observer','Factory','Decorator'],0,'Singleton restricts instantiation to one object.'),
  q('Design Patterns','easy','Which pattern notifies dependents when state changes?',['Observer','Singleton','Adapter','Builder'],0,'Observer (pub/sub).'),
  q('Design Patterns','medium','What does the Factory pattern do?',['Encapsulates object creation','Caches DB queries','Encrypts data','Sorts arrays'],0,'It delegates instantiation to a factory method.'),
  q('Design Patterns','hard','Which pattern lets you wrap an object to add behaviour dynamically?',['Decorator','Singleton','Iterator','Prototype'],0,'Decorator wraps objects with the same interface.'),

  // ── Authentication ──────────────────────────────────────────────────────
  q('Authentication','easy','What does JWT stand for?',['JSON Web Token','Java Web Tool','JavaScript Writing Template','Joint Web Transfer'],0,'A compact signed token format.'),
  q('Authentication','easy','Authentication answers which question?',['Who are you?','What may you do?','Where is the server?','How fast is it?'],0,'Authorization answers what you may do.'),
  q('Authentication','medium','How should passwords be stored?',['Hashed with a slow salted algorithm like bcrypt/argon2','Plain text','Base64 encoded','Reversible encryption in the URL'],0,'Use adaptive hashing with per-password salts.'),
  q('Authentication','hard','Why avoid storing JWTs with long expiry in localStorage?',['XSS can steal them, and long-lived tokens extend the damage window','localStorage is too small','JWTs cannot be stored','It breaks HTTPS'],0,'Prefer short-lived tokens, refresh rotation and httpOnly cookies where suitable.'),

  // ── Web Security ────────────────────────────────────────────────────────
  q('Web Security','easy','What is SQL injection?',['Inserting malicious SQL through untrusted input','A faster query technique','A database backup','An index type'],0,'Prevent with parameterized queries.'),
  q('Web Security','easy','What does XSS stand for?',['Cross-Site Scripting','Extra Secure Sockets','XML Style Sheet','Cross-System Sync'],0,'XSS injects scripts into pages viewed by others.'),
  q('Web Security','medium','Best defence against SQL injection?',['Parameterized queries / prepared statements','Hiding the database port only','Longer passwords','Using GET instead of POST'],0,'Separates code from data.'),
  q('Web Security','hard','What does the SameSite cookie attribute mitigate?',['CSRF','SQL injection','DNS spoofing','Buffer overflow'],0,'It limits cross-site cookie sending.'),

  // ── PostgreSQL ──────────────────────────────────────────────────────────
  q('PostgreSQL','easy','Which command opens the PostgreSQL interactive terminal?',['psql','pgrun','postgresql-shell','sqlcmd'],0,'psql is the standard CLI.'),
  q('PostgreSQL','easy','Which data type stores JSON with indexing support in PostgreSQL?',['JSONB','TEXTJSON','BLOBJSON','DOCUMENT'],0,'JSONB is binary JSON supporting GIN indexes.'),
  q('PostgreSQL','medium','What does EXPLAIN ANALYZE do?',['Shows the executed query plan with actual timings','Deletes unused indexes','Backs up the DB','Encrypts a table'],0,'It runs the query and reports actual plan costs.'),
  q('PostgreSQL','hard','Which isolation level is the default in PostgreSQL?',['Read Committed','Serializable','Read Uncommitted','Repeatable Read'],0,'PostgreSQL defaults to Read Committed.'),

  // ── Redis ───────────────────────────────────────────────────────────────
  q('Redis','easy','Redis is primarily:',['An in-memory key-value store','A relational DB','A web server','A compiler'],0,'Redis keeps data in memory for speed.'),
  q('Redis','easy','Which command sets a key with expiry in seconds?',['SETEX key 60 value','PUSH key 60','EXPIRE-ALL','SAVE key'],0,'SETEX (or SET … EX) sets a TTL.'),
  q('Redis','medium','Which structure suits a leaderboard?',['Sorted set','String only','Bitmap only','HyperLogLog'],0,'Sorted sets order members by score.'),
  q('Redis','hard','What is cache invalidation challenge?',['Ensuring cached data does not become stale/inconsistent with the source of truth','Compressing keys','Installing Redis','Choosing a port'],0,'Famously one of the hard problems.'),

  // ── Database Design ─────────────────────────────────────────────────────
  q('Database Design','easy','What is a primary key?',['A unique identifier for each row','A password','A foreign table','A sort order'],0,'It uniquely identifies records.'),
  q('Database Design','easy','What is a foreign key?',['A column referencing a primary key in another table','A backup column','An encrypted field','A view'],0,'It enforces referential integrity.'),
  q('Database Design','medium','What does normalization aim to reduce?',['Data redundancy and anomalies','Table count always','Query results','Index use'],0,'It structures data to avoid duplication.'),
  q('Database Design','hard','When is denormalization reasonable?',['To optimize read-heavy workloads at the cost of redundancy','Never','To save disk only','To remove keys'],0,'Trade write complexity for read speed.'),

  // ── AWS Fundamentals ────────────────────────────────────────────────────
  q('AWS Fundamentals','easy','Which AWS service provides object storage?',['S3','EC2','RDS','Lambda'],0,'Amazon S3 stores objects in buckets.'),
  q('AWS Fundamentals','easy','Which AWS service provides virtual servers?',['EC2','S3','IAM','Route 53'],0,'EC2 offers resizable compute instances.'),
  q('AWS Fundamentals','medium','What does IAM manage?',['Users, roles and permissions','Billing invoices only','CDN caching','Container images only'],0,'Identity and Access Management.'),
  q('AWS Fundamentals','hard','What is the principle of least privilege?',['Grant only the permissions required','Grant admin to all','Share root credentials','Disable MFA'],0,'Minimizes blast radius.'),

  // ── Pandas ──────────────────────────────────────────────────────────────
  q('Pandas','easy','Which is the main 2-D labelled structure in pandas?',['DataFrame','ArrayList','Tensor','Stack'],0,'DataFrame is a table with labelled axes.'),
  q('Pandas','easy','Which method shows the first rows of a DataFrame?',['head()','top()','first_rows()','peek()'],0,'df.head() returns the first 5 rows by default.'),
  q('Pandas','medium','How do you drop rows with missing values?',['df.dropna()','df.remove()','df.clean()','df.fillnull()'],0,'dropna() removes rows with NaN.'),
  q('Pandas','hard','Which method combines groups and aggregates?',['groupby().agg()','merge().sort()','pivot().drop()','apply().sum()'],0,'groupby with agg summarizes per group.'),

  // ── Statistics ──────────────────────────────────────────────────────────
  q('Statistics','easy','Which is a measure of central tendency?',['Median','Variance','Range','Skewness'],0,'Mean, median and mode describe the centre.'),
  q('Statistics','easy','What does standard deviation measure?',['Spread of data around the mean','Sample size','The mode','Correlation sign'],0,'It is the square root of variance.'),
  q('Statistics','medium','A p-value below 0.05 usually means:',['Result unlikely under the null hypothesis at the 5% level','The effect is large','The null is proven true','The sample is biased'],0,'It is evidence against the null, not effect size.'),
  q('Statistics','hard','Correlation does not imply:',['Causation','Association','Linearity measurement','Covariance'],0,'Confounders may explain correlations.'),

  // ── Data Visualization ──────────────────────────────────────────────────
  q('Data Visualization','easy','Best chart for change over time?',['Line chart','Pie chart','Scatter of IDs','Table of text'],0,'Line charts show trends.'),
  q('Data Visualization','easy','Which chart compares categories?',['Bar chart','Line chart of dates','Histogram of one value','Heat map of names'],0,'Bars compare discrete categories.'),
  q('Data Visualization','medium','What does a histogram show?',['Distribution of a numeric variable','Relationship between categories','Network paths','Time zones'],0,'It bins values to show frequency.'),
  q('Data Visualization','hard','Why truncate a bar chart axis cautiously?',['It can exaggerate differences and mislead','It speeds rendering','It is required','It adds colour'],0,'Bar length should be proportional to value.'),

  // ── Scikit-learn ────────────────────────────────────────────────────────
  q('Scikit-learn','easy','Which function splits data into train and test sets?',['train_test_split','split_data','cut_set','divide'],0,'sklearn.model_selection.train_test_split.'),
  q('Scikit-learn','easy','Which method trains an estimator?',['fit()','run()','learn_all()','build()'],0,'estimator.fit(X, y).'),
  q('Scikit-learn','medium','What is overfitting?',['Model fits training data too closely and generalizes poorly','Model is too small','Training is too fast','Data is too clean'],0,'Detect via train/validation gap.'),
  q('Scikit-learn','hard','What does cross-validation provide?',['A more robust performance estimate across folds','Faster training','Bigger datasets','Feature names'],0,'It averages performance over multiple splits.'),

  // ── Generative AI ───────────────────────────────────────────────────────
  q('Generative AI','easy','What does LLM stand for?',['Large Language Model','Linear Learning Method','Local Logic Machine','Layered Lookup Map'],0,'Models trained on large text corpora.'),
  q('Generative AI','easy','What is a prompt?',['The input instruction/context given to a model','A model weight','A GPU','A database'],0,'Prompts steer model output.'),
  q('Generative AI','medium','What is RAG?',['Retrieval-Augmented Generation: fetch relevant documents to ground the answer','Random Answer Generator','Recurrent Attention Graph','Rapid API Gateway'],0,'It supplies retrieved context to the model.'),
  q('Generative AI','hard','Why treat user-supplied documents as untrusted in LLM apps?',['They may contain prompt-injection instructions','They are always too long','LLMs cannot read them','They increase accuracy'],0,'Never let data override system instructions.'),

  // ── Monitoring ──────────────────────────────────────────────────────────
  q('Monitoring','easy','Which tool is commonly used for metrics scraping?',['Prometheus','Photoshop','Figma','Notepad'],0,'Prometheus collects time-series metrics.'),
  q('Monitoring','easy','What is an alert for?',['Notifying people when a condition indicates a problem','Compiling code','Styling pages','Hashing passwords'],0,'Alerts trigger on thresholds/anomalies.'),
  q('Monitoring','medium','Which are the three pillars of observability?',['Metrics, logs, traces','CPU, RAM, disk','Dev, test, prod','Build, ship, run'],0,'Together they explain system behaviour.'),
  q('Monitoring','hard','What does an SLO describe?',['A target level of reliability for a service','A server location','A script language','A billing plan'],0,'Service Level Objective, e.g. 99.9% availability.'),

  // ── Infrastructure as Code ──────────────────────────────────────────────
  q('Infrastructure as Code','easy','Terraform is used for:',['Provisioning infrastructure declaratively','Writing CSS','Browsing the web','Image editing'],0,'Describe infra in .tf files.'),
  q('Infrastructure as Code','easy','Main benefit of IaC?',['Repeatable, version-controlled infrastructure','Faster typing','No servers needed','No testing needed'],0,'Treat infra like code.'),
  q('Infrastructure as Code','medium','What does terraform plan do?',['Shows proposed changes without applying','Destroys all resources','Formats files','Installs providers only'],0,'It previews the diff.'),
  q('Infrastructure as Code','hard','Why store Terraform state remotely with locking?',['Prevents concurrent conflicting changes and enables team sharing','To reduce file count','To hide providers','State is not needed'],0,'Remote backends such as S3 + lock tables.'),

  // ── Site Reliability ────────────────────────────────────────────────────
  q('Site Reliability','easy','What is an incident postmortem?',['A blameless review of what happened and how to prevent recurrence','A punishment meeting','A deployment tool','A load test'],0,'Learning-focused review.'),
  q('Site Reliability','easy','What does availability measure?',['Proportion of time a service works','Code size','Team size','Colour contrast'],0,'Often expressed as nines.'),
  q('Site Reliability','medium','What is an error budget?',['Allowed unreliability before feature work pauses','Money for bugs','Max logs','Test coverage'],0,'1 − SLO.'),
  q('Site Reliability','hard','Why prefer gradual (canary) rollouts?',['Limits blast radius of bad releases','Makes releases slower for no reason','Avoids monitoring','Skips testing'],0,'Detect issues on a small share of traffic.'),

  // ── Spring Boot ─────────────────────────────────────────────────────────
  q('Spring Boot','easy','Which annotation marks a Spring Boot application entry class?',['@SpringBootApplication','@Main','@Entry','@Bootstrap'],0,'It enables auto-configuration and component scanning.'),
  q('Spring Boot','easy','Which annotation creates a REST controller?',['@RestController','@Service','@Entity','@Repository'],0,'@RestController combines @Controller and @ResponseBody.'),
  q('Spring Boot','medium','What does @Autowired do?',['Injects a dependency managed by Spring','Creates a database','Starts a thread','Logs requests'],0,'Dependency injection.'),
  q('Spring Boot','hard','What is Spring Data JPA used for?',['Reducing boilerplate for database access via repositories','Frontend styling','Container scheduling','Message encryption'],0,'Repository interfaces generate implementations.'),

  // ── Agile ───────────────────────────────────────────────────────────────
  q('Agile','easy','A Scrum sprint is:',['A fixed-length iteration','A bug type','A server','A database'],0,'Usually 1–4 weeks.'),
  q('Agile','easy','Who owns the product backlog in Scrum?',['Product Owner','Scrum tester','CTO only','Customer support'],0,'The Product Owner orders the backlog.'),
  q('Agile','medium','What is a daily stand-up for?',['Syncing progress and impediments','Writing code','Deploying','Performance reviews'],0,'Short team sync.'),
  q('Agile','hard','What is velocity?',['Amount of work a team completes per sprint','Typing speed','Server latency','Release count'],0,'Used for forecasting, not comparing teams.'),

  // ── Responsive Design ───────────────────────────────────────────────────
  q('Responsive Design','easy','Which meta tag enables responsive scaling on mobile?',['viewport','charset','robots','refresh'],0,'<meta name="viewport" content="width=device-width, initial-scale=1">'),
  q('Responsive Design','easy','Which CSS feature applies styles by screen width?',['Media queries','Keyframes','Selectors only','Variables'],0,'@media (max-width: …).'),
  q('Responsive Design','medium','Which layout system is two-dimensional?',['CSS Grid','Float only','Inline-block','Tables of text'],0,'Grid handles rows and columns.'),
  q('Responsive Design','hard','What does "mobile-first" mean?',['Write base styles for small screens, then enhance with min-width queries','Design only for phones','Hide content on desktop','Use only images'],0,'Progressive enhancement.'),

  // ── Accessibility ───────────────────────────────────────────────────────
  q('Accessibility','easy','Why add alt text to images?',['Describes the image for screen-reader users','Speeds up loading','Changes colour','Enables caching'],0,'Alt text conveys image meaning.'),
  q('Accessibility','easy','What does ARIA provide?',['Attributes to expose roles/states to assistive tech','Animations','Database access','Routing'],0,'Accessible Rich Internet Applications.'),
  q('Accessibility','medium','Which HTML element is best for a clickable action?',['<button>','<div onclick>','<span>','<p>'],0,'Native buttons give keyboard and screen-reader support.'),
  q('Accessibility','hard','WCAG AA normal-text colour contrast ratio minimum?',['4.5:1','2:1','3.5:1','7:1 only'],0,'AA requires 4.5:1 for normal text.'),

  // ── Bash ────────────────────────────────────────────────────────────────
  q('Bash','easy','What does the pipe | do in a shell?',['Sends one command output as input to another','Deletes files','Starts a server','Comments a line'],0,'cmd1 | cmd2'),
  q('Bash','easy','Which command prints text?',['echo','print_r','say','emit'],0,'echo prints arguments.'),
  q('Bash','medium','What does $? hold?',['Exit status of the last command','Process ID','Current user','Current path'],0,'0 means success.'),
  q('Bash','hard','What does set -euo pipefail do in scripts?',['Exits on errors, unset variables and failed pipes','Prints help','Enables colours','Runs in background'],0,'A common strict-mode header.'),

  // ── Go ──────────────────────────────────────────────────────────────────
  q('Go','easy','Which keyword starts a goroutine?',['go','async','spawn','thread'],0,'go f() runs f concurrently.'),
  q('Go','easy','How do you declare a variable with type inference in a function?',[':=','let','var:=','auto'],0,'x := 5'),
  q('Go','medium','Channels in Go are used for:',['Communication between goroutines','Database queries','HTTP routing','Logging'],0,'They synchronize and pass data.'),
  q('Go','hard','How is error handling idiomatically done in Go?',['Returning an error value and checking it','try/catch','Throwing exceptions','Ignoring panics'],0,'Functions return (value, error).'),

  // ── C# ──────────────────────────────────────────────────────────────────
  q('C#','easy','C# runs primarily on which platform?',['.NET','JVM','Node.js','Erlang VM'],0,'.NET (Core/5+).'),
  q('C#','easy','Which keyword defines a property accessor pair?',['get/set','read/write','fetch/put','in/out'],0,'public int X { get; set; }'),
  q('C#','medium','What is LINQ?',['Language-integrated query for collections','A UI toolkit','A package manager','A database engine'],0,'Query syntax over IEnumerable.'),
  q('C#','hard','What does async/await in C# enable?',['Non-blocking asynchronous code using Tasks','Multi-process forking','Static typing','Compile caching'],0,'Task-based asynchronous pattern.'),

  // ── PHP ─────────────────────────────────────────────────────────────────
  q('PHP','easy','PHP variables start with:',['$','@','#','&'],0,'$name = "x";'),
  q('PHP','easy','Which function outputs text?',['echo','console.log','puts','cout'],0,'echo prints strings.'),
  q('PHP','medium','What is Composer?',['Dependency manager for PHP','A template engine','A web server','A database'],0,'Manages packages via composer.json.'),
  q('PHP','hard','Why use PDO prepared statements?',['Prevent SQL injection','Speed up CSS','Cache images','Compress output'],0,'Bind parameters separately from SQL.'),

  // ── Flutter ─────────────────────────────────────────────────────────────
  q('Flutter','easy','Flutter apps are written in:',['Dart','Kotlin','Swift','Ruby'],0,'Flutter uses Dart.'),
  q('Flutter','easy','Everything in Flutter UI is a:',['Widget','Activity','Fragment','Controller'],0,'Widgets compose the UI tree.'),
  q('Flutter','medium','Difference between StatelessWidget and StatefulWidget?',['Stateful widgets hold mutable state that can trigger rebuilds','Stateless can use setState','No difference','Stateless is slower'],0,'setState exists in State objects.'),
  q('Flutter','hard','What does hot reload do?',['Injects updated code into the running app preserving state','Restarts device','Builds release APK','Clears cache'],0,'Fast iteration.'),

  // ── Smart Contracts ─────────────────────────────────────────────────────
  q('Smart Contracts','easy','Smart contracts on Ethereum run on the:',['EVM','JVM','CLR','V8 only'],0,'Ethereum Virtual Machine.'),
  q('Smart Contracts','easy','What is gas?',['Fee unit for computation on Ethereum','A token','A language','A wallet'],0,'Users pay gas for execution.'),
  q('Smart Contracts','medium','Are deployed smart contracts typically mutable?',['No, code is immutable unless designed with upgrade patterns','Yes, edit anytime','Only by Google','Only on weekends'],0,'Proxies enable upgradability.'),
  q('Smart Contracts','hard','What is a reentrancy attack?',['A contract is called back before its state is updated, enabling repeated withdrawals','A DNS attack','A phishing email','A rendering bug'],0,'Use checks-effects-interactions or ReentrancyGuard.'),

  // ── Cryptography Fundamentals ───────────────────────────────────────────
  q('Cryptography Fundamentals','easy','Which is a hash function?',['SHA-256','AES','RSA','Diffie-Hellman'],0,'SHA-256 produces a fixed-size digest.'),
  q('Cryptography Fundamentals','easy','Symmetric encryption uses:',['The same key to encrypt and decrypt','Two different keys','No key','Only hashes'],0,'AES is symmetric.'),
  q('Cryptography Fundamentals','medium','In public-key crypto, what encrypts a message for you?',['Your public key','Your private key','A shared password','Nothing'],0,'Only your private key can decrypt it.'),
  q('Cryptography Fundamentals','hard','Why add a salt to password hashes?',['Defeats precomputed rainbow tables and makes equal passwords hash differently','Makes hashes reversible','Shrinks hash size','Speeds up login'],0,'Unique salts per password.'),

  // ── Incident Response ───────────────────────────────────────────────────
  q('Incident Response','easy','First priority when an incident is detected?',['Contain and assess impact','Delete logs','Announce publicly without facts','Ignore it'],0,'Contain to limit damage and preserve evidence.'),
  q('Incident Response','easy','What is a SIEM used for?',['Aggregating and analysing security events','Designing logos','Compiling code','Hosting websites'],0,'Security Information and Event Management.'),
  q('Incident Response','medium','Which is a standard IR phase order?',['Preparation, detection, containment, eradication, recovery, lessons learned','Recovery, preparation, blame','Detection only','Eradication, ignore'],0,'NIST-style lifecycle.'),
  q('Incident Response','hard','Why preserve evidence/chain of custody?',['Needed for investigation and potential legal action','To use more disk','To slow response','No reason'],0,'Avoid altering artifacts.'),

  // ── Technical Support ───────────────────────────────────────────────────
  q('Technical Support','easy','First step when a user reports a problem?',['Gather details and reproduce the issue','Reinstall the OS','Blame the user','Close the ticket'],0,'Understand symptoms before acting.'),
  q('Technical Support','easy','What is a ticketing system for?',['Tracking and managing support requests','Hosting videos','Compiling apps','Printing'],0,'Examples: Jira Service Desk, ServiceNow.'),
  q('Technical Support','medium','What is escalation?',['Passing an unresolved issue to a higher support tier','Closing a ticket','Deleting data','Restarting a PC'],0,'Tier-1 → Tier-2/3.'),
  q('Technical Support','hard','Best approach to an intermittent fault?',['Collect logs/timestamps and look for patterns before changing things','Change many settings at once','Ignore it','Replace all hardware'],0,'Change one variable at a time.'),

  // ── Network Administration ──────────────────────────────────────────────
  q('Network Administration','easy','A router primarily:',['Forwards packets between networks','Stores files','Prints','Renders video'],0,'Layer 3 device.'),
  q('Network Administration','easy','What does a firewall do?',['Filters traffic by rules','Speeds up Wi-Fi','Stores passwords','Compresses files'],0,'Allows or blocks traffic.'),
  q('Network Administration','medium','What is a VLAN?',['A logical segmentation of a switch network','A VPN client','A DNS record','A cable type'],0,'Separates broadcast domains.'),
  q('Network Administration','hard','What does NAT do?',['Translates private to public IP addresses','Encrypts packets','Assigns MACs','Blocks DNS'],0,'Allows many private hosts to share a public IP.'),

  // ── Data Pipelines ──────────────────────────────────────────────────────
  q('Data Pipelines','easy','What does ETL stand for?',['Extract, Transform, Load','Execute, Test, Launch','Encode, Transfer, Log','Export, Tag, Link'],0,'Classic data integration process.'),
  q('Data Pipelines','easy','Which tool orchestrates workflows as DAGs?',['Apache Airflow','Photoshop','Nginx','Postman'],0,'Airflow schedules DAG-based pipelines.'),
  q('Data Pipelines','medium','What is idempotency in a pipeline?',['Re-running produces the same result without duplicates','Running once only','Running faster','Running in parallel'],0,'Essential for safe retries.'),
  q('Data Pipelines','hard','Batch vs streaming: streaming processes data:',['Continuously as it arrives','Only nightly','Only manually','Only on disk dumps'],0,'Low latency event processing.'),

  // ── Model Deployment ────────────────────────────────────────────────────
  q('Model Deployment','easy','What is model serving?',['Exposing a trained model for predictions via an API/service','Training on GPUs','Labelling data','Plotting loss'],0,'Inference endpoint.'),
  q('Model Deployment','easy','Why version ML models?',['Reproducibility and rollback','Smaller files','Faster GPUs','Prettier plots'],0,'Track which model produced which results.'),
  q('Model Deployment','medium','What is data drift?',['Input data distribution changes over time vs training data','Disk fragmentation','Model size growth','API latency'],0,'It can degrade accuracy.'),
  q('Model Deployment','hard','Which tool is used for experiment tracking and model registry?',['MLflow','Nginx','Postman','Webpack'],0,'MLflow tracks runs and models.'),

  // ── Vulnerability Assessment ────────────────────────────────────────────
  q('Vulnerability Assessment','easy','What is a CVE?',['A public identifier for a known vulnerability','A virus type','A cloud service','A firewall rule'],0,'Common Vulnerabilities and Exposures.'),
  q('Vulnerability Assessment','easy','Nmap is used for:',['Network discovery and port scanning','Image editing','Compiling','Database design'],0,'Authorized scanning only.'),
  q('Vulnerability Assessment','medium','Vulnerability scanning vs penetration testing?',['Scanning identifies potential flaws automatically; pen testing attempts exploitation to prove impact','Same thing','Pen testing is automated only','Scanning exploits systems'],0,'Different depth and goals.'),
  q('Vulnerability Assessment','hard','What does CVSS provide?',['A standardized severity score for vulnerabilities','A patch','A firewall','An exploit'],0,'0–10 severity scale.'),

  // ── Mobile UI / Android ─────────────────────────────────────────────────
  q('Android Development','easy','Which language is Google’s preferred language for Android?',['Kotlin','Perl','Ruby','COBOL'],0,'Kotlin-first since 2019.'),
  q('Android Development','easy','What is an Activity?',['A single screen with a UI','A database','A network packet','A build tool'],0,'Entry point for user interaction.'),
  q('Android Development','medium','What manifest file declares app components and permissions?',['AndroidManifest.xml','build.gradle only','strings.xml','proguard.txt'],0,'Required for every Android app.'),
  q('Android Development','hard','Why avoid long work on the main thread?',['It freezes the UI (ANR)','It uses more battery only','It breaks Gradle','It is illegal'],0,'Use coroutines/background threads.')
];
