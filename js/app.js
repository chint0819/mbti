/**
 * 画面遷移と描画
 *   start(テーマ入力) → quiz(12問) → result(診断結果)
 * 結果はURLクエリ(?theme=&type=&scores=)で共有でき、共有リンクを開くと結果画面から始まる。
 */
(function () {
  'use strict';

  const { AXES, scoreAnswers, compatibleType } = window.DiagnosisEngine;
  const { PRESET_THEMES, buildResult, compatSummary } = window.DiagnosisThemes;
  const QUESTIONS = window.QUESTIONS;
  const LIKERT_LABELS = window.LIKERT_LABELS;

  const $ = (id) => document.getElementById(id);

  const state = {
    theme: '',
    current: 0,
    answers: [], // 1〜5
  };

  // ---------- 画面切り替え ----------

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
    $('screen-' + name).classList.add('active');
    window.scrollTo({ top: 0 });
  }

  // ---------- スタート画面 ----------

  function initStart() {
    const chipsBox = $('preset-chips');
    chipsBox.innerHTML = '';
    PRESET_THEMES.forEach((t) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = t;
      chip.addEventListener('click', () => {
        $('theme-input').value = t;
        startQuiz();
      });
      chipsBox.appendChild(chip);
    });

    $('start-btn').addEventListener('click', startQuiz);
    $('theme-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') startQuiz();
    });
  }

  function startQuiz() {
    const theme = $('theme-input').value.trim();
    if (!theme || theme.length > 12) {
      $('theme-error').hidden = false;
      return;
    }
    $('theme-error').hidden = true;
    state.theme = theme;
    state.current = 0;
    state.answers = [];
    renderQuestion();
    showScreen('quiz');
  }

  // ---------- 質問画面 ----------

  function renderQuestion() {
    const q = QUESTIONS[state.current];
    const total = QUESTIONS.length;

    $('quiz-theme-label').textContent = `${state.theme}診断`;
    $('quiz-progress-text').textContent = `Q${state.current + 1} / ${total}`;
    $('progress-bar').style.width = `${(state.current / total) * 100}%`;
    $('question-text').textContent = q.text;
    $('back-btn').style.visibility = state.current === 0 ? 'hidden' : 'visible';

    const box = $('likert-options');
    box.innerHTML = '';
    LIKERT_LABELS.forEach((label, i) => {
      const value = i + 1;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'likert-option';
      btn.dataset.value = String(value);
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', state.answers[state.current] === value ? 'true' : 'false');
      if (state.answers[state.current] === value) btn.classList.add('selected');
      btn.innerHTML = `<span class="likert-dot dot-${value}"></span><span>${label}</span>`;
      btn.addEventListener('click', () => answer(value));
      box.appendChild(btn);
    });
  }

  function answer(value) {
    state.answers[state.current] = value;
    if (state.current < QUESTIONS.length - 1) {
      state.current += 1;
      renderQuestion();
    } else {
      finishQuiz();
    }
  }

  function goBack() {
    if (state.current > 0) {
      state.current -= 1;
      renderQuestion();
    }
  }

  // ---------- 結果画面 ----------

  function finishQuiz() {
    const { typeCode, axes } = scoreAnswers(QUESTIONS, state.answers);
    renderResult(state.theme, typeCode, axes.map((a) => a.score));
    updateShareUrl(state.theme, typeCode, axes.map((a) => a.score));
    showScreen('result');
  }

  /**
   * @param {string} theme
   * @param {string} typeCode
   * @param {number[]} scores 各軸の1文字目極への傾き(0〜100)。AXESと同順。
   */
  function renderResult(theme, typeCode, scores) {
    const result = buildResult(typeCode, theme);

    $('result-theme-label').textContent = `${theme}診断 結果`;
    $('result-emoji').textContent = result.emoji;
    $('result-title').textContent = `「${result.title}」タイプ`;
    $('result-code').textContent = `${result.archetypeName}(${typeCode}型)`;
    $('result-catch').textContent = result.catch;
    $('result-flavor').textContent = result.flavor;
    $('result-desc').textContent = result.desc;
    $('result-advice').textContent = result.advice;
    $('result-compat').textContent = compatSummary(compatibleType(typeCode), theme);

    const ul = $('result-strengths');
    ul.innerHTML = '';
    result.strengths.forEach((s) => {
      const li = document.createElement('li');
      li.textContent = s;
      ul.appendChild(li);
    });

    const barsBox = $('axis-bars');
    barsBox.innerHTML = '';
    AXES.forEach((axis, i) => {
      const score = scores[i];
      const dominantFirst = score >= 50;
      const percent = dominantFirst ? score : 100 - score;
      const row = document.createElement('div');
      row.className = 'axis-row';
      row.innerHTML = `
        <div class="axis-labels">
          <span class="${dominantFirst ? 'axis-dominant' : ''}">${axis.first.name}(${axis.first.letter})</span>
          <span class="axis-name">${axis.label}</span>
          <span class="${dominantFirst ? '' : 'axis-dominant'}">${axis.second.name}(${axis.second.letter})</span>
        </div>
        <div class="axis-track">
          <div class="axis-fill ${dominantFirst ? 'from-left' : 'from-right'}" style="width:${percent}%"></div>
        </div>
        <p class="axis-percent">${dominantFirst ? axis.first.name : axis.second.name} ${percent}%</p>
      `;
      barsBox.appendChild(row);
    });

    // シェア用テキストを保持
    state.shareText = `【${theme}診断】わたしは「${result.title}」タイプ(${result.archetypeName})でした! ${result.emoji}`;
  }

  function updateShareUrl(theme, typeCode, scores) {
    const params = new URLSearchParams({
      theme,
      type: typeCode,
      scores: scores.join(','),
    });
    history.replaceState(null, '', `${location.pathname}?${params}`);
  }

  function share() {
    const url = location.href;
    const text = state.shareText || '〇〇診断メーカー';
    if (navigator.share) {
      navigator.share({ title: '〇〇診断メーカー', text, url }).catch(() => {});
      return;
    }
    navigator.clipboard.writeText(`${text}\n${url}`).then(() => {
      const fb = $('share-feedback');
      fb.hidden = false;
      setTimeout(() => { fb.hidden = true; }, 2000);
    });
  }

  function resetToStart() {
    history.replaceState(null, '', location.pathname);
    $('theme-input').value = '';
    showScreen('start');
  }

  // ---------- 共有リンクからの復元 ----------

  function tryRestoreFromUrl() {
    const params = new URLSearchParams(location.search);
    const theme = (params.get('theme') || '').trim();
    const typeCode = params.get('type') || '';
    const scores = (params.get('scores') || '').split(',').map(Number);

    if (
      theme && theme.length <= 12 &&
      window.DiagnosisThemes.ARCHETYPES[typeCode] &&
      scores.length === AXES.length &&
      scores.every((s) => Number.isFinite(s) && s >= 0 && s <= 100)
    ) {
      renderResult(theme, typeCode, scores);
      showScreen('result');
      return true;
    }
    return false;
  }

  // ---------- 初期化 ----------

  initStart();
  $('back-btn').addEventListener('click', goBack);
  $('share-btn').addEventListener('click', share);
  $('retry-btn').addEventListener('click', () => {
    $('theme-input').value = state.theme || new URLSearchParams(location.search).get('theme') || '';
    startQuiz();
  });
  $('new-theme-btn').addEventListener('click', resetToStart);

  tryRestoreFromUrl();
})();
