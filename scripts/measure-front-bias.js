// 前衛1人に負傷が偏る原因を測る（読み取り専用。数値も選出規則も一切変更しない）。
//
// なぜあるか：2026-07-29 の棚卸しで「隊商護衛 2000回のうち負傷したのはガッドだけ、他3人は0回」と判明した。
// 第3段階の回復クールダウンが実質1人専用になっていないかを、仮説（選出が固定／配分が前衛集中／個体が脆い）
// に切り分けて確かめるために置いた。
// ★ 前衛の選び方・ダメージ配分・負傷閾値・ステータスのどれかを触ったら、必ずこれを流し直すこと。
//
// 使い方：index.html をブラウザで開き、DevTools のコンソールにこのファイルの中身を貼って
//        measureFrontBias() を実行する（依存パッケージなし）。
//        measureFrontBias({ trials: 5000 }) のように試行回数を上げられる。

(function () {
  const BASE_PARTY = ["adv_mina", "adv_gadd", "adv_elne", "adv_row"];
  const QUEST_ID = "quest_caravan_escort";

  function getParty(ids) {
    return ids.map((id) => window.masterAdventurers.find((a) => a.id === id)).filter(Boolean);
  }

  function pct(n, total) {
    return total === 0 ? "0.0%" : (n / total * 100).toFixed(1) + "%";
  }

  // 1ラウンドごとの前衛は roundLog[].frontId に残っている。最終 frontId だけ見ると交代を見落とす。
  function measureFront(partyIds, itemIds, trials) {
    const quest = window.masterQuests.find((q) => q.id === QUEST_ID);
    const party = getParty(partyIds);
    const roundsAsFront = {};
    let totalRounds = 0;
    for (let i = 0; i < trials; i++) {
      const r = simulateBattle(quest, party, itemIds, Math.random);
      if (!r) return null;
      r.roundLog.forEach((rl) => {
        roundsAsFront[rl.frontId] = (roundsAsFront[rl.frontId] ?? 0) + 1;
        totalRounds++;
      });
    }
    return partyIds.map((id) => ({
      冒険者: window.masterAdventurers.find((a) => a.id === id)?.name ?? id,
      前衛ラウンド数: roundsAsFront[id] ?? 0,
      割合: pct(roundsAsFront[id] ?? 0, totalRounds),
      平均ラウンド: (totalRounds / trials).toFixed(2)
    }));
  }

  // 前衛が倒れたら pickBattleFront は次点を返すはずなので、交代が起きない理由を確かめる。
  // 倒れた戦闘がその場で終わっているなら、交代の機会そのものが来ていないということ。
  function measureFrontDown(partyIds, itemIds, trials) {
    const quest = window.masterQuests.find((q) => q.id === QUEST_ID);
    const party = getParty(partyIds);
    let frontDowned = 0;
    const outcomeWhenDowned = {};
    let switched = 0;
    for (let i = 0; i < trials; i++) {
      const r = simulateBattle(quest, party, itemIds, Math.random);
      if (!r) return null;
      const fronts = new Set(r.roundLog.map((rl) => rl.frontId));
      if (fronts.size > 1) switched++;
      const downedFront = r.members.find((m) => m.id === r.roundLog[0]?.frontId && m.hp <= 0);
      if (downedFront) {
        frontDowned++;
        outcomeWhenDowned[r.outcome] = (outcomeWhenDowned[r.outcome] ?? 0) + 1;
      }
    }
    return {
      trials,
      前衛が倒れた戦闘: frontDowned,
      前衛が倒れた率: pct(frontDowned, trials),
      前衛が交代した戦闘: switched,
      倒れたときの決着: outcomeWhenDowned
    };
  }

  // 被ダメ総量は events の take、最終HP率は members から取る。どちらも simulateBattle の戻り値そのまま。
  function measureIntake(partyIds, itemIds, trials) {
    const quest = window.masterQuests.find((q) => q.id === QUEST_ID);
    const party = getParty(partyIds);
    const acc = {};
    let totalRounds = 0;
    partyIds.forEach((id) => { acc[id] = { damage: 0, ratios: [], zeroHits: 0, hits: 0 }; });
    for (let i = 0; i < trials; i++) {
      const r = simulateBattle(quest, party, itemIds, Math.random);
      if (!r) return null;
      totalRounds += r.roundLog.length;
      r.events.filter((e) => e.type === "take").forEach((e) => {
        if (acc[e.targetId]) { acc[e.targetId].damage += e.damage; acc[e.targetId].hits++; }
      });
      // damage 0 の被弾は take イベントに出ない（guard で削り切られた分）。ラウンド数との差で数える。
      r.roundLog.forEach((rl) => {
        rl.hits.forEach((h) => { if (acc[h.id] && h.damage === 0) acc[h.id].zeroHits++; });
      });
      r.members.forEach((m) => { if (acc[m.id]) acc[m.id].ratios.push(m.maxHp > 0 ? m.hp / m.maxHp : 1); });
    }
    return partyIds.map((id) => {
      const a = acc[id];
      const sorted = [...a.ratios].sort((x, y) => x - y);
      const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
      const below = (t) => sorted.filter((v) => v <= t).length;
      const adv = window.masterAdventurers.find((x) => x.id === id);
      const surv = adv?.stats?.survival ?? 10;
      const maxHp = Math.round((BATTLE_TUNING.jobBaseHp[adv?.job] ?? BATTLE_TUNING.defaultJobBaseHp) + surv * BATTLE_TUNING.hpPerSurvival);
      return {
        冒険者: adv?.name ?? id,
        被ダメ平均: (a.damage / trials).toFixed(1),
        // ★ 編成が変わるとラウンド数も変わるので、素の総量だけで前衛の脆さを比べない。
        "1R被ダメ/maxHp": ((a.damage / totalRounds) / maxHp * 100).toFixed(1) + "%",
        有効被弾: a.hits,
        ゼロ被弾: a.zeroHits,
        最終HP率最低: (sorted[0] * 100).toFixed(1) + "%",
        "5%点": (at(0.05) * 100).toFixed(1) + "%",
        中央値: (at(0.5) * 100).toFixed(1) + "%",
        "70%以下": pct(below(0.70), sorted.length),
        "35%以下": pct(below(0.35), sorted.length)
      };
    });
  }

  // HP と guard は simulateBattle と同じ式で出す（app.js の BATTLE_TUNING をそのまま参照する）。
  function statTable(partyIds) {
    return partyIds.map((id) => {
      const a = window.masterAdventurers.find((x) => x.id === id);
      const surv = a.stats?.survival ?? 10;
      const base = BATTLE_TUNING.jobBaseHp[a.job] ?? BATTLE_TUNING.defaultJobBaseHp;
      return {
        冒険者: a.name,
        job: a.job,
        前衛順: BATTLE_TUNING.frontOrder.indexOf(a.job) === -1 ? "-" : BATTLE_TUNING.frontOrder.indexOf(a.job) + 1,
        survival: surv,
        maxHp: Math.round(base + surv * BATTLE_TUNING.hpPerSurvival),
        guard: a.weapon?.guard ?? 0,
        combat: a.stats?.combat ?? 10,
        support: a.stats?.support ?? 10,
        courage: a.stats?.courage ?? 15
      };
    });
  }

  window.measureFrontBias = function (opts = {}) {
    const trials = opts.trials ?? 2000;
    const itemIds = opts.itemIds ?? ["item_bandage"];
    const noGadd = BASE_PARTY.filter((id) => id !== "adv_gadd");

    console.log(`--- 1. 前衛選出の分布 / 基準4人 × ${trials}回（ラウンド単位）---`);
    console.table(measureFront(BASE_PARTY, itemIds, trials));
    console.log(`--- 1b. ガッドを外した3人 × ${trials}回 ---`);
    console.table(measureFront(noGadd, itemIds, trials));
    console.log(`--- 1c. 前衛の交代が起きるか / 基準4人 × ${trials}回 ---`);
    console.table([measureFrontDown(BASE_PARTY, itemIds, trials)]);

    console.log(`--- 2. 前衛と後衛の受け方 / 基準4人 × ${trials}回 ---`);
    console.table(measureIntake(BASE_PARTY, itemIds, trials));
    console.log(`--- 2b. ガッドを外した3人 × ${trials}回 ---`);
    console.table(measureIntake(noGadd, itemIds, trials));

    console.log("--- 3. 4人のステータス比較 ---");
    console.table(statTable(BASE_PARTY));

    console.log("負傷は最終HP率が 70% 以下（軽症）と 35% 以下（重症）で決まる。上の「70%以下」列がそのまま負傷率。");
  };
})();
