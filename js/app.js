/**
 * 画面遷移と描画
 *
 * 2つのモードを持つ:
 *   AIモード   … config.js の aiEndpoint 設定時。テーマ専用の質問と
 *                キャラクター結果をAIが生成する(js/ai.js 経由で取得)。
 *   汎用モード … 未設定時・AI生成失敗時のフォールバック。固定12問の
 *                心理尺度 + テンプレート結果(従来動作)。
 *
 * どちらも「回答 → 4軸スコア → タイプ判定」という採点の骨組みは共通。
 * 結果はURLクエリ(?theme=&type=&scores=&mode=)で共有できる。
 */
(function () {
  'use strict';

  const { AXES, scoreAnswers, scoreChoices, matchCharacter, compatibleType } = window.DiagnosisEngine;
  const { PRESET_THEMES, ARCHETYPES, buildResult, compatSummary } = window.DiagnosisThemes;
  const AI = window.DiagnosisAI;
  const QUESTIONS = window.QUESTIONS;
  const LIKERT_LABELS = window.LIKERT_LABELS;

  const $ = (id) => document.getElementById(id);

  const state = {
    mode: 'generic',   // 'generic' | 'ai'
    theme: '',
    pack: null,        // AIモードの診断パック
    current: 0,
    answers: [],       // 汎用: 1〜5 / AI: 選んだ選択肢のvalue(-2〜2)
    shareText: '',
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

  async function startQuiz() {
    const theme = $('theme-input').value.trim();
    if (!theme || theme.length > 12) {
      showThemeError('テーマを入力してください(12文字まで)');
      return;
    }
    $('theme-error').hidden = true;
    state.theme = theme;
    state.current = 0;
    state.answers = [];
    hideModeNotice();

    if (AI.isEnabled()) {
      $('loading-title').textContent = `「${theme}診断」を作成中`;
      showScreen('loading');
      try {
        state.pack = await AI.fetchPack(theme);
        state.mode = 'ai';
      } catch (e) {
        if (e && e.rejected) {
          showThemeError('このテーマでは診断を作成できません。別のテーマをお試しください');
          showScreen('start');
          return;
        }
        // 生成失敗 → 汎用診断で続行
        state.mode = 'generic';
        state.pack = null;
        showModeNotice('AI生成に失敗したため、共通の12問で診断します');
      }
    } else {
      state.mode = 'generic';
      state.pack = null;
    }

    renderQuestion();
    showScreen('quiz');
  }

  function showThemeError(message) {
    const el = $('theme-error');
    el.textContent = message;
    el.hidden = false;
  }

  function showModeNotice(message) {
    const el = $('mode-notice');
    el.textContent = message;
    el.hidden = false;
  }

  function hideModeNotice() {
    $('mode-notice').hidden = true;
  }

  // ---------- 質問画面 ----------

  function currentQuestions() {
    return state.mode === 'ai' ? state.pack.questions : QUESTIONS;
  }

  function renderQuestion() {
    const questions = currentQuestions();
    const q = questions[state.current];
    const total = questions.length;

    $('quiz-theme-label').textContent =
      state.mode === 'ai' && state.pack.title ? state.pack.title : `${state.theme}診断`;
    $('quiz-progress-text').textContent = `Q${state.current + 1} / ${total}`;
    $('progress-bar').style.width = `${(state.current / total) * 100}%`;
    $('question-text').textContent = q.text;
    $('back-btn').style.visibility = state.current === 0 ? 'hidden' : 'visible';

    const box = $('likert-options');
    box.innerHTML = '';

    if (state.mode === 'ai') {
      q.choices.forEach((choice) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'likert-option choice-option';
        btn.setAttribute('role', 'radio');
        const selected = state.answers[state.current] === choice.value;
        btn.setAttribute('aria-checked', selected ? 'true' : 'false');
        if (selected) btn.classList.add('selected');
        btn.textContent = choice.text;
        btn.addEventListener('click', () => answer(choice.value));
        box.appendChild(btn);
      });
    } else {
      LIKERT_LABELS.forEach((label, i) => {
        const value = i + 1;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'likert-option';
        btn.setAttribute('role', 'radio');
        const selected = state.answers[state.current] === value;
        btn.setAttribute('aria-checked', selected ? 'true' : 'false');
        if (selected) btn.classList.add('selected');
        btn.innerHTML = `<span class="likert-dot dot-${value}"></span><span>${label}</span>`;
        btn.addEventListener('click', () => answer(value));
        box.appendChild(btn);
      });
    }
  }

  function answer(value) {
    state.answers[state.current] = value;
    if (state.current < currentQuestions().length - 1) {
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
    const scored = state.mode === 'ai'
      ? scoreChoices(state.pack.questions, state.answers)
      : scoreAnswers(QUESTIONS, state.answers);
    const scores = scored.axes.map((a) => a.score);

    if (state.mode === 'ai') {
      renderAiResult(state.theme, state.pack, scored.axes);
    } else {
      renderGenericResult(state.theme, scored.typeCode, scores);
    }
    updateShareUrl(state.theme, scored.typeCode, scores, state.mode);
    showScreen('result');
  }

  /** 4軸バーの描画(両モード共通) */
  function renderAxisBars(scores) {
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
  }

  function renderStrengths(strengths) {
    const ul = $('result-strengths');
    ul.innerHTML = '';
    strengths.forEach((s) => {
      const li = document.createElement('li');
      li.textContent = s;
      ul.appendChild(li);
    });
  }

  /** AIモード: 軸スコアに最も近いキャラクターを表示 */
  function renderAiResult(theme, pack, axes) {
    const character = matchCharacter(pack.results, axes);

    $('result-theme-label').textContent = `${pack.title || theme + '診断'} 結果`;
    $('result-emoji').textContent = character.emoji;
    $('result-title').textContent = `「${character.name}」タイプ`;
    $('result-code').textContent = `${character.code}型`;
    $('result-catch').textContent = character.catch;
    $('result-flavor').textContent = character.flavor;
    $('result-desc').textContent = character.desc;
    $('result-advice').textContent = character.advice;
    renderStrengths(character.strengths);
    renderAxisBars(axes.map((a) => a.score));

    // 相性: 相性タイプに一致するキャラがいればその名前で表示
    const compatCode = compatibleType(character.code);
    const compatChar = pack.results.find((r) => r.code === compatCode && r !== character);
    $('result-compat').textContent = compatChar
      ? `${compatChar.emoji}「${compatChar.name}」タイプ(${compatCode}型)。あなたにない視点を持ちつつ、大切にするものが通じ合う相手です。`
      : `${compatCode}型のタイプ。あなたにない視点を持ちつつ、大切にするものが通じ合う相手です。`;

    state.shareText = `【${pack.title || theme + '診断'}】わたしは「${character.name}」タイプでした! ${character.emoji}`;
  }

  /** 汎用モード: 16タイプのテンプレート結果を表示 */
  function renderGenericResult(theme, typeCode, scores) {
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
    renderStrengths(result.strengths);
    renderAxisBars(scores);

    state.shareText = `【${theme}診断】わたしは「${result.title}」タイプ(${result.archetypeName})でした! ${result.emoji}`;
  }

  function updateShareUrl(theme, typeCode, scores, mode) {
    const params = new URLSearchParams({
      theme,
      type: typeCode,
      scores: scores.join(','),
      mode,
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
    $('theme-error').hidden = true;
    showScreen('start');
  }

  // ---------- 共有リンクからの復元 ----------

  /** scores から axes オブジェクト(score + dominant)を再構築 */
  function axesFromScores(scores) {
    return AXES.map((axis, i) => ({
      ...axis,
      score: scores[i],
      dominant: scores[i] >= 50 ? axis.first : axis.second,
    }));
  }

  async function tryRestoreFromUrl() {
    const params = new URLSearchParams(location.search);
    const theme = (params.get('theme') || '').trim();
    const typeCode = params.get('type') || '';
    const scores = (params.get('scores') || '').split(',').map(Number);
    const mode = params.get('mode') || 'generic';

    const valid =
      theme && theme.length <= 12 &&
      /^[EI][NS][TF][JP]$/.test(typeCode) &&
      scores.length === AXES.length &&
      scores.every((s) => Number.isFinite(s) && s >= 0 && s <= 100);
    if (!valid) return false;

    state.theme = theme;

    if (mode === 'ai' && AI.isEnabled()) {
      $('loading-title').textContent = `「${theme}診断」を読み込み中`;
      showScreen('loading');
      try {
        const pack = await AI.fetchPack(theme);
        state.mode = 'ai';
        state.pack = pack;
        renderAiResult(theme, pack, axesFromScores(scores));
        showScreen('result');
        return true;
      } catch {
        // 取得できなければ汎用結果で表示(タイプ・スコアは共有値をそのまま使う)
      }
    }

    if (!ARCHETYPES[typeCode]) return false;
    state.mode = 'generic';
    renderGenericResult(theme, typeCode, scores);
    showScreen('result');
    return true;
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

  tryRestoreFromUrl().then((restored) => {
    if (!restored && !$('screen-start').classList.contains('active')) {
      showScreen('start');
    }
  });
})();
