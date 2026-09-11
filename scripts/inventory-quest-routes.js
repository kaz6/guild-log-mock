// 全依頼の「経路」を実行して棚卸しする（読み取り専用。ゲーム側の状態は変更しない）。
//
// なぜあるか：第3段階（負傷の持続と回復）の実装で、負傷が付くのは隊商護衛だけだと判明した。
// 依頼の性質ではなく実装都合で安全度が分かれている状態を、推測ではなく実行結果で確認するため。
// ★ 経路をいじる変更（依頼の追加・generateReport の分岐変更・simulateBattle の適用範囲変更）の
//   前後で流し、どの依頼がどの経路に乗っているかの差分を見ること。
//
// 使い方：index.html をブラウザで開き、DevTools のコンソールにこのファイルの中身を貼って
//        inventoryQuestRoutes() を実行する（依存パッケージなし）。
//        inventoryQuestRoutes({ trials: 500 }) のように試行回数を上げられる。

(function () {
  const BASE_PARTY = ["adv_mina", "adv_gadd", "adv_elne", "adv_row"];

  function pct(n, total) {
    return total === 0 ? "0.00%" : (Math.round((n / total) * 10000) / 100).toFixed(2) + "%";
  }

  // simulateBattle を一時的に包んで、どの依頼が実際に呼ぶかを数える。
  // 呼び出し回数を数えるだけで、戻り値も引数も変えない。
  function withBattleCounter(fn) {
    const original = window.simulateBattle;
    let calls = 0;
    window.simulateBattle = function (...args) {
      calls++;
      return original.apply(this, args);
    };
    try {
      fn();
    } finally {
      window.simulateBattle = original;
    }
    return calls;
  }

  function runOne(questId, partyIds, itemIds, departTimeOfDay) {
    return generateReport({
      questId,
      adventurerIds: partyIds,
      adventurerItemIds: Object.fromEntries(partyIds.map((id, idx) => [id, idx === 0 ? itemIds : []])),
      seed: Math.floor(Math.random() * 1e9),
      departTimeOfDay,
      departWeather: "晴れ"
    });
  }

  window.inventoryQuestRoutes = function (opts = {}) {
    const trials = opts.trials ?? 200;
    const partyIds = opts.partyIds ?? BASE_PARTY;
    const itemIds = opts.itemIds ?? ["item_obs_sheet", "item_bandage"];
    // 残る灯りの観察記録は夜出発のときだけ付く（app.js の分岐が isNight で切っている）。
    // 観察記録の欄を見るときは departTimeOfDay を変えて2回流すこと。
    const departTimeOfDay = opts.departTimeOfDay ?? "昼";
    const rows = [];

    window.masterQuests.forEach((quest) => {
      const results = {};
      const branches = {};
      let injured = 0;
      let observed = 0;
      let errors = 0;

      const battleCalls = withBattleCounter(() => {
        for (let i = 0; i < trials; i++) {
          let r;
          try {
            r = runOne(quest.id, partyIds, itemIds, departTimeOfDay);
          } catch (e) {
            errors++;
            continue;
          }
          results[r.result] = (results[r.result] ?? 0) + 1;
          const b = r.hiddenTags?.branch;
          if (b) branches[b] = (branches[b] ?? 0) + 1;
          // 負傷が付くかどうかは hiddenTags.battleHpRatios の有無で決まる（applyInjuriesFromReport が読む）
          if (r.hiddenTags?.battleHpRatios) injured++;
          if (r.observationNotes && r.observationNotes.notes && r.observationNotes.notes.length > 0) observed++;
        }
      });

      rows.push({
        依頼: quest.title,
        id: quest.id,
        enemyId: quest.enemyId ?? "-",
        戦闘経由: pct(battleCalls, trials),
        負傷経路: pct(injured, trials),
        観察対象: quest.observationTarget,
        観察記録: pct(observed, trials),
        result: Object.keys(results).join(" / ") || "-",
        branch: Object.keys(branches).join(" / ") || "-",
        例外: errors
      });
    });

    console.log(`--- 全依頼の経路棚卸し × ${trials}回 / 編成 ${partyIds.join("+")} / 支給品 ${itemIds.join("+")} / 出発 ${departTimeOfDay} ---`);
    console.table(rows);
    console.log("戦闘経由が 0% なのに enemyId を持つ依頼は、データとロジックが食い違っている。");
    return rows;
  };
})();
