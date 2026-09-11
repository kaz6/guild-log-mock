// 敵ごとの手触りを並べて測る（読み取り専用。ゲーム側の数値・依頼の割り当ては変更しない）。
//
// なぜあるか：2026-07-30 時点で、測定はすべて「野盗1種類」に対するものだった。
// この状態で小さいクリティカルの閾値を決めると、野盗に最適な値になる。
// ★ さらに guard の設計仮説（連続攻撃に強く、一撃が重い敵には弱い）が未検証だった。
//
// 使い方：index.html をブラウザで開き、DevTools のコンソールにこのファイルの中身を貼って
//        measureEnemy() を実行する（依存パッケージなし）。
//        measureEnemy({ trials: 4000 }) のように試行回数を上げられる。
//
// ★ 新敵はどの依頼にも割り当てていない。既存の依頼の敵を差し替えると基準値が全部動くので、
//   ここで「隊商護衛の依頼定義の敵だけ差し替えた仮の quest」を組んで測る。

(function () {
  const BASE_PARTY = ["adv_mina", "adv_gadd", "adv_elne", "adv_row"];
  const BASE_QUEST_ID = "quest_caravan_escort";

  function getParty(ids) {
    return ids.map((id) => window.masterAdventurers.find((a) => a.id === id)).filter(Boolean);
  }
  function pct(n, total) {
    return total === 0 ? "0.0%" : (Math.round((n / total) * 1000) / 10).toFixed(1) + "%";
  }
  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  // 隊商護衛の依頼定義をコピーし、敵だけ差し替えた仮の quest を作る。
  // ★ window.masterQuests は書き換えない（既存の依頼の敵は動かさない）。
  function questWithEnemy(enemyId) {
    const base = window.masterQuests.find((q) => q.id === BASE_QUEST_ID);
    return { ...base, enemyId };
  }

  // 被弾1発ごとの生データを取るため、simulateBattle のソースを組み替えて probe を仕込む。
  // 式は1文字も変えない（記録だけを足す）。
  const TAKE_LINE = "const base = Math.max(0, Math.round(share - f.weaponGuard));";

  function buildProbedSim(probe) {
    const src = window.simulateBattle.toString();
    if (src.indexOf(TAKE_LINE) === -1) {
      throw new Error("被ダメ計算の行が見つからない。app.js の戦闘が変わっている可能性がある。");
    }
    const patched = src.replace(
      TAKE_LINE,
      TAKE_LINE + " if (__PROBE) __PROBE.push({ id: f.id, share: share, base: base, front: f.id === front.id });"
    );
    return new Function("__PROBE", "return (" + patched + ");")(probe);
  }

  const ENEMIES = [
    { key: "野盗", enemyId: "enemy_road_raiders" },
    { key: "大熊", enemyId: "enemy_ridge_bear" }
  ];

  window.measureEnemy = function (opts = {}) {
    const trials = opts.trials ?? 4000;
    const party = getParty(BASE_PARTY);
    const out = {};

    // ---- 0. 敵のステータスと、そこから決まる取り分のレンジ ----
    const vMin = BATTLE_TUNING.varianceMin;
    const vMax = BATTLE_TUNING.varianceMax;
    const fs = BATTLE_TUNING.frontDamageShare;
    out.enemies = ENEMIES.map((e) => {
      const enemy = window.masterEnemies.find((x) => x.id === e.enemyId);
      return {
        敵: enemy.shortName || enemy.name,
        HP: enemy.hp,
        threat: enemy.threat,
        "前衛の取り分": `${round2(enemy.threat * vMin * fs)} 〜 ${round2(enemy.threat * vMax * fs)}`,
        "後衛の取り分(4人)": `${round2(enemy.threat * vMin * (1 - fs) / 3)} 〜 ${round2(enemy.threat * vMax * (1 - fs) / 3)}`,
        "後衛の取り分 平均": round2(enemy.threat * ((vMin + vMax) / 2) * (1 - fs) / 3)
      };
    });

    // ---- 本体：敵ごとに1回まわして、必要な数字を全部拾う ----
    const perEnemy = {};
    ENEMIES.forEach((e) => {
      const quest = questWithEnemy(e.enemyId);
      const probe = [];
      const sim = buildProbedSim(probe);

      const stage = { 軽: 0, 中: 0, 重: 0, 致命: 0 };
      const branchKinds = new Set();
      let deep = 0;
      let rounds = 0;
      let totalIncoming = 0;
      const downedBy = {}; // 誰が戦闘不能になったか
      let downedBattles = 0;
      const critTake = []; // 被弾クリティカルの「素ダメージ」（倍にする前）
      let takeHits = 0;

      for (let i = 0; i < trials; i++) {
        const before = probe.length;
        const r = sim(quest, party, ["item_bandage"], Math.random);
        stage[r.stage] = (stage[r.stage] ?? 0) + 1;
        rounds += r.rounds;
        if (r.events.some((ev) => ev.type === "status" && (ev.to === "深手" || ev.to === "戦闘不能"))) deep++;
        // 戦闘不能は「誰が」まで拾う
        const downedNames = r.events
          .filter((ev) => ev.type === "status" && ev.to === "戦闘不能")
          .map((ev) => ev.targetName);
        if (downedNames.length) {
          downedBattles++;
          downedNames.forEach((n) => { downedBy[n] = (downedBy[n] ?? 0) + 1; });
        }
        // クリティカルの素ダメージ＝そのラウンドの probe から引き当てる
        r.events.filter((ev) => ev.type === "take" && ev.crit).forEach((ev) => {
          critTake.push(ev.damage / BATTLE_TUNING.critMultiplier);
        });
        takeHits += probe.length - before;
        totalIncoming += probe.slice(before).reduce((s, h) => s + h.base, 0);
      }

      perEnemy[e.key] = { stage, deep, rounds, probe, downedBy, downedBattles, critTake, takeHits, totalIncoming };
    });

    // ---- 1. guard の設計仮説：ロウは一撃が重い敵に弱くなるか ----
    out.guardHypothesis = [];
    party.forEach((a) => {
      const nm = a.nickname || a.name;
      const row = { 冒険者: nm, "実効guard": round2((a.weapon?.guard ?? 0) * BATTLE_TUNING.guardScale) };
      ENEMIES.forEach((e) => {
        const mine = perEnemy[e.key].probe.filter((h) => h.id === a.id);
        row[`${e.key} 平均被ダメ`] = round2(mine.reduce((s, h) => s + h.base, 0) / mine.length);
        row[`${e.key} ダメ0率`] = pct(mine.filter((h) => h.base === 0).length, mine.length);
      });
      out.guardHypothesis.push(row);
    });
    // 硬さの順位（平均被ダメの小さい順）が敵で入れ替わるか
    out.hardnessOrder = ENEMIES.map((e) => {
      const ranked = party
        .map((a) => ({
          nm: a.nickname || a.name,
          avg: perEnemy[e.key].probe.filter((h) => h.id === a.id).reduce((s, h, _, arr) => s + h.base / arr.length, 0)
        }))
        .sort((x, y) => x.avg - y.avg);
      return { 敵: e.key, "硬い順（平均被ダメの小さい順）": ranked.map((r) => `${r.nm}(${round2(r.avg)})`).join(" < ") };
    });

    // ---- 2. 小さいクリティカルがどれだけ残るか ----
    const CRIT_BANDS = [
      { label: "素1-2", test: (d) => d >= 1 && d <= 2 },
      { label: "素3-5", test: (d) => d >= 3 && d <= 5 },
      { label: "素6-10", test: (d) => d >= 6 && d <= 10 },
      { label: "素11-20", test: (d) => d >= 11 && d <= 20 },
      { label: "素21+", test: (d) => d >= 21 }
    ];
    out.critSize = ENEMIES.map((e) => {
      const c = perEnemy[e.key].critTake;
      const row = { 敵: e.key, "被弾クリティカル数": c.length };
      CRIT_BANDS.forEach((b) => { row[b.label] = pct(c.filter(b.test).length, c.length); });
      // 「致命の一撃！6ダメージ！」相当＝倍にしたあとが10以下
      row["★表示10以下（絵面が不自然）"] = pct(c.filter((d) => d * BATTLE_TUNING.critMultiplier <= 10).length, c.length);
      row["素の中央値"] = c.length ? [...c].sort((x, y) => x - y)[Math.floor(c.length / 2)] : 0;
      return row;
    });

    // ---- 3. 結末の分布（stage と branch）----
    out.stage = ENEMIES.map((e) => {
      const p = perEnemy[e.key];
      return {
        敵: e.key,
        軽: pct(p.stage.軽, trials),
        中: pct(p.stage.中, trials),
        重: pct(p.stage.重, trials),
        致命: pct(p.stage.致命, trials),
        深手発生: pct(p.deep, trials),
        平均T: round2(p.rounds / trials),
        "1戦闘の総被ダメ": round2(p.totalIncoming / trials)
      };
    });

    // branch は generateReport を通す（煙幕・エルシーの発火件数を見るため）
    out.branch = [];
    ENEMIES.forEach((e) => {
      const quest = questWithEnemy(e.enemyId);
      const original = window.masterQuests;
      [
        { label: "支給品なし", ids: BASE_PARTY, items: [] },
        { label: "包帯1", ids: BASE_PARTY, items: ["item_bandage"] },
        { label: "煙幕", ids: BASE_PARTY, items: ["item_smoke"] },
        { label: "エルシー同行", ids: [...BASE_PARTY, "adv_elsie"], items: ["item_bandage"] }
      ].forEach((set) => {
        // masterQuests を一時的に差し替えて generateReport を通す（終わったら必ず戻す）
        window.masterQuests = original.map((q) => (q.id === BASE_QUEST_ID ? quest : q));
        const branch = {};
        try {
          for (let i = 0; i < Math.round(trials / 2); i++) {
            const r = generateReport({
              questId: BASE_QUEST_ID,
              adventurerIds: set.ids,
              adventurerItemIds: { adv_mina: set.items },
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
        const full = (branch.great_light ?? 0) + (branch.great_wound ?? 0);
        out.branch.push({
          敵: e.key,
          条件: set.label,
          完全成功: pct(full, total),
          bail: branch.bail ?? 0,
          partial_loss: branch.partial_loss ?? 0,
          partial_elsie: branch.partial_elsie ?? 0,
          fail: branch.fail ?? 0,
          結末の種類: Object.keys(branch).join(" / ")
        });
      });
    });

    // ---- 4. 戦闘不能（件数と誰か）----
    out.downed = ENEMIES.map((e) => {
      const p = perEnemy[e.key];
      const who = Object.entries(p.downedBy).map(([n, c]) => `${n} ${c}件`).join(" / ") || "なし";
      return {
        敵: e.key,
        "戦闘不能が出た戦闘": `${p.downedBattles}件 / ${trials}戦闘（${pct(p.downedBattles, trials)}）`,
        "誰が（のべ件数）": who
      };
    });

    console.log("--- 敵のステータスと取り分のレンジ ---");
    console.table(out.enemies);
    console.log(`--- 1. guard の設計仮説（基準4人・包帯1・各${trials}戦闘）---`);
    console.table(out.guardHypothesis);
    console.table(out.hardnessOrder);
    console.log("--- 2. 被弾クリティカルの素ダメージ分布 ---");
    console.table(out.critSize);
    console.log("--- 3. 結末の分布 ---");
    console.table(out.stage);
    console.table(out.branch);
    console.log("--- 4. 戦闘不能 ---");
    console.table(out.downed);
    return out;
  };
})();
