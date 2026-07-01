# DATA_MODEL.md

## Adventurer / 冒険者

冒険者は遠征に参加するキャラクター。

主な要素：
- id
- name
- job
- species
- traits
- obsession
- weapon
- accessory
- memory
- caution
- courage
- kindness
- curiosity
- canSolo

注意：
- species: "dog" の冒険者は犬として扱う
- エルシーは special: true だが、UI上で「特別」と強調しすぎない
- 欠点は traits の中に type: "flaw" として含める

## Party / パーティ

遠征に出る冒険者の集合。

注意：
- 1〜4人程度
- エルシー単独は不可
- 人間1人＋エルシーは完全ソロでも完全複数人でもない
- 人間用ログでは humanMembers を使う

## Quest / 依頼

依頼は遠征の目的。

主な要素：
- id
- title
- category
- danger
- area
- recommended
- tags
- summary
- tensionBase
- tensionRange

カテゴリ例：
- 生活
- 探索
- 戦闘
- 調査
- 保全
- 輸送
- 救助
- 護衛
- 記録

## SupportItem / 支給品

遠征に持たせる道具。

例：
- 包帯
- 携帯鍋
- 笛
- 古地図
- 油紙の手紙入れ
- 観察記録票
- ランタン

注意：
- 支給品は依頼に合う場合だけログに出す
- 唐突に出さない
- 結果や判断とつながると良い

## Expedition / 遠征

依頼、パーティ、支給品、天候、時間帯をまとめた実行単位。

主な要素：
- quest
- party
- items
- weather
- timeOfDay
- tensionValue
- result

## Report / 報告書

遠征後に表示されるログ。

主な要素：
- questTitle
- party
- result
- logs
- highlight
- memo

## ReportLog / 遠征ログ

報告書内の1行。

現状：
- kind
- text

将来案：
- phase
- importance
- tensionLevel

## Highlight / 今回のハイライト

遠征終了時に表示する印象的な1文。

注意：
- 本文と矛盾しない
- 依頼カテゴリと結果に合う
- 重すぎる文を低緊張依頼に出しすぎない