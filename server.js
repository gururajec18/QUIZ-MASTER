const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const { db, initDatabase } = require('./database');

// Ensure database is initialized
initDatabase();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'gururaj-3d-quiz-master-secret-key-2026';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Helper
function authenticateToken(req, res, next) {
  const token = req.cookies.auth_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, username, full_name, usn, semester, role FROM users WHERE id = ?').get(decoded.userId);
    req.user = user || null;
  } catch (err) {
    req.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
  next();
}

app.use(authenticateToken);

// -------------------------------------------------------------
// AUTH ROUTES
// -------------------------------------------------------------

app.post('/api/auth/register', (req, res) => {
  const { username, password, full_name, usn, semester } = req.body;
  if (!username || !password || !full_name || !usn || !semester) {
    return res.status(400).json({ error: 'Full Name, USN, Semester, Username, and Password are all required.' });
  }

  const cleanUser = username.trim().toLowerCase();
  if (cleanUser === 'gururajec18' || cleanUser === 'admin') {
    return res.status(403).json({ error: 'This username is reserved and cannot be registered.' });
  }

  if (cleanUser.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Username must be at least 3 characters and password at least 4 characters.' });
  }

  try {
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(cleanUser);
    if (existing) {
      return res.status(409).json({ error: 'Username is already taken. Please choose another.' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const insert = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, usn, semester, role)
      VALUES (?, ?, ?, ?, ?, 'user')
    `);
    const result = insert.run(cleanUser, passwordHash, full_name.trim(), usn.trim().toUpperCase(), semester.trim());
    const userId = Number(result.lastInsertRowid);

    const token = jwt.sign({ userId, username: cleanUser, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('auth_token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });

    res.json({
      success: true,
      message: 'Account created successfully!',
      user: { id: userId, username: cleanUser, full_name: full_name.trim(), usn: usn.trim().toUpperCase(), semester: semester.trim(), role: 'user' }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed due to a server error.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('auth_token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });

    res.json({
      success: true,
      message: `Welcome back, ${user.full_name}!`,
      user: { id: user.id, username: user.username, full_name: user.full_name, usn: user.usn || '', semester: user.semester || '', role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed due to a server error.' });
  }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) {
    return res.json({ authenticated: false, user: null });
  }
  res.json({ authenticated: true, user: req.user });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true, message: 'Successfully logged out.' });
});

// -------------------------------------------------------------
// QUIZ PARTICIPANT ROUTES
// -------------------------------------------------------------

// Get overall quiz metadata
app.get('/api/quiz/info', (req, res) => {
  const settings = db.prepare('SELECT * FROM quiz_settings WHERE id = 1').get();
  const qCount = db.prepare('SELECT COUNT(*) as count FROM questions').get();
  
  let userBest = null;
  let userAttemptsCount = 0;
  if (req.user) {
    const best = db.prepare('SELECT MAX(percentage) as bestScore, COUNT(*) as count FROM quiz_attempts WHERE user_id = ?').get(req.user.id);
    userBest = best.bestScore;
    userAttemptsCount = best.count;
  }

  res.json({
    title: settings?.title || 'Comprehensive Quiz',
    description: settings?.description || '',
    timeLimitMinutes: settings?.time_limit_minutes || 15,
    passingPercentage: settings?.passing_percentage || 60,
    totalQuestions: qCount.count,
    userBest,
    userAttemptsCount,
    developer: 'Gururaj Surampalli'
  });
});

// Start a quiz attempt: RANDOMIZE answer order for each user attempt!
app.post('/api/quiz/start', requireAuth, (req, res) => {
  const settings = db.prepare('SELECT * FROM quiz_settings WHERE id = 1').get() || {
    time_limit_minutes: 15,
    randomize_options: 1,
    randomize_questions: 1
  };

  const rawQuestions = db.prepare('SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, points FROM questions').all();
  if (rawQuestions.length === 0) {
    return res.status(400).json({ error: 'Quiz currently has no active questions. Please inform the administrator.' });
  }

  // Shuffle question order if enabled
  let questionList = [...rawQuestions];
  if (settings.randomize_questions) {
    for (let i = questionList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questionList[i], questionList[j]] = [questionList[j], questionList[i]];
    }
  }

  const sessionToken = crypto.randomUUID();
  const optionMappings = {}; // { [questionId]: { [shuffledKey]: originalKey, ... } }
  const clientQuestions = [];

  questionList.forEach((q, index) => {
    // Array of original options
    const originalOptions = [
      { origKey: 'A', text: q.option_a },
      { origKey: 'B', text: q.option_b },
      { origKey: 'C', text: q.option_c },
      { origKey: 'D', text: q.option_d }
    ];

    // Randomize option order for this specific user attempt
    if (settings.randomize_options) {
      for (let i = originalOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [originalOptions[i], originalOptions[j]] = [originalOptions[j], originalOptions[i]];
      }
    }

    // Assign presentation option keys (A, B, C, D) to the shuffled order
    const shuffledPresentationKeys = ['A', 'B', 'C', 'D'];
    const mappingForQ = {};
    const presentedOptions = [];

    originalOptions.forEach((opt, idx) => {
      const presentedKey = shuffledPresentationKeys[idx];
      mappingForQ[presentedKey] = opt.origKey; // maps presented 'A' -> original 'C'
      presentedOptions.push({
        key: presentedKey,
        text: opt.text
      });
    });

    optionMappings[q.id] = {
      mapping: mappingForQ,
      correctOrigKey: q.correct_option,
      points: q.points || 1
    };

    clientQuestions.push({
      id: q.id,
      number: index + 1,
      text: q.question_text,
      points: q.points || 1,
      options: presentedOptions // Sanitized: does NOT reveal which option is correct!
    });
  });

  const now = Math.floor(Date.now() / 1000);
  const timeLimitSeconds = (settings.time_limit_minutes || 15) * 60;
  const expiresAt = now + timeLimitSeconds;

  const insertSession = db.prepare(`
    INSERT INTO quiz_sessions (token, user_id, question_order_json, option_mappings_json, time_limit_seconds, started_at, expires_at, completed)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `);

  insertSession.run(
    sessionToken,
    req.user.id,
    JSON.stringify(questionList.map(q => q.id)),
    JSON.stringify(optionMappings),
    timeLimitSeconds,
    now,
    expiresAt
  );

  res.json({
    token: sessionToken,
    title: settings.title,
    timeLimitSeconds,
    totalQuestions: clientQuestions.length,
    questions: clientQuestions,
    startedAt: now,
    expiresAt
  });
});

// Submit answers for grading
app.post('/api/quiz/submit', requireAuth, (req, res) => {
  const { token, answers, timeSpentSeconds } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Quiz session token is missing.' });
  }

  const session = db.prepare('SELECT * FROM quiz_sessions WHERE token = ? AND user_id = ?').get(token, req.user.id);
  if (!session) {
    return res.status(404).json({ error: 'Quiz session not found or does not belong to you.' });
  }

  if (session.completed) {
    return res.status(400).json({ error: 'This quiz attempt has already been submitted.' });
  }

  const now = Math.floor(Date.now() / 1000);
  // Allow a 15-second grace period for network latency past expires_at
  const isExpired = now > (session.expires_at + 15);

  const optionMappings = JSON.parse(session.option_mappings_json);
  const userAnswers = answers || {}; // { [questionId]: 'A'|'B'|'C'|'D' }

  let earnedScore = 0;
  let totalScore = 0;
  const breakdown = [];

  // Fetch all questions details to build complete report
  const questionIds = Object.keys(optionMappings).map(Number);
  const placeholders = questionIds.map(() => '?').join(',');
  const questionsData = db.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`).all(...questionIds);
  const qMap = new Map(questionsData.map(q => [q.id, q]));

  for (const qIdStr of Object.keys(optionMappings)) {
    const qId = Number(qIdStr);
    const qData = qMap.get(qId);
    if (!qData) continue;

    const qConfig = optionMappings[qIdStr];
    const userSelectedPresKey = userAnswers[qId] || null; // e.g. 'A', 'B' ...
    const userOrigKey = userSelectedPresKey ? qConfig.mapping[userSelectedPresKey] : null;
    const isCorrect = userOrigKey !== null && userOrigKey === qConfig.correctOrigKey;
    const points = qConfig.points || 1;

    totalScore += points;
    if (isCorrect) {
      earnedScore += points;
    }

    // Find the displayed text for user choice & correct choice
    const getOptionTextByOrigKey = (origKey) => {
      if (origKey === 'A') return qData.option_a;
      if (origKey === 'B') return qData.option_b;
      if (origKey === 'C') return qData.option_c;
      if (origKey === 'D') return qData.option_d;
      return 'Not answered';
    };

    breakdown.push({
      questionId: qId,
      questionText: qData.question_text,
      userSelected: userSelectedPresKey ? `${userSelectedPresKey}: ${getOptionTextByOrigKey(userOrigKey)}` : 'Unanswered',
      correctAnswer: `${qConfig.correctOrigKey}: ${getOptionTextByOrigKey(qConfig.correctOrigKey)}`,
      isCorrect,
      pointsAwarded: isCorrect ? points : 0,
      maxPoints: points,
      explanation: qData.explanation || ''
    });
  }

  const percentage = totalScore > 0 ? Math.round((earnedScore / totalScore) * 100 * 10) / 10 : 0;
  const settings = db.prepare('SELECT passing_percentage FROM quiz_settings WHERE id = 1').get() || { passing_percentage: 60 };
  const passed = percentage >= settings.passing_percentage ? 1 : 0;
  const safeTimeSpent = Math.min(timeSpentSeconds || (now - session.started_at), session.time_limit_seconds);

  // Insert attempt
  const insertAttempt = db.prepare(`
    INSERT INTO quiz_attempts (user_id, score, total_points, percentage, passed, time_spent_seconds, answers_breakdown_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const attemptRes = insertAttempt.run(
    req.user.id,
    earnedScore,
    totalScore,
    percentage,
    passed,
    safeTimeSpent,
    JSON.stringify(breakdown)
  );

  // Mark session completed
  db.prepare('UPDATE quiz_sessions SET completed = 1 WHERE id = ?').run(session.id);

  res.json({
    success: true,
    attemptId: Number(attemptRes.lastInsertRowid),
    score: earnedScore,
    totalPoints: totalScore,
    percentage,
    passed: Boolean(passed),
    passingPercentage: settings.passing_percentage,
    timeSpentSeconds: safeTimeSpent,
    breakdown,
    developer: 'Gururaj Surampalli'
  });
});

// Get user's past attempts
app.get('/api/quiz/my-attempts', requireAuth, (req, res) => {
  const attempts = db.prepare(`
    SELECT id, score, total_points, percentage, passed, time_spent_seconds, created_at
    FROM quiz_attempts
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(req.user.id);
  res.json({ attempts });
});

// -------------------------------------------------------------
// ADMIN MANAGEMENT & QUIZ MODIFICATION ROUTES
// -------------------------------------------------------------

// Get Quiz Settings
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const settings = db.prepare('SELECT * FROM quiz_settings WHERE id = 1').get();
  res.json(settings);
});

// Update Quiz Settings (Time limit, title, passing %, randomization)
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const { title, description, time_limit_minutes, passing_percentage, randomize_options, randomize_questions } = req.body;
  
  const parsedTime = parseInt(time_limit_minutes, 10);
  if (isNaN(parsedTime) || parsedTime < 1 || parsedTime > 300) {
    return res.status(400).json({ error: 'Time limit must be a valid number of minutes between 1 and 300.' });
  }

  const parsedPass = parseInt(passing_percentage, 10);
  if (isNaN(parsedPass) || parsedPass < 0 || parsedPass > 100) {
    return res.status(400).json({ error: 'Passing percentage must be between 0 and 100.' });
  }

  db.prepare(`
    UPDATE quiz_settings
    SET title = ?, description = ?, time_limit_minutes = ?, passing_percentage = ?, randomize_options = ?, randomize_questions = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(
    title || 'Mastery Quiz',
    description || '',
    parsedTime,
    parsedPass,
    randomize_options ? 1 : 0,
    randomize_questions ? 1 : 0
  );

  res.json({ success: true, message: 'Quiz settings updated successfully!' });
});

// Get all questions for admin
app.get('/api/admin/questions', requireAdmin, (req, res) => {
  const questions = db.prepare(`
    SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, points, order_num, created_at
    FROM questions
    ORDER BY order_num ASC, id ASC
  `).all();
  res.json({ questions, count: questions.length });
});

// Add a new question
app.post('/api/admin/questions', requireAdmin, (req, res) => {
  const { question_text, option_a, option_b, option_c, option_d, correct_option, explanation, points } = req.body;
  if (!question_text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
    return res.status(400).json({ error: 'Question text, all 4 options, and the correct option (A, B, C, or D) are required.' });
  }

  const validCorrect = ['A', 'B', 'C', 'D'].includes(correct_option.toUpperCase());
  if (!validCorrect) {
    return res.status(400).json({ error: 'Correct option must be A, B, C, or D.' });
  }

  const maxOrder = db.prepare('SELECT MAX(order_num) as maxOrder FROM questions').get();
  const nextOrder = (maxOrder?.maxOrder || 0) + 1;

  const insert = db.prepare(`
    INSERT INTO questions (question_text, option_a, option_b, option_c, option_d, correct_option, explanation, points, order_num)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insert.run(
    question_text.trim(),
    option_a.trim(),
    option_b.trim(),
    option_c.trim(),
    option_d.trim(),
    correct_option.toUpperCase(),
    (explanation || '').trim(),
    parseInt(points, 10) || 1,
    nextOrder
  );

  res.json({
    success: true,
    message: 'Question created successfully!',
    questionId: Number(result.lastInsertRowid)
  });
});

// Update a question
app.put('/api/admin/questions/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { question_text, option_a, option_b, option_c, option_d, correct_option, explanation, points } = req.body;

  if (!question_text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
    return res.status(400).json({ error: 'Question text, all 4 options, and correct option are required.' });
  }

  if (!['A', 'B', 'C', 'D'].includes(correct_option.toUpperCase())) {
    return res.status(400).json({ error: 'Correct option must be A, B, C, or D.' });
  }

  const update = db.prepare(`
    UPDATE questions
    SET question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_option = ?, explanation = ?, points = ?
    WHERE id = ?
  `);

  const result = update.run(
    question_text.trim(),
    option_a.trim(),
    option_b.trim(),
    option_c.trim(),
    option_d.trim(),
    correct_option.toUpperCase(),
    (explanation || '').trim(),
    parseInt(points, 10) || 1,
    id
  );

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Question not found.' });
  }

  res.json({ success: true, message: 'Question updated successfully!' });
});

// Delete a question
app.delete('/api/admin/questions/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Question not found.' });
  }
  res.json({ success: true, message: 'Question deleted successfully.' });
});

// Get all student attempts & scores
app.get('/api/admin/attempts', requireAdmin, (req, res) => {
  const attempts = db.prepare(`
    SELECT a.id, a.user_id, u.username, u.full_name, u.usn, u.semester, a.score, a.total_points, a.percentage, a.passed, a.time_spent_seconds, a.created_at
    FROM quiz_attempts a
    JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC
  `).all();

  // Aggregate stats
  const totalAttempts = attempts.length;
  const passedCount = attempts.filter(a => a.passed === 1).length;
  const avgPercentage = totalAttempts > 0 
    ? (attempts.reduce((sum, a) => sum + a.percentage, 0) / totalAttempts).toFixed(1)
    : 0;
  const highestPercentage = totalAttempts > 0 ? Math.max(...attempts.map(a => a.percentage)) : 0;

  res.json({
    attempts,
    stats: {
      totalAttempts,
      passedCount,
      failedCount: totalAttempts - passedCount,
      passRate: totalAttempts > 0 ? Math.round((passedCount / totalAttempts) * 100) : 0,
      avgPercentage,
      highestPercentage
    }
  });
});

// Get detailed single attempt breakdown
app.get('/api/admin/attempts/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const attempt = db.prepare(`
    SELECT a.*, u.username, u.full_name, u.usn, u.semester
    FROM quiz_attempts a
    JOIN users u ON a.user_id = u.id
    WHERE a.id = ?
  `).get(id);

  if (!attempt) {
    return res.status(404).json({ error: 'Attempt not found.' });
  }

  attempt.breakdown = JSON.parse(attempt.answers_breakdown_json);
  delete attempt.answers_breakdown_json;

  res.json(attempt);
});

// Delete an attempt
app.delete('/api/admin/attempts/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM quiz_attempts WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Attempt record not found.' });
  }
  res.json({ success: true, message: 'Attempt record deleted.' });
});

// -------------------------------------------------------------
// PDF EXPORT ROUTE (ADMIN)
// -------------------------------------------------------------
app.get('/api/admin/export/pdf', requireAdmin, (req, res) => {
  try {
    const attempts = db.prepare(`
      SELECT a.id, u.full_name, u.username, u.usn, u.semester, a.score, a.total_points, a.percentage, a.passed, a.time_spent_seconds, a.created_at
      FROM quiz_attempts a
      JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
    `).all();

    const settings = db.prepare('SELECT * FROM quiz_settings WHERE id = 1').get() || {};
    const totalCount = attempts.length;
    const passedCount = attempts.filter(a => a.passed === 1).length;
    const avgScore = totalCount > 0 ? (attempts.reduce((s, a) => s + a.percentage, 0) / totalCount).toFixed(1) : 0;
    const passRate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;

    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Quiz_Scores_Report_Gururaj_Surampalli.pdf"');

    doc.pipe(res);

    // Header gradient banner
    doc.rect(40, 40, 515, 65).fill('#0f172a');
    doc.rect(40, 102, 515, 3).fill('#6366f1');

    doc.fillColor('#38bdf8').fontSize(20).font('Helvetica-Bold')
       .text('ASSESSMENT SCORE REPORT', 55, 52);
    
    doc.fillColor('#94a3b8').fontSize(10).font('Helvetica')
       .text('Quiz: ' + (settings.title || 'Academic Assessment') + '  |  Passing Threshold: ' + (settings.passing_percentage || 60) + '%', 55, 78);

    doc.fillColor('#a855f7').fontSize(9).font('Helvetica-Bold')
       .text('Developed by Gururaj Surampalli', 360, 54, { align: 'right', width: 180 });

    const generatedDate = new Date().toLocaleString();
    doc.fillColor('#64748b').fontSize(8).font('Helvetica')
       .text('Generated: ' + generatedDate, 360, 78, { align: 'right', width: 180 });

    doc.moveDown(3);

    // Summary Analytics Box
    const boxY = 125;
    doc.roundedRect(40, boxY, 515, 60, 6).fillAndStroke('#f8fafc', '#e2e8f0');

    doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold');
    doc.text('TOTAL ATTEMPTS', 60, boxY + 12);
    doc.text('PASS RATE', 185, boxY + 12);
    doc.text('AVERAGE SCORE', 315, boxY + 12);
    doc.text('PASSED / FAILED', 440, boxY + 12);

    doc.fontSize(16).font('Helvetica-Bold');
    doc.fillColor('#0f172a').text(String(totalCount), 60, boxY + 28);
    doc.fillColor('#10b981').text(passRate + '%', 185, boxY + 28);
    doc.fillColor('#6366f1').text(avgScore + '%', 315, boxY + 28);
    doc.fillColor('#0f172a').text(`${passedCount} / ${totalCount - passedCount}`, 440, boxY + 28);

    // Table Header
    let currentY = boxY + 80;
    doc.rect(40, currentY, 515, 24).fill('#1e293b');
    doc.fillColor('#f8fafc').fontSize(8.5).font('Helvetica-Bold');
    doc.text('#', 46, currentY + 7);
    doc.text('Candidate Name', 64, currentY + 7);
    doc.text('USN', 165, currentY + 7);
    doc.text('Sem', 245, currentY + 7);
    doc.text('Score', 290, currentY + 7);
    doc.text('Percent', 345, currentY + 7);
    doc.text('Status', 405, currentY + 7);
    doc.text('Duration', 475, currentY + 7);

    currentY += 24;

    if (attempts.length === 0) {
      doc.rect(40, currentY, 515, 30).fill('#f8fafc');
      doc.fillColor('#64748b').fontSize(10).font('Helvetica')
         .text('No user attempts recorded yet.', 50, currentY + 9, { align: 'center', width: 495 });
      currentY += 30;
    } else {
      attempts.forEach((att, idx) => {
        // Page overflow check
        if (currentY > 740) {
          doc.addPage();
          currentY = 50;

          // Repeat small header
          doc.rect(40, currentY, 515, 22).fill('#1e293b');
          doc.fillColor('#f8fafc').fontSize(8.5).font('Helvetica-Bold');
          doc.text('#', 46, currentY + 6);
          doc.text('Candidate Name', 64, currentY + 6);
          doc.text('USN', 165, currentY + 6);
          doc.text('Sem', 245, currentY + 6);
          doc.text('Score', 290, currentY + 6);
          doc.text('Percent', 345, currentY + 6);
          doc.text('Status', 405, currentY + 6);
          doc.text('Duration', 475, currentY + 6);
          currentY += 22;
        }

        const bg = idx % 2 === 0 ? '#ffffff' : '#f1f5f9';
        doc.rect(40, currentY, 515, 22).fill(bg);

        doc.fillColor('#334155').fontSize(8).font('Helvetica');
        doc.text(String(idx + 1), 46, currentY + 6);
        doc.text(att.full_name || 'N/A', 64, currentY + 6, { width: 98, ellipsis: true });
        doc.text(att.usn || '-', 165, currentY + 6, { width: 75, ellipsis: true });
        doc.text(att.semester || '-', 245, currentY + 6, { width: 42, ellipsis: true });
        doc.text(`${att.score}/${att.total_points}`, 290, currentY + 6);
        doc.text(`${att.percentage}%`, 345, currentY + 6);

        if (att.passed) {
          doc.fillColor('#059669').font('Helvetica-Bold').text('PASSED', 405, currentY + 6);
        } else {
          doc.fillColor('#dc2626').font('Helvetica-Bold').text('FAILED', 405, currentY + 6);
        }

        const minutes = Math.floor(att.time_spent_seconds / 60);
        const seconds = att.time_spent_seconds % 60;
        const timeStr = `${minutes}m ${seconds}s`;
        doc.fillColor('#64748b').font('Helvetica').text(timeStr, 475, currentY + 6);

        currentY += 22;
      });
    }

    // Footer signature
    doc.rect(40, 780, 515, 1).fill('#cbd5e1');
    doc.fillColor('#475569').fontSize(8.5).font('Helvetica-Bold')
       .text('Developed by Gururaj Surampalli  |  Assessment Platform', 40, 788, { align: 'center', width: 515 });

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF report.' });
    }
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    platform: 'Quiz Assessment Platform',
    developer: 'Gururaj Surampalli',
    timestamp: new Date().toISOString()
  });
});

// Fallback to index.html for Single Page Application
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Quiz WebApp Server running on http://localhost:${PORT}`);
  console.log(`✨ Developed by Gururaj Surampalli`);
  console.log(`====================================================`);
});
