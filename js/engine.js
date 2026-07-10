/**
 * 採点エンジン
 *
 * 回答(1〜5)を軸ごとに集計し、各軸のスコア(0〜100)と4文字のタイプコードを返す。
 * スコアは軸コード1文字目の極(E/N/T/J)への傾き。50でちょうど中間。
 */
(function (global) {
  'use strict';

  const AXES = [
    { code: 'EI', label: 'エネルギーの向き', first: { letter: 'E', name: '外向' }, second: { letter: 'I', name: '内向' } },
    { code: 'NS', label: 'ものの見方',       first: { letter: 'N', name: '探究' }, second: { letter: 'S', name: '現実' } },
    { code: 'TF', label: '判断のしかた',     first: { letter: 'T', name: '論理' }, second: { letter: 'F', name: '共感' } },
    { code: 'JP', label: '進め方',           first: { letter: 'J', name: '計画' }, second: { letter: 'P', name: '柔軟' } },
  ];

  /**
   * @param {Array<{axis: string, keyed: 'first'|'second'}>} questions
   * @param {number[]} answers 各質問への回答(1〜5)。questions と同じ順序。
   * @returns {{typeCode: string, axes: Array<{code, label, first, second, score, dominant}>}}
   *   score: 1文字目の極への傾き(0〜100)
   *   dominant: 優勢な極({letter, name})。50ちょうどは1文字目に倒す。
   */
  function scoreAnswers(questions, answers) {
    if (!Array.isArray(answers) || answers.length !== questions.length) {
      throw new Error('answers must have one entry per question');
    }

    // 軸ごとに -2〜+2 を合算(+が1文字目の極)
    const sums = {};
    const counts = {};
    for (const axis of AXES) {
      sums[axis.code] = 0;
      counts[axis.code] = 0;
    }

    questions.forEach((q, i) => {
      const raw = answers[i];
      if (!Number.isInteger(raw) || raw < 1 || raw > 5) {
        throw new Error('answer out of range at index ' + i);
      }
      const centered = raw - 3; // -2〜+2
      sums[q.axis] += q.keyed === 'first' ? centered : -centered;
      counts[q.axis] += 1;
    });

    let typeCode = '';
    const axes = AXES.map((axis) => {
      const max = counts[axis.code] * 2; // 各問±2点
      const score = Math.round(((sums[axis.code] + max) / (2 * max)) * 100);
      const dominant = score >= 50 ? axis.first : axis.second;
      typeCode += dominant.letter;
      return { ...axis, score, dominant };
    });

    return { typeCode, axes };
  }

  /**
   * AIモード用: 選択式質問の採点。
   * @param {Array<{axis: string}>} questions
   * @param {number[]} values 各質問で選んだ選択肢の value(-2〜2、+が1文字目の極)
   * @returns scoreAnswers と同じ形({typeCode, axes})
   */
  function scoreChoices(questions, values) {
    if (!Array.isArray(values) || values.length !== questions.length) {
      throw new Error('values must have one entry per question');
    }
    const sums = {};
    const counts = {};
    for (const axis of AXES) {
      sums[axis.code] = 0;
      counts[axis.code] = 0;
    }
    questions.forEach((q, i) => {
      const v = values[i];
      if (!Number.isInteger(v) || v < -2 || v > 2) {
        throw new Error('choice value out of range at index ' + i);
      }
      sums[q.axis] += v;
      counts[q.axis] += 1;
    });

    let typeCode = '';
    const axes = AXES.map((axis) => {
      const max = counts[axis.code] * 2;
      const score = max === 0 ? 50 : Math.round(((sums[axis.code] + max) / (2 * max)) * 100);
      const dominant = score >= 50 ? axis.first : axis.second;
      typeCode += dominant.letter;
      return { ...axis, score, dominant };
    });
    return { typeCode, axes };
  }

  /**
   * AIモード用: 軸スコアに最も近いタイプコードを持つ結果(キャラクター)を選ぶ。
   * 距離 = 各軸について「スコア」と「そのキャラの極(0 or 100)」の差の合計。
   * 単純な4文字一致より、傾きの強さを反映したマッチングになる。
   * @param {Array<{code: string}>} results
   * @param {Array<{score: number, first: {letter}}>} axes scoreChoices/scoreAnswers の axes
   */
  function matchCharacter(results, axes) {
    let best = null;
    let bestDist = Infinity;
    for (const r of results) {
      if (typeof r.code !== 'string' || r.code.length !== axes.length) continue;
      let dist = 0;
      axes.forEach((axis, i) => {
        const target = r.code[i] === axis.first.letter ? 100 : 0;
        dist += Math.abs(axis.score - target);
      });
      if (dist < bestDist) {
        bestDist = dist;
        best = r;
      }
    }
    return best;
  }

  /**
   * 相性タイプ: エネルギーの向きと進め方が逆で、ものの見方と判断が同じタイプ。
   * 「補い合いつつ価値観が通じる」という古典的なペアリング規則。
   */
  function compatibleType(typeCode) {
    const flip = { E: 'I', I: 'E', J: 'P', P: 'J' };
    return typeCode
      .split('')
      .map((ch) => flip[ch] || ch)
      .join('');
  }

  global.DiagnosisEngine = { AXES, scoreAnswers, scoreChoices, matchCharacter, compatibleType };
})(typeof window !== 'undefined' ? window : globalThis);
