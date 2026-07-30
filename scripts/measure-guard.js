// guard（武器の防御値）の式と値を測る（読み取り専用。ゲーム本体の数値・コードは一切変更しない）。
//
// なぜあるか：小さいダメージのクリティカル（「致命の一撃！6ダメージ！」で重症60分）を調べたところ、
// 素ダメージが 3 のような値になるのは guard がほぼ全部を吸っているためと分かった。
// ★ しかし 5 と 3 の間で何が起きているかを誰も測っていなかった。
//   式が急峻なのか、式は緩やかだが 5 が上限に近すぎるのかで打ち手がまったく違う。
//
// 使い方：index.html をブラウザで開き、DevTools のコンソールにこのファイルの中身を貼って
//        measureGuard() を実行する（依存パッケージなし）。
//        measureGuard({ trials: 4000 }) のように試行回数を上げられる。
//
// 式の差し替えは simulateBattle のソース文字列を組み替えて別関数を作る方式で行う
// （しきい値の掃引で pickBattleFront を差し替えたのと同じ考え方）。app.js は書き換えない。

(function () {
  const BASE_PARTY = ["adv_mina", "adv_gadd", "adv_elne", "adv_row"];
  const QUEST_ID = "quest_caravan_escort";

  // simulateBattle 内の被ダメ計算はこの1行。ここだけを差し替える。
  const GUARD_LINE = "const base = Math.max(0, Math.round(share - f.weaponGuard));";

  function getParty(ids) {
    return ids.map((id) => window.masterAdventurers.find((a) => a.id === id)).filter(Boolean);
  }
  function pct(n, total) {
    return total === 0 ? "0.0%" : (Math.round((n / total) * 1000) / 10).toFixed(1) + "%";
  }
  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  // guard の式（share＝その人の被ダメ取り分、g＝weaponGuard）。すべて 0 以上の整数を返す。
  const FORMULAS = {
    "現行（減算）": (share, g) => Math.max(0, Math.round(share - g)),
    "減算・guard×0.6": (share, g) => Math.max(0, Math.round(share - g * 0.6)),
    "減算・guard×0.3": (share, g) => Math.max(0, Math.round(share - g * 0.3)),
    "乗算 5%/点": (share, g) => Math.max(0, Math.round(share * (1 - g * 0.05))),
    "乗算 7%/点": (share, g) => Math.max(0, Math.round(share * (1 - g * 0.07))),
    "乗算 10%/点": (share, g) => Math.max(0, Math.round(share * (1 - g * 0.10))),
    "減算＋下限25%": (share, g) => Math.max(Math.round(share * 0.25), Math.max(0, Math.round(share - g))),
    "減算＋下限40%": (share, g) => Math.max(Math.round(share * 0.40), Math.max(0, Math.round(share - g)))
  };

  // simulateBattle のソースから、guard の式を差し替えた別関数を作る。
  // probe を渡すと、被弾1発ごとに {g, share, base, front} を記録する。
  function buildSim(guardFn, probe) {
    const src = window.simulateBattle.toString();
    if (src.indexOf(GUARD_LINE) === -1) {
      throw new Error("guard の式の行が見つからない。app.js の被ダメ計算が変わっている可能性がある。");
    }
    const patched = src.replace(
      GUARD_LINE,
      "const base = __GUARD_FN(share, f.weaponGuard);" +
      " if (__PROBE) __PROBE.push({ g: f.weaponGuard, id: f.id, share: share, base: base, front: f.id === front.id });"
    );
    // new Function は関数本体を大域スコープで評価するので、BATTLE_TUNING などの参照はそのまま効く。
    return new Function("__GUARD_FN", "__PROBE", "return (" + patched + ");")(guardFn, probe || null);
  }

  function withSim(fn, body) {
    const original = window.simulateBattle;
    window.simulateBattle = fn;
    try {
      return body();
    } finally {
      window.simulateBattle = original;
    }
  }

  const BANDS = [
    { label: "0ダメ", test: (d) => d === 0 },
    { label: "1-2", test: (d) => d >= 1 && d <= 2 },
    { label: "3-5", test: (d) => d >= 3 && d <= 5 },
    { label: "6-10", test: (d) => d >= 6 && d <= 10 },
    { label: "11-20", test: (d) => d >= 11 && d <= 20 },
    { label: "21+", test: (d) => d >= 21 }
  ];

  function bandRow(values) {
    const row = {};
    BANDS.forEach((b) => {
      row[b.label] = pct(values.filter(b.test).length, values.length);
    });
    return row;
  }

  // ---- 1. 被弾1発ごとの生データを集める（現行式のまま。share は guard に依存しない量）----
  function collectHits(trials) {
    const quest = window.masterQuests.find((q) => q.id === QUEST_ID);
    const party = getParty(BASE_PARTY);
    const probe = [];
    const sim = buildSim(FORMULAS["現行（減算）"], probe);
    for (let i = 0; i < trials; i++) sim(quest, party, ["item_bandage"], Math.random);
    return probe;
  }

  window.measureGuard = function (opts = {}) {
    const trials = opts.trials ?? 4000;
    const quest = window.masterQuests.find((q) => q.id === QUEST_ID);
    const enemy = window.masterEnemies.find((e) => e.id === quest.enemyId);
    const out = {};

    // ---- 現在の値 ----
    const party = getParty(BASE_PARTY);
    out.values = party.map((a) => ({
      冒険者: a.nickname || a.name,
      職業: a.job,
      guard: a.weapon?.guard ?? 0,
      武器: a.weapon?.name ?? "",
      power: a.weapon?.power ?? 0,
      maxHp: Math.round(
        (BATTLE_TUNING.jobBaseHp[a.job] ?? BATTLE_TUNING.defaultJobBaseHp) +
          (a.stats?.survival ?? 10) * BATTLE_TUNING.hpPerSurvival
      )
    }));

    const vMin = BATTLE_TUNING.varianceMin;
    const vMax = BATTLE_TUNING.varianceMax;
    const fs = BATTLE_TUNING.frontDamageShare;
    out.scale = [{
      敵: enemy.shortName || enemy.name,
      threat: enemy.threat,
      "1R総被ダメ": `${round2(enemy.threat * vMin)} 〜 ${round2(enemy.threat * vMax)}`,
      "前衛の取り分": `${round2(enemy.threat * vMin * fs)} 〜 ${round2(enemy.threat * vMax * fs)}`,
      "後衛の取り分(4人)": `${round2(enemy.threat * vMin * (1 - fs) / 3)} 〜 ${round2(enemy.threat * vMax * (1 - fs) / 3)}`,
      "guard 5 が後衛の取り分に占める割合": pct(5, enemy.threat * ((vMin + vMax) / 2) * (1 - fs) / 3)
    }];

    // ---- 1. guard 0〜5 の特性（同一の share 分布に対して式を適用する＝同一条件）----
    const hits = collectHits(Math.max(400, Math.round(trials / 8)));
    const frontShares = hits.filter((h) => h.front).map((h) => h.share);
    const rearShares = hits.filter((h) => !h.front).map((h) => h.share);
    const allShares = hits.map((h) => h.share);

    const baseMean = (shares, g) =>
      shares.reduce((s, sh) => s + FORMULAS["現行（減算）"](sh, g), 0) / shares.length;

    out.guardCurve = [];
    for (let g = 0; g <= 5; g++) {
      const applyAll = allShares.map((sh) => FORMULAS["現行（減算）"](sh, g));
      const applyFront = frontShares.map((sh) => FORMULAS["現行（減算）"](sh, g));
      const applyRear = rearShares.map((sh) => FORMULAS["現行（減算）"](sh, g));
      out.guardCurve.push({
        guard: g,
        "実効削減率 前衛": pct(1 - baseMean(frontShares, g) / baseMean(frontShares, 0), 1),
        "実効削減率 後衛": pct(1 - baseMean(rearShares, g) / baseMean(rearShares, 0), 1),
        "ダメ0割合 前衛": pct(applyFront.filter((d) => d === 0).length, applyFront.length),
        "ダメ0割合 後衛": pct(applyRear.filter((d) => d === 0).length, applyRear.length),
        "平均ダメ 前衛": round2(applyFront.reduce((a, b) => a + b, 0) / applyFront.length),
        "平均ダメ 後衛": round2(applyRear.reduce((a, b) => a + b, 0) / applyRear.length),
        "ダメ0割合 全体": pct(applyAll.filter((d) => d === 0).length, applyAll.length)
      });
    }

    // ---- 被ダメージの分布（現行の実値。各人の guard そのままで観測されたもの）----
    out.dist = [];
    party.forEach((a) => {
      const mine = hits.filter((h) => h.id === a.id);
      if (!mine.length) return;
      out.dist.push({
        冒険者: a.nickname || a.name,
        guard: a.weapon?.guard ?? 0,
        被弾数: mine.length,
        前衛率: pct(mine.filter((h) => h.front).length, mine.length),
        ...bandRow(mine.map((h) => h.base)),
        平均: round2(mine.reduce((s, h) => s + h.base, 0) / mine.length)
      });
    });
    out.dist.push({
      冒険者: "（全員）",
      guard: "—",
      被弾数: hits.length,
      前衛率: pct(hits.filter((h) => h.front).length, hits.length),
      ...bandRow(hits.map((h) => h.base)),
      平均: round2(hits.reduce((s, h) => s + h.base, 0) / hits.length)
    });

    // guard 0〜5 それぞれで、後衛の被ダメがどの帯に落ちるか。
    // ★ 「素1-5帯（クリティカルで6ダメージになる帯）」が guard のせいなのか、
    //   それとも guard 0 でもそこにしか落ちないのかを分ける。
    out.guardBands = [];
    for (let g = 0; g <= 5; g++) {
      out.guardBands.push({
        guard: g,
        位置: "後衛",
        ...bandRow(rearShares.map((sh) => FORMULAS["現行（減算）"](sh, g))),
        "1-5帯の合計": pct(
          rearShares.map((sh) => FORMULAS["現行（減算）"](sh, g)).filter((d) => d >= 1 && d <= 5).length,
          rearShares.length
        )
      });
    }
    for (let g = 0; g <= 5; g++) {
      out.guardBands.push({
        guard: g,
        位置: "前衛",
        ...bandRow(frontShares.map((sh) => FORMULAS["現行（減算）"](sh, g))),
        "1-5帯の合計": pct(
          frontShares.map((sh) => FORMULAS["現行（減算）"](sh, g)).filter((d) => d >= 1 && d <= 5).length,
          frontShares.length
        )
      });
    }

    // 位置別（同じ guard でも前衛と後衛でまったく別の振る舞いになる）
    out.byPosition = [
      { 位置: "前衛", 被弾数: frontShares.length, ...bandRow(hits.filter((h) => h.front).map((h) => h.base)) },
      { 位置: "後衛", 被弾数: rearShares.length, ...bandRow(hits.filter((h) => !h.front).map((h) => h.base)) }
    ];

    // ---- 3. 式を差し替えたときの感度（軽・深手・0割合・下位帯）----
    out.sensitivity = [];
    out.perPerson = [];
    Object.keys(FORMULAS).forEach((label) => {
      const probe = [];
      const sim = buildSim(FORMULAS[label], probe);
      const stage = { 軽: 0, 中: 0, 重: 0, 致命: 0 };
      let deep = 0;
      let rounds = 0;
      for (let i = 0; i < trials; i++) {
        const r = sim(quest, party, ["item_bandage"], Math.random);
        stage[r.stage] = (stage[r.stage] ?? 0) + 1;
        rounds += r.rounds;
        if (r.events.some((e) => e.type === "status" && (e.to === "深手" || e.to === "戦闘不能"))) deep++;
      }
      const bases = probe.map((h) => h.base);
      const nonZero = bases.filter((d) => d > 0);
      // 完全成功率は generateReport 側の branch で見る（煙幕・エルシーなしの基準編成）
      const branch = {};
      withSim(sim, () => {
        for (let i = 0; i < Math.round(trials / 2); i++) {
          const r = generateReport({
            questId: QUEST_ID,
            adventurerIds: BASE_PARTY,
            adventurerItemIds: { adv_mina: ["item_bandage"] },
            seed: Math.floor(Math.random() * 1e9),
            departTimeOfDay: "昼",
            departWeather: "晴れ"
          });
          const b = r.hiddenTags?.branch ?? "(none)";
          branch[b] = (branch[b] ?? 0) + 1;
        }
      });
      const branchTotal = Object.values(branch).reduce((a, b) => a + b, 0);
      const full = (branch.great_light ?? 0) + (branch.great_wound ?? 0);
      out.sensitivity.push({
        式: label,
        軽: pct(stage.軽, trials),
        中: pct(stage.中, trials),
        重: pct(stage.重, trials),
        深手発生: pct(deep, trials),
        "ダメ0割合": pct(bases.length - nonZero.length, bases.length),
        "素1-5の割合(0除く)": pct(nonZero.filter((d) => d <= 5).length, nonZero.length),
        "素1-5の割合(全被弾)": pct(nonZero.filter((d) => d <= 5).length, bases.length),
        平均被ダメ: round2(bases.reduce((a, b) => a + b, 0) / bases.length),
        完全成功: pct(full, branchTotal),
        平均T: round2(rounds / trials)
      });

      // 式を変えると「誰が痛むか」も動く。位置ごとの効きが変わるため。
      const row = { 式: label };
      party.forEach((a) => {
        const mine = probe.filter((h) => h.id === a.id);
        if (!mine.length) return;
        const nm = a.nickname || a.name;
        row[`${nm}(g${a.weapon?.guard ?? 0}) 平均`] = round2(mine.reduce((s, h) => s + h.base, 0) / mine.length);
        row[`${nm} 0割合`] = pct(mine.filter((h) => h.base === 0).length, mine.length);
      });
      out.perPerson.push(row);
    });

    console.log("--- 現在の guard と maxHp ---");
    console.table(out.values);
    console.log("--- 敵の攻撃力と取り分のレンジ ---");
    console.table(out.scale);
    console.log(`--- guard 0〜5 の特性（同一の share 分布 ${hits.length} 発に各 guard を適用）---`);
    console.table(out.guardCurve);
    console.log("--- 被ダメージの分布（現行値・素ダメージ）---");
    console.table(out.dist);
    console.log("--- 位置別の分布（前衛／後衛）---");
    console.table(out.byPosition);
    console.log("--- guard 0〜5 それぞれの帯分布（1-5帯が guard 由来かを分ける）---");
    console.table(out.guardBands);
    console.log(`--- 式を差し替えたときの感度（隊商護衛・基準4人・包帯1・${trials}回）---`);
    console.table(out.sensitivity);
    console.log("--- 式ごとの個人別 平均被ダメ／0割合（誰が痛むかが動く）---");
    console.table(out.perPerson);
    return out;
  };
})();
