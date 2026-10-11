> 2026-10-11 の `/claude-api prompt-audit` の報告（全文）。**行番号は `c6f2a5f` 時点**。比較と適用の結果は `2026-10-11-prompt-audit-diff.md`。
> パッチ3本はリポジトリに入れていない（事実の訂正を当てたので、残りは棚卸しの①②の後に作り直す）。

# prompt-audit 報告（guild-log-mock の Claude Code 設定）

実施：2026-10-11 21:37 JST ／ HEAD `c6f2a5f`（作業ツリーは綺麗。このセッションの作業ブランチは上流を追跡していないため、origin との一致は確かめていない）

## 前提

- **範囲**：`CLAUDE.md`（ルート直下。インポートなし）、`.claude/skills/session-end/SKILL.md`、`.claude/skills/js-bug-fix-loop/SKILL.md`、`~/.claude/skills/session-start-hook/SKILL.md`（ユーザー階層のスキル。**全プロジェクトに効く**）。
  - 存在しなかったもの：`CLAUDE.local.md`／`AGENTS.md`／`.claude/CLAUDE.md`／`~/.claude/CLAUDE.md`／祖先ディレクトリの指示ファイル／`rules/`・`commands/`・`agents/`・`output-styles/`（プロジェクト側にもホーム側にもない）／管理ポリシーの CLAUDE.md（`/etc/claude-code` なし）。
  - 報告のみの対象：`~/.claude/skills/synced/…`（組織から同期される `anthropic-skills:*`。プラグイン扱い）。`~/.claude/plugins/synced` は空。
  - 読んでいないもの：settings ファイル、`.mcp.json`、`~/.claude.json`。
- **対象モデル**：このセッションを動かしているモデル（Opus 5.5）。モデルを固定しているスキルはない。
- **来歴**：clone が浅い。`^5d8a267`（2026-09-17）が境界コミットなので、その日より前の行は `git blame` では順序が付けられない。下の2件の衝突を `flag` にとどめたのはこのため。

## 要約

影響の大きい順に3点：

1. **CLAUDE.md の「データは app.js にある」という記述は事実と違う。** `masterQuests`／`masterItems`／`masterAdventurers`／`masterEnemies` は `data-*.js` 側で `window.*` として定義されている。概要（81-83行）、構造（428-433行）、新しい依頼を足す手順の1（465行）の3か所が、エージェントに app.js を探させる書き方になっている。しかも 248 行では、この同じファイルが `data-*.js` に `node --check` をかけている。
2. **セッションごとに読み込まれる本文に、「旧記述は○○だった」型の移行の名残と保守メモがたまっている。** モデルが一度も見ていない旧版との差分として書かれた行が8か所ある（Group 1d・Group 2）。session-end には修正履歴が39行あり、スキルを呼ぶたびに読み込まれる。
3. **ユーザー階層の session-start-hook スキルは自己矛盾している。** 「最初は async を使わない」（75行）と書きながら、雛形（89行）が async の JSON を出し、締めの文（149行）は「同期で動かした」と報告させる。

件数：Group 1＝11（1a：2・1c：2・1d：7）／Group 2＝9（古くなった事実：5・矛盾：2・履歴：1・保守メモ：1）／Group 3＝0（ツール定義なし。2つのスキルの description はルーティング文で、keep-list 6 により対象外）／Group 4＝適用外（API を呼ぶコードなし）。

## 所見（確度の高い順）

| # | 場所 | 根拠となる本文 | パターン | 古くなった理由 | 確度 | 対応 |
|---|---|---|---|---|---|---|
| 1 | CLAUDE.md:81-83 | 「ロジックのほぼ全てが `app.js`…」「`app.js`：データ定義・…すべてを含む本体」 | G2 古くなった事実 | 定義は `data-quests.js:20` などにあり、`window.master*` として置かれている | 高 | rewrite（01） |
| 2 | CLAUDE.md:430-433 | 「### データ定義」の下に `masterQuests`／`masterItems`／`masterAdventurers` を並べている | G2 古くなった事実 | 同上。この節は見出しが「app.js の構造」 | 高 | rewrite（01） |
| 3 | CLAUDE.md:465 | 「1. `masterQuests` に1件追加」 | G2 古くなった事実 | 追加する先は `data-quests.js` | 高 | rewrite（01） |
| 4 | CLAUDE.md:444 | `generateHighlight(quest, party, itemIds, departConditions, result, rng)` | G2 古くなった事実 | 実物は `app.js:6962` で、第7引数 `usedItemIds` がある | 高 | rewrite（01） |
| 5 | CLAUDE.md:146 | 「依頼17件のロードまで確認」 | G2 古くなった事実（ファイル内で矛盾） | 291 行と `data-quests.js` では22件。この確認は実機で取り直していないので、数字を外すだけにする | 高 | rewrite（01） |
| 6 | ~/.claude/skills/session-start-hook/SKILL.md:75／89／149 | "Don't use async mode in the first iteration" と、雛形の `echo '{"async": true…}'`、"Hook execution mode: Syncronous" | G2 矛盾（同じファイルの中） | 手順どおりに作ると async の hook ができあがり、そのうえで「同期」と報告することになる | 高 | rewrite（03・**全プロジェクトに影響**） |
| 7 | CLAUDE.md:182-183 | 「※ 参考（2026-09-28）：current 53件…」「この行は古くなる」 | G2 変わりやすい具体値 | 173 行の「件数はここに書かない」と同じコミット（0e3bb453）で、作者が意図して添えた参考値。とはいえ自分で「古くなる」と書いている数字で、173 行の規則とも噛み合わない | 中 | remove（01） |
| 8 | CLAUDE.md:7-8 | 「（2026-08-01 に運用規約が訂正された）」「『Notionが正本』とだけ覚えないこと。そう読んだせいで…」 | G1d 移行前提の言い回し | 直後の表が規則そのものを示している。モデルが知らない旧規則を前提にした言い方になっている | 中 | rewrite（01） |
| 9 | CLAUDE.md:90 | 「『一度に1つ』は『判定できる変更は並列でよい』に変わった」 | G1d | 旧規則を名指しすることで、存在しない選択肢があるように読める。理由（93行）は残す | 中 | rewrite（01） |
| 10 | CLAUDE.md:139-140 | 「旧記述の『package.json がなく…』は事実でなくなった」 | G1d | 今の事実は 138 行で言い切れている | 中 | remove（01） |
| 11 | CLAUDE.md:173-174 | 「旧記述の『current 13件…』は…古くなっていた」 | G1d | 規則の本体は「件数を書かない」。理由だけ残す | 中 | rewrite（01） |
| 12 | CLAUDE.md:266 | 「旧記述の『5秒固定／10秒固定』は、いまの画面には無い」 | G1d | 265 行が今の3段階を言い切っている | 中 | remove（01） |
| 13 | CLAUDE.md:290 | 「（★ 2026-09-13 に実測で直した。旧記述の『15件』は古い）」 | G1d | 291 行に今の件数がある | 中 | remove（01） |
| 14 | CLAUDE.md:437-438 | 「旧実装は②③が無く…納屋が実際にこれに落ちていた」 | G1d | ②③がなぜあるかを、今の規則として言い直す | 中 | rewrite（01） |
| 15 | CLAUDE.md:440 | 「`masterObservations` は存在しない（…旧記述を訂正した）」 | G1d／G1c（起きない失敗への禁止） | プロジェクト内のコード・md のどこからも参照されていない（DECISION_LOG／REJECTED_INDEX は除外して grep）。誤りの元になった旧記述はもう消えている | 中 | remove（01） |
| 16 | CLAUDE.md:114, 345 | 「※ この運用は…マスターの④-bに反映済み」「※ マスター…には…反映済み／未反映」 | G2 履歴の記述 | Notion のマスターとの同期状況は保守する人向けのメモで、エージェントへの指示ではない | 中 | remove（01） |
| 17 | session-end/SKILL.md:8, 608-646 | 「配布状況：…」と「# 修正履歴」39行 | G2 履歴の記述 | スキルを呼ぶたびに読み込まれる。決めたこと自体は本文にすでにあり、履歴はマスターと git にある | 中 | move（01）※下の注を参照 |
| 18 | js-bug-fix-loop/SKILL.md:30-32 | 1周目／2周目／3周目の箇条書き | G1c 繰り返しによる念押し | 28 行の「最大3周まで」と、34 行の節で言っていることの繰り返し | 中 | rewrite（01） |
| 19 | CLAUDE.md 全体（★ 73個）／session-end（★ 158個） | 「★ **…**」 | G1a 圧力語の密度 | ほぼ全行に印が付いていて、印が情報になっていない。太字・⚠️・理由の文は残し、★ だけ外す | 中 | rewrite（02・**別パッチ**） |
| 20 | session-start-hook:126,130,134 | 「IMPORTANT:」×3 | G1a | 理由のない大文字の強調 | 中 | rewrite（03） |
| 21 | session-start-hook:57 | "Make a todo list for all the tasks in this workflow…" | G1b/1c 段取りの指図 | 今のモデルは言われなくても段取りを組む。言うと計画を立てすぎる方向に働く | 中 | remove（03） |
| 22 | CLAUDE.md:103 と 105／109-112 | 「Git操作（commit/push等）は指示がない限り行わない」と、「wrap-up で…コミット…push する」「その場で main へマージして配信する」 | G2 矛盾 | 103 行は境界コミット（09-17）、109 行は 09-22 で、順序は付く。ただ古い側が禁止で、新しい側がそれを緩めているので flag にとどめる。**決めること**：103 行に「下の配信運用と wrap-up は例外」と書き足すかどうか | — | flag |
| 23 | session-end/SKILL.md:214, 605（と 68） | 「毎回まるごと置き換える（EX-110）」と、225 行「一致を確認できた場合は、差分更新でよい」 | G2 矛盾 | 該当行はすべて境界コミットに入っていて、blame では順序が付けられない（本文に書かれた日付は、新旧の根拠に使わない）。CLAUDE.md:21 は「条件を満たすときは差分更新」としている。**決めること**：⑤-b を常に全置換とするか、条件付きで差分更新を認めるか。決めたらマスター側から直す | — | flag |
| 24 | js-bug-fix-loop/SKILL.md:16 | 「mcp__claude-in-chrome の read_console_messages」 | G2 変わりやすい具体値（インストール済みツール） | このクラウド環境にはそのツールがなく、リポジトリの検証は Playwright（`tools/sweep.js`・`tools/tests/`）。ただし、手元にないことは記述が誤っている証拠にはならない | 低 | flag |

確かめた結果、そのままでよかったもの：`scripts/` の 13本・8／5本・`gen-*.js` 4本（いずれも一致）、npm スクリプト4本、本文に出てくるパス（`AI_GUIDELINES.md` とその「壊してはいけない導線」節を含む）、依頼22件／hidden 2件、`state.beastLog`（`app.js:517-520` でまだ移し替えている）、Notion のコマンド名（`update_content`／`insert_content`／`replace_content` は `notion-update-page` の command と一致）。Unity の節と、各スキルの description（ルーティング文）は文脈情報として残す。

### 報告のみ（編集は提案しない）

- **`anthropic-skills:*`（同期されたスキル12ファイル）**：grep で兆候を見ただけ。大文字の強調が pdf に1・pptx に2・skill-creator に3。「think step by step」や旧モデル名はなし。読み込んで監査してはいないので、問題がないとは言えない。

## 提案パッチ（適用していない）

すべて `scratchpad/audit/` に置いてある。

- `01-facts-and-history.patch`：#1-5, 7-18（リポジトリに `git apply --check` が通ることを確認済み）。diff の文脈が重なるため、隣り合う所見は1つの hunk にまとまっている。
- `02-emphasis-markers.patch`：#19。**01 を当てたあとに当てる**（01→02 の順で通ることを確認済み）。体裁だけの変更なので、事実の訂正とは分けて採否を決められる。
- `03-user-level-session-start-hook.patch`：#6, 20, 21。`~` で `git apply` する。⚠️ **全プロジェクトに影響する。** このクラウド環境では `~/.claude` がセッションごとに用意し直されるので、ここで当てても次のセッションには残らない。直すなら配布元で直す。

注（#17・#19 の session-end 分）：このファイルは Notion `02_operations/スキル：session-end` の写しである。写し側だけ直しても、次にマスターと同期したときに戻る。採用するならマスター側から直す必要がある。

## 検証

- 古くなった事実（#1-5, 7）は、上に挙げた実物と照らし合わせて確認した。
- テストやフックは CLAUDE.md の節の**名前**にだけ触れていて（`flow.spec.js`・`hooks.spec.js`・`notion-guard.js`）、本文の文字列を照合してはいない。パッチは節の名前を変えていない。
- 「フックで縛っている規則」の節（55-61行）には手を付けていない。
