// エルシーに人間の行動をさせていないかを機械的に洗う（読み取り専用。ゲーム側の状態は変更しない）。
//
// なぜあるか：2026-08-06（EX-056）。工程エンジンの「担い手」は
// **その依頼の育成値をパーティで一番持っている者**で決まり、エルシー（犬）も候補に入る。
// ★ 担い手の名前は「効いた瞬間」や依頼専用の行の主語になるので、犬が担い手になると
//   「エルシーが道と目印を先に読み…」のように **CURRENT_SPEC のエルシー仕様が禁じた行動** を書いてしまう。
//   実際に9依頼で起きていた。`fieldworkHumanOnly` / `fieldworkSteps[].humanOnly` を宣言すれば
//   担い手から犬が外れるが、**依頼を足したときの書き忘れは宣言では防げない**ので、これで洗う。
//
// 使い方：index.html をブラウザで開き、DevTools のコンソールにこのファイルの中身を貼って
//        checkElsieActions() を実行する（依存パッケージなし）。
//        checkElsieActions({ trials: 60 }) のように回数を変えられる。
//
// 見方：violations が0件なら通っている。1件でもあれば、その依頼に humanOnly の宣言が要る
//      （または文面を犬でも成り立つ書き方に直す）。

(function () {
  const HUMANS = ["adv_mina", "adv_gadd", "adv_elne", "adv_row"];
  const DOG = "adv_elsie";

  // CURRENT_SPEC「エルシー仕様」の**させない行動**をそのまま写したもの。
  // ★ 表を新設したのではなく、仕様の文言を検査条件として書き下しているだけ。
  const FORBIDDEN = [
    { name: "記録する", re: /記録|書き留|書き損じ|報告書に残/ },
    { name: "説明する", re: /説明|言い添え|口添え/ },
    { name: "声をかける", re: /声をかけ|呼びかけ/ },
    { name: "読む", re: /読み|読む|読ん/ },
    { name: "修理する", re: /修理|繕っ|直し/ },
    { name: "納品書を確認する", re: /納品書/ },
    { name: "拓本を取る", re: /拓本|写し取/ },
    { name: "会話する", re: /会話|話を通|話しかけ|と言った|と話/ },
    // 上の8つは仕様の列挙そのもの。以下は実測で出た「人間の手仕事」の言い回し。
    { name: "道具や手当てを整える", re: /手当て|段取り|道具と|先回りで整え|整え/ }
  ];

  function partyCombos() {
    const combos = [];
    for (let mask = 1; mask < 1 << HUMANS.length; mask++) {
      const ids = HUMANS.filter((_, i) => mask & (1 << i));
      combos.push({ label: ids.join("+") + "+犬", ids: [...ids, DOG] });
    }
    return combos;
  }

  window.checkElsieActions = function (opts = {}) {
    const trials = opts.trials ?? 40;
    const dog = window.getAdventurer ? window.getAdventurer(DOG) : null;
    const dogName = dog ? (dog.nickname || dog.name) : "エルシー";

    // 担い手を読む2か所（「効いた瞬間」と樽の行）を包んで、主語と文面を控える。
    const origSupport = window.fieldworkSupportTexts;
    const origBarrel = window.tavernBarrelLine;
    let picked = [];
    window.fieldworkSupportTexts = function (support) {
      const texts = origSupport.apply(this, arguments);
      picked.push({ where: "効いた瞬間", name: support && support.name, statKey: support && support.statKey, texts });
      return texts;
    };
    window.tavernBarrelLine = function (fw) {
      const text = origBarrel.apply(this, arguments);
      const lead = (fw && fw.stepLeads && fw.stepLeads[fw.stepLeads.length - 1]) || (fw && fw.lead) || null;
      picked.push({ where: "依頼専用の行", name: lead && lead.name, statKey: lead && lead.statKey, texts: text ? [text] : [] });
      return text;
    };

    const violations = [];
    const dogLeads = [];
    let reports = 0;

    try {
      window.masterQuests.forEach((quest) => {
        const declaredAll = quest.fieldworkHumanOnly === true;
        partyCombos().forEach((combo) => {
          let seed = 1;
          let dogLeadCount = 0;
          const seen = new Set();
          for (let i = 0; i < trials; i++) {
            picked = [];
            const report = window.generateReport({
              questId: quest.id,
              adventurerIds: combo.ids,
              itemIds: [],
              adventurerItemIds: {},
              departTimeOfDay: i % 2 ? "夜" : "昼",
              departWeather: ["晴れ", "曇り", "小雨", "霧", "風が強い"][i % 5],
              seed: (seed++) * 7919
            });
            reports += 1;
            if (!report.hiddenTags || !report.hiddenTags.fieldwork) continue;
            picked.forEach((p) => {
              if (p.name !== dogName) return;
              dogLeadCount += 1;
              p.texts.forEach((text) => {
                if (!text || !text.includes(dogName)) return;
                FORBIDDEN.forEach((f) => {
                  if (!f.re.test(text)) return;
                  const key = quest.id + "|" + p.where + "|" + f.name + "|" + text;
                  if (seen.has(key)) return;
                  seen.add(key);
                  violations.push({
                    依頼: quest.title,
                    編成: combo.label,
                    場所: p.where,
                    育成値: p.statKey,
                    禁じた行動: f.name,
                    文面: text,
                    宣言: declaredAll ? "fieldworkHumanOnly あり" : "宣言なし"
                  });
                });
              });
            });
          }
          if (dogLeadCount > 0) {
            dogLeads.push({ 依頼: quest.title, 編成: combo.label, 回数: dogLeadCount, 宣言: declaredAll ? "あり" : "なし" });
          }
        });
      });
    } finally {
      window.fieldworkSupportTexts = origSupport;
      window.tavernBarrelLine = origBarrel;
    }

    console.log("報告書", reports, "件を検査（依頼", window.masterQuests.length, "× 編成", partyCombos().length, "× 各", trials, "件）");
    console.log("エルシーが担い手になった組み合わせ:", dogLeads.length, "件");
    if (dogLeads.length > 0) console.table(dogLeads);
    console.log(violations.length === 0 ? "違反 0件" : "★ 違反 " + violations.length + "件");
    if (violations.length > 0) console.table(violations);
    return { reports, dogLeads, violations };
  };
})();
