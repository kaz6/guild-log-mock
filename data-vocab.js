// 判定用語彙（2026-08-06・EX-061）。
//
// ★ 既存の `tags` とは別物。`tags` は掲示板・名簿に出す表示用のまま据え置き、判定には使わない。
//   こちらは「行為（How）× 対象（What）」の2軸で、冒険者・支給品・工程の3組が共有する単一の表。
//
// ★ 行為が主で、対象は任意。区別したいときだけ対象を添える（`運ぶ` 単独で成立する）。
// ★ 1つの工程・道具・人が複数の語を持ってよい（包帯＝手当て／留める）。
// ★ 向き（dir）は `+`＝得意 / `-`＝苦手。無記入は中立。
// ★ 場所・時間（暗がり／道／夜 など）は対象に入れない。Where は依頼属性が持つ（2026-08-06 裁定）。
//
// ⚠️ **この時点では判定に接続していない。** 定義と付与だけで、読んでいるコードは無い。
//    接続は別タスクで、同一シードの不一致0を保てる形を設計してから行う。

window.masterVocab = {
  // 行為（How）13語（2026-08-18・EX-063 で〈採る〉〈離れる〉を追加）
  // ★ 〈離れる〉は〈退く〉ではない。撤退は「荷物を置いてくること」であり逃走ではないので、
  //   敗北の語感が薄い語を採った。煙幕・撤退判断・エルシーの撤退保証が同じ語に乗る。
  acts: ["運ぶ", "察する", "伝える", "前に立つ", "攻める", "進む", "手当て", "記録", "留める", "整える", "火と食", "採る", "離れる"],

  // 対象（What）5語・任意
  targets: ["重い", "壊れ物", "紙物", "生き物", "人"],

  // ★ 採らなかった語（再提案を防ぐために残す）
  //   採る/集める … 一度見送ったが、運ぶ＋察するでは摘む動作が落ちると実測で確認され、
  //                 2026-08-18（EX-063）に〈採る〉として採用した
  //   登る/降りる … 実装済みの依頼に存在しない
  //   暗がり/道 … 対象ではなく Where（依頼属性）へ

  // 依頼の工程。★ 文面から読める行為で書く（タグ名ではない）。
  //   label は工程の呼び名で、判定には使わない（人が読んで照合するためのもの）。
  questSteps: {
    quest_tavern_errand: [
      { label: "店主に用件を伝えて頼む", acts: ["伝える"], targets: ["人"] },
      { label: "樽を受け取る", acts: ["運ぶ"], targets: ["壊れ物"] },
      { label: "樽を担ぐ", acts: ["運ぶ"], targets: ["重い"] },
      { label: "裏口まで運び込む", acts: ["運ぶ"], targets: ["重い"] }
    ],
    quest_herb: [
      { label: "森の浅い場所を進む", acts: ["進む"], targets: [] },
      { label: "使える草と避ける草を見分ける", acts: ["察する"], targets: [] },
      // ★ 摘む動作は既存の工程文から落ちていた（EX-061 の実測）。〈採る〉の追加で書けるようになった行
      { label: "薬草を摘み取って袋に収める", acts: ["採る"], targets: [] },
      { label: "足跡を読む", acts: ["察する"], targets: ["生き物"] },
      { label: "薬草袋の破れを繕う", acts: ["留める"], targets: ["壊れ物"] },
      { label: "小さな獣を遠ざける", acts: ["前に立つ"], targets: ["生き物"] },
      { label: "見て書き留める", acts: ["記録"], targets: ["生き物"] }
    ],
    quest_signpost: [
      { label: "道標のゆるみを確かめる", acts: ["察する"], targets: ["壊れ物"] },
      { label: "表面を傷めずに読む", acts: ["記録"], targets: ["壊れ物"] },
      { label: "古地図と現地を突き合わせる", acts: ["記録", "察する"], targets: ["紙物"] },
      { label: "通行人から聞き出す", acts: ["伝える"], targets: ["人"] },
      { label: "仮に留めて支える", acts: ["留める"], targets: ["壊れ物"] },
      { label: "書き写す", acts: ["記録"], targets: ["紙物"] }
    ],
    quest_letter: [
      { label: "封蝋を触らずに確かめる", acts: ["察する"], targets: ["壊れ物"] },
      { label: "宛先を聞き込む", acts: ["伝える"], targets: ["人"] },
      { label: "古地図と旧住所を突き合わせる", acts: ["記録"], targets: ["紙物"] },
      { label: "濡らさずに運ぶ", acts: ["運ぶ"], targets: ["紙物"] },
      { label: "本人に手渡す", acts: ["伝える", "運ぶ"], targets: ["人", "紙物"] }
    ],
    quest_wedding_support: [
      { label: "会場を整える", acts: ["整える"], targets: [] },
      { label: "厨房を手伝う", acts: ["火と食"], targets: [] },
      { label: "酒樽と長椅子を担ぐ", acts: ["運ぶ"], targets: ["重い"] },
      { label: "こぼさずに運ぶ", acts: ["運ぶ"], targets: ["壊れ物"] },
      { label: "招待客を席まで案内する", acts: ["伝える", "前に立つ"], targets: ["人"] },
      { label: "迷子を見つける", acts: ["察する"], targets: ["人"] },
      { label: "夜間の見回り", acts: ["察する"], targets: [] },
      { label: "飾り紐を受け渡す", acts: ["運ぶ"], targets: ["壊れ物"] }
    ],
    quest_old_house_cleanup: [
      { label: "壊れた家具を運び出す", acts: ["運ぶ"], targets: ["重い"] },
      { label: "床板を踏んで確かめる", acts: ["察する"], targets: [] },
      { label: "古い手紙を封を開けずに残す", acts: ["記録"], targets: ["紙物"] },
      { label: "使える物と処分品を見分ける", acts: ["察する"], targets: [] },
      { label: "近所から聞き取る", acts: ["伝える"], targets: ["人"] },
      { label: "茶器を包む", acts: ["運ぶ", "留める"], targets: ["壊れ物"] },
      { label: "部屋割りと段取りを決める", acts: ["整える"], targets: [] }
    ],
    quest_field_mystery: [
      { label: "畑の外へ押し返す", acts: ["前に立つ", "攻める"], targets: ["生き物"] },
      { label: "依頼人の背後を空ける", acts: ["前に立つ"], targets: ["人"] },
      { label: "逃げた方角を読んで書き留める", acts: ["察する", "記録"], targets: ["生き物"] },
      { label: "距離を保って観察する", acts: ["察する"], targets: ["生き物"] }
    ],
    quest_barn_bite: [
      { label: "灯りで歯形と足跡を確かめる", acts: ["察する"], targets: ["生き物"] },
      { label: "戸口をふさぐ", acts: ["前に立つ"], targets: ["生き物"] },
      { label: "正面から受け止める", acts: ["前に立つ"], targets: ["生き物"] },
      { label: "仕留める", acts: ["攻める"], targets: ["生き物"] },
      { label: "笛で動きを乱す", acts: ["伝える"], targets: [] },
      { label: "傷の手当てをする", acts: ["手当て"], targets: ["人"] }
    ],
    quest_old_bridge_repair: [
      { label: "岸側から板の緩みを確かめる", acts: ["察する"], targets: ["壊れ物"] },
      { label: "傷んだ板を外し使える釘を選り分ける", acts: ["察する", "留める"], targets: ["壊れ物"] },
      { label: "仮に留めて印をつける", acts: ["留める"], targets: ["壊れ物"] },
      { label: "通行人を止める・笛で合図する", acts: ["伝える"], targets: ["人"] },
      { label: "迂回路を決めて誘導する", acts: ["整える", "伝える"], targets: ["人"] },
      { label: "橋下の桁を照らして確かめる", acts: ["察する"], targets: [] },
      { label: "試し渡りをする", acts: ["進む", "察する"], targets: [] }
    ],
    quest_church_patrol: [
      { label: "柵と段差のゆるみを確かめる", acts: ["察する"], targets: ["壊れ物"] },
      { label: "花壇と祈りの跡に触れずに確かめる", acts: ["察する"], targets: [] },
      { label: "巡回順を決める", acts: ["整える"], targets: [] },
      { label: "外縁を順に回る", acts: ["進む"], targets: [] },
      { label: "縄で結んで持たせる", acts: ["留める"], targets: ["壊れ物"] },
      { label: "灯りで段差を照らして確かめる", acts: ["察する"], targets: [] },
      { label: "距離を保って観察する", acts: ["察する"], targets: [] }
    ],
    quest_herb_delivery: [
      { label: "結び目を確かめて結び直す", acts: ["留める"], targets: ["壊れ物"] },
      { label: "濡らさずに運ぶ", acts: ["運ぶ"], targets: ["紙物", "壊れ物"] },
      { label: "崩れやすい包みを抱えて運ぶ", acts: ["運ぶ"], targets: ["壊れ物"] },
      { label: "ぬかるみの少ない道を選ぶ", acts: ["進む"], targets: [] },
      { label: "荷紐を繕う", acts: ["留める"], targets: ["壊れ物"] },
      { label: "手渡して受領印をもらう", acts: ["伝える", "記録"], targets: ["人", "紙物"] }
    ],
    quest_missing_herbalist: [
      { label: "新しい足跡だけを追う", acts: ["察する"], targets: ["人"] },
      { label: "笛を鳴らして返事を待つ", acts: ["伝える"], targets: ["人"] },
      { label: "分岐ごとに帰り道を確かめる", acts: ["察する", "進む"], targets: [] },
      { label: "落ちていた物から状況を読む", acts: ["察する"], targets: [] },
      { label: "保護して連れ帰る", acts: ["前に立つ", "手当て"], targets: ["人"] },
      { label: "傷の手当てをする", acts: ["手当て"], targets: ["人"] }
    ],
    quest_evening_market_escort: [
      { label: "人通りの残る明るい道を選ぶ", acts: ["進む"], targets: [] },
      { label: "少し前を歩き、狭い所で待つ", acts: ["前に立つ"], targets: ["人"] },
      { label: "重い買い物袋を引き受ける", acts: ["運ぶ"], targets: ["重い"] },
      { label: "擦れた膝に包帯を当てる", acts: ["手当て"], targets: ["人"] },
      { label: "灯りで石段を照らす", acts: ["察する"], targets: [] }
    ],
    quest_caravan_escort: [
      { label: "先行して曲がりと茂みの陰を確かめる", acts: ["察する", "進む"], targets: [] },
      { label: "荷馬車の前に並ぶ", acts: ["前に立つ"], targets: ["人"] },
      { label: "野盗と打ち合う", acts: ["攻める"], targets: ["人"] },
      { label: "傷の手当てをする", acts: ["手当て"], targets: ["人"] }
    ],
    quest_caravan_search: [
      { label: "轍と足跡を読んで方角を絞る", acts: ["察する"], targets: ["人"] },
      { label: "匂いで辿る", acts: ["察する"], targets: ["生き物"] },
      { label: "古地図と現地を突き合わせる", acts: ["記録", "察する"], targets: ["紙物"] },
      { label: "痕跡の先へ進む", acts: ["進む"], targets: [] },
      { label: "商人と荷を連れ戻す", acts: ["前に立つ"], targets: ["人"] }
    ],
    quest_caravan_lastchance: [
      { label: "前回追い切れなかった轍を辿り直す", acts: ["察する"], targets: ["人"] },
      { label: "匂いで辿る", acts: ["察する"], targets: ["生き物"] },
      { label: "古地図と現地を突き合わせる", acts: ["記録", "察する"], targets: ["紙物"] },
      { label: "痕跡の先へ進む", acts: ["進む"], targets: [] },
      { label: "商人と荷を連れ戻す", acts: ["前に立つ"], targets: ["人"] }
    ],
    quest_old_stele_rubbing: [
      { label: "石碑の向きと周囲の地面を確かめる", acts: ["察する"], targets: [] },
      { label: "苔を削らず読める部分だけ写し取る", acts: ["記録"], targets: ["壊れ物"] },
      { label: "風でずれないよう紙を留める", acts: ["留める"], targets: ["紙物"] },
      { label: "拓本を濡らさずに運ぶ", acts: ["運ぶ"], targets: ["紙物"] },
      { label: "光を斜めから当てて浅い刻みを見る", acts: ["察する"], targets: [] },
      { label: "読めなかった箇所を補わずに残す", acts: ["記録"], targets: ["紙物"] }
    ],
    quest_lingering_light: [
      { label: "昼の足跡と轍を確かめる", acts: ["察する"], targets: [] },
      { label: "灯りの位置と消えた方角を書き留める", acts: ["記録"], targets: [] },
      { label: "灯りで足元を照らす", acts: ["察する"], targets: [] },
      { label: "距離を保ち、帰り道を確かめる", acts: ["察する", "進む"], targets: [] }
    ]
  },

  // 支給品。★ 何に効く道具かを行為で書く。
  items: {
    item_bandage: [
      { acts: ["手当て"], targets: ["人"] },
      { acts: ["留める"], targets: ["壊れ物"] }
    ],
    item_map: [
      { acts: ["察する"], targets: [] },
      { acts: ["記録"], targets: ["紙物"] }
    ],
    item_whistle: [{ acts: ["伝える"], targets: [] }],
    item_pot: [{ acts: ["火と食"], targets: [] }],
    item_oilcase: [{ acts: ["運ぶ"], targets: ["紙物"] }],
    item_obs_sheet: [{ acts: ["記録"], targets: [] }],
    item_lantern: [{ acts: ["察する"], targets: [] }],
    // ★ 煙幕＝視界を切って離れるための道具（2026-08-18・EX-063 で〈離れる〉が入り、語が付いた）
    item_smoke: [{ acts: ["離れる"], targets: [] }]
  },

  // 冒険者。★ dir は "+"＝得意 / "-"＝苦手。無記入は中立。
  adventurers: {
    adv_mina: [
      { acts: ["察する"], targets: [], dir: "+" },
      { acts: ["記録"], targets: ["紙物"], dir: "+" },
      { acts: ["進む"], targets: [], dir: "+" },
      { acts: ["伝える"], targets: ["人"], dir: "+" }
    ],
    adv_gadd: [
      { acts: ["運ぶ"], targets: ["重い"], dir: "+" },
      { acts: ["前に立つ"], targets: ["人"], dir: "+" },
      { acts: ["攻める"], targets: [], dir: "+" },
      { acts: ["火と食"], targets: [], dir: "+" },
      { acts: ["伝える"], targets: ["人"], dir: "+" },
      // ★ 石碑で「削った方が早い」と言い、止められている（傷めずに写すのが苦手）
      { acts: ["記録"], targets: ["壊れ物"], dir: "-" }
    ],
    adv_elne: [
      { acts: ["手当て"], targets: ["人"], dir: "+" },
      // ★ 薬草師の本業（職業から直接読める。EX-058 の材料どおり）
      { acts: ["採る"], targets: [], dir: "+" },
      { acts: ["察する"], targets: ["生き物"], dir: "+" },
      { acts: ["記録"], targets: ["紙物"], dir: "+" },
      { acts: ["記録"], targets: ["壊れ物"], dir: "+" },
      { acts: ["整える"], targets: [], dir: "+" }
    ],
    adv_row: [
      { acts: ["察する"], targets: [], dir: "+" },
      { acts: ["前に立つ"], targets: ["人"], dir: "+" },
      { acts: ["運ぶ"], targets: ["重い"], dir: "+" },
      { acts: ["伝える"], targets: [], dir: "+" },
      { acts: ["進む"], targets: [], dir: "+" }
    ],
    adv_elsie: [
      { acts: ["察する"], targets: ["生き物"], dir: "+" },
      { acts: ["進む"], targets: [], dir: "+" },
      // ★ 以下は CURRENT_SPEC「エルシー仕様」の「させない行動」に対応する
      //   （記録する・読む・拓本を取る／説明する・声をかける・会話する／修理する）
      { acts: ["記録"], targets: [], dir: "-" },
      { acts: ["伝える"], targets: ["人"], dir: "-" },
      { acts: ["留める"], targets: [], dir: "-" },
      // ★ ハーネスで支給品は運べるが、重い物は担げない（EX-056 の humanOnly と同じ線）
      { acts: ["運ぶ"], targets: ["重い"], dir: "-" },
      // ★ 撤退保証（E2＝いれば撤退が必ず成功する）を〈離れる〉の得意として書く（2026-08-18・EX-063）。
      //   裁定の「煙幕・撤退判断・エルシーの撤退保証が同じ語に乗る」の3つ目
      { acts: ["離れる"], targets: [], dir: "+" }
    ]
  }
};
