// 非戦闘依頼の共通経路（工程エンジン）を測る（読み取り専用。ゲーム側の状態は変更しない）。
//
// なぜあるか：2026-07-31 に16件の非戦闘依頼を共通経路へ移した。
// ★ 移行前は編成も支給品も結末に届いていなかった（実測で分布がほぼ動かなかった）。
//   共通経路の数値（FIELDWORK_TUNING・危険度の負荷・天候の負荷・育成値）を触ったら、
//   勝率にあたる「結末の分布」だけでなく、**負傷率と工程ログの行数**も必ず一緒に見ること。
//   戦闘側で「勝率しか見ずに軽が消えた」回帰を起こした前例がある。
//
// 使い方：index.html をブラウザで開き、DevTools のコンソールにこのファイルの中身を貼って
//        measureFieldwork() を実行する（依存パッケージなし）。
//        measureFieldwork({ trials: 500, weather: "小雨", itemIds: ["item_map"] }) のように条件を変えられる。

(function () {
  const BASE_PARTY = ["adv_mina", "adv_gadd", "adv_elne", "adv_row"];

  function pct(n, total) {
    return total === 0 ? "0.0%" : (Math.round((n / total) * 1000) / 10) + "%";
  }

  window.measureFieldwork = function (opts = {}) {
    const trials = opts.trials ?? 300;
    const partyIds = opts.partyIds ?? BASE_PARTY;
    const itemIds = opts.itemIds ?? [];
    const weather = opts.weather ?? "晴れ";
    const timeOfDay = opts.timeOfDay ?? "昼";
    const rows = [];
    const perMember = {};
    partyIds.forEach((id) => { perMember[id] = { 軽症: 0, 重症: 0 }; });

    window.masterQuests.forEach((quest) => {
      const results = {};
      const causes = {};
      let injured = 0;
      let severe = 0;
      let lines = 0;
      let errors = 0;

      for (let i = 0; i < trials; i++) {
        let r;
        try {
          r = generateReport({
            questId: quest.id,
            adventurerIds: partyIds,
            adventurerItemIds: Object.fromEntries(partyIds.map((id, idx) => [id, idx === 0 ? itemIds : []])),
            seed: Math.floor(Math.random() * 1e9),
            departTimeOfDay: timeOfDay,
            departWeather: weather
          });
        } catch (e) {
          errors++;
          continue;
        }
        results[r.result] = (results[r.result] ?? 0) + 1;
        lines += (r.logs ?? []).length;
        const cause = r.hiddenTags?.fieldwork?.cause;
        if (cause) causes[cause] = (causes[cause] ?? 0) + 1;
        const ratios = r.hiddenTags?.battleHpRatios;
        if (!ratios) continue;
        const crit = new Set(r.hiddenTags?.battleCritIds ?? []);
        let any = false;
        let sev = false;
        Object.entries(ratios).forEach(([advId, ratio]) => {
          const level = injuryLevelFromHpRatio(ratio, crit.has(advId));
          if (!level) return;
          any = true;
          if (level === "重症") sev = true;
          if (perMember[advId]) perMember[advId][level] += 1;
        });
        if (any) injured++;
        if (sev) severe++;
      }

      rows.push({
        依頼: quest.title,
        経路: quest.enemyId ? "戦闘" : "工程",
        負傷率: pct(injured, trials),
        重症率: pct(severe, trials),
        平均行数: Math.round((lines / trials) * 10) / 10,
        滞りの理由: Object.entries(causes).map(([k, v]) => `${k}${v}`).join(" ") || "-",
        結末: Object.entries(results).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, trials)}`).join(" / "),
        例外: errors
      });
    });

    console.log(`--- 経路の実測 × ${trials}回 / 編成 ${partyIds.join("+")} / 支給品 ${itemIds.join("+") || "なし"} / ${timeOfDay}・${weather} ---`);
    console.table(rows);
    console.log("人ごとの負傷（非戦闘では特定の1人に偏らないこと。偏るなら消耗の割り当てが壊れている）:");
    console.table(perMember);
    return rows;
  };
})();
