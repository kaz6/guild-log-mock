# 口調の検査（voice-check）

マスターは kaz6/ops の `tools/voice-check/`。各企画は写して使う（矛盾検査係・文章の通読係と同じ流れ）。

**写す手順**：`voice-check.js`（と試験の `voice-check.test.js`）を企画のリポジトリの `tools/voice-check/` に丸ごと写し、冒頭の「配布状況」の行だけ写した日の版に書き換える。話し手つきの文の一覧（下の (a)）を書き出す処理と、口調の表（下の (b)）は、その企画が自分で作って持つ。マスターには入れない。直すときはマスターを直してから配り直す。

```
node tools/voice-check/voice-check.js <lines.json> <voice-table.json> [--json]
node --test tools/voice-check/voice-check.test.js   # 試験
```

終了コード：0＝表に合わない文なし／1＝あり／2＝入力の誤り。依存なし（Node の標準だけ。Node 20 以上で確かめた版は 22）。

## (a) 話し手つきの文の一覧

```json
[
  { "speaker": "剣士", "text": "俺が先に行く。", "source": "data-quests.js:120" }
]
```

`source` は出どころ（ファイルと行、報告書の番号など）。任意だが、書くと一覧から元へ戻れる。

## (b) 口調の表

```json
{
  "firstPersonWords": ["私", "僕", "俺", "わたし", "あたし"],
  "silent": ["犬"],
  "speakers": {
    "剣士": {
      "firstPerson": ["俺"],
      "avoidFirstPerson": ["拙者"],
      "address": [{ "to": "団長", "use": ["団長"], "avoid": ["あんた"] }],
      "endings": { "use": ["だ"], "avoid": ["ですわ"], "must": false }
    },
    "語り": {}
  },
  "exceptions": [
    { "speaker": "剣士", "text": "拙者と名乗っておく", "rule": "first-person", "reason": "変装の場面（作者の裁定 2026-10-30）" }
  ]
}
```

| 項目 | 見ること | 挙がる種類（`rule`） |
|---|---|---|
| `silent` | ここに書いた者の文が1つでもあれば挙げる | `silent` |
| `speakers` に無い話し手 | 表に無い者の文は挙げる（名前の取り違え・表の書き漏れを拾う。話すなら `{}` でよいので書く） | `unknown-speaker` |
| `avoidFirstPerson` | 文に含まれていたら挙げる | `first-person` |
| `firstPerson` ＋ `firstPersonWords` | 話し手に `firstPerson` があるときだけ、`firstPersonWords` のうちその話し手の一人称でない語が文に含まれていたら挙げる | `first-person-other` |
| `address[].avoid` | 文に含まれていたら挙げる（`to`・`use` は報告に添える） | `address` |
| `endings.avoid` | 文（。！？!? と改行で区切る）がその語で終わっていたら挙げる | `ending-avoid` |
| `endings.must: true` | 文が `endings.use` のどれでも終わっていなければ挙げる | `ending-must` |
| `exceptions` | `speaker`・`text`（文に含まれる部分）・`source`・`rule` のうち書いたものが全部合う指摘を消す。`reason` は必須。一度も使われなかった例外は注意に出す（古い例外の見つけ） | — |

- 一致は文字列がそのまま含まれるか（終わるか）だけで見る。表に正規表現や条件式は書かない
- 語の一部に当たる誤検知（「私物」の「私」など）は、表を細かくするより `exceptions` に理由つきで書く
- 語尾を見るときは、文末の閉じ記号（」』）…など）を落としてから比べる
