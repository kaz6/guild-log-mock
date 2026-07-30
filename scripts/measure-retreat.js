// 撤退判断（4段階）を測る（読み取り専用。ゲーム側の数値・依頼の割り当ては変更しない）。
//
// なぜあるか：2026-07-30 に撤退判断を4段階へ作り直した。裁定の条件として、
//   ★ 段階1（接敵で引く）が実際に発火すること（0% なら失敗、高すぎても失敗）
//   ★ 「敵HP20%以下での撤退」の割合が下がること（旧実装は 78〜84%）
//   ★ 野盗と大熊で接敵スコアが違うこと（旧式は敵HPの割合しか見ず、完全に同じだった）
// を測ることが求められている。
//
// 使い方：index.html をブラウザで開き、DevTools のコンソールにこのファイルの中身を貼って
//        measureRetreat() を実行する（依存パッケージなし）。
//        measureRetreat({ trials: 4000 }) のように試行回数を上げられる。
//
// ★ 新敵（大熊）はどの依頼にも割り当てていないので、ここで「隊商護衛の敵だけ差し替えた仮の quest」を組む。

(function () {
  const BASE_QUEST_ID = "quest_caravan_escort";
  const ENEMIES = [
    { key: "野盗", enemyId: "enemy_road_raiders" },
    { key: "大熊", enemyId: "enemy_ridge_bear" }
  ];
  const PARTIES = [
    { key: "基準4人", ids: ["adv_mina", "adv_gadd", "adv_elne", "adv_row"] },
    { key: "3人(ミナ鉄鍋エルネ)", ids: ["adv_mina", "adv_gadd", "adv_elne"] },
    { key: "ミナ+ガッド", ids: ["adv_mina", "adv_gadd"] },
    { key: "ミナ+エルネ", ids: ["adv_mina", "adv_elne"] },
    { key: "ガッド単独", ids: ["adv_gadd"] },
    { key: "基準3人+エルシー", ids: ["adv_mina", "adv_gadd", "adv_elne", "adv_elsie"] }
  ];
  const ITEM_SETS = [
    { key: "支給品なし", items: [] },
    { key: "包帯1", items: ["item_bandage"] },
    { key: "包帯2", items: ["item_bandage", "item_bandage"] },
    { key: "煙幕", items: ["item_smoke"] }
  ];

  function getParty(ids) {
    return ids.map((id) => window.masterAdventurers.find((a) => a.id === id)).filter(Boolean);
  }
  function pct(n, total) {
    return total === 0 ? "-" : (Math.round((n / total) * 1000) / 10).toFixed(1) + "%";
  }
  function round2(n) {
    return Math.round(n * 100) / 100;
  }
  function questWithEnemy(enemyId) {
    const base = window.masterQuests.find((q) => q.id === BASE_QUEST_ID);
    return { ...base, enemyId };
  }

  window.measureRetreat = function (opts = {}) {
    const trials = opts.trials ?? 3000;
    const out = {};

    // ---- 0. 接敵スコア（決定的なので1回で分かる）----
    // 判断は常に正しい＝接敵時は乱数が入らないので、編成×敵ごとに1つの値に決まる。
    out.contact = [];
    ENEMIES.forEach((e) => {
      const quest = questWithEnemy(e.enemyId);
      PARTIES.forEach((p) => {
        const party = getParty(p.ids);
        ["包帯1", "支給品なし"].forEach((setKey) => {
          const set = ITEM_SETS.find((s) => s.key === setKey);
          const r = window.simulateBattle(quest, party, set.items, Math.random);
          if (!r) return;
          const d = r.decisions.find((x) => x.at === "first");
          out.contact.push({
            敵: e.key,
            編成: p.key,
            支給品: set.key,
            "倒すまで(R)": d.roundsToKill,
            "持たない(R)": d.roundsToFall,
            比: d.ratio,
            接敵スコア: d.score,
            "票/必要": `${d.retreatCount}/${d.needed}`,
            "★段階1で引いた": d.retreat ? "はい" : "いいえ"
          });
        });
      });
    });

    // ---- 1. 結末と撤退の中身 ----
    out.result = [];
    ENEMIES.forEach((e) => {
      const quest = questWithEnemy(e.enemyId);
      PARTIES.forEach((p) => {
        const party = getParty(p.ids);
        ITEM_SETS.forEach((set) => {
          const stage = {};
          let contactRetreat = 0, inBattleRetreat = 0, victory = 0, defeat = 0, stalemate = 0;
          let deep = 0, downedBattles = 0, retreatLowHp = 0, failThenWin = 0, retreatFailBattles = 0;
          const downedBy = {};
          let voteEvents = 0, falterEvents = 0, holdEvents = 0, supplyOutEvents = 0;
          for (let i = 0; i < trials; i++) {
            const r = window.simulateBattle(quest, party, set.items, Math.random);
            if (!r) continue;
            stage[r.stage] = (stage[r.stage] ?? 0) + 1;
            if (r.outcome === "withdraw_first") contactRetreat++;
            else if (r.outcome === "withdraw_emergency") inBattleRetreat++;
            else if (r.outcome === "victory") victory++;
            else if (r.outcome === "defeat") defeat++;
            else stalemate++;
            if (r.outcome === "withdraw_emergency" && r.enemyHpRatio <= BATTLE_TUNING.enemyLowHpRatio) retreatLowHp++;
            if (r.retreatFailures > 0) retreatFailBattles++;
            if (r.retreatFailures > 0 && r.outcome === "victory") failThenWin++;
            if (r.events.some((ev) => ev.type === "status" && (ev.to === "深手" || ev.to === "戦闘不能"))) deep++;
            const downedNames = r.events.filter((ev) => ev.type === "status" && ev.to === "戦闘不能").map((ev) => ev.targetName);
            if (downedNames.length) {
              downedBattles++;
              downedNames.forEach((n) => { downedBy[n] = (downedBy[n] ?? 0) + 1; });
            }
            voteEvents += r.events.filter((ev) => ev.type === "vote").length;
            falterEvents += r.events.filter((ev) => ev.type === "enemy_falter").length;
            holdEvents += r.events.filter((ev) => ev.type === "retreat" && ev.at === "resolve" && !ev.retreat && ev.afterShaken).length;
            supplyOutEvents += r.events.filter((ev) => ev.type === "supply_out").length;
          }
          out.result.push({
            敵: e.key,
            編成: p.key,
            支給品: set.key,
            "★段階1で引いた": pct(contactRetreat, trials),
            交戦後に撤退: pct(inBattleRetreat, trials),
            勝利: pct(victory, trials),
            敗北: pct(defeat, trials),
            膠着: pct(stalemate, trials),
            軽: pct(stage.軽 ?? 0, trials),
            中: pct(stage.中 ?? 0, trials),
            深手発生: pct(deep, trials),
            戦闘不能が出た戦闘: pct(downedBattles, trials),
            "誰が(のべ)": Object.entries(downedBy).map(([n, c]) => `${n} ${c}`).join(" / ") || "なし",
            "★撤退のうち敵HP20%以下": inBattleRetreat === 0 ? "-" : pct(retreatLowHp, inBattleRetreat),
            撤退失敗が出た戦闘: pct(retreatFailBattles, trials),
            "失敗→続行→勝利": failThenWin,
            "ログ:票の節目/戦": round2(voteEvents / trials),
            "ログ:敵が鈍る/戦": round2(falterEvents / trials),
            "ログ:引こうとして留まった/戦": round2(holdEvents / trials),
            "ログ:包帯が尽きた/戦": round2(supplyOutEvents / trials)
          });
        });
      });
    });

    // ---- 2. 結末の分岐（generateReport を通す。煙幕・エルシー・新結末 avoid の件数）----
    out.branch = [];
    ENEMIES.forEach((e) => {
      const quest = questWithEnemy(e.enemyId);
      const original = window.masterQuests;
      [
        { label: "基準4人・包帯1", ids: PARTIES[0].ids, items: ["item_bandage"] },
        { label: "基準4人・煙幕", ids: PARTIES[0].ids, items: ["item_smoke"] },
        { label: "基準3人+エルシー・包帯1", ids: PARTIES[5].ids, items: ["item_bandage"] },
        { label: "ミナ+エルネ・包帯1", ids: PARTIES[3].ids, items: ["item_bandage"] }
      ].forEach((setDef) => {
        window.masterQuests = original.map((q) => (q.id === BASE_QUEST_ID ? quest : q));
        const branch = {};
        try {
          for (let i = 0; i < Math.round(trials / 2); i++) {
            const r = generateReport({
              questId: BASE_QUEST_ID,
              adventurerIds: setDef.ids,
              adventurerItemIds: { adv_mina: setDef.items },
              seed: Math.floor(Math.random() * 1e9),
              departTimeOfDay: "昼",
              departWeather: "晴れ"
            });
            const b = r.hiddenTags?.branch ?? "(none)";
            branch[b] = (branch[b] ?? 0) + 1;
          }
        } finally {
          window.masterQuests = original;
        }
        const total = Object.values(branch).reduce((a, b) => a + b, 0);
        out.branch.push({
          敵: e.key,
          条件: setDef.label,
          完全成功: pct((branch.great_light ?? 0) + (branch.great_wound ?? 0), total),
          "★avoid(挑まず帰る)": branch.avoid ?? 0,
          partial_detour: branch.partial_detour ?? 0,
          partial_loss: branch.partial_loss ?? 0,
          partial_elsie: branch.partial_elsie ?? 0,
          bail: branch.bail ?? 0,
          fail: branch.fail ?? 0,
          結末の種類: Object.keys(branch).join(" / ")
        });
      });
    });

    console.log("--- 0. 接敵スコア（段階1は乱数を使わないので編成×敵で決定的）---");
    console.table(out.contact);
    console.log(`--- 1. 結末と撤退の中身（各${trials}戦闘）---`);
    console.table(out.result);
    console.log("--- 2. 結末の分岐（generateReport 経由）---");
    console.table(out.branch);
    return out;
  };
})();
