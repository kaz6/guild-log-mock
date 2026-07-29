// 戦闘の結末分布を測る（読み取り専用。数値は一切変更しない）。
//
// なぜあるか：スライス9の検証が「勝率」しか見ておらず、結末4段階の分布を見ていなかったため、
// 軽（浅手勝利）が 0% に落ちた回帰に気づけなかった（2026-07-29 のタスクで判明）。
// ★ 戦闘の数値を触るときは、必ずこれを流して結末分布を確認すること。
//
// 使い方：index.html をブラウザで開き、DevTools のコンソールにこのファイルの中身を貼って
//        measureBattle() を実行する（依存パッケージなし。ゲーム側のコードは変更しない）。
//        measureBattle({ trials: 8000 }) のように試行回数を上げられる。

(function () {
  const BATTLE_QUESTS = ["quest_barn_bite", "quest_caravan_escort"];
  const BASE_PARTY = ["adv_mina", "adv_gadd", "adv_elne", "adv_row"];

  function getParty(ids) {
    return ids.map((id) => window.masterAdventurers.find((a) => a.id === id)).filter(Boolean);
  }

  function pct(n, total) {
    return total === 0 ? "0.00%" : (Math.round((n / total) * 10000) / 100).toFixed(2) + "%";
  }

  // stage（軽/中/重/致命）と outcome の分布。simulateBattle を直接叩く。
  function measureStage(questId, partyIds, itemIds, trials) {
    const quest = window.masterQuests.find((q) => q.id === questId);
    const party = getParty(partyIds);
    const stage = { 軽: 0, 中: 0, 重: 0, 致命: 0 };
    const outcome = {};
    let rounds = 0;
    let deep = 0;
    for (let i = 0; i < trials; i++) {
      const r = simulateBattle(quest, party, itemIds, Math.random);
      if (!r) return null;
      stage[r.stage] = (stage[r.stage] ?? 0) + 1;
      outcome[r.outcome] = (outcome[r.outcome] ?? 0) + 1;
      rounds += r.rounds;
      if (r.events.some((e) => e.type === "status" && (e.to === "深手" || e.to === "戦闘不能"))) deep++;
    }
    return {
      trials,
      stage,
      stagePct: Object.fromEntries(Object.entries(stage).map(([k, v]) => [k, pct(v, trials)])),
      outcome,
      deepWoundPct: pct(deep, trials),
      avgRounds: Math.round((rounds / trials) * 100) / 100
    };
  }

  // branch（報告書の結末7種）の分布。generateReport を通すので、プレイヤーが見る結末そのもの。
  function measureBranch(questId, partyIds, itemIds, trials) {
    const branch = {};
    for (let i = 0; i < trials; i++) {
      const r = generateReport({
        questId,
        adventurerIds: partyIds,
        adventurerItemIds: Object.fromEntries(partyIds.map((id, idx) => [id, idx === 0 ? itemIds : []])),
        seed: Math.floor(Math.random() * 1e9),
        departTimeOfDay: "昼",
        departWeather: "晴れ"
      });
      const b = r.hiddenTags?.branch ?? "(none)";
      branch[b] = (branch[b] ?? 0) + 1;
    }
    const full = (branch.great_light ?? 0) + (branch.great_wound ?? 0);
    const partial = (branch.partial_detour ?? 0) + (branch.partial_loss ?? 0) + (branch.partial_elsie ?? 0);
    const failed = (branch.bail ?? 0) + (branch.fail ?? 0);
    return {
      trials,
      branch,
      完全成功: pct(full, trials),
      部分成功: pct(partial, trials),
      失敗: pct(failed, trials)
    };
  }

  window.measureBattle = function (opts = {}) {
    const trials = opts.trials ?? 4000;
    const itemSets = opts.itemSets ?? [
      { label: "支給品なし", items: [] },
      { label: "包帯1", items: ["item_bandage"] },
      { label: "包帯2", items: ["item_bandage", "item_bandage"] },
      { label: "煙幕のみ", items: ["item_smoke"] },
      { label: "包帯1+煙幕", items: ["item_bandage", "item_smoke"] }
    ];
    const partySets = opts.partySets ?? [
      { label: "基準4人", ids: BASE_PARTY },
      { label: "基準4人+エルシー", ids: [...BASE_PARTY, "adv_elsie"] },
      { label: "ガッド+ロウ", ids: ["adv_gadd", "adv_row"] },
      { label: "ミナ+エルネ", ids: ["adv_mina", "adv_elne"] },
      { label: "ミナ+エルネ+エルシー", ids: ["adv_mina", "adv_elne", "adv_elsie"] }
    ];

    const out = { stage: [], branch: [] };

    BATTLE_QUESTS.forEach((questId) => {
      const quest = window.masterQuests.find((q) => q.id === questId);
      if (!quest || !quest.enemyId) return;
      itemSets.forEach((set) => {
        const r = measureStage(questId, BASE_PARTY, set.items, trials);
        if (r) out.stage.push({ 依頼: quest.title, 編成: "基準4人", 支給品: set.label, ...r.stagePct, 深手発生: r.deepWoundPct, 平均T: r.avgRounds });
      });
      partySets.forEach((set) => {
        const r = measureStage(questId, set.ids, ["item_bandage"], trials);
        if (r) out.stage.push({ 依頼: quest.title, 編成: set.label, 支給品: "包帯1", ...r.stagePct, 深手発生: r.deepWoundPct, 平均T: r.avgRounds });
      });
    });

    // branch は隊商護衛だけが持つ（納屋は専用ログで branch を出さない）
    itemSets.forEach((set) => {
      const r = measureBranch("quest_caravan_escort", BASE_PARTY, set.items, trials);
      out.branch.push({ 編成: "基準4人", 支給品: set.label, ...r.branch, 完全成功: r.完全成功, 部分成功: r.部分成功, 失敗: r.失敗 });
    });
    partySets.forEach((set) => {
      [[], ["item_smoke"]].forEach((items) => {
        const r = measureBranch("quest_caravan_escort", set.ids, items, trials);
        out.branch.push({ 編成: set.label, 支給品: items.length ? "煙幕" : "なし", ...r.branch, 完全成功: r.完全成功, 部分成功: r.部分成功, 失敗: r.失敗 });
      });
    });

    console.log(`--- 結末4段階（stage）× ${trials}回 ---`);
    console.table(out.stage);
    console.log(`--- 結末の分岐（branch・隊商護衛）× ${trials}回 ---`);
    console.table(out.branch);
    return out;
  };
})();
