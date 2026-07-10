/**
 * 〇〇診断メーカー AI生成プロキシ (Cloudflare Worker)
 *
 * POST /generate { "theme": "ディズニー" }
 *   → テーマ専用の診断パック(質問8問 + キャラクター結果)をJSONで返す
 *
 * APIキーをブラウザに晒さないための中継サーバー。Claude APIの構造化出力
 * (json_schema)で応答フォーマットを強制し、生成結果はCloudflareのキャッシュに
 * 30日保存する(同じテーマの2回目以降はAPI課金なし・即応答)。
 *
 * 必要な環境変数:
 *   ANTHROPIC_API_KEY (Secret) … Anthropic Console で発行したAPIキー
 * 任意:
 *   MODEL            … 既定 "claude-opus-4-8"。コスト優先なら "claude-haiku-4-5"
 *   ALLOWED_ORIGIN   … CORS許可オリジン。既定 "*"。公開後は
 *                      "https://<ユーザー名>.github.io" に絞るのを推奨
 */

const TYPE_CODES = [
  'ENTJ', 'ENTP', 'ENFJ', 'ENFP', 'ESTJ', 'ESTP', 'ESFJ', 'ESFP',
  'INTJ', 'INTP', 'INFJ', 'INFP', 'ISTJ', 'ISTP', 'ISFJ', 'ISFP',
];

// Claude の応答をこのスキーマに強制する(構造化出力)。
// 個数の制約(8問・2問/軸など)はスキーマで表現できないためプロンプト+検証で担保。
const PACK_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          axis: { type: 'string', enum: ['EI', 'NS', 'TF', 'JP'] },
          choices: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                value: { type: 'integer', enum: [-2, -1, 1, 2] },
              },
              required: ['text', 'value'],
              additionalProperties: false,
            },
          },
        },
        required: ['text', 'axis', 'choices'],
        additionalProperties: false,
      },
    },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          emoji: { type: 'string' },
          code: { type: 'string', enum: TYPE_CODES },
          catch: { type: 'string' },
          desc: { type: 'string' },
          strengths: { type: 'array', items: { type: 'string' } },
          advice: { type: 'string' },
          flavor: { type: 'string' },
        },
        required: ['name', 'emoji', 'code', 'catch', 'desc', 'strengths', 'advice', 'flavor'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'questions', 'results'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `あなたは性格診断コンテンツの専門制作者です。ユーザーが指定するテーマに合わせた「〇〇診断」を1つ設計してください。

# 診断の仕組み(厳守)
この診断は性格心理学の4軸モデルに基づきます。質問への回答から4軸のスコアを計算し、最もタイプが近い「結果」を表示します。あなたの仕事は、この骨組みをテーマの世界観で包むことです。

4軸(タイプコードの文字順もこの順):
1. EI軸: 外向(E) / 内向(I) … エネルギーの向き
2. NS軸: 探究(N) / 現実(S) … ものの見方(想像・可能性 vs 実際・具体)
3. TF軸: 論理(T) / 共感(F) … 判断のしかた
4. JP軸: 計画(J) / 柔軟(P) … 進め方

# questions: ちょうど8問(各軸ちょうど2問)
- テーマの世界観に沿った楽しいシチュエーション質問にする(例: テーマがディズニーなら「パークに着いたら最初にすることは?」)。
- ただし各質問は必ず担当axisの性格特性を測れる内容にすること。趣味の知識やテーマへの詳しさを問う質問は禁止。テーマを知らない人でも答えられること。
- 各質問にchoicesを4つ。valueはその選択が軸の1文字目の極(E/N/T/J)をどれだけ示すか: 2(強く1文字目)、1(やや1文字目)、-1(やや2文字目)、-2(強く2文字目)。4つの選択肢でvalue 2, 1, -1, -2 を1つずつ使うこと。
- 選択肢の並び順はvalue順にせずシャッフルすること。

# results: 10〜16個
- テーマに関連する具体的なキャラクター・人物・モノを選ぶ(例: ディズニーならミッキーマウス、プーさん、スティッチ…)。よく知られたものを優先。
- 各結果のcodeは、その対象の「広く知られた性格・ふるまい」に最も合う4文字タイプを誠実に割り当てること(例: 陽気でみんなをまとめるリーダー的キャラ→E×F系)。これが診断の妥当性の核心なので、印象に流されず性格描写と一貫させる。
- codeはなるべく重複させず、E/I・N/S・T/F・J/Pの各極がバランスよく登場するように選ぶ(16タイプ中10種類以上をカバー)。
- desc: そのタイプの性格分析(2〜3文)。キャラクターの具体的な性格・エピソードに絡めつつ、診断された人自身の性格描写として読めるように書く。
- catch: そのキャラらしい短いキャッチコピー。
- strengths: 診断された人の強みを3つ(そのタイプの性格に基づく)。
- advice: そのタイプへのワンポイントアドバイス(1〜2文)。
- flavor: 「あなたを〜に例えると…」という楽しい一文。
- emoji: そのキャラ・モノを表す絵文字1つ。

# その他
- title: 「◯◯診断」の形式。
- すべて日本語。明るく親しみやすい文体。実在の人物がテーマの場合も、性格描写はポジティブで敬意あるものに限る。
- 不適切なテーマ(差別的・性的・特定個人への中傷につながるもの)の場合は、質問や結果を生成せず、titleを「NG」、questionsとresultsを空配列にすること。`;

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(body, status, env, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(env),
      ...extraHeaders,
    },
  });
}

/** 生成パックの最低限の妥当性検証(構造はスキーマで保証済みなので個数と整合性のみ) */
function validatePack(pack) {
  if (!pack || !Array.isArray(pack.questions) || !Array.isArray(pack.results)) {
    return 'malformed pack';
  }
  if (pack.title === 'NG') return 'theme rejected';
  if (pack.questions.length < 4) return 'too few questions';

  const perAxis = {};
  for (const q of pack.questions) {
    perAxis[q.axis] = (perAxis[q.axis] || 0) + 1;
    if (!Array.isArray(q.choices) || q.choices.length < 2) return 'bad choices';
  }
  for (const axis of ['EI', 'NS', 'TF', 'JP']) {
    if (!perAxis[axis]) return 'axis not covered: ' + axis;
  }
  if (pack.results.length < 4) return 'too few results';
  for (const r of pack.results) {
    if (!Array.isArray(r.strengths) || r.strengths.length < 1) return 'bad strengths';
  }
  return null;
}

async function generatePack(theme, env) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.MODEL || 'claude-opus-4-8',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: PACK_SCHEMA } },
      messages: [{ role: 'user', content: `テーマ: ${theme}` }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`anthropic api error ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  if (data.stop_reason === 'refusal') {
    throw new Error('theme rejected');
  }
  if (data.stop_reason === 'max_tokens') {
    throw new Error('generation truncated');
  }
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('no text in response');
  }
  return JSON.parse(textBlock.text);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/generate') {
      return json({ error: 'not found' }, 404, env);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'ANTHROPIC_API_KEY is not configured' }, 500, env);
    }

    let theme;
    try {
      const body = await request.json();
      theme = String(body.theme || '').trim();
    } catch {
      return json({ error: 'invalid json body' }, 400, env);
    }
    if (!theme || theme.length > 20) {
      return json({ error: 'theme must be 1-20 characters' }, 400, env);
    }

    // キャッシュ確認(同じテーマは再生成しない)
    const cache = caches.default;
    const cacheKey = new Request(
      'https://pack-cache.internal/v1?theme=' + encodeURIComponent(theme.toLowerCase()),
    );
    const cached = await cache.match(cacheKey);
    if (cached) {
      const body = await cached.text();
      return json(JSON.parse(body), 200, env, { 'X-Pack-Cache': 'hit' });
    }

    let pack;
    try {
      pack = await generatePack(theme, env);
    } catch (e) {
      const msg = String(e && e.message);
      if (msg.includes('theme rejected')) {
        return json({ error: 'このテーマでは診断を作成できません' }, 422, env);
      }
      return json({ error: 'generation failed', detail: msg }, 502, env);
    }

    const invalid = validatePack(pack);
    if (invalid === 'theme rejected') {
      return json({ error: 'このテーマでは診断を作成できません' }, 422, env);
    }
    if (invalid) {
      return json({ error: 'generated pack invalid', detail: invalid }, 502, env);
    }

    // 30日キャッシュ(共有リンクを開いたときに同じパックが返るように)
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(JSON.stringify(pack), {
          headers: { 'Cache-Control': 'public, max-age=2592000' },
        }),
      ),
    );

    return json(pack, 200, env, { 'X-Pack-Cache': 'miss' });
  },
};
