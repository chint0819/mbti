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

  global.DiagnosisEngine = { AXES, scoreAnswers, compatibleType };
})(typeof window !== 'undefined' ? window : globalThis);
