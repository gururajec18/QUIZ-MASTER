/**
 * 3D Quiz Master Web Application
 * Developed by Gururaj Surampalli
 */

const App = {
  state: {
    user: null,
    quizInfo: null,
    activeSession: null,
    activeQuestions: [],
    currentQuestionIndex: 0,
    userAnswers: {}, // { [questionId]: 'A' | 'B' | 'C' | 'D' }
    timerInterval: null,
    timeRemainingSeconds: 0,
    startTime: 0,
    adminQuestions: [],
    adminSettings: null,
    adminAttempts: [],
    adminStats: null,
    currentEditingQuestionId: null
  },

  init: async function () {
    this.bindEvents();
    await this.checkAuth();
  },

  // -------------------------------------------------------------
  // TOAST NOTIFICATIONS
  // -------------------------------------------------------------
  showToast: function (message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-3d ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  // -------------------------------------------------------------
  // VIEW SWITCHING
  // -------------------------------------------------------------
  switchView: function (viewId) {
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active');
    });

    const target = document.getElementById(viewId);
    if (target) {
      target.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  },

  // -------------------------------------------------------------
  // AUTHENTICATION
  // -------------------------------------------------------------
  checkAuth: async function () {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated && data.user) {
        this.setUser(data.user);
      } else {
        this.setUser(null);
        this.switchView('view-auth');
      }
    } catch (err) {
      console.error('Check auth error:', err);
      this.setUser(null);
      this.switchView('view-auth');
    }
  },

  setUser: function (user) {
    this.state.user = user;
    const authActions = document.getElementById('nav-user-actions');
    const authorPill = document.getElementById('nav-author-pill');

    if (user) {
      authActions.innerHTML = `
        <div class="user-profile-badge">
          <span>👤</span>
          <strong>${user.full_name}</strong>
          <span class="role-tag ${user.role}">${user.role}</span>
        </div>
        ${user.role === 'admin' ? `
          <button class="btn-3d btn-3d-cyan btn-sm" onclick="App.loadAdminDashboard()">
            ⚙️ Admin Panel
          </button>
        ` : `
          <button class="btn-3d btn-3d-primary btn-sm" onclick="App.loadUserDashboard()">
            🎯 Quiz Hub
          </button>
        `}
        <button class="btn-3d btn-3d-danger btn-sm" onclick="App.logout()">
          Logout
        </button>
      `;

      if (user.role === 'admin') {
        this.loadAdminDashboard();
      } else {
        this.loadUserDashboard();
      }
    } else {
      authActions.innerHTML = `
        <button class="btn-3d btn-3d-primary btn-sm" onclick="App.showAuthTab('login')">
          Login
        </button>
      `;
    }
  },

  login: async function (username, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      this.showToast(data.message || 'Login successful!', 'success');
      this.setUser(data.user);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  register: async function (username, password, full_name, usn, semester) {
    if (!username || !password || !full_name || !usn || !semester) {
      this.showToast('Please fill in all registration fields.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, full_name, usn, semester })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      this.showToast('Student account created successfully!', 'success');
      this.setUser(data.user);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  logout: async function () {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      this.state.user = null;
      this.setUser(null);
      this.showToast('You have been logged out.', 'info');
      this.switchView('view-auth');
    } catch (err) {
      console.error(err);
    }
  },

  showAuthTab: function (tab) {
    this.switchView('view-auth');
    const studentBox = document.getElementById('student-login-container');
    const regBox = document.getElementById('register-form-container');
    const adminBox = document.getElementById('admin-login-container');
    const btnStudent = document.getElementById('tab-btn-student');
    const btnReg = document.getElementById('tab-btn-register');
    const btnAdmin = document.getElementById('tab-btn-admin');

    if (studentBox) studentBox.style.display = (tab === 'student' ? 'block' : 'none');
    if (regBox) regBox.style.display = (tab === 'register' ? 'block' : 'none');
    if (adminBox) adminBox.style.display = (tab === 'admin' ? 'block' : 'none');

    if (btnStudent) btnStudent.classList.toggle('active', tab === 'student');
    if (btnReg) btnReg.classList.toggle('active', tab === 'register');
    if (btnAdmin) btnAdmin.classList.toggle('active', tab === 'admin');
  },

  // -------------------------------------------------------------
  // USER DASHBOARD & QUIZ HUB
  // -------------------------------------------------------------
  loadUserDashboard: async function () {
    this.switchView('view-user-dashboard');
    try {
      const res = await fetch('/api/quiz/info');
      const data = await res.json();
      this.state.quizInfo = data;

      document.getElementById('dash-quiz-title').textContent = data.title;
      document.getElementById('dash-quiz-desc').textContent = data.description;
      document.getElementById('dash-meta-questions').textContent = data.totalQuestions;
      document.getElementById('dash-meta-time').textContent = `${data.timeLimitMinutes} Mins`;
      document.getElementById('dash-meta-passing').textContent = `${data.passingPercentage}%`;

      const bestElem = document.getElementById('dash-meta-best');
      if (data.userBest !== null && data.userBest !== undefined) {
        bestElem.textContent = `${data.userBest}%`;
      } else {
        bestElem.textContent = 'None yet';
      }

      // Load user past attempts table
      this.loadMyAttempts();
    } catch (err) {
      console.error(err);
      this.showToast('Failed to load quiz metadata', 'error');
    }
  },

  loadMyAttempts: async function () {
    try {
      const res = await fetch('/api/quiz/my-attempts');
      const data = await res.json();
      const tbody = document.getElementById('my-attempts-tbody');
      
      if (!data.attempts || data.attempts.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align:center; color: var(--text-dim); padding: 1.5rem;">
              No quiz attempts recorded yet. Click "Start 3D Quiz" above to take the challenge!
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = data.attempts.map((att, i) => {
        const mins = Math.floor(att.time_spent_seconds / 60);
        const secs = att.time_spent_seconds % 60;
        const date = new Date(att.created_at).toLocaleString();
        const statusBadge = att.passed
          ? `<span class="role-tag user" style="font-weight:700;">PASSED</span>`
          : `<span class="role-tag admin" style="background:rgba(239,68,68,0.2);color:#fca5a5;border-color:rgba(239,68,68,0.4);font-weight:700;">FAILED</span>`;

        return `
          <tr>
            <td><strong>#${att.id}</strong></td>
            <td>${att.score} / ${att.total_points}</td>
            <td><strong style="color: ${att.passed ? '#34d399' : '#f87171'}">${att.percentage}%</strong></td>
            <td>${statusBadge}</td>
            <td>${mins}m ${secs}s</td>
            <td style="color:var(--text-dim); font-size: 0.8rem;">${date}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error(err);
    }
  },

  // -------------------------------------------------------------
  // QUIZ RUNNER (RANDOMIZED ANSWER ORDER FOR DIFFERENT USERS)
  // -------------------------------------------------------------
  startQuiz: async function () {
    try {
      const res = await fetch('/api/quiz/start', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start quiz');
      }

      this.state.activeSession = data;
      this.state.activeQuestions = data.questions;
      this.state.currentQuestionIndex = 0;
      this.state.userAnswers = {};
      this.state.timeRemainingSeconds = data.timeLimitSeconds;
      this.state.startTime = Date.now();

      this.switchView('view-active-quiz');
      this.renderDrawerBubbles();
      this.renderCurrentQuestion();
      this.startTimer();

      this.showToast('Quiz started! Answer options have been randomized.', 'info');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  startTimer: function () {
    clearInterval(this.state.timerInterval);
    const timerBox = document.getElementById('quiz-timer-box');
    const timerVal = document.getElementById('quiz-timer-val');

    const updateDisplay = () => {
      const minutes = Math.floor(this.state.timeRemainingSeconds / 60);
      const seconds = this.state.timeRemainingSeconds % 60;
      timerVal.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      // Visual warning indications
      if (this.state.timeRemainingSeconds <= 60) {
        timerBox.className = 'timer-box-3d danger';
      } else if (this.state.timeRemainingSeconds <= 180) {
        timerBox.className = 'timer-box-3d warning';
      } else {
        timerBox.className = 'timer-box-3d';
      }

      if (this.state.timeRemainingSeconds <= 0) {
        clearInterval(this.state.timerInterval);
        this.showToast('Time has expired! Submitting your assessment...', 'warning');
        this.submitQuiz(true);
      }
      this.state.timeRemainingSeconds--;
    };

    updateDisplay();
    this.state.timerInterval = setInterval(updateDisplay, 1000);
  },

  renderCurrentQuestion: function () {
    const q = this.state.activeQuestions[this.state.currentQuestionIndex];
    if (!q) return;

    // Progress bar
    const total = this.state.activeQuestions.length;
    const progressPct = ((this.state.currentQuestionIndex + 1) / total) * 100;
    document.getElementById('quiz-progress-fill').style.width = `${progressPct}%`;

    // Question Number & Text
    document.getElementById('active-q-badge').textContent = `Question ${this.state.currentQuestionIndex + 1} of ${total} • ${q.points} pt${q.points > 1 ? 's' : ''}`;
    document.getElementById('active-q-text').textContent = q.text;

    // Render randomized options
    const optionsContainer = document.getElementById('active-q-options');
    optionsContainer.innerHTML = '';

    const selectedOptionKey = this.state.userAnswers[q.id];

    q.options.forEach(opt => {
      const isSelected = selectedOptionKey === opt.key;
      const tile = document.createElement('div');
      tile.className = `option-tile-3d ${isSelected ? 'selected' : ''}`;
      tile.onclick = () => this.selectOption(q.id, opt.key);

      tile.innerHTML = `
        <div class="option-key-badge-3d">${opt.key}</div>
        <div class="option-text-val">${opt.text}</div>
      `;
      optionsContainer.appendChild(tile);
    });

    // Update navigation buttons
    document.getElementById('btn-prev-q').disabled = (this.state.currentQuestionIndex === 0);
    const nextBtn = document.getElementById('btn-next-q');
    if (this.state.currentQuestionIndex === total - 1) {
      nextBtn.innerHTML = 'Review & Finish 🏁';
      nextBtn.className = 'btn-3d btn-3d-success';
    } else {
      nextBtn.innerHTML = 'Next Question ➡️';
      nextBtn.className = 'btn-3d btn-3d-primary';
    }

    this.renderDrawerBubbles();
  },

  selectOption: function (questionId, optionKey) {
    this.state.userAnswers[questionId] = optionKey;
    this.renderCurrentQuestion();
    this.renderDrawerBubbles();
  },

  prevQuestion: function () {
    if (this.state.currentQuestionIndex > 0) {
      this.state.currentQuestionIndex--;
      this.renderCurrentQuestion();
    }
  },

  nextQuestion: function () {
    if (this.state.currentQuestionIndex < this.state.activeQuestions.length - 1) {
      this.state.currentQuestionIndex++;
      this.renderCurrentQuestion();
    } else {
      this.openSubmitConfirmModal();
    }
  },

  jumpToQuestion: function (index) {
    if (index >= 0 && index < this.state.activeQuestions.length) {
      this.state.currentQuestionIndex = index;
      this.renderCurrentQuestion();
    }
  },

  renderDrawerBubbles: function () {
    const grid = document.getElementById('drawer-bubbles-grid');
    if (!grid) return;

    grid.innerHTML = '';
    this.state.activeQuestions.forEach((q, idx) => {
      const btn = document.createElement('button');
      btn.className = 'q-bubble-btn';
      if (idx === this.state.currentQuestionIndex) btn.classList.add('active');
      if (this.state.userAnswers[q.id]) btn.classList.add('answered');

      btn.textContent = idx + 1;
      btn.onclick = () => this.jumpToQuestion(idx);
      grid.appendChild(btn);
    });

    // Answered count summary
    const answeredCount = Object.keys(this.state.userAnswers).length;
    const total = this.state.activeQuestions.length;
    document.getElementById('drawer-stats-summary').textContent = `${answeredCount} of ${total} Answered`;
  },

  openSubmitConfirmModal: function () {
    const answeredCount = Object.keys(this.state.userAnswers).length;
    const total = this.state.activeQuestions.length;
    const unanswered = total - answeredCount;

    document.getElementById('submit-modal-answered').textContent = answeredCount;
    document.getElementById('submit-modal-unanswered').textContent = unanswered;
    document.getElementById('modal-submit-confirm').classList.add('active');
  },

  closeSubmitConfirmModal: function () {
    document.getElementById('modal-submit-confirm').classList.remove('active');
  },

  submitQuiz: async function (isAutoSubmit = false) {
    this.closeSubmitConfirmModal();
    clearInterval(this.state.timerInterval);

    const timeSpent = Math.round((Date.now() - this.state.startTime) / 1000);

    try {
      const res = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: this.state.activeSession.token,
          answers: this.state.userAnswers,
          timeSpentSeconds: timeSpent
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      this.showResultsView(data);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // -------------------------------------------------------------
  // RESULTS VIEW & CELEBRATION
  // -------------------------------------------------------------
  showResultsView: function (result) {
    this.switchView('view-results');

    const trophy = document.getElementById('result-trophy-elem');
    const scoreVal = document.getElementById('result-score-val');
    const statusPill = document.getElementById('result-status-pill');

    if (result.passed) {
      trophy.className = 'result-3d-trophy pass';
      trophy.textContent = '🏆';
      scoreVal.className = 'score-big-display pass';
      statusPill.className = 'result-pill-status pass';
      statusPill.textContent = '🎉 Congratulations! You Passed!';

      // Trigger Confetti Celebration if canvas-confetti is loaded
      if (typeof confetti === 'function') {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      }
    } else {
      trophy.className = 'result-3d-trophy fail';
      trophy.textContent = '🎯';
      scoreVal.className = 'score-big-display fail';
      statusPill.className = 'result-pill-status fail';
      statusPill.textContent = 'Keep Going! Passing Score is ' + result.passingPercentage + '%';
    }

    scoreVal.textContent = `${result.percentage}%`;
    document.getElementById('result-meta-points').textContent = `${result.score} / ${result.totalPoints}`;
    
    const mins = Math.floor(result.timeSpentSeconds / 60);
    const secs = result.timeSpentSeconds % 60;
    document.getElementById('result-meta-time').textContent = `${mins}m ${secs}s`;
    document.getElementById('result-meta-passing').textContent = `${result.passingPercentage}%`;

    // Render detailed breakdown list
    const breakdownContainer = document.getElementById('result-breakdown-list');
    breakdownContainer.innerHTML = '';

    result.breakdown.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = `breakdown-card ${item.isCorrect ? 'correct' : 'incorrect'}`;
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
          <strong style="color:#c7d2fe;">Question ${index + 1}</strong>
          <span style="font-weight:700; color:${item.isCorrect ? '#10b981' : '#ef4444'}">
            ${item.isCorrect ? '✅ Correct (+'+item.pointsAwarded+'pt)' : '❌ Incorrect (0pt)'}
          </span>
        </div>
        <p style="font-size:0.95rem; margin-bottom: 0.6rem; color:#ffffff;">${item.questionText}</p>
        <div style="font-size: 0.85rem; color: var(--text-muted); display:flex; flex-direction:column; gap:0.25rem;">
          <div>Your Choice: <strong style="color: ${item.isCorrect ? '#34d399' : '#f87171'}">${item.userSelected}</strong></div>
          ${!item.isCorrect ? `<div>Correct Answer: <strong style="color: #34d399">${item.correctAnswer}</strong></div>` : ''}
          ${item.explanation ? `<div style="margin-top:0.4rem; padding: 0.5rem; background: rgba(0,0,0,0.25); border-radius: 8px; color: #93c5fd;">💡 <em>${item.explanation}</em></div>` : ''}
        </div>
      `;
      breakdownContainer.appendChild(card);
    });
  },

  // -------------------------------------------------------------
  // ADMIN PORTAL & QUIZ MODIFICATIONS
  // -------------------------------------------------------------
  loadAdminDashboard: async function () {
    if (!this.state.user || this.state.user.role !== 'admin') {
      this.showToast('Admin privilege required.', 'error');
      return;
    }

    this.switchView('view-admin');
    await Promise.all([
      this.loadAdminSettings(),
      this.loadAdminQuestions(),
      this.loadAdminAttempts()
    ]);
  },

  showAdminTab: function (tab) {
    document.querySelectorAll('.admin-tab-pane').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(`admin-tab-${tab}`).style.display = 'block';
    document.getElementById(`btn-admin-tab-${tab}`).classList.add('active');
  },

  // Admin Tab 1: Quiz Settings & Time
  loadAdminSettings: async function () {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      this.state.adminSettings = data;

      document.getElementById('input-quiz-title').value = data.title || '';
      document.getElementById('input-quiz-desc').value = data.description || '';
      document.getElementById('input-quiz-time').value = data.time_limit_minutes || 15;
      document.getElementById('input-quiz-passing').value = data.passing_percentage || 60;
      document.getElementById('check-random-options').checked = Boolean(data.randomize_options);
      document.getElementById('check-random-questions').checked = Boolean(data.randomize_questions);
    } catch (err) {
      console.error(err);
    }
  },

  saveAdminSettings: async function () {
    const title = document.getElementById('input-quiz-title').value;
    const description = document.getElementById('input-quiz-desc').value;
    const time_limit_minutes = document.getElementById('input-quiz-time').value;
    const passing_percentage = document.getElementById('input-quiz-passing').value;
    const randomize_options = document.getElementById('check-random-options').checked;
    const randomize_questions = document.getElementById('check-random-questions').checked;

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          time_limit_minutes,
          passing_percentage,
          randomize_options,
          randomize_questions
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update settings');

      this.showToast('Quiz configuration and timer saved successfully!', 'success');
      this.loadAdminSettings();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // Admin Tab 2: Manage Questions (any number)
  loadAdminQuestions: async function () {
    try {
      const res = await fetch('/api/admin/questions');
      const data = await res.json();
      this.state.adminQuestions = data.questions;

      document.getElementById('admin-questions-count-badge').textContent = `${data.count} Questions Configured`;
      const container = document.getElementById('admin-questions-list');

      if (data.questions.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 3rem; color: var(--text-dim);">
            No questions currently in the quiz. Click "Add New Question" above to create one!
          </div>
        `;
        return;
      }

      container.innerHTML = data.questions.map((q, idx) => `
        <div class="card-3d" style="margin-bottom: 1.25rem; padding: 1.35rem;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 0.75rem; gap: 1rem;">
            <div>
              <span class="role-tag user" style="font-weight:700;">#${idx + 1}</span>
              <span style="font-size: 0.8rem; color: var(--text-dim); margin-left: 0.5rem;">${q.points} point${q.points > 1 ? 's' : ''}</span>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn-3d btn-3d-cyan btn-sm" onclick="App.openEditQuestionModal(${q.id})">
                ✏️ Edit
              </button>
              <button class="btn-3d btn-3d-danger btn-sm" onclick="App.deleteQuestion(${q.id})">
                🗑️ Delete
              </button>
            </div>
          </div>
          <h4 style="font-size: 1.05rem; margin-bottom: 0.85rem; color:#ffffff;">${q.question_text}</h4>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.88rem; margin-bottom: 0.75rem;">
            <div style="padding: 0.45rem 0.75rem; border-radius: 8px; background: ${q.correct_option === 'A' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${q.correct_option === 'A' ? 'var(--success)' : 'var(--border-glass)'};">
              <strong>A:</strong> ${q.option_a} ${q.correct_option === 'A' ? '✅' : ''}
            </div>
            <div style="padding: 0.45rem 0.75rem; border-radius: 8px; background: ${q.correct_option === 'B' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${q.correct_option === 'B' ? 'var(--success)' : 'var(--border-glass)'};">
              <strong>B:</strong> ${q.option_b} ${q.correct_option === 'B' ? '✅' : ''}
            </div>
            <div style="padding: 0.45rem 0.75rem; border-radius: 8px; background: ${q.correct_option === 'C' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${q.correct_option === 'C' ? 'var(--success)' : 'var(--border-glass)'};">
              <strong>C:</strong> ${q.option_c} ${q.correct_option === 'C' ? '✅' : ''}
            </div>
            <div style="padding: 0.45rem 0.75rem; border-radius: 8px; background: ${q.correct_option === 'D' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${q.correct_option === 'D' ? 'var(--success)' : 'var(--border-glass)'};">
              <strong>D:</strong> ${q.option_d} ${q.correct_option === 'D' ? '✅' : ''}
            </div>
          </div>

          ${q.explanation ? `
            <div style="font-size: 0.8rem; color: #93c5fd; padding: 0.4rem 0.75rem; background: rgba(0,0,0,0.25); border-radius: 6px;">
              💡 <em>${q.explanation}</em>
            </div>
          ` : ''}
        </div>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  },

  setCorrectOption: function (optKey) {
    const key = (optKey || 'A').toUpperCase();
    const selectElem = document.getElementById('form-correct-option');
    if (selectElem) selectElem.value = key;

    ['a', 'b', 'c', 'd'].forEach(letter => {
      const row = document.getElementById(`row-opt-${letter}`);
      const lbl = document.getElementById(`badge-lbl-${letter}`);
      const isCurrent = (letter.toUpperCase() === key);
      if (row) {
        if (isCurrent) {
          row.classList.add('is-correct');
        } else {
          row.classList.remove('is-correct');
        }
      }
      if (lbl) {
        lbl.textContent = isCurrent ? '✅ Correct Answer' : 'Mark Correct';
      }
    });
  },

  openAddQuestionModal: function () {
    this.state.currentEditingQuestionId = null;
    document.getElementById('modal-q-title').textContent = 'Add New Question';
    document.getElementById('form-question-text').value = '';
    document.getElementById('form-option-a').value = '';
    document.getElementById('form-option-b').value = '';
    document.getElementById('form-option-c').value = '';
    document.getElementById('form-option-d').value = '';
    document.getElementById('form-points').value = '1';
    document.getElementById('form-explanation').value = '';
    this.setCorrectOption('A');
    document.getElementById('modal-question-editor').classList.add('active');
  },

  openEditQuestionModal: async function (questionId) {
    let q = this.state.adminQuestions.find(item => Number(item.id) === Number(questionId));
    if (!q) {
      try {
        const res = await fetch('/api/admin/questions');
        const data = await res.json();
        this.state.adminQuestions = data.questions;
        q = this.state.adminQuestions.find(item => Number(item.id) === Number(questionId));
      } catch (e) {}
    }
    if (!q) {
      this.showToast('Question details not found.', 'error');
      return;
    }

    this.state.currentEditingQuestionId = Number(questionId);
    document.getElementById('modal-q-title').textContent = `Edit Question #${questionId}`;
    document.getElementById('form-question-text').value = q.question_text || '';
    document.getElementById('form-option-a').value = q.option_a || '';
    document.getElementById('form-option-b').value = q.option_b || '';
    document.getElementById('form-option-c').value = q.option_c || '';
    document.getElementById('form-option-d').value = q.option_d || '';
    document.getElementById('form-points').value = q.points || 1;
    document.getElementById('form-explanation').value = q.explanation || '';
    this.setCorrectOption(q.correct_option || 'A');
    document.getElementById('modal-question-editor').classList.add('active');
  },

  closeQuestionModal: function () {
    document.getElementById('modal-question-editor').classList.remove('active');
  },

  saveQuestion: async function () {
    const question_text = document.getElementById('form-question-text').value;
    const option_a = document.getElementById('form-option-a').value;
    const option_b = document.getElementById('form-option-b').value;
    const option_c = document.getElementById('form-option-c').value;
    const option_d = document.getElementById('form-option-d').value;
    const correct_option = document.getElementById('form-correct-option').value;
    const points = document.getElementById('form-points').value;
    const explanation = document.getElementById('form-explanation').value;

    if (!question_text || !option_a || !option_b || !option_c || !option_d) {
      this.showToast('Please fill in question text and all 4 options.', 'error');
      return;
    }

    try {
      const isEditing = Boolean(this.state.currentEditingQuestionId);
      const url = isEditing
        ? `/api/admin/questions/${this.state.currentEditingQuestionId}`
        : '/api/admin/questions';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_text,
          option_a,
          option_b,
          option_c,
          option_d,
          correct_option,
          points: parseInt(points, 10) || 1,
          explanation
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save question');

      this.showToast(data.message || 'Question saved successfully!', 'success');
      this.closeQuestionModal();
      this.loadAdminQuestions();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  deleteQuestion: async function (questionId) {
    if (!confirm(`Are you sure you want to delete Question #${questionId}?`)) return;

    try {
      const res = await fetch(`/api/admin/questions/${questionId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete question');

      this.showToast('Question deleted successfully.', 'info');
      this.loadAdminQuestions();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // Admin Tab 3: Scores, Analytics, and PDF Export
  loadAdminAttempts: async function () {
    try {
      const res = await fetch('/api/admin/attempts');
      const data = await res.json();
      this.state.adminAttempts = data.attempts;
      this.state.adminStats = data.stats;

      // Stats cards
      document.getElementById('stat-total-attempts').textContent = data.stats.totalAttempts;
      document.getElementById('stat-pass-rate').textContent = `${data.stats.passRate}%`;
      document.getElementById('stat-avg-score').textContent = `${data.stats.avgPercentage}%`;
      document.getElementById('stat-top-score').textContent = `${data.stats.highestPercentage}%`;

      // Render Table
      const tbody = document.getElementById('admin-scores-tbody');
      if (data.attempts.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; color: var(--text-dim); padding: 2rem;">
              No student submissions yet. Once users complete quizzes, their scores will appear here.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = data.attempts.map((att, idx) => {
        const mins = Math.floor(att.time_spent_seconds / 60);
        const secs = att.time_spent_seconds % 60;
        const date = new Date(att.created_at).toLocaleString();
        const statusBadge = att.passed
          ? `<span class="role-tag user" style="font-weight:700;">PASSED</span>`
          : `<span class="role-tag admin" style="background:rgba(239,68,68,0.2);color:#fca5a5;border-color:rgba(239,68,68,0.4);font-weight:700;">FAILED</span>`;

        return `
          <tr>
            <td>${idx + 1}</td>
            <td><strong>${att.full_name}</strong></td>
            <td><code style="color:#38bdf8; font-weight:700;">${att.usn || '-'}</code></td>
            <td style="color:var(--text-muted); font-size:0.85rem;">${att.semester || '-'}</td>
            <td style="color:var(--text-dim); font-size:0.85rem;">@${att.username}</td>
            <td>${att.score} / ${att.total_points}</td>
            <td><strong style="color: ${att.passed ? '#34d399' : '#f87171'}">${att.percentage}%</strong></td>
            <td>${statusBadge}</td>
            <td>${mins}m ${secs}s</td>
            <td style="color:var(--text-dim); font-size:0.8rem;">${date}</td>
            <td>
              <div style="display:flex; gap:0.4rem;">
                <button class="btn-3d btn-3d-cyan btn-sm" onclick="App.viewAttemptDetail(${att.id})">
                  🔍 View
                </button>
                <button class="btn-3d btn-3d-danger btn-sm" onclick="App.deleteAttemptRecord(${att.id})">
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error(err);
    }
  },

  viewAttemptDetail: async function (attemptId) {
    try {
      const res = await fetch(`/api/admin/attempts/${attemptId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch details');

      document.getElementById('modal-attempt-user').textContent = `${data.full_name} (@${data.username})`;
      const subElem = document.getElementById('modal-attempt-sub');
      if (subElem) {
        subElem.textContent = `USN: ${data.usn || '-'}  •  Semester: ${data.semester || '-'}`;
      }
      document.getElementById('modal-attempt-score').textContent = `${data.score}/${data.total_points} (${data.percentage}%)`;
      document.getElementById('modal-attempt-status').innerHTML = data.passed
        ? `<span class="role-tag user">PASSED</span>`
        : `<span class="role-tag admin" style="background:rgba(239,68,68,0.2);color:#fca5a5;">FAILED</span>`;

      const breakdownBox = document.getElementById('modal-attempt-breakdown');
      breakdownBox.innerHTML = (data.breakdown || []).map((b, i) => `
        <div style="padding: 0.75rem; border-radius: 8px; margin-bottom: 0.5rem; background: ${b.isCorrect ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; border-left: 3px solid ${b.isCorrect ? '#10b981' : '#ef4444'};">
          <div style="font-weight:700; font-size:0.88rem; margin-bottom: 0.25rem;">
            #${i + 1} ${b.questionText}
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted);">
            Choice: <span style="color:${b.isCorrect ? '#34d399' : '#f87171'}">${b.userSelected}</span> | Correct: <span style="color:#34d399">${b.correctAnswer}</span>
          </div>
          ${b.explanation ? `<div style="font-size:0.75rem; color:#93c5fd; margin-top:0.25rem;"><em>${b.explanation}</em></div>` : ''}
        </div>
      `).join('');

      // Setup single PDF button
      document.getElementById('btn-download-single-pdf').onclick = () => {
        window.PDFExporter.exportSingleAttemptReport(data);
      };

      document.getElementById('modal-attempt-viewer').classList.add('active');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  closeAttemptDetailModal: function () {
    document.getElementById('modal-attempt-viewer').classList.remove('active');
  },

  deleteAttemptRecord: async function (attemptId) {
    if (!confirm('Are you sure you want to delete this candidate score record?')) return;

    try {
      const res = await fetch(`/api/admin/attempts/${attemptId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete record');

      this.showToast('Score record deleted.', 'info');
      this.loadAdminAttempts();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  exportScoresToPdf: function (method = 'client') {
    if (this.state.adminAttempts.length === 0) {
      this.showToast('No score records to export.', 'warning');
      return;
    }

    if (method === 'server') {
      window.location.href = '/api/admin/export/pdf';
    } else {
      window.PDFExporter.exportScoresReport(
        this.state.adminAttempts,
        this.state.adminStats,
        this.state.adminSettings
      );
    }
  },

  // -------------------------------------------------------------
  // EVENT BINDINGS
  // -------------------------------------------------------------
  bindEvents: function () {
    // Auth Forms
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.onsubmit = (e) => {
        e.preventDefault();
        const u = document.getElementById('login-username').value;
        const p = document.getElementById('login-password').value;
        this.login(u, p);
      };
    }

    const regForm = document.getElementById('register-form');
    if (regForm) {
      regForm.onsubmit = (e) => {
        e.preventDefault();
        const u = document.getElementById('reg-username').value;
        const p = document.getElementById('reg-password').value;
        const fn = document.getElementById('reg-fullname').value;
        this.register(u, p, fn);
      };
    }

    // Modal background close
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.onclick = (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      };
    });
  }
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
