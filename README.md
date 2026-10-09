# 高専祭 シフト調整システム

高専祭の運営で、約100人のシフト調整を「希望収集 → 自動割り当て → 手動修正・確定 → 閲覧・印刷」まで一つのWebアプリで完結させるためのシステムです。

要件の詳細は [PLAN.md](PLAN.md)（要件定義書）を参照してください。

## 主な機能

**一般ユーザー**

- Microsoft アカウント（または登録済みメール宛のワンタイムコード）でログイン
- 初回ログイン時に、シフト希望の入力が必要な役職を確認（承認）
- 「入りたい」「入れる」「入れない」の希望入力（5分単位、締切前は何度でも修正可）
- 確定後の自分のシフト閲覧

**管理者**

- ユーザー管理（個別登録・編集・削除、CSV一括取込、所属部門・総勤務時間の設定）
- 部門・シフト枠の設定（枠の自動生成と個別編集、最低／最大人数）
- 希望入力の受付期間設定、入力状況（未入力者）の確認
- 自動割り当ての実行（整数計画 / HiGHS）、不足枠の一覧表示、手動修正・固定
- シフトの確定、印刷画面、操作履歴

部門は 総務部／企画部／模擬店部／デコレ部／展示部／放送部 の6つです。

## 技術構成

| 領域         | 使用技術                                                                              |
| ------------ | ------------------------------------------------------------------------------------- |
| サーバー     | [Hono](https://hono.dev/) + TypeScript（Node.js 22 以上）                             |
| フロント     | React 19 + React Router 7 + Vite（SPA）、Tailwind CSS 4、Radix UI                     |
| 認証         | Auth.js（`@auth/core` / `@hono/auth-js`）。Microsoft Entra ID、メール、開発用ログイン |
| DB           | PostgreSQL 17 + Drizzle ORM                                                           |
| 検証         | Zod（`@hono/zod-validator`）                                                          |
| 自動割り当て | HiGHS（WASM）をワーカーで非同期実行                                                   |
| テスト・品質 | Vitest、ESLint、Prettier、`tsc --noEmit`                                              |

## ディレクトリ構成

```
.
├── server/              # API サーバー
│   ├── src/
│   │   ├── admin/       # ユーザー・部門・枠の管理、CSV取込
│   │   ├── assign/      # 自動割り当て（モデル、ソルバ、ワーカー）、自分のシフト
│   │   ├── auth/        # 認証（サインイン検証、開発用ログイン）
│   │   ├── availability/# 希望入力のルール・保存
│   │   ├── db/          # スキーマ、クライアント、マイグレーション、シード
│   │   ├── app.ts       # Hono アプリ本体（ルーティング）
│   │   └── index.ts     # エントリポイント（DB接続・静的配信）
│   └── drizzle/         # 生成されたマイグレーション
├── web/                 # フロントエンド（Vite + React）
│   └── src/routes/      # 画面（希望入力、自分のシフト、管理画面など）
├── docker-compose.yml   # PostgreSQL と Mailpit（ローカル用）
├── .env.example         # 環境変数のひな形
└── PLAN.md              # 要件定義書
```

## ローカル開発のはじめ方

### 前提

- Node.js 22 以上
- pnpm
- Docker（PostgreSQL と Mailpit の起動用）

### 手順

```bash
# 1. 依存関係のインストール
pnpm install

# 2. PostgreSQL と Mailpit を起動
docker compose up -d

# 3. 環境変数を設定
cp .env.example .env.local

# 4. マイグレーションとシード（管理者・一般ユーザー・5部門・サンプル枠と希望）
pnpm db:migrate
pnpm db:seed

# 5. 開発サーバーを起動（server と web を並列起動）
pnpm dev
```

起動後、<http://localhost:3000> を開きます。

| URL                     | 内容                                                  |
| ----------------------- | ----------------------------------------------------- |
| <http://localhost:3000> | Web（Vite 開発サーバー。`/api` は 3001 番へプロキシ） |
| <http://localhost:3001> | API サーバー                                          |
| <http://localhost:8025> | Mailpit（ワンタイムコードのメール確認）               |

### 開発用ログイン

ローカルでは Microsoft アカウントを使わず、ログイン画面の「テストアカウントでログイン」から、`db:seed` で投入されたアカウントを選んでログインします（パスワード不要）。

テストアカウントには、管理者（2人）、一般ユーザー（単一部門／複数部門掛け持ち）、初回ログイン未確認のユーザー、希望入力が不要な役職のみのユーザー、未登録ユーザー（拒否確認用）が含まれます。

開発用ログインは、次の条件をすべて満たす場合にのみ有効になります。

- `AUTH_DEV_LOGIN=true`
- `NODE_ENV=development`
- `AUTH_URL` がローカルホスト

> **注意:** 本番の Secret や環境変数には `AUTH_DEV_LOGIN` を絶対に設定しないでください。

## 環境変数

[.env.example](.env.example) を `.env.local` にコピーして使います。

| 変数                                                            | 説明                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| `DATABASE_URL`                                                  | PostgreSQL への接続文字列                             |
| `AUTH_SECRET`                                                   | Auth.js のシークレット（本番では必ず安全な値に変更）  |
| `AUTH_URL`                                                      | アプリの公開URL（ローカルは `http://localhost:3000`） |
| `AUTH_DEV_LOGIN`                                                | 開発用ログインの有効化（ローカル専用）                |
| `AUTH_MICROSOFT_ENTRA_ID_ID` / `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Entra ID のクライアントID／シークレット（本番のみ）   |
| `ALLOWED_TENANT_IDS`                                            | ログインを許可するテナントID（本番のみ）              |
| `SMTP_URL`                                                      | ワンタイムコード送信用 SMTP（ローカルは Mailpit）     |
| `PORT`                                                          | API サーバーのポート（既定 `3001`）                   |

## スクリプト

| コマンド                            | 内容                           |
| ----------------------------------- | ------------------------------ |
| `pnpm dev`                          | server と web を並列で開発起動 |
| `pnpm dev:server` / `pnpm dev:web`  | 片方だけ起動                   |
| `pnpm build`                        | web → server の順にビルド      |
| `pnpm start`                        | ビルド済みサーバーを起動       |
| `pnpm lint`                         | ESLint                         |
| `pnpm format` / `pnpm format:check` | Prettier による整形／チェック  |
| `pnpm typecheck`                    | 全ワークスペースの型チェック   |
| `pnpm test`                         | Vitest を一括実行              |
| `pnpm test:watch`                   | Vitest をウォッチモードで実行  |
| `pnpm test:coverage`                | カバレッジ付きでテスト         |
| `pnpm db:migrate`                   | マイグレーション適用           |
| `pnpm db:seed`                      | シードデータ投入               |

スキーマを変更したときは、`server` で `pnpm db:generate` を実行してマイグレーションを生成し、`pnpm db:migrate` で適用します。

## 自動割り当ての概要

ユーザー × シフト枠の 0/1 変数による整数計画を HiGHS で解きます。

- **ハード制約:** 「入れない」時間帯に割り当てない／同一時間帯の重複割り当てなし／枠の最大人数を超えない／登録された部門の枠のみ
- **ソフト制約（ペナルティ）:** 最低人数の充足、総勤務時間を目標に近づける（上限超過は大きなペナルティ）、「入りたい」の優先、負担の偏りの軽減
- 人数不足などで解けない枠があっても停止せず、不足枠として一覧表示します。
- 手動で固定した割り当ては、再実行時も固定値として扱われます。

## 本番環境

- 公開URL: `https://hr.nara-kosensai.com`（VPS 上の k3s、Traefik Ingress + cert-manager）
- Microsoft Entra ID のリダイレクトURI: `https://hr.nara-kosensai.com/api/auth/callback/microsoft-entra-id`
- サーバーは API とビルド済み SPA の静的配信を1プロセスで担当します。
- 認可はすべてサーバー側で判定します（ログイン可否はメール事前登録とテナントID許可リストで検証）。

デプロイ前に `pnpm build` が通ることを確認してください。

## 開発の流れ

1. ブランチで作業し、コミット前に `pnpm lint` / `pnpm format:check` / `pnpm typecheck` / `pnpm test` を通す
2. 要件の変更は [PLAN.md](PLAN.md) に反映する
