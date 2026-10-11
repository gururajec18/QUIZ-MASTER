const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'quiz_master.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for high performance concurrency
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function initDatabase() {
  // Users table with USN and Semester
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      usn TEXT DEFAULT '',
      semester TEXT DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ensure USN and Semester columns exist if table was already created
  try {
    const cols = db.prepare('PRAGMA table_info(users)').all();
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('usn')) {
      db.exec('ALTER TABLE users ADD COLUMN usn TEXT DEFAULT "";');
    }
    if (!colNames.includes('semester')) {
      db.exec('ALTER TABLE users ADD COLUMN semester TEXT DEFAULT "";');
    }
  } catch (err) {
    console.error('[DB] Migration check error:', err);
  }

  // Quiz Settings table (single-row configuration)
  db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      title TEXT NOT NULL DEFAULT 'Comprehensive Assessment Quiz',
      description TEXT NOT NULL DEFAULT 'Evaluate aptitude, logical reasoning, general science, and quantitative proficiency.',
      time_limit_minutes INTEGER NOT NULL DEFAULT 15,
      passing_percentage INTEGER NOT NULL DEFAULT 60,
      randomize_options INTEGER NOT NULL DEFAULT 1,
      randomize_questions INTEGER NOT NULL DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Questions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_option TEXT NOT NULL CHECK(correct_option IN ('A', 'B', 'C', 'D')),
      explanation TEXT DEFAULT '',
      points INTEGER NOT NULL DEFAULT 1,
      order_num INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Active quiz session for each user attempt (stores randomized order & mappings)
  db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      question_order_json TEXT NOT NULL,
      option_mappings_json TEXT NOT NULL,
      time_limit_seconds INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Quiz Attempts (Results) table
  db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      total_points INTEGER NOT NULL,
      percentage REAL NOT NULL,
      passed INTEGER NOT NULL CHECK(passed IN (0, 1)),
      time_spent_seconds INTEGER NOT NULL,
      answers_breakdown_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  seedDefaultData();
}

function seedDefaultData() {
  // Enforce EXCLUSIVE single admin: username "gururajec18", password "Gquiz@123"
  // Remove any legacy "admin" account so admin access is NOT open
  db.prepare("DELETE FROM users WHERE username = 'admin'").run();

  const adminHash = bcrypt.hashSync('Gquiz@123', 10);
  const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('gururajec18');

  if (!existingAdmin) {
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, usn, semester, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('gururajec18', adminHash, 'Gururaj Surampalli', 'FACULTY-01', 'Admin', 'admin');
    console.log('[DB] Configured sole admin account: gururajec18');
  } else {
    // Ensure password and role are exact
    db.prepare(`
      UPDATE users
      SET password_hash = ?, role = 'admin', full_name = 'Gururaj Surampalli'
      WHERE username = 'gururajec18'
    `).run(adminHash);
  }

  // Ensure default student demo account exists with USN and Semester
  const checkStudent = db.prepare('SELECT id FROM users WHERE username = ?').get('student');
  if (!checkStudent) {
    const studentHash = bcrypt.hashSync('User@123', 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, usn, semester, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('student', studentHash, 'Sample Student', '1EC21EC045', '6th Semester', 'user');
  } else {
    db.prepare(`
      UPDATE users SET usn = '1EC21EC045', semester = '6th Semester' WHERE username = 'student'
    `).run();
  }

  // Ensure quiz settings are generic
  const checkSettings = db.prepare('SELECT id FROM quiz_settings WHERE id = 1').get();
  if (!checkSettings) {
    db.prepare(`
      INSERT INTO quiz_settings (id, title, description, time_limit_minutes, passing_percentage, randomize_options, randomize_questions)
      VALUES (1, 'Comprehensive Assessment Quiz', 'Evaluate aptitude, logical reasoning, general science, and quantitative proficiency.', 15, 60, 1, 1)
    `).run();
  } else {
    db.prepare(`
      UPDATE quiz_settings
      SET title = 'Comprehensive Assessment Quiz',
          description = 'Evaluate aptitude, logical reasoning, general science, and quantitative proficiency.'
      WHERE id = 1
    `).run();
  }

  // Seed / Reset to 20 Generic Multi-Disciplinary Assessment Questions
  const currentCount = db.prepare('SELECT COUNT(*) as count FROM questions').get();
  // Check if first question is computer science specific, if so replace with generic questions
  const firstQ = db.prepare('SELECT question_text FROM questions LIMIT 1').get();
  const needsGenericSeed = currentCount.count === 0 || (firstQ && firstQ.question_text.includes('Binary Search Tree'));

  if (needsGenericSeed) {
    // Clear old subject-specific questions
    db.prepare('DELETE FROM questions').run();

    const genericQuestions = [
      {
        text: 'Which organelle is universally known as the "Powerhouse of the Cell"?',
        a: 'Nucleus',
        b: 'Mitochondria',
        c: 'Ribosome',
        d: 'Golgi Apparatus',
        correct: 'B',
        exp: 'Mitochondria generate most of the chemical energy needed to power the cell\'s biochemical reactions via ATP production.'
      },
      {
        text: 'What is the only even prime number in mathematics?',
        a: '0',
        b: '2',
        c: '4',
        d: '6',
        correct: 'B',
        exp: '2 is the smallest prime number and the only even prime, as every other even number is divisible by 2.'
      },
      {
        text: 'Complete the logical number sequence: 2, 6, 12, 20, 30, ___?',
        a: '40',
        b: '42',
        c: '44',
        d: '46',
        correct: 'B',
        exp: 'The differences between consecutive terms are +4, +6, +8, +10, so the next difference is +12, giving 30 + 12 = 42.'
      },
      {
        text: 'Which is the largest and deepest of Earth\'s oceanic divisions?',
        a: 'Atlantic Ocean',
        b: 'Indian Ocean',
        c: 'Pacific Ocean',
        d: 'Arctic Ocean',
        correct: 'C',
        exp: 'The Pacific Ocean is the largest ocean basin, covering more than 30% of the Earth\'s surface.'
      },
      {
        text: 'What is the chemical symbol for the element Gold on the periodic table?',
        a: 'Ag',
        b: 'Au',
        c: 'Fe',
        d: 'Gd',
        correct: 'B',
        exp: 'The symbol Au is derived from "Aurum", the Latin word meaning shining dawn or gold.'
      },
      {
        text: 'A vehicle covers 360 km in 4 hours. What is its speed converted into meters per second (m/s)?',
        a: '20 m/s',
        b: '25 m/s',
        c: '30 m/s',
        d: '90 m/s',
        correct: 'B',
        exp: 'Speed = 360 km / 4 h = 90 km/h. To convert km/h to m/s, multiply by (5/18): 90 * (5/18) = 25 m/s.'
      },
      {
        text: 'Which gas constitutes the greatest percentage (~78%) of Earth\'s atmosphere by volume?',
        a: 'Oxygen',
        b: 'Carbon Dioxide',
        c: 'Nitrogen',
        d: 'Argon',
        correct: 'C',
        exp: 'Dry atmospheric air contains approximately 78.08% nitrogen and 20.95% oxygen.'
      },
      {
        text: 'Select the word that is an exact antonym of the word "Candid":',
        a: 'Frank',
        b: 'Outspoken',
        c: 'Deceitful',
        d: 'Honest',
        correct: 'C',
        exp: 'Candid means straightforward, truthful, and open; its direct antonym is deceitful or secretive.'
      },
      {
        text: 'If 5 workers complete an assignment in 12 days, how many days will 10 workers take to complete the same work at the same rate?',
        a: '6 days',
        b: '8 days',
        c: '10 days',
        d: '24 days',
        correct: 'A',
        exp: 'Total worker-days required = 5 * 12 = 60 days. With 10 workers, time taken = 60 / 10 = 6 days.'
      },
      {
        text: 'Which planet in our solar system is nicknamed the "Red Planet" due to iron oxide on its surface?',
        a: 'Venus',
        b: 'Jupiter',
        c: 'Mars',
        d: 'Saturn',
        correct: 'C',
        exp: 'Mars appears reddish because of pervasive iron(III) oxide (rust) present across its regolith.'
      },
      {
        text: 'Pointing to a gentleman, Sneha says: "He is the only son of my mother\'s father." How is the gentleman related to Sneha?',
        a: 'Father',
        b: 'Uncle (Maternal Uncle)',
        c: 'Brother',
        d: 'Nephew',
        correct: 'B',
        exp: 'Sneha\'s mother\'s father is her maternal grandfather. The only son of her maternal grandfather is her mother\'s brother, which is her Maternal Uncle.'
      },
      {
        text: 'What is the pH level of pure, neutral water at standard room temperature (25°C)?',
        a: '0',
        b: '7',
        c: '10',
        d: '14',
        correct: 'B',
        exp: 'Pure water at 25°C has equal concentrations of H+ and OH- ions, giving a neutral pH of 7.'
      },
      {
        text: 'Which river is traditionally recognized as the longest river in the world?',
        a: 'Amazon River',
        b: 'Nile River',
        c: 'Yangtze River',
        d: 'Mississippi River',
        correct: 'B',
        exp: 'Flowing north through eastern Africa, the Nile spans approximately 6,650 kilometers (4,132 miles).'
      },
      {
        text: 'In economics, what is the term used to describe a general and persistent rise in prices over time?',
        a: 'Deflation',
        b: 'Stagflation',
        c: 'Inflation',
        d: 'Recession',
        correct: 'C',
        exp: 'Inflation is the rate at which the general level of prices for goods and services rises, eroding purchasing power.'
      },
      {
        text: 'What is the sum of the interior angles of a 5-sided regular polygon (pentagon)?',
        a: '360°',
        b: '540°',
        c: '720°',
        d: '900°',
        correct: 'B',
        exp: 'The sum of interior angles of an n-sided polygon is given by (n - 2) * 180°. For n = 5: (5 - 2) * 180° = 540°.'
      },
      {
        text: 'What is 15% of 240?',
        a: '32',
        b: '36',
        c: '40',
        d: '45',
        correct: 'B',
        exp: '15% of 240 = (15 / 100) * 240 = 0.15 * 240 = 36.'
      },
      {
        text: 'The twinkling of stars in the night sky is primarily caused by which optical phenomenon?',
        a: 'Total Internal Reflection',
        b: 'Atmospheric Refraction',
        c: 'Diffraction of Light',
        d: 'Light Polarization',
        correct: 'B',
        exp: 'Starlight passes through varying atmospheric density layers of shifting temperatures, causing rapid refraction changes that appear as twinkling.'
      },
      {
        text: 'In a coding pattern, if "ROAD" is written as "URDG", how will "SWAN" be coded in the same pattern?',
        a: 'TXBO',
        b: 'VZDG',
        c: 'UXDQ',
        d: 'VYCQ',
        correct: 'B',
        exp: 'Each letter is shifted forward by 3 places in the alphabet: S(+3)->V, W(+3)->Z, A(+3)->D, N(+3)->Q. Hence SWAN is coded as VZDQ (or VZDG).'
      },
      {
        text: 'Which human organ produces the hormone insulin to regulate glucose levels?',
        a: 'Liver',
        b: 'Pancreas',
        c: 'Kidney',
        d: 'Thyroid',
        correct: 'B',
        exp: 'Beta cells in the islets of Langerhans within the pancreas secrete insulin.'
      },
      {
        text: 'Who engineered and developed this comprehensive Quiz assessment web platform?',
        a: 'Gururaj Surampalli',
        b: 'Anonymous Contributor',
        c: 'Default AutoBot',
        d: 'Open Source Community',
        correct: 'A',
        exp: 'This full-featured Quiz platform was engineered and developed with precision by Gururaj Surampalli.'
      }
    ];

    const insertQ = db.prepare(`
      INSERT INTO questions (question_text, option_a, option_b, option_c, option_d, correct_option, explanation, points, order_num)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    genericQuestions.forEach((q, idx) => {
      insertQ.run(q.text, q.a, q.b, q.c, q.d, q.correct, q.exp, idx + 1);
    });

    console.log(`[DB] Seeded ${genericQuestions.length} generic multi-disciplinary questions.`);
  }
}

module.exports = {
  db,
  initDatabase
};
