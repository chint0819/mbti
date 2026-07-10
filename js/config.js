/**
 * アプリ設定
 *
 * aiEndpoint に Cloudflare Worker のURLを設定すると「AIモード」が有効になり、
 * 入力されたテーマに合わせてAIが質問と診断結果(キャラクター)を生成します。
 *   例: aiEndpoint: "https://marubatsu-shindan.<あなたのID>.workers.dev"
 *
 * 空文字のままの場合、および生成に失敗した場合は、心理4軸の固定12問で診断する
 * 汎用モードで動作します(セットアップ手順は SETUP-AI.md 参照)。
 */
(function (global) {
  'use strict';

  global.APP_CONFIG = {
    aiEndpoint: '',
  };
})(typeof window !== 'undefined' ? window : globalThis);
