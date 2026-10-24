// 固有依頼の連鎖（相談 → 固有依頼 → 感謝）。2026-10-24・EX-165。
//
// ★ 設計：DECISION_LOG 2026-10-24「序盤は『相談→固有依頼→感謝』を6人ぶん畳み掛ける…」「固有依頼の連鎖の作り方…」。
// ★ 文面の正本：Notion「固有依頼の連鎖の台本（確定稿）」403a8a5dfd4581378d8ae80b5fdf6d0d。**一字一句このまま**。
//   直したいときは台本の側を直してから写す。
// ★ 記号：【主人公】＝プレイヤー名（無記名なら「記録員」）。【鉄鍋】＝鉄鍋の呼び名（名簿のあだ名があればそのあだ名）。
//   会話（相談・感謝）は描画のたびに今の呼び名で差し込む。報告書は作られた時点の呼び名で閉じる（あとから変わらない）。
// ★ 配列の1要素＝会話の窓の1段落（台本の空行で区切る。台本の確定稿は空行なしの1段落）。
// ★ 文面の無い人（consult が null）のところで連鎖は止まる。仮の文をプレイヤーに見せない。
window.masterBondChain = {
  // 連鎖が始まる時機：受付嬢の②の会話（初依頼の達成）を読んだあと、6件の依頼で「未達でない報告書」が
  //   さらに何通届いたら始めるか（設計「さらに2つほど」）。②の1通を含めると 1＋この数。
  startAfterSixCleared: 2,
  chain: [
    {
      id: "bond_gadd",
      adventurerId: "adv_gadd",
      // 相談（ホームの会話の窓で1度だけ。話し手は【鉄鍋】）
      consult: {
        speaker: "【鉄鍋】",
        paragraphs: [[
          "おう、【主人公】。ちょっといいか。",
          "ギルドもだいぶサマになってきたしよ、みんなに飯を振る舞いてえんだ。",
          "昔いた宿場の、冬の粥でな。……いや、薄いやつじゃねえぞ。ちゃんと具の入ったやつだ。",
          "ただ、あの味には沢の岩塩が要る。俺が行く。誰か一緒に来てくれりゃ助かる。"
        ]]
      },
      // 固有依頼（依頼の定義は data-quests.js の quest_bond_gadd。ここは報告書の本文＝定型・揺れない）
      questId: "quest_bond_gadd",
      reportLines: [
        "一行は、【鉄鍋】の案内で塩の沢へ向かった。",
        "【鉄鍋】は道中、食べられる草をいくつも摘み、袋がふくらんでいった。",
        "沢の岩肌に白い筋が走っていた。【鉄鍋】は削った塩をひとなめして、しばらく黙った。",
        "「……これだ」とだけ言って、彼は袋の口をきつく縛った。",
        "帰り道、【鉄鍋】は「コレが要る。コレが必要なんだ。コレさえあったら……」と三度言った。「あとは、火だ。火が要る。火を熾さねえと……消えねえ火を……」と呟いたあと、頭を振った。【鉄鍋】の中の何かが解けたようだ。"
      ],
      // 感謝（固有依頼の報告書に読了の封をしたとき、会話の窓で1度だけ。話し手は【鉄鍋】）
      thanks: {
        speaker: "【鉄鍋】",
        paragraphs: [[
          "よう、できたぜ。「宿場の冬の粥」だ。みんな、食ってくれ。",
          "おかわりもある。余るくらい作ったからな！",
          "【主人公】、あんたの分は大盛りだ。……付き合ってくれて、ありがとよ。"
        ]]
      },
      // 報酬（感謝を読んだときに開く。報酬の金は 0 のまま）。中身は下の masterAbilities
      ability: "winter_porridge"
    },
    // ★ 以下は文面が未作成（台本ページで「未作成」）。consult が null なので連鎖はここで止まる
    { id: "bond_mina", adventurerId: "adv_mina", consult: null, questId: null, reportLines: null, thanks: null },
    { id: "bond_elne", adventurerId: "adv_elne", consult: null, questId: null, reportLines: null, thanks: null },
    { id: "bond_row", adventurerId: "adv_row", consult: null, questId: null, reportLines: null, thanks: null },
    // エルシー：人の言葉を話させない（相談と感謝は行動の描写と受付嬢の通訳で書く）
    { id: "bond_elsie", adventurerId: "adv_elsie", consult: null, questId: null, reportLines: null, thanks: null },
    // 受付嬢：本人は行かない（依頼主が受付嬢で、誰でも行ける）
    { id: "bond_reception", adventurerId: null, consult: null, questId: null, reportLines: null, thanks: null }
  ]
};

// アビリティ（固有依頼の報酬。2026-10-24・EX-165 の追加）。
// ★ 設計：DECISION_LOG 2026-10-24「鉄鍋の固有依頼の報酬は、アビリティ「冬越えの粥」（疲労を少し軽くする）」。
// ★ 持っているかは state.abilities（感謝を読んだときに立てる）。出発のときに遠征へ写し、報告書はそれだけを読む
//   （報告書の生成で過去の記録を読まない＝PR #150）。
// ★ 効くのは野外で休みを挟む遠出だけ（依頼データの outdoorRest）。町なかの用事には効かない。
window.masterAbilities = {
  winter_porridge: {
    name: "冬越えの粥",
    adventurerId: "adv_gadd",
    // 工程ごとに積もる疲労に掛ける倍率。★ 仮の値（制作の最後に調整する）。
    fatigueStepScale: 0.75,
    // 効いた遠征の報告書に1行（★ 仮の文面。したことだけを書き、結果は書かない）。【鉄鍋】＝呼び名。
    //   どちらを出すかは出発の種で決める（報告書の乱数を引かない）。
    lines: [
      "休みのたびに、【鉄鍋】が冬越えの粥を配った。",
      "【鉄鍋】は火の番をしながら、鍋の粥をかき混ぜていた。"
    ]
  }
};
