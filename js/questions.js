/**
 * 質問バンク
 *
 * 4軸 × 各3問 = 12問。ビッグファイブ理論の下位因子を参考にした簡易尺度。
 *   EI: エネルギーの向き   外向(E) ←→ 内向(I)   … 外向性
 *   NS: ものの見方         探究(N) ←→ 現実(S)   … 開放性
 *   TF: 判断のしかた       論理(T) ←→ 共感(F)   … 協調性(思考-感情)
 *   JP: 進め方             計画(J) ←→ 柔軟(P)   … 誠実性
 *
 * 各質問は5件法(1: そう思わない 〜 5: そう思う)。
 * keyed が "first" なら「そう思う」ほど軸コードの1文字目(E/N/T/J)に加点、
 * "second" なら逆転項目として2文字目(I/S/F/P)に加点する。
 * 逆転項目を混ぜることで、回答の偏り(黙従傾向)の影響を減らしている。
 */
(function (global) {
  'use strict';

  const QUESTIONS = [
    // --- EI: 外向性 ---
    { id: 1,  axis: 'EI', keyed: 'first',  text: '初対面の人と話すと、むしろエネルギーが湧いてくる' },
    { id: 2,  axis: 'EI', keyed: 'second', text: '休日はひとりで静かに過ごすことで元気を取り戻す' },
    { id: 3,  axis: 'EI', keyed: 'first',  text: '大人数の集まりでは、自分から話題を振ることが多い' },

    // --- NS: 開放性 ---
    { id: 4,  axis: 'NS', keyed: 'first',  text: '「もしも〜だったら」という空想をよくする' },
    { id: 5,  axis: 'NS', keyed: 'second', text: 'アイデアの面白さよりも、実際に役立つかどうかを重視する' },
    { id: 6,  axis: 'NS', keyed: 'first',  text: '新しい考え方や知らない分野に触れること自体が楽しい' },

    // --- TF: 思考-感情 ---
    { id: 7,  axis: 'TF', keyed: 'first',  text: '物事を決めるときは、気持ちよりも筋が通っているかを重視する' },
    { id: 8,  axis: 'TF', keyed: 'second', text: '友人から相談を受けたら、解決策よりまず気持ちに寄り添う' },
    { id: 9,  axis: 'TF', keyed: 'first',  text: '議論では、多少ぶつかっても正しさをはっきりさせたい' },

    // --- JP: 誠実性 ---
    { id: 10, axis: 'JP', keyed: 'first',  text: '旅行は事前にスケジュールを決めてから出発したい' },
    { id: 11, axis: 'JP', keyed: 'second', text: '締め切りが迫ってからのほうが、かえって力を発揮できる' },
    { id: 12, axis: 'JP', keyed: 'first',  text: '部屋やデスクが散らかっていると落ち着かない' },
  ];

  const LIKERT_LABELS = [
    'そう思わない',
    'あまりそう思わない',
    'どちらともいえない',
    'ややそう思う',
    'そう思う',
  ];

  global.QUESTIONS = QUESTIONS;
  global.LIKERT_LABELS = LIKERT_LABELS;
})(typeof window !== 'undefined' ? window : globalThis);
