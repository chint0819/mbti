/**
 * ロジックのテスト。ブラウザ用スクリプトは globalThis に公開されるので
 * Node からそのまま require して検証できる。
 *
 * 実行: node tests/run-tests.js
 */
'use strict';

require('../js/questions.js');
require('../js/engine.js');
require('../js/themes.js');

const { AXES, scoreAnswers, compatibleType } = globalThis.DiagnosisEngine;
const { ARCHETYPES, buildResult, compatSummary } = globalThis.DiagnosisThemes;
const QUESTIONS = globalThis.QUESTIONS;

let failed = 0;

function assert(cond, message) {
  if (cond) {
    console.log('  ok - ' + message);
  } else {
    failed += 1;
    console.error('  NG - ' + message);
  }
}

console.log('scoreAnswers:');
{
  // 全問「どちらともいえない」→ 全軸50、タイプは1文字目に倒れる
  const neutral = scoreAnswers(QUESTIONS, QUESTIONS.map(() => 3));
  assert(neutral.axes.every((a) => a.score === 50), '中立回答で全軸50');
  assert(neutral.typeCode === 'ENTJ', '50ちょうどは1文字目の極に倒す');

  // 1文字目の極に全振り: firstキーは5、secondキー(逆転)は1
  const allFirst = scoreAnswers(QUESTIONS, QUESTIONS.map((q) => (q.keyed === 'first' ? 5 : 1)));
  assert(allFirst.typeCode === 'ENTJ', '全振りでENTJ');
  assert(allFirst.axes.every((a) => a.score === 100), '全振りで全軸100');

  // 2文字目の極に全振り
  const allSecond = scoreAnswers(QUESTIONS, QUESTIONS.map((q) => (q.keyed === 'first' ? 1 : 5)));
  assert(allSecond.typeCode === 'ISFP', '逆全振りでISFP');
  assert(allSecond.axes.every((a) => a.score === 0), '逆全振りで全軸0');

  // 逆転項目が効いている: 全問5(黙従回答)は全振りと一致しない
  const acquiescent = scoreAnswers(QUESTIONS, QUESTIONS.map(() => 5));
  assert(
    acquiescent.axes.every((a) => a.score < 100),
    '全問5でも逆転項目により100にならない'
  );

  // バリデーション
  let threw = false;
  try { scoreAnswers(QUESTIONS, [3]); } catch { threw = true; }
  assert(threw, '回答数の不一致はエラー');
  threw = false;
  try { scoreAnswers(QUESTIONS, QUESTIONS.map(() => 6)); } catch { threw = true; }
  assert(threw, '範囲外の回答はエラー');
}

console.log('質問バンク:');
{
  const perAxis = {};
  for (const q of QUESTIONS) perAxis[q.axis] = (perAxis[q.axis] || 0) + 1;
  assert(QUESTIONS.length === 12, '12問ある');
  assert(AXES.every((a) => perAxis[a.code] === 3), '各軸ちょうど3問');
  assert(
    AXES.every((a) => QUESTIONS.some((q) => q.axis === a.code && q.keyed === 'second')),
    '各軸に逆転項目が1問以上ある'
  );
}

console.log('タイプ定義:');
{
  // 4軸2極 = 16タイプ全部にコンテンツがあるか
  const codes = [];
  for (const a of ['E', 'I']) for (const b of ['N', 'S']) for (const c of ['T', 'F']) for (const d of ['J', 'P']) {
    codes.push(a + b + c + d);
  }
  assert(codes.every((c) => ARCHETYPES[c]), '16タイプすべて定義済み');
  assert(
    codes.every((c) => {
      const t = ARCHETYPES[c];
      return t.name && t.emoji && t.catch && t.desc && t.strengths.length === 3 && t.advice &&
        t.modifiers.length >= 2 && t.flavors.length >= 2;
    }),
    '16タイプすべてに必須コンテンツが揃っている'
  );
}

console.log('buildResult:');
{
  const r = buildResult('INFP', 'ラーメン');
  assert(r.title.endsWith('系ラーメン'), 'タイトルにテーマが入る');
  assert(r.flavor.includes('ラーメン'), 'フレーバーテキストにテーマが入る');
  const r2 = buildResult('INFP', 'ラーメン');
  assert(r.title === r2.title && r.flavor === r2.flavor, '同じテーマ×タイプなら結果が安定(共有リンク整合)');

  let threw = false;
  try { buildResult('XXXX', 'ラーメン'); } catch { threw = true; }
  assert(threw, '不明なタイプコードはエラー');
}

console.log('compatibleType:');
{
  assert(compatibleType('ENTJ') === 'INTP', 'EI/JPを反転、NS/TFは維持');
  assert(compatibleType('ISFP') === 'ESFJ', '逆方向も反転');
  assert(compatSummary('INTP', '犬').includes('犬'), '相性サマリーにテーマが入る');
}

console.log('');
if (failed > 0) {
  console.error(failed + ' 件失敗');
  process.exit(1);
}
console.log('すべてのテストに合格');
