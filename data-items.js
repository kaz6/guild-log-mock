// ★ 買い出しと在庫（2026-09-23・EX-144）の2項目。**どちらも仮置き**（制作の最後に作者が調整する）。
//   consumable … 使ったら在庫へ戻らない（使わずに帰れば戻る）。⚠️ 設計ページに記述が無い＝実装側の判断。
//                包帯（手当てで1つ消費）と煙幕（焚いたら無くなる）だけ。道具は持ち帰る。
//   shopTier   … 買い出しで並ぶ順番（★ 設計ページ「最初から全部並べない」。解放条件の中身は未定）。
//                1＝包帯と煙幕（CURRENT_SPEC 2026-07-25「初期は包帯と煙幕の2択」）／2＝携帯鍋（同「最初の開放候補」）／
//                3＝残り。段が開く条件は data-money.js の `shopTierAfterTrips`。
window.masterItems = [
  { id: "item_bandage", name: "包帯", tags: ["治療", "負傷ログ"], note: "負傷時のログや撤退判断に影響する。", consumable: true, shopTier: 1 },
  { id: "item_map", name: "古地図", tags: ["道迷い", "街道照合"], note: "街道・森・古い道標の記録照合に使える。", shopTier: 3 },
  { id: "item_whistle", name: "笛", tags: ["合流", "撤退"], note: "視界が悪い場所での合流ログに影響する。", shopTier: 3 },
  { id: "item_pot", name: "携帯鍋", tags: ["休憩", "士気"], note: "休憩ログや関係性ログに影響する。", shopTier: 2 },
  { id: "item_oilcase", name: "油紙の手紙入れ", tags: ["手紙", "雨", "記録保護"], note: "紙の依頼書や手紙を濡らさず運ぶ。", shopTier: 3 },
  { id: "item_obs_sheet", name: "観察記録票", tags: ["観察", "記録", "生物", "生態目録"], note: "観察対象がいる依頼で持たせると、報告書に冒険者ごとの観察メモが追加される。", shopTier: 3 },
  { id: "item_lantern", name: "ランタン", tags: ["夜道", "灯り", "調査"], note: "夜道や暗所で足元と帰り道を確認するための支給品。", shopTier: 3 },
  { id: "item_smoke", name: "煙幕", tags: ["撤退", "回避", "戦闘"], note: "各人の撤退判断を早め、撤退が成立すれば煙幕を焚いて戦闘を回避し先へ進める。", consumable: true, shopTier: 1 }
];
