# CLAUDE.md

このファイルは、Claude Code がこのリポジトリで作業する際に必ず守るべきルールです。

## ドキュメントの正本
- **Notionが正本。`docs/` は実装参照用の写し。**
- 競合したらNotionを優先する。`docs/` の記述を根拠に
  仕様を判断しない。
- `docs/DECISION_LOG.md` `SESSION_STATE.md` への追記は
  作業中の暫定記録。**セッション終了時に必ずNotionへ反映する**
  （反映前の `docs/` は未確定扱い）。
- 詳細：Notion `00_shared/ドキュメント運用規約`

## Notion ページID（このリポジトリの書き戻し先）

書き戻す先（記入・移動の実績があるページ）：

| ページ | ID | 用途 |
|---|---|---|
| `_tasks/進行中` | `39da8a5dfd4581a091f0ce2d0d6dcdfd` | タスクページの確認事項・実装結果を記入する（個別タスクページのIDは都度チャットで指定される） |
| `_tasks/完了済み` | `39da8a5dfd4581f3904edda4ad2b0c79` | 完了したタスクページの移動先 |
| コアコンセプト（正本・最重要） | `3a5a8a5dfd4581a7b73ce0eb6541635e` | 設計思想の正本。改訂注記の書き込み先 |
| 掴み体験仕様_隊商護衛と戦闘 | `399a8a5dfd4581838726dc8b2de703d3` | 戦闘仕様の検討記録。注記の書き込み先 |

参照する先（読み取りのみ）：

| ページ | ID |
|---|---|
| 遠征ギルドログ（プロジェクトルート） | `399a8a5dfd45819d8d8aca0c86f9aade` |
| `_tasks`（実装タスク） | `39da8a5dfd4581159f9fdfb6b6e37f35` |
| `00_shared/ドキュメント運用規約` | `3a9a8a5dfd458160bffcd90e48bf5b08` |

⚠️ 検索で「DECISION_LOG（設計判断の記録）」というNotionページがヒットするが、それは**別企画（IGPJ_02 天使様）のページ**であり、このリポジトリの書き戻し先ではない。名前が似たページはIDで確認してから書き込むこと。

## プロジェクト概要

「遠征ギルドログ Mock」は、ローカルで動く HTML/CSS/JavaScript のモックです。
ロジックのほぼ全てが `app.js` に集約されています。ビルドステップはありません。

- `app.js`：データ定義・状態管理・ログ生成ロジック・画面描画すべてを含む本体
- `index.html` / `style.css`：画面側
- `CURRENT_SPEC.md`：現状の仕様まとめ
- `NEXT_TASKS.md`：既知課題・後回しタスク

## 作業の進め方（最重要）

- **1回の対応につき1機能・1修正**。複数機能を一度にまとめて実装しない。
- **既存構造をなるべく維持**し、**最小差分を優先**する。
- **大規模リファクタリングは禁止**。関数の分割・統合・設計変更は指示がない限り行わない。
- 新しいテンプレート方式・共通化関数などを勝手に導入しない（既存の `pickOne` / `pickTensionOne` パターンに合わせる）。
- 修正の目的が「ログの自然さ・整合性の向上」であって「ログ量の追加」ではない場合、新しい文言を大量に足さない。

## 実行・確認について

- コード変更後は `node --check app.js` で構文確認を行ってよい。
- 開発サーバーの起動、パッケージの追加インストール、Git操作（commit/push等）は指示がない限り行わない。
- README の更新は指示がない限り行わない。

## 出力ルール

- 常に日本語で回答する。
- 作業完了時は「変更したファイル」と「確認手順」だけを簡潔に伝える。前置きや長い説明文は不要。
- コード変更をしない依頼（構造把握・レビュー・調査など）のときは、指示がない限り絶対にコードを変更しない。

## app.js の構造（現状）

### データ定義
- `masterQuests`：依頼の定義（id, title, category, danger, area, recommended, tags, observationTarget, tensionBase/tensionRange, summary）
- `masterItems`：支給品の定義
- `masterAdventurers`（相当データ）：冒険者データ。weapon / accessory / obsession / traits / stats を持つ
- `masterObservations`：観察対象（図鑑）の元データ

### ログ生成の中心
- `generateReport(expedition)` が司令塔。`quest.id` で分岐し、依頼ジャンルごとに専用の `generate*Logs()` 関数（例: `generateBattleLogs` / `generateBarnHuntLogs` / `generateBridgeRepairLogs` など）を呼ぶか、`questEventPools` / `lifeQuestEventPools` を使った汎用フローに乗せる。
- `generateHighlight(quest, party, itemIds, departConditions, result, rng)` がハイライト文生成の中心。quest.id / category で分岐し、最後に result 別のフォールバックに落ちる。

### 人数・主体表現
- `isSoloParty` / `isSoloHumanParty` / `isCompanionParty`（人間1人＋エルシー）/ `isMultiHumanParty` / `partySubject` / `usesSoloHumanStyle` で編成パターンを判定する。
- 新しいログを書くときは、ソロ・人間1人+エルシー・複数人のパターンで「一行」「仲間」「互いに」等の主語が不自然にならないか必ず確認する。

### エルシー（犬の特別冒険者）
- `elsiePartyLogText()`：依頼ごとのプールからエルシーの1行を選ぶ。犬らしい行動のみに留め、人間の行動（記録する・説明する・声をかける等）をさせない。
- `withElsieLog(report, quest, party, rng)`：`elsiePartyLogText` を報告書に追記するラッパー。
- **重要**：依頼専用の `generate*Logs()` 関数内で既にエルシーのログをインライン挿入している場合、`generateReport` 側でその依頼の分岐に `withElsieLog(...)` を重ねて使わない（二重・三重出力の原因になる）。新しい依頼ジャンルを追加するときは、インライン挿入か `withElsieLog` かのどちらか一方に統一すること。

### 緊張度（tension）
- `tensionBase` / `tensionRange` を持つ依頼のみ `computeTensionValue` / `tensionToLevel` が働く。
- `pickTensionOne` / `pickTensionLines` で緊張度に応じた文言を選ぶ。
- 低緊張の生活依頼（結婚式の手伝い等）に、戦闘・護衛・救助寄りの緊張感が高い文言（退路・負傷者・危険・制した、等）を混ぜない。

### 支給品
- `canUseItemInQuest(quest, itemId, weather)` の `allowedByQuest` で依頼ごとに使用可否を管理する。新しい依頼を追加したら、ここに許可アイテムを追加する。

## 新しい依頼ジャンルを追加するときの最小差分ポイント

1. `masterQuests` に1件追加
2. 専用の `generate*Logs()` 関数を新規作成（既存の似た依頼の関数を参考にする。既存関数の改造ではなく新規関数として作る）
3. `canUseItemInQuest` の `allowedByQuest` に許可アイテムを追加
4. `generateReport()` に `quest.id` 分岐を追加し、上記関数を呼ぶ。エルシーのログ方針（インライン or withElsieLog）を決めて統一する
5. 必要なら `generateHighlight()` に専用分岐を追加（なくても汎用フォールバックで動く）

## 今はやらない前提の大きな変更（指示がない限り着手しない）

- 報告書データ構造（`report.logs`）の刷新、二視点（主観/客観）UI化
- ハイライト生成のログ全文解析アルゴリズム化
- tension による文体の崩壊演出（三人称→主観混入など）
- 依頼チェーン・地域進行度などのメタ構造
- 5依頼分の `generate*Logs` を共通ジェネレーターへ統合する等の大規模リファクタリング


## 作業終了時のドキュメント更新ルール

1つの機能の実装・修正が完了し、検証（動作確認）も通った時点で、
実装コミットとは別に、以下を必ず行うこと。

### 手順
1. NEXT_TASKS.mdを開き、以下を追記する（最大3行まで、簡潔に）
   - 今回完了した内容（1行）
   - 作業中に見つかった「次にやった方がよさそうなこと」（あれば、1〜2行）
   - 保留にした判断・人間の確認待ちの項目（あれば、1行）
2. 今回の変更がCURRENT_SPEC.mdの内容に影響する場合のみ、該当箇所を更新する
   （影響がなければCURRENT_SPEC.mdは触らない）
3. ドキュメント更新は実装コミットに混ぜず、必ず別コミットにする
   コミットメッセージ例: docs: update NEXT_TASKS after [作業内容]

### 禁止事項
- NEXT_TASKS.mdへの追記を4行以上にしない
- ドキュメント更新のついでにコードを触らない
- CURRENT_SPEC.mdを「念のため」全体的に書き直さない
