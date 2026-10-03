# EX-149：mods と wrap-up がこの環境で効くかの調査（2026-10-03）

> 調査のみ。何も入れていない・何も変えていない。
> 環境：claude.ai/code のリモート（`CLAUDE_CODE_ENTRYPOINT=remote_mobile`、`CLAUDE_CODE_REMOTE=true`、`CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE=cloud_default`）。
> 起動形態は `--output-format=stream-json --input-format=stream-json`（ターミナル UI ではなく、ストリーム入出力で動く起動）。

## 1. 今のセッションの Claude Code のバージョン

- **2.1.288**。実行中のプロセス（`/opt/claude-code/bin/claude`）と PATH 上の `claude` の両方で `--version` を確かめた。
- wrap-up の条件（2.1.277 以降）と mods の条件（ドキュメント上 2.1.287 以降）はどちらも満たしている。
- ⚠️ 環境変数 `CLAUDE_CODE_VERSION` は `2.1.42` になっていて、実行中のバイナリと食い違う。ランナー側の値と思われるが、何を指すかは確かめられなかった。判断には実行中のバイナリの値を使った。

## 2. このリモート環境で mods が使えるか

**確かめられたこと**
- **`/plugin`（スラッシュコマンド）は使えない。** 公式ドキュメント（Claude Code on the web）に「`/plugin` や `/resume` のようにターミナルでしか動かないコマンドは使えない」とある。
- **シェルの `claude plugin` コマンドはある。** `claude plugin list` は「No plugins installed」と返し、`claude plugin marketplace list` は組み込みの Anthropic Directory を1つ返した。今はプラグインが1本も入っていない。
- **mods を読み込む仕組みは、このビルドに入っている。**
  - 手元に保存された機能フラグで、関数フック（mods）の読み込みが有効になっている（`tengu_plugin_hooks_modules: true`）。
  - mods を作るための組み込みスキル（`plugin-authoring`）がこのセッションに出ている。
- **公式ドキュメント（mods overview）の対応表**
  - クラウドセッションでは、プラグインがそのセッションに届けば **hooks（関数）は動く**。
  - **UI 要素（ペイン・ステータス行・トースト）は出ない。**
  - 届け方：リポジトリの `.claude/skills/<名前>/` に `.claude-plugin/plugin.json` を含めて置くと、そのリポジトリで作業する全員が自動で読み込む（「Plugins shared through a repository」）。
  - ほかの方法：`CLAUDE_CODE_PLUGIN_DIRS`（2.1.280 以降）、`claude plugin install`。

**確かめられなかったこと**
- **リポジトリに mod を置いたとき、このリモートセッションで実際にフックが呼ばれるか。** 検証には mod を1本入れる必要があり、今回の範囲（何も入れない）を超えるのでやっていない。
- `claude plugin install` でコンテナに入れたものが次のセッションに残るか。コンテナは毎回作り直されるので残らない見込みだが、確かめていない。**リポジトリ経由（`.claude/skills/`）なら毎回クローンされる**ので、届けるならこちらが筋。

**補足**
- いま repo で動いている**普通のフック（`.claude/settings.json` の SessionStart → `session-start.sh`）は、このリモートで毎回動いている**（セッション開始時に git-sync の出力が出ている）。
- 下の候補の多くは、mods（関数）でなくても**コマンドのフック（PreToolUse／PostToolUse）でも書ける**。mods でないと書けないのは、プロンプトの書き換えや組み込み機能の置き換えなど。

## 3. このリモート環境で wrap-up が効くか

**確かめられたこと**
- **公式ドキュメントに wrap-up allowance の記載は見つからなかった**（Claude Code on the web、model-config ほか）。クラウドセッションは「アカウントのほかの利用とレート制限を共有する」とだけある。
- **バイナリ（2.1.288）には仕組みが入っている。**
  - 応答ヘッダの `anthropic-ratelimit-unified-grace-5h-utilization` などを読んで「猶予（grace）」の区間を判定する処理がある。
  - モデルに渡す注記の文面も入っている：「[Usage limit reached — grace window active. Wrap up: finish or checkpoint; don't start subagents or long work.]」／「…Checkpoint now: finish the current step, then list up to 3 short bullets…」。
  - リモート（remote_mobile）かどうかで分岐している箇所は、文字列検索の範囲では見つからなかった。
- **ただし、この注記の出し方を決める機能フラグは、手元の保存値では止まっている。**
  - `tengu_lantern_wick_mode: "off"`、`tengu_lantern_wick: false`
  - 一方、`tengu_lantern_sconce: true`。その文面は「Usage limit reached · continuing to work, then switching to usage credits」で、利用クレジットへの切り替えの通知と読める。

**確かめられなかったこと**
- **このリモートで wrap-up の猶予が実際に付くか**（付けるかどうかはサーバー側が決める。上限に当てていないので観測していない）。
- 機能フラグの名前は内部の符号なので、`lantern_wick` が wrap-up そのものかどうかは**断定できない**。文面が近いことから関係があると読んだだけ。
- **推測で「使える」とは書かない。** 現状は「仕組みはビルドにあるが、この環境で発動するかは未確認。モデルへの注記は手元のフラグ上は止まっている」。

## 案 A：mods（またはフック）に移せそうな規則の候補（実装しない）

これまで文章で書き、実際に破られたことがあるものを選んだ。

| 候補 | 何を遮る／知らせるか | 破られた実例 | 種類 |
|---|---|---|---|
| ① 当たり確認に `notion-search` を使わない／単発 probe を使わない | Notion を書き込んだ直後の `notion-search` と、`notion-update-page` の `old_str`＝`new_str`（何もしない置換）を止めて、「読み直しは notion-fetch」と返す | 2026-08-08〜08-19（probe）、2026-09-11（search が古い値を返した） | PreToolUse |
| ② DECISION_LOG の見出しは「## YYYY-MM-DD: 見出し」 | `docs/DECISION_LOG.md` への書き込みで、新しい見出しがこの形でなければ知らせる。Notion の DECISION_LOG（ID 固定）への追記も同じ | 正本の 139 節が「# 見出し（日付）」の形（2026-09-29 の調査）。★ これはチャット側が書いたものなので、**Code 側のフックでは防げない**（Code の書き込みだけが対象） | PostToolUse |
| ③ Notion に書く文の全角数字・欠けたバックスラッシュ | `notion-update-page` の `new_str` に `０-９` があれば止める | 2026-09-17（全角「５」が本文に入った） | PreToolUse |
| ④ DECISION_LOG の ID 指定 | 「DECISION_LOG」の名前で `notion-search` したら、ID を使うよう返す | 2026-07-26（別企画の同名ページを踏んだ） | PreToolUse |
| ⑤ 対比較の基準は単独コミット | `git commit` に `tools/tests/fixtures/report-baseline.json` とほかのファイルが一緒に入っていたら止める | （実例なし。裁定で決めた規則） | PreToolUse（Bash） |
| ⑥ `scripts/` は外部依存ゼロ | `scripts/*.js` への書き込みに、組み込み以外の `require` があれば止める | （実例なし） | PreToolUse |

- **Unity の `.meta`／YAML の直接編集の禁止は、このリポジトリには該当しない**（Unity を使っていない HTML/CSS/JS のモック）。Unity のリポジトリ側の候補。
- ★ 優先は①③④。どれも**「確認したつもり」で黙って通る形**の事故で、文章の規則を重ねても再発してきた。
- 注意：①は「書き込み直後」の判定が要るので、関数（mods）で状態を持つほうが書きやすい。③④⑤⑥はコマンドのフックでも書ける。

## 案 B：wrap-up に入ったときの規約（実装しない）

> **使用上限の猶予（wrap-up）に入ったら、コードは進めない。作業中の変更をコミットし、SESSION_STATE の「次にやること」に続きの一手を1行書いて push する（Notion への反映は次のセッションに回してよい）。**

- 理由：猶予は小さい固定枠なので、Notion の反映（読み直しに数万トークン）より、repo に続きを残すほうが確実。repo が SESSION_STATE の正本なので、push まで済めば次のセッションは迷わない。
