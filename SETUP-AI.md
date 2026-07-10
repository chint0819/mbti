# AIモードのセットアップ手順

このアプリは、**AIモード**を有効にすると、入力されたテーマに合わせてAIが質問と診断結果を生成します。
例: テーマが「ディズニー」なら、質問は「パークに着いたら最初にすること?」のようなディズニー仕立てになり、結果は「ミッキーマウス」「くまのプーさん」といったキャラクター(その性格に基づく分析つき)になります。

GitHub Pages は静的サイトなので、AIのAPIキーをそのままサイトに置くと盗まれてしまいます。
そのため、キーを安全に保管する中継サーバー(Cloudflare Workers・無料枠で十分)を1つ立てます。

```
ブラウザ → Cloudflare Worker(あなたのAPIキーで Claude を呼ぶ)→ Anthropic API
```

所要時間はおよそ15分。プログラミングは不要で、コピー&ペーストだけで完了します。

---

## Step 1: Anthropic APIキーを取得する(5分)

1. https://console.anthropic.com/ にアクセスしてアカウントを作成
2. 「Billing」でクレジットを購入(最低 $5 から。従量課金)
3. 「API Keys」→「Create Key」でキーを作成し、`sk-ant-...` で始まる文字列を控える(**この画面でしか表示されません**)

### 料金の目安

- 既定のモデル(Claude Opus 4.8)の場合、**新しいテーマの初回生成1回あたり おおよそ10〜20円**です
- 一度生成したテーマは Worker 側にキャッシュされるため、**同じテーマの2回目以降は無料・即表示**です(共有リンクを開いた人も同様)
- コストを1/5程度に抑えたい場合は Step 2 で環境変数 `MODEL` に `claude-haiku-4-5` を設定してください(生成品質はやや下がります)

## Step 2: Cloudflare Worker を作る(5分)

1. https://dash.cloudflare.com/ で無料アカウントを作成
2. 左メニュー「Compute (Workers)」→「Create」→「Start with Hello World」→ 名前(例: `marubatsu-shindan`)を付けて「Deploy」
3. 「Edit code」を開き、エディタの内容をすべて削除して、このリポジトリの [`worker/worker.js`](worker/worker.js) の中身を貼り付け →「Deploy」
4. Workerの「Settings」→「Variables and Secrets」で追加:
   - `ANTHROPIC_API_KEY`(Type: **Secret**)… Step 1 のキー
   - 任意: `MODEL`(Type: Text)… 例 `claude-haiku-4-5`(未設定なら `claude-opus-4-8`)
   - 任意: `ALLOWED_ORIGIN`(Type: Text)… `https://<あなたのGitHubユーザー名>.github.io`(未設定なら全オリジン許可)
5. Workerの URL を控える(例: `https://marubatsu-shindan.<あなたのID>.workers.dev`)

### 動作確認(任意)

ターミナルがあれば:

```bash
curl -X POST https://<WorkerのURL>/generate \
  -H "Content-Type: application/json" \
  -d '{"theme":"ディズニー"}'
```

質問とキャラクターのJSONが返ってくれば成功です(初回は10〜30秒かかります)。

## Step 3: サイトに Worker のURLを設定する(2分)

1. GitHub でこのリポジトリの `js/config.js` を開き、鉛筆アイコン(Edit)をクリック
2. `aiEndpoint: ''` を Worker のURLに書き換える:

   ```js
   aiEndpoint: 'https://marubatsu-shindan.<あなたのID>.workers.dev',
   ```

3. 「Commit changes」で保存 → 自動デプロイが走り、1〜2分でサイトに反映されます

これで完了です。サイトでテーマを入力すると「AIが診断を作成中…」と表示され、テーマ専用の診断が始まります。

---

## 補足

- **フォールバック**: Worker が落ちている・未設定・生成に失敗した場合は、自動的に従来の汎用12問診断に切り替わります(サイトが壊れることはありません)
- **不適切なテーマ**: 差別的・中傷的なテーマはAIが生成を拒否し、ユーザーには「このテーマでは診断を作成できません」と表示されます
- **診断の妥当性**: AIモードでも採点の骨組みは同じです。質問は心理4軸(外向/内向・探究/現実・論理/共感・計画/柔軟)を測るように生成され、各キャラクターにはその性格に基づく4文字タイプが割り当てられ、回答から計算した軸スコアに最も近いキャラクターが結果になります
- **使いすぎが心配な場合**: Cloudflare ダッシュボードで Worker のリクエスト数を確認できます。Anthropic Console 側でも月額の利用上限(Spend Limit)を設定しておくと安心です
