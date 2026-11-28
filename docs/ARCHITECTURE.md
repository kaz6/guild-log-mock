# ARCHITECTURE.md

> **このファイルの扱い**：repo が正本。Claude Code が書いて、Claude Code が読む（2026-11-28・P-021）。**コードが事実の正本**で、ここは「どこを開くか」の地図。食い違ったらコードが正で、ここを直す。
> ★ 行番号は書かない（すぐずれる）。探すときは関数名で `grep -n "関数名" app.js` する。決まりは `CLAUDE.md`、経緯・理由は `docs/CLAUDE_NOTES.md`。

`app.js` は約1.2万行・1ファイルで、分けない（Unity で作り直す前提のモック。大規模リファクタリングは禁止）。**全文を読まずに、下の名前で検索して該当の所だけ開く。** ビルドなし。`index.html` が `data-*.js` → `app.js` の順に読み込む（順は `index.html` の `FILES`）。

## app.js を役割で分ける（先頭から末尾へ、おおよその並び）

| 役割 | 主な名前 | 何を触るならここ |
|---|---|---|
| 設定・時間・金・在庫 | `DEV_MODE` `STORAGE_KEY` `QUEST_DURATION_BANDS` `DEMO_SPEED_OPTIONS` `MONEY_RULES` `moveMoney` `settleNegativeMoney` `stockCount` `planExpeditionSupplies` | 所要時間・加速・金・在庫・買い出し・行き止まり（`isDeadEnd`／`settleDeadEnd`） |
| 固有依頼の連鎖・受付嬢の相談 | `bondChainEntries` `currentBondEntry` `RECEPTION_TALKS` `STICKY_NOTES` | 相談→固有依頼→感謝（台本は `data-bonds.js`）。付箋・受付嬢の一言 |
| 状態と保存 | `createInitialState` `loadState` `saveState` `normalizeExpeditions` `bindRecord` `restoreBoundRecord` | セーブの形・読み込み時の補正・綴じた記録。★ 形を変えたら `loadState` 側で古いセーブを移す |
| 成長・過去・掛け合い | `GROWTH_*` `applyGrowthGain` `appendGrowthLogToReport` `appendPastSignalToReport` `generatePartyBanterLog` `generatePresenceLog` | 帰還の処理（報告書のあとに足す行）。`data-past.js` |
| 編成の判定・負傷 | `isSoloParty` `isCompanionParty` `isMultiHumanParty` `partySubject` `applyInjuriesFromReport` `settleMissingDeaths` | 人数に応じた主語。負傷・行方不明 |
| 遠征の進行 | `startExpedition` `completeExpeditionIfDue` `checkExpeditionCompletion` | 出発→帰還。帰還時に `generateReport` が呼ばれる |
| 画面（描画） | `render` `renderInterview` `renderHome` `renderQuests` `renderAdventurers` `renderResult` `renderReportDetail` `renderEcologyRecord` `renderLedger` | `render()` が `route` で振り分ける。HTML は文字列で組む（`*Html` 関数） |
| ホームの部屋 | `ROOM_OBJECTS` `ROOM_PARTS` `ROOM_MENUS` `buildRoomView` `syncRoomView` `roomObjectsHtml` `roomShadow` | 押せる枠（絵の上の％）・パーツ・季節と時刻の層・影。絵は `assets/home/` |
| 掲示板・名簿・生態目録 | `buildBoardQuests` `questBoardVisibility` `isQuestUnlocked` `suppliesPanelHtml` `adventurerListCardHtml` `ecologyRecord*` | 依頼の出し方・解放条件・支給品の選択・名簿・記入型の生態目録 |
| 乱数・文の選び方・緊張度 | `makeRng` `pickOne` `pickTensionOne` `pickTensionLines` `computeTensionValue` `tensionToLevel` | ログの文を選ぶ共通部品。★ 新しい選び方を勝手に増やさない |
| 汎用の出来事文 | `generateWeatherLog` `roadEventText` `workEventText` `personalEventText` `supplyEventText` `canUseItemInQuest` | 道中・作業・人物・支給品の行。`canUseItemInQuest` の `allowedByQuest`（依頼ごとの許可。既定は全禁止） |
| 結末文 | `questOutcomeText` `outcomeText` `OUTCOME_CONDITIONS` | 本文は `data-outcomes.js`（`data-quests.js` の `outcomes` と対） |
| 観察記録 | `generateObservationNotes` `generateAdventurerObservationNote` `generateKindObservationNote` `OBSERVATION_KIND_NOTES` | 観察対象のある依頼。3段階（専用分岐→種別→受け皿）。検査は `scripts/check-observation-targets.js` |
| 報告書の生成（司令塔） | `generateReport` `generateReportBody` `finalizeQuestReport` `generateShoppingReport` `generateReliefReport` | `quest.id` で分岐し、依頼別の `generate*Logs` か共通経路へ |
| 依頼別の報告 | `generateBattleLogs` `generateBarnHuntLogs` `generateBridgeRepairLogs` `generateCaravanEscortLogs` `generateSteleRubbingLogs` ほか `generate*Logs` | 新しい依頼ジャンルは**新規の `generate*Logs` を足す**（既存を改造しない）。エルシーは `elsiePartyLogText`／`withElsieLog` |
| ハイライト | `generateHighlight` | 依頼・結果ごとの一行。最後に結果別のフォールバック |
| 戦闘エンジン | `BATTLE_TUNING` `simulateBattle` `computeBattleForecast` `computeBattleResolveDecision` `getEnemyForQuest` | 数値を変えたら `scripts/measure-battle.js`（結末分布）。敵は `data-enemies.js` |
| 工程エンジン（非戦闘の共通経路） | `FIELDWORK_TUNING` `simulateFieldwork` `resolveFieldwork` `drawFieldworkHook` `fieldworkLogLines` | 非戦闘依頼の工程・結末の段階。`measure-fieldwork.js` |
| 起動（ファイルの最後） | `setInterval` ／ `render()` | ★ 新しい定数・エンジンは、この起動より**前**に置く（後ろだと初回描画で未初期化の例外になる） |

## DEV_MODE（?dev=1）

`?dev=1` のときだけ効く（`const DEV_MODE`）。公開用は `/`、デバッグ用は `/?dev=1`。時間加速（`getDemoSpeed`）・時間帯／天候の切り替え・「Mock用」ボタン・Mock初期化・ホームの季節と時刻のつまみは、`?dev=1` なしでは出さず、効かせない。`data-dev-only` 属性の要素が `?dev=1` で表示される。

## data-*.js（マスターデータ。`window.master*`）

- `data-quests.js` 依頼（`masterQuests`・`masterPlaces`）／`data-outcomes.js` 結末文／`data-enemies.js` 敵
- `data-adventurers.js` 冒険者／`data-past.js` 冒険者の過去／`data-bonds.js` 固有依頼の連鎖
- `data-items.js` 支給品／`data-money.js` 金と在庫の値（仮置き）／`data-time.js` 所要時間の帯／`data-vocab.js` 判定用語彙

## その他のディレクトリ

- `scripts/` 外部依存ゼロの検査・測定・生成（`measure-*.js` は DevTools に貼る／`gen-*.js`・`check-*.js` は `node` で回す）
- `tools/` 外部依存（playwright）を持ってよい置き場。`sweep.js`（検証の土台）・`report-texts.js`（報告書の書き出し）・`voice-lines.js`・`voice-check/`（口調の検査）・`notation-table.json`（表記の表）
- `tools/tests/` `current/`（全部緑であるべき試験）・`acceptance/`（受け入れ。未実装は `fixme`）・`fixtures/`（対比較の基準 `report-baseline.json` ほか）・`helpers/`
- `trial/` テスター用の凍結コピー。**手で直さない**（作り直しは `node scripts/make-trial.js` を単独の PR で）
- `docs/` 仕様の正本 `CURRENT_SPEC.md`・記録 `DECISION_LOG.md`／`SESSION_STATE.md`・素材の出典 `CREDITS.md`・経緯 `CLAUDE_NOTES.md`・`archive/`（棚卸しの全文）・`backup/`（Notion 正本の写し）
- `assets/` 画像（`home/` 部屋の絵と層・パーツ、`icons/`、`portrait/`）／`mockups/` 見た目の試作／`.claude/` フック・スキル・エージェント／`.github/workflows/` pr-review ほか
