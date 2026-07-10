/**
 * AI生成パックの取得クライアント
 *
 * Cloudflare Worker (worker/worker.js) にテーマを送り、テーマ専用の
 * 診断パック(質問 + キャラクター結果)を受け取る。取得済みパックは
 * localStorage に7日キャッシュし、共有リンクを開いたときや再挑戦時に
 * 再生成を待たずに済むようにする。
 */
(function (global) {
  'use strict';

  const CACHE_PREFIX = 'pack-v1:';
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function isEnabled() {
    return Boolean(global.APP_CONFIG && global.APP_CONFIG.aiEndpoint);
  }

  /** worker側と同等の検証(壊れたキャッシュや応答を弾く) */
  function isValidPack(pack) {
    if (!pack || !Array.isArray(pack.questions) || !Array.isArray(pack.results)) return false;
    if (pack.questions.length < 4 || pack.results.length < 4) return false;
    const axes = new Set(pack.questions.map((q) => q.axis));
    for (const a of ['EI', 'NS', 'TF', 'JP']) {
      if (!axes.has(a)) return false;
    }
    return pack.questions.every(
      (q) => Array.isArray(q.choices) && q.choices.length >= 2 &&
        q.choices.every((c) => typeof c.text === 'string' && Number.isInteger(c.value)),
    ) && pack.results.every(
      (r) => r.name && typeof r.code === 'string' && r.code.length === 4 && Array.isArray(r.strengths),
    );
  }

  function cacheKey(theme) {
    return CACHE_PREFIX + theme.toLowerCase();
  }

  function readCache(theme) {
    try {
      const raw = localStorage.getItem(cacheKey(theme));
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() - entry.at > CACHE_TTL_MS || !isValidPack(entry.pack)) {
        localStorage.removeItem(cacheKey(theme));
        return null;
      }
      return entry.pack;
    } catch {
      return null;
    }
  }

  function writeCache(theme, pack) {
    try {
      localStorage.setItem(cacheKey(theme), JSON.stringify({ at: Date.now(), pack }));
    } catch {
      // localStorage不可(プライベートモード等)でも動作は継続
    }
  }

  /**
   * @returns {Promise<object>} 診断パック。失敗時は reject(呼び出し側でフォールバック)。
   *   テーマが不適切として拒否された場合は err.rejected = true。
   */
  async function fetchPack(theme) {
    const cachedPack = readCache(theme);
    if (cachedPack) return cachedPack;

    const endpoint = global.APP_CONFIG.aiEndpoint.replace(/\/$/, '');
    const resp = await fetch(endpoint + '/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    });

    if (resp.status === 422) {
      const err = new Error('theme rejected');
      err.rejected = true;
      throw err;
    }
    if (!resp.ok) {
      throw new Error('generate failed: ' + resp.status);
    }

    const pack = await resp.json();
    if (!isValidPack(pack)) {
      throw new Error('invalid pack');
    }
    writeCache(theme, pack);
    return pack;
  }

  global.DiagnosisAI = { isEnabled, fetchPack, isValidPack };
})(typeof window !== 'undefined' ? window : globalThis);
