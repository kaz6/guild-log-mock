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



## 冒険者パラメータ設計

冒険者は単なるユニットではなく、任務経験・判断傾向・過去の出来事を持つ存在として扱う。

### stats：任務能力

任務の経験・成長・将来の判定補正に使う。

- combat：戦闘対応力
- exploration：地形・道・痕跡を読む力
- investigation：情報収集・違和感発見
- negotiation：住民対応・会話
- support：仲間支援・応急処置
- survival：生還力・悪条件対応



### tendencies：判断傾向

将来、撤退判断・ログ分岐・性格のにじみに使う。

- caution：慎重さ
- courage：勇敢さ
- curiosity：好奇心
- kindness：優しさ
- memory：記憶力

※ 現在の traits は性格ラベル配列として使用中のため、数値パラメータには使わない。

### traits：性格ラベル

表示・ログ文・キャラ付けに使う。
positive 2つ + flaw 1つを基本とする。

### specialties：得意分野・持ち札

元職、経験、得意分野を表すタグ。
判定補正だけでなく、ログ文や報告書のフックとして使う。

例：
森道 / 痕跡 / 夜間行動 / 野営 / 応急処置 / 住民対応 / 保全 / 動物の気配 / 怪異察知 / 配達経験 / 料理 / 酒場経験 / 元役人

### history：履歴・記憶

冒険者が経験した出来事を記録する。

- sorties：遠征回数
- injuries：負傷回数
- successfulRetreats：撤退成功回数
- usedSupplies：活用した支給品
- memorableEvents：印象的な出来事



### MVP方針

最初は stats のみ追加し、遠征後に成長ログを1行表示する。
stats を成功判定に使うのは後回しにする。
tendencies / specialties / history の本格利用は後回しにする。



## 将来構想：battleStats

現在の `stats` は任務全体の適性を表す。

将来的に、戦闘ログを拡張する場合は、実戦闘用に `battleStats` を分ける。

### stats：任務能力

- combat：戦闘対応力。攻撃力ではなく、戦闘状況への対応・判断・連携。

- exploration：探索

- investigation：調査

- negotiation：交渉

- support：支援

- survival：生還力

### battleStats：実戦闘用パラメータ

- maxHp：内部HP。プレイヤーには数値表示しない。ログや帰還後の様子で表す。

- strength：筋力。物理攻撃、力仕事、仲間を背負う場面に使う。

- magic：魔力。魔術、怪異、図書館系依頼で使う。高魔力キャラは低スタミナでもよい。

- stamina：スタミナ。依頼の継続力、疲労、長距離移動、戦闘継続に使う。

- defense：防御力。被ダメージを軽減する。盾役・重装役向け。

### 命中率・回避について

現時点では採用しない。

基本的に攻撃は当たる前提とし、外れる/避けるより、敵ギミックへの対処や撤退判断で戦闘の緊張感を作る。

### tendencies

`courage` は度胸・胆力として扱う。

戦闘継続、怪異への踏み込み、撤退判断に影響する。

ただし高すぎると危険な続行につながる。

## Highlight / 今回のハイライト

遠征終了時に表示する印象的な1文。

注意：

- 本文と矛盾しない
- 依頼カテゴリと結果に合う
- 重すぎる文を低緊張依頼に出しすぎない

