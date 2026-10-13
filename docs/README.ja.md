# Graphune

![Obsidian](https://img.shields.io/badge/Obsidian-%3E%3D1.8.7-blueviolet)
![License](https://img.shields.io/badge/license-MIT-green)

知識を調律する。GraphuneはVault内の見出しを、Obsidian Canvas上の空間的でつながりのあるワークスペースへ変換する。

> 0.1.2から、Community Directoryの要件に合わせてObsidianプラグインIDを`graphune`へ変更した。旧`obsidian-heptabase`配下の設定は初回起動時に取り込む。

[English](../README.md)

## Graphuneが解くこと

Vault内の見出しセクションを抽出してCanvas上に個別のノートとして配置する。Markdownを正本に保ったまま、Canvasを空間的な思考面として利用できる。

## 機能

- **サイドバー見出しエクスプローラー** — 右サイドバーで全ノートと見出し階層を閲覧
- **デバウンス付き検索** — リアルタイムでノートをタイトルで絞り込み
- **ライブラリフィルター** — Vaultを再読込せず、タグ・フォルダで絞り込み、更新日時・タイトルで並べ替え
- **Canvas へドラッグ&ドロップ** — 見出しを開いている Canvas にドラッグして新規ノートを作成
- **スマートなコンテンツ抽出** — ネストされた見出しを含むセクション全体を自動抽出
- **自動ファイル作成** — サニタイズされたファイル名で新規ファイルを作成し、名前の衝突も自動処理
- **ノードサイズの設定** — Canvas ノードのデフォルトの幅と高さを設定可能
- **出力先の設定** — 抽出ノートの保存フォルダとファイル名プレフィックスを指定可能
- **エッジのバックリンク同期** — Canvasのファイルノード間に引いた接続とMarkdownバックリンクを同期
- **英語・日本語UI** — Obsidianの言語に追従するか、使用言語を明示的に選択
- **抽出元の記録** — 新しい概念カードに元ノート・見出し・Canvas・抽出日時を記録
- **カードコンテキスト** — 現在のカードの抽出元・バックリンク・配置先Canvasを表示
- **Canvasから記事へ移動** — Canvas上のファイルノードを選択してサイドバーエディタで開く
- **Canvas内検索とフォーカス** — 現在のCanvasにあるカード・テキスト・グループ・リンクを検索してズーム
- **Canvas選択ツール** — 選択カードの整列・等間隔配置・接続・グループ化と、同期されたUndo/Redoに対応
- **高速カード作成** — 重ならないカードを作成し、フォーカス済みタイトル欄ですぐ命名
- **キーボードアクセシブル** — 完全なキーボードナビゲーション対応

## インストール

### 手動インストール

1. このリポジトリをクローンまたはダウンロード
2. 依存関係のインストールとビルド：
   ```bash
   pnpm install
   pnpm build
   ```
3. `main.js`、`manifest.json`、`styles.css`（存在する場合）を Vault のプラグインディレクトリにコピー：
   ```
   <vault>/.obsidian/plugins/graphune/
   ```
4. Obsidian を再起動し、設定 > コミュニティプラグイン でプラグインを有効化

## 使い方

1. Obsidian で Canvas を開く
2. リボン（左サイドバー）の **list-tree** アイコンをクリックして Heading Explorer を開く
3. エクスプローラーパネルでノートを閲覧または検索
4. ノートを展開して見出し階層を確認
5. 見出しを Canvas にドラッグ — 抽出されたセクション内容で新規ノートが作成される

Canvas上で複数ノードを選択し、Obsidianのコマンドパレットから整列・等間隔配置を実行できる。整列には2ノード、等間隔配置には3ノード以上が必要。

**Create new card**コマンドでは、表示中のCanvas中央へ選択済みカードを作成する。Canvasの空白をCmd/Ctrl + ダブルクリックすると、その位置へ作成できる。作成後はタイトル全体が選択されるため、入力すると`Untitled`を即座に置き換えられる。

## 設定

| 設定項目 | 説明 | デフォルト |
| --- | --- | --- |
| 抽出ファイルの保存先 | 抽出した見出しファイルの保存先。空の場合は元ファイルと同じフォルダー | _(空)_ |
| ノードの既定幅 | 新しいCanvasノードの幅（200〜800） | 400 |
| ノードの既定高さ | 新しいCanvasノードの高さ（100〜600） | 300 |
| ファイル名の接頭辞 | 抽出ファイル名に付ける接頭辞 | _(空)_ |
| 作成前にプレビューを表示 | ファイル作成前に抽出セクションを確認 | オフ |
| クイックカードの既定タイトル | ダブルクリックで作るカードの初期タイトル | `Untitled` |
| エッジ同期を有効化 | Canvas上でファイルノードを接続したときバックリンクを書き込む | オン |
| 既定のエッジ色 | 新しいエッジへ適用する色 | Obsidian既定 |
| 既定のエッジラベル | 新しいエッジへ適用するラベル | _(空)_ |
| 言語 | Obsidianの設定に追従、または英語・日本語を明示的に選択 | システム設定 |

## 開発

UI変更は[UX principles](UX_PRINCIPLES.md)に従う。なめらかさとデザイン品質を、このプラグインのリリース基準として扱う。

ユーザー向け文言はコンポーネントへ直書きせず、`src/i18n/index.ts`へ追加する。英語を正本とし、すべてのキーに日本語訳を用意する。言語変更は開いているGraphuneビューへ即時反映され、コマンド名とリボンのラベルはプラグイン再読み込み後に更新される。

### 前提条件

- [Node.js](https://nodejs.org/)（LTS）
- [pnpm](https://pnpm.io/)

### セットアップ

```bash
pnpm install
```

### コマンド

```bash
pnpm dev        # ウォッチモードでビルド
pnpm build      # プロダクションビルド
pnpm test       # テスト実行
pnpm lint       # oxlint でリント
pnpm format     # oxfmt で自動フォーマット
```

### Obsidian実機テスト

プラグインをビルドし、既存Vaultを変更せずにサンプルノート・Canvas・このプラグインへのリンクを持つ専用Vaultを作成する：

```bash
pnpm build
pnpm setup:device
pnpm open:device
```

初回のみObsidianの「保管庫としてフォルダを開く」から `.dev/ux-audit-vault` を選び、ローカルVaultを信頼して `Graphune` を有効化する。以後は `pnpm open:device` で直接開ける。

`UX監査Canvas.canvas` と `UX監査チェックリスト.md` を使い、ライト・ダーク、狭幅、キーボード、検索、ドラッグ&ドロップを確認する。反復開発中は `pnpm dev` を実行する。Hot Reloadを使わない場合は、Obsidianの「設定 → コミュニティプラグイン → プラグインの再読み込み」で最新ビルドを反映する。

### 0.1.1以前からの移行

Community Directoryでは、ID変更を同じプラグインの更新として扱えない。旧Graphuneを無効化し、0.1.2を`.obsidian/plugins/graphune/`へインストールしてからGraphuneを再度有効化する。新ID側に設定がない場合に限り、初回起動時に`.obsidian/plugins/obsidian-heptabase/data.json`を取り込む。

手動・開発環境では次のコマンドで設定コピーと`community-plugins.json`のID置換を実行できる。

```bash
pnpm migrate:legacy -- --vault <vault-path>
```

旧プラグインフォルダは削除せず、`community-plugins.json`のバックアップも作る。0.1.2の動作確認後に旧フォルダを削除すること。旧IDに属するWorkspace配置は一度開き直す必要がある場合があるが、ノートとCanvasは変更しない。

## コントリビューション

コントリビューションの詳細は[CONTRIBUTING.md](../CONTRIBUTING.md)を参照する。[Issue](https://github.com/Chazutsu/graphune/issues)の作成やプルリクエストも歓迎する。

1. リポジトリをフォーク
2. フィーチャーブランチを作成（`git checkout -b feature/my-feature`）
3. 変更を加え、テストを追加
4. `pnpm test && pnpm lint` で検証
5. プルリクエストを送信

## ライセンス

[MIT](../LICENSE)

## 謝辞

[Heptabase](https://heptabase.com/) とそのビジュアルナレッジ管理のアプローチに触発されました。
