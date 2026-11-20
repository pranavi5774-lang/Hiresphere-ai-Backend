// ============================================================
// HireSphere AI — Skill Dictionary
// ============================================================
// A transparent mapping of canonical skill names to common resume
// variants. This is the ONLY place skill terminology is normalized;
// no hidden model is involved. HR can audit exactly why a skill was
// counted as matched.
// ============================================================

export interface SkillEntry {
  canonical: string;
  aliases: string[]; // lowercase variants matched against resume text
  category: 'LANGUAGE' | 'FRAMEWORK' | 'DATABASE' | 'TOOL' | 'CLOUD' | 'CONCEPT' | 'SOFT';
}

export const SKILL_DICTIONARY: SkillEntry[] = [
  // Languages
  { canonical: 'JavaScript', aliases: ['javascript', 'js', 'es6', 'ecmascript', 'java script'], category: 'LANGUAGE' },
  { canonical: 'TypeScript', aliases: ['typescript', 'ts'], category: 'LANGUAGE' },
  { canonical: 'Python', aliases: ['python', 'python3'], category: 'LANGUAGE' },
  { canonical: 'Java', aliases: ['java', 'core java', 'java 8', 'java11'], category: 'LANGUAGE' },
  { canonical: 'C++', aliases: ['c++', 'cpp'], category: 'LANGUAGE' },
  { canonical: 'C#', aliases: ['c#', 'csharp', 'c sharp'], category: 'LANGUAGE' },
  { canonical: 'PHP', aliases: ['php'], category: 'LANGUAGE' },
  { canonical: 'SQL', aliases: ['sql', 'ansi sql'], category: 'LANGUAGE' },
  { canonical: 'Go', aliases: ['golang', 'go lang'], category: 'LANGUAGE' },
  { canonical: 'R', aliases: ['r language', 'rstudio', ' r '], category: 'LANGUAGE' },
  { canonical: 'Kotlin', aliases: ['kotlin'], category: 'LANGUAGE' },
  { canonical: 'Swift', aliases: ['swift', 'swiftui'], category: 'LANGUAGE' },
  { canonical: 'HTML/CSS', aliases: ['html', 'css', 'html5', 'css3', 'html/css', 'sass', 'scss'], category: 'LANGUAGE' },
  { canonical: 'Bash/Shell', aliases: ['bash', 'shell scripting', 'shell', 'powershell'], category: 'LANGUAGE' },

  // Frameworks & libraries
  { canonical: 'React', aliases: ['react', 'reactjs', 'react.js', 'react js'], category: 'FRAMEWORK' },
  { canonical: 'Next.js', aliases: ['next.js', 'nextjs', 'next js'], category: 'FRAMEWORK' },
  { canonical: 'Node.js', aliases: ['node.js', 'nodejs', 'node js', 'node'], category: 'FRAMEWORK' },
  { canonical: 'Express.js', aliases: ['express', 'express.js', 'expressjs'], category: 'FRAMEWORK' },
  { canonical: 'Angular', aliases: ['angular', 'angularjs', 'angular 2+'], category: 'FRAMEWORK' },
  { canonical: 'Vue.js', aliases: ['vue', 'vuejs', 'vue.js'], category: 'FRAMEWORK' },
  { canonical: 'Django', aliases: ['django', 'django rest framework', 'drf'], category: 'FRAMEWORK' },
  { canonical: 'Flask', aliases: ['flask', 'flask-restful'], category: 'FRAMEWORK' },
  { canonical: 'FastAPI', aliases: ['fastapi', 'fast api'], category: 'FRAMEWORK' },
  { canonical: 'Spring Boot', aliases: ['spring boot', 'springboot', 'spring mvc', 'spring'], category: 'FRAMEWORK' },
  { canonical: 'Bootstrap', aliases: ['bootstrap', 'bootstrap 5'], category: 'FRAMEWORK' },
  { canonical: 'Tailwind CSS', aliases: ['tailwind', 'tailwindcss', 'tailwind css'], category: 'FRAMEWORK' },
  { canonical: '.NET', aliases: ['.net', 'dotnet', 'asp.net', 'asp.net core'], category: 'FRAMEWORK' },
  { canonical: 'Flutter', aliases: ['flutter', 'dart'], category: 'FRAMEWORK' },
  { canonical: 'TensorFlow', aliases: ['tensorflow'], category: 'FRAMEWORK' },
  { canonical: 'PyTorch', aliases: ['pytorch', 'torch'], category: 'FRAMEWORK' },
  { canonical: 'Scikit-learn', aliases: ['scikit-learn', 'sklearn', 'scikit learn'], category: 'FRAMEWORK' },
  { canonical: 'Pandas', aliases: ['pandas'], category: 'FRAMEWORK' },
  { canonical: 'NumPy', aliases: ['numpy'], category: 'FRAMEWORK' },

  // Databases
  { canonical: 'MySQL', aliases: ['mysql', 'mariadb'], category: 'DATABASE' },
  { canonical: 'PostgreSQL', aliases: ['postgresql', 'postgres'], category: 'DATABASE' },
  { canonical: 'MongoDB', aliases: ['mongodb', 'mongo'], category: 'DATABASE' },
  { canonical: 'SQLite', aliases: ['sqlite', 'sqlite3'], category: 'DATABASE' },
  { canonical: 'Redis', aliases: ['redis'], category: 'DATABASE' },
  { canonical: 'Oracle DB', aliases: ['oracle', 'oracle db', 'pl/sql'], category: 'DATABASE' },
  { canonical: 'SQL Server', aliases: ['sql server', 'mssql', 'ms sql'], category: 'DATABASE' },

  // Tools
  { canonical: 'Git', aliases: ['git', 'github', 'gitlab', 'version control'], category: 'TOOL' },
  { canonical: 'Docker', aliases: ['docker', 'containerization', 'containers'], category: 'TOOL' },
  { canonical: 'Kubernetes', aliases: ['kubernetes', 'k8s'], category: 'TOOL' },
  { canonical: 'Postman', aliases: ['postman', 'api testing'], category: 'TOOL' },
  { canonical: 'Jenkins', aliases: ['jenkins', 'ci/cd', 'cicd'], category: 'TOOL' },
  { canonical: 'Jira', aliases: ['jira', 'atlassian'], category: 'TOOL' },
  { canonical: 'Figma', aliases: ['figma'], category: 'TOOL' },
  { canonical: 'Excel', aliases: ['excel', 'ms excel', 'spreadsheets', 'pivot tables'], category: 'TOOL' },
  { canonical: 'Power BI', aliases: ['power bi', 'powerbi'], category: 'TOOL' },
  { canonical: 'Tableau', aliases: ['tableau'], category: 'TOOL' },
  { canonical: 'Linux', aliases: ['linux', 'ubuntu', 'unix'], category: 'TOOL' },

  // Cloud
  { canonical: 'AWS', aliases: ['aws', 'amazon web services', 'ec2', 's3', 'lambda'], category: 'CLOUD' },
  { canonical: 'Azure', aliases: ['azure', 'microsoft azure'], category: 'CLOUD' },
  { canonical: 'GCP', aliases: ['gcp', 'google cloud', 'google cloud platform'], category: 'CLOUD' },
  { canonical: 'Firebase', aliases: ['firebase', 'firestore'], category: 'CLOUD' },
  { canonical: 'Heroku', aliases: ['heroku', 'render.com', 'render'], category: 'CLOUD' },

  // Concepts / practices
  { canonical: 'REST API', aliases: ['rest api', 'restful api', 'rest', 'restful', 'api development'], category: 'CONCEPT' },
  { canonical: 'GraphQL', aliases: ['graphql', 'apollo'], category: 'CONCEPT' },
  { canonical: 'Machine Learning', aliases: ['machine learning', 'ml', 'supervised learning', 'predictive modeling'], category: 'CONCEPT' },
  { canonical: 'NLP', aliases: ['nlp', 'natural language processing', 'text mining'], category: 'CONCEPT' },
  { canonical: 'Data Analysis', aliases: ['data analysis', 'data analytics', 'eda', 'exploratory data analysis'], category: 'CONCEPT' },
  { canonical: 'Data Visualization', aliases: ['data visualization', 'data viz', 'dashboarding', 'charts'], category: 'CONCEPT' },
  { canonical: 'Deep Learning', aliases: ['deep learning', 'neural networks', 'cnn', 'rnn', 'lstm'], category: 'CONCEPT' },
  { canonical: 'Computer Vision', aliases: ['computer vision', 'opencv', 'image processing'], category: 'CONCEPT' },
  { canonical: 'Agile/Scrum', aliases: ['agile', 'scrum', 'kanban', 'sprint planning'], category: 'CONCEPT' },
  { canonical: 'Unit Testing', aliases: ['unit testing', 'unit tests', 'pytest', 'jest', 'test automation'], category: 'CONCEPT' },
  { canonical: 'CI/CD', aliases: ['ci/cd', 'continuous integration', 'continuous deployment', 'devops'], category: 'CONCEPT' },
  { canonical: 'Microservices', aliases: ['microservices', 'microservices architecture'], category: 'CONCEPT' },
  { canonical: 'System Design', aliases: ['system design', 'system architecture', 'scalability'], category: 'CONCEPT' },
  { canonical: 'OOP', aliases: ['oop', 'object oriented programming', 'object-oriented'], category: 'CONCEPT' },
  { canonical: 'Data Structures', aliases: ['data structures', 'dsa', 'algorithms', 'problem solving'], category: 'CONCEPT' },
  { canonical: 'SDLC', aliases: ['sdlc', 'software development life cycle'], category: 'CONCEPT' },
  { canonical: 'Cybersecurity', aliases: ['cybersecurity', 'information security', 'infosec', 'owasp'], category: 'CONCEPT' },
  { canonical: 'UI/UX', aliases: ['ui/ux', 'ux design', 'ui design', 'wireframing', 'prototyping'], category: 'CONCEPT' },

  // Soft skills
  { canonical: 'Communication', aliases: ['communication', 'communication skills', 'presentation skills'], category: 'SOFT' },
  { canonical: 'Teamwork', aliases: ['teamwork', 'team collaboration', 'collaboration', 'cross-functional'], category: 'SOFT' },
  { canonical: 'Leadership', aliases: ['leadership', 'led a team', 'mentoring', 'mentored'], category: 'SOFT' },
  { canonical: 'Time Management', aliases: ['time management', 'prioritization'], category: 'SOFT' },
  { canonical: 'Adaptability', aliases: ['adaptability', 'fast learner', 'quick learner'], category: 'SOFT' },
];

/** Normalized full-text search term for one canonical skill (longest alias first). */
export function getSkill(canonical: string): SkillEntry | undefined {
  return SKILL_DICTIONARY.find((s) => s.canonical.toLowerCase() === canonical.toLowerCase());
}

export interface SkillHit {
  skill: string; // canonical name
  alias: string; // the variant actually found
  evidence: string; // resume sentence containing it
}

/** Scan normalized resume text for dictionary skills; return canonical hits with evidence. */
export function findSkillsInText(text: string, evidenceSentences: string[]): SkillHit[] {
  const lower = ` ${text.toLowerCase()} `;
  const hits: SkillHit[] = [];
  const seen = new Set<string>();
  for (const entry of SKILL_DICTIONARY) {
    for (const alias of entry.aliases) {
      const pattern = buildAliasRegex(alias);
      if (!pattern) continue;
      if (pattern.test(lower)) {
        if (!seen.has(entry.canonical)) {
          seen.add(entry.canonical);
          hits.push({
            skill: entry.canonical,
            alias,
            evidence: findEvidence(evidenceSentences, alias) || 'Found in resume text',
          });
        }
        break;
      }
    }
  }
  return hits;
}

function findEvidence(sentences: string[], alias: string): string | null {
  for (const s of sentences) {
    if (buildAliasRegex(alias)?.test(s.toLowerCase())) {
      return s.length > 180 ? s.slice(0, 177) + '…' : s;
    }
  }
  return null;
}

function buildAliasRegex(alias: string): RegExp | null {
  const escaped = alias.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  if (!escaped) return null;
  // word-ish boundaries; allow the padded-space trick used for " r "
  return new RegExp(`(?<![a-z0-9+#])${escaped}(?![a-z0-9+#])`, 'i');
}
