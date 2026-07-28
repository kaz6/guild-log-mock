// 遠征の所要時間まわりのマスターデータ。
// 2026-07-28 に app.js から移設（値は移設前と同一・1つも変えていない）。
// 帯の定義は「データ」であってロジックではないため data 側に置く。app.js は参照するだけ。
// 変更するときは Notion の CURRENT_SPEC「遠征の所要時間」節も更新すること。

// 時間の正本はこの定数1個。コアコンセプト16章「昼30分／夜30分＝実1時間でゲーム内1日」。
// ここを変えるだけで全依頼の所要時間が伸び縮みする（実時間は必ずここから導出する）。
window.REAL_MINUTES_PER_GAME_DAY = 60;
window.MS_PER_REAL_MINUTE = 60000;

// 実時間の分をゲーム内日数へ換算する。所要時間の一次情報はゲーム内日数だが、
// 近場の帯は日数で書くと 0.0167 等になり読めないため、定義時だけ分で書いて日数へ変換する。
function gameDaysFromRealMinutes(realMinutes) {
  return realMinutes / window.REAL_MINUTES_PER_GAME_DAY;
}

// 依頼の所要時間の帯（コアコンセプト17章）。依頼データの durationBand がこのキーを指す。
// ※ 帯名「近」は旧称「最序盤」。実態は進行段階ではなく距離なので改称した（体験版②裁定）。
// ※ long_5h / long_7h は定義のみで該当依頼は未実装。北・東の遠方依頼が入ったときに使う。
window.masterDurationBands = {
  near_1m: { label: "近", days: gameDaysFromRealMinutes(1) },
  near_5m: { label: "近", days: gameDaysFromRealMinutes(5) },
  near_10m: { label: "近", days: gameDaysFromRealMinutes(10) },
  short_30m: { label: "短", days: gameDaysFromRealMinutes(30) },
  short_1h: { label: "短", days: gameDaysFromRealMinutes(60) },
  mid_2h: { label: "中", days: gameDaysFromRealMinutes(120) },
  mid_3h: { label: "中", days: gameDaysFromRealMinutes(180) },
  long_5h: { label: "長", days: gameDaysFromRealMinutes(300) },
  long_7h: { label: "長", days: gameDaysFromRealMinutes(420) }
};
window.defaultDurationBand = "short_30m";
