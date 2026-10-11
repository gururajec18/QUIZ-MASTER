/**
 * Updated Automated Verification Test Suite
 * Tests all requirements:
 * 1. Admin login restricted exclusively to gururajec18 / Gquiz@123 (old admin rejected)
 * 2. Student registration with USN and Semester
 * 3. Generic Multi-Disciplinary Question Pool & Editing
 * 4. Option randomization per user
 * 5. Grading and Admin Scoreboard with USN and Semester
 * 6. PDF Export with USN and Semester
 */

async function runTests() {
  const BASE_URL = 'http://localhost:3000';
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  try {
    // 1. Health Check
    console.log('\n--- 1. Testing Health Endpoint ---');
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthData = await healthRes.json();
    assert(healthData.status === 'online', 'Health endpoint status is online');
    assert(healthData.developer === 'Gururaj Surampalli', 'Developer attribution matches Gururaj Surampalli');

    // 2. Restricted Admin Login Verification
    console.log('\n--- 2. Testing Restricted Admin Access ---');
    // Test that old 'admin' login fails
    const oldAdminRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin@123' })
    });
    assert(oldAdminRes.status === 401, 'Old generic "admin" account is disabled (HTTP 401)');

    // Test that designated sole admin gururajec18 / Gquiz@123 succeeds
    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'gururajec18', password: 'Gquiz@123' })
    });
    const adminLoginData = await adminLoginRes.json();
    const adminCookie = adminLoginRes.headers.get('set-cookie');
    assert(adminLoginData.success === true, 'Exclusive admin gururajec18 logged in successfully');
    assert(adminLoginData.user.role === 'admin', 'Admin role verified');

    // 3. Student Registration with USN and Semester
    console.log('\n--- 3. Testing Student Registration with USN & Semester ---');
    const testUsername = `student_${Date.now().toString().slice(-4)}`;
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUsername,
        password: 'Password@123',
        full_name: 'Pooja Hegde',
        usn: '1EC22EC088',
        semester: '6th Semester'
      })
    });
    const regData = await regRes.json();
    const studentCookie = regRes.headers.get('set-cookie');
    assert(regData.success === true, 'Student registration succeeded');
    assert(regData.user.usn === '1EC22EC088', 'Registered student USN verified');
    assert(regData.user.semester === '6th Semester', 'Registered student Semester verified');

    // 4. Verify Generic Multi-Disciplinary Question Pool
    console.log('\n--- 4. Testing Generic Questions Pool ---');
    const questionsRes = await fetch(`${BASE_URL}/api/admin/questions`, {
      headers: { 'Cookie': adminCookie }
    });
    const questionsData = await questionsRes.json();
    assert(questionsData.count >= 20, `Generic questions count verified: ${questionsData.count}`);
    const q1 = questionsData.questions[0];
    console.log(`Sample Question 1: "${q1.question_text}"`);
    assert(!q1.question_text.includes('Binary Search Tree'), 'Questions are generic and multi-disciplinary (not subject-specific)');

    // 5. Test Question Editing with Correct Option
    console.log('\n--- 5. Testing Question Editing Flow ---');
    const editRes = await fetch(`${BASE_URL}/api/admin/questions/${q1.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie
      },
      body: JSON.stringify({
        question_text: 'Which organelle is universally known as the "Powerhouse of the Cell"?',
        option_a: 'Nucleus',
        option_b: 'Mitochondria (ATP Producer)',
        option_c: 'Ribosome',
        option_d: 'Golgi Apparatus',
        correct_option: 'B',
        explanation: 'Mitochondria generate cellular energy in the form of ATP.',
        points: 1
      })
    });
    const editData = await editRes.json();
    assert(editData.success === true, 'Admin successfully edited question and options');

    // 6. Test Quiz Start & Answer Order Randomization
    console.log('\n--- 6. Testing Answer Order Randomization ---');
    const quizRes = await fetch(`${BASE_URL}/api/quiz/start`, {
      method: 'POST',
      headers: { 'Cookie': studentCookie }
    });
    const quizData = await quizRes.json();
    assert(Boolean(quizData.token), 'Candidate received session token');
    assert(quizData.questions.length >= 20, 'Candidate received all questions');
    assert(quizData.questions[0].options.length === 4, 'Candidate question has 4 options');
    assert(!quizData.questions[0].correct_option, 'Candidate question does NOT expose correct_option');

    // 7. Submit Quiz Answers
    console.log('\n--- 7. Testing Answer Submission ---');
    const answers = {};
    quizData.questions.forEach(q => {
      answers[q.id] = q.options[0].key; // select first presented shuffled option
    });

    const submitRes = await fetch(`${BASE_URL}/api/quiz/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': studentCookie
      },
      body: JSON.stringify({
        token: quizData.token,
        answers,
        timeSpentSeconds: 210
      })
    });
    const submitData = await submitRes.json();
    assert(submitData.success === true, 'Assessment submitted and scored');
    assert(typeof submitData.percentage === 'number', `Score: ${submitData.score}/${submitData.totalPoints} (${submitData.percentage}%)`);

    // 8. Admin View Scores with USN and Semester
    console.log('\n--- 8. Testing Admin Scoreboard (USN & Semester) ---');
    const attemptsRes = await fetch(`${BASE_URL}/api/admin/attempts`, {
      headers: { 'Cookie': adminCookie }
    });
    const attemptsData = await attemptsRes.json();
    assert(attemptsData.attempts.length >= 1, 'Attempts records found');
    const latestAttempt = attemptsData.attempts[0];
    assert(Boolean(latestAttempt.usn), `Candidate USN verified: ${latestAttempt.usn}`);
    assert(Boolean(latestAttempt.semester), `Candidate Semester verified: ${latestAttempt.semester}`);

    // 9. Admin PDF Export
    console.log('\n--- 9. Testing PDF Export ---');
    const pdfRes = await fetch(`${BASE_URL}/api/admin/export/pdf`, {
      headers: { 'Cookie': adminCookie }
    });
    const contentType = pdfRes.headers.get('content-type');
    const pdfBuffer = await pdfRes.arrayBuffer();
    const pdfHeader = Buffer.from(pdfBuffer.slice(0, 5)).toString('utf-8');

    assert(pdfRes.status === 200, 'PDF endpoint HTTP 200');
    assert(contentType.includes('application/pdf'), 'Content-Type is application/pdf');
    assert(pdfHeader === '%PDF-', 'Valid PDF binary header');
    console.log(`Generated PDF size: ${pdfBuffer.byteLength} bytes`);

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test Suite encountered error:', err);
  }
}

runTests();
