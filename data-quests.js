// outcomes：その依頼で起こりうる結末の候補（2026-08-01・段階①でコードからここへ移した）。
// 完遂（full）／部分（partial）／未達（fail）の3段階で持つ。工程エンジンの結果の段階と同じ形なので、
// 結末と段階の対応表を別に持たなくてよい（app.js の GROWTH_TIER_BY_RESULT はここから作られる）。
// fail が空の依頼は、未達のとき共通の「引き返し」に落ちる。
// 並び順は移行前のコードのままにしてある（同じ乱数で同じ結末になるため）。
// 掲示板の規則（2026-09-15・EX-102）。★ 値はデータ側に持つ。
//   slots    ＝掲示板に同時に並べる上限（EX-049 の確定事項「最大6枚」）。
//             ⚠️ 捜索チェーンの緊急依頼はこの枠の外（割り込みなので枠に食わせない）。
//   cooldown ＝一度行った依頼が引っ込む長さ。単位は**依頼の消化数**（EX-049 の確定事項
//             「クールタイムは消化数1〜3」）。実施回数で 1→2→3→1… と巡回する。
//   ★ 夜道 v2 の `reappearAfterCount`（倒すまで戻る）とは**器は同じだが規則が別物**。
//     あちらは「勝つまで戻り、勝ったら二度と出ない」、こちらは「行ったら引っ込み、また戻る」。
//     両方を持つ依頼は、まず `reappearAfterCount` で判定し、そちらが出すと言ったものだけ
//     クールタイムを見る（＝厳しい側が勝つ）。
window.masterBoardRules = {
  slots: 6,
  cooldown: { min: 1, max: 3 }
};

window.masterQuests = [
  {
    // ★ 最初のクエスト（2026-08-05・EX-053）。記録係の就任祝いの酒樽を買いに行く。
    //   初期公開はこの1件だけで、クリアすると結婚式・夕市・夜道が開く。
    //   ★ 酒場はギルド内画面として持たず、画面外の場所としてログと会話の中にだけ出す。
    id: "quest_tavern_errand",
    title: "隣の酒場に買い出し",
    // ★ 2026-09-21・EX-140【3】：**一度きり**（一度行ったら二度と掲示板に出ない）。
    //   ⚠️ これで下の `firstRunNeverFails` の「2回目以降は通常の判定に戻る」は**到達しなくなる**が、
    //     旗は残す——**例外の理由はデータから読めるべき**で、一度きりを外したときに黙って挙動が変わらないため。
    oneTime: true,
    category: "生活",
    danger: "低",
    area: "ギルドの隣の酒場",
    // ★ 2026-09-18・EX-133 に 20秒 → 10秒（確定事項「最初の依頼は10〜30秒」の下限）。
    //   ⚠️ 作者が実機で遊んで20秒は長いと判断した。
    durationBand: "near_10s",
    // ★ 工程ごとに参照する育成値を宣言する（2026-08-06・EX-054）。
    //   ★ 工程数は `fieldworkPhases` が持つ（2026-08-13・EX-057 で宣言と切り離した。
    //     宣言の要素数では決めない）。この依頼は2工程固定。
    //   「樽を担ぐ」は体力に対応する値として survival を流用する（新設はしない）。
    //   ★ survival は maxHp の元でもあり、体力に対応する育成値は現状これ1つ。
    //   ★ どちらの工程も担い手は人間だけ（2026-08-06・EX-056）。犬は話を通せないし樽も担げない。
    //   力量の計算はこれまでどおりエルシーも数える（外すのは名前が文に出る側だけ）。
    fieldworkPhases: 2,
    fieldworkSteps: [
      { label: "店主と話を通す", stat: "negotiation", humanOnly: true },
      { label: "樽を担ぐ", stat: "survival", humanOnly: true }
    ],
    recommended: ["豪胆", "世話焼き", "慎重"],
    tags: ["生活", "買い出し", "運搬", "酒場", "祝い"],
    observationTarget: "なし",
    tensionBase: 10,
    tensionRange: 10,
    summary: "記録係の就任祝いに出す酒樽を、ギルドの隣の酒場まで買いに行く。代金はギルドの財布から出る。",
    // ★ 初回だけの例外（2026-08-06 裁定／2026-09-18・EX-131 で実装）。
    //   **この依頼を一度も行っていない回に限り、未達（出直し）を出さず完遂に落とす。**
    //   2回目以降は通常の判定に戻る。
    //   ★ 理由：初期加入は3人＋エルシー固定で**初回は編成の選択肢がほぼない**。
    //     プレイヤーの判断が効いていない状態で失敗させるのは「プレイヤーを責めない」に反する。
    //     最初の1件は**短時間で帰還してログが読める**ことが目的なので、初手が未達だとその体験が成立しない。
    //   ⚠️ **負荷の数値を下げて結果的に未達が出なくなる形にはしない。** 結果的に0%へ近づけても
    //     保証にはならず、**例外であることがデータから読めない**。例外は例外としてここに書く
    //     （`outcomeOverride` と同じ扱い）。
    //   ★ 部分（寄り道）は初回でもそのまま出る。**引き上げるのは未達だけ**なので、
    //     結末の幅と担ぎ手の書き分けは初回でも失われない。
    firstRunNeverFails: true,
    // ★ 金の例外（2026-09-23・EX-144。保留タスク「酒樽の代金を実際に減らす」をここで畳んだ）。
    //   遠征費の代わりに**酒樽の代金**を払い、報酬は無い。
    //   ★ **最初に見る金の動きが、報酬ではなく自分のための支出になる**（設計ページ）。
    //   ⚠️ 値は仮置き（data-money.js と同じ扱い。制作の最後に作者が調整する）。
    money: { fee: 30, feeLabel: "酒樽の代金", reward: 0 },
    outcomes: { full: ["成功", "上機嫌"], partial: ["寄り道"], fail: ["出直し"] }
  },
  {
    id: "quest_herb",
    // ★ 工程の担い手は人間だけ（2026-08-06・EX-056）。力量の計算はこれまでどおりエルシーも数える。
    fieldworkHumanOnly: true,
    title: "森の薬草採集",
    category: "探索",
    danger: "低",
    area: "薄明の森",
    durationBand: "short_1h",
        // ★ 2026-09-21・EX-140【3】：掃除クリアで開く6件のひとつ（親を「古い道標の確認」から掃除へ）。
    //   ★ 6枠目に1時間の依頼を置くのは裁定1＝A。所要が1分〜1時間に散り、同時遠征が活きる。
    unlockedBy: "quest_guild_cleanup",
    recommended: ["斥候", "薬草師"],
    tags: ["探索", "採集", "観察"],
    observationTarget: "森喰い兎",
    tensionBase: 25,
    tensionRange: 20,
    summary: "森の浅い場所で薬草を採集する。小型の獣による荷荒らしが報告されている。",
    outcomes: { full: ["成功", "採集優先", "観察優先"], partial: ["小成功"], fail: [] }
  },
  {
    // ★ 調査ジャンルの1件目（2026-09-15・EX-106）。★ **前情報のない任務**——村人が
    //   「見たことのない草がある」と言ってきただけで、何なのかは誰も知らない。
    //   ★ 観察記録が主眼。仮称は命名の対象になりうる形で置く（正式名が付くのは体験版の後）。
    id: "quest_unknown_grass",
    // ★ 担い手は人間だけ（2026-09-11・EX-074／2026-09-15・EX-106）。この依頼は category が「調査」で、
    //   効いた瞬間の文面は statKey（investigation）で選ばれる。investigation には犬固有の文が無いので、
    //   どの工程を犬が担っても人間用の記録の文が出る（古い石碑の拓本と同じ理由）。
    fieldworkHumanOnly: true,
    title: "森の際に出た見慣れない草の確認",
    category: "調査",
    danger: "低",
    area: "森の際の湿った窪地",
    durationBand: "short_30m",
    unlockedBy: "quest_herb",
    recommended: ["薬草師", "慎重"],
    tags: ["調査", "植物", "記録", "未同定"],
    // ★ 呼称は既存に合わせて**鉤括弧で「なにか」を括る**形（「なにか」／嚙みつく「なにか」）。
    //   入れ子を避けるため、内側は二重鉤括弧にしている。
    observationTarget: "灰かぶりのような『なにか』",
    observationKind: "植物",
    tensionBase: 20,
    tensionRange: 14,
    // ★ 文面は 2026-09-15・EX-108 でチャット側が本置き（それまでは仮置きだった）。
    summary: "森の際の窪地に、見たことのない草が出ているという。村の者が言うには、去年までは無かったらしい。名も毒の有無も分からない。",
    outcomes: { full: ["群生確認", "標本確保"], partial: ["採取見送り"], fail: [] }
  },
  {
    id: "quest_signpost",
    // ★ 工程の担い手は人間だけ（2026-08-06・EX-056）。力量の計算はこれまでどおりエルシーも数える。
    fieldworkHumanOnly: true,
    title: "古い道標の確認",
    category: "探索",
    danger: "低",
    area: "古い街道",
    durationBand: "short_30m",
    unlockedBy: "quest_old_house_cleanup",
    recommended: ["斥候"],
    tags: ["探索", "街道", "記録"],
    observationTarget: "なし",
    tensionBase: 18,
    tensionRange: 16,
    summary: "雨で傾いた道標を確認し、街道記録と照合する。戦闘は想定されていない。",
    outcomes: { full: ["成功"], partial: ["応急処置", "照合保留", "再確認"], fail: [] }
  },
  {
    id: "quest_letter",
    title: "届けられなかった手紙",
    category: "生活",
    danger: "低",
    area: "雨待ちの街道",
    durationBand: "short_1h",
    unlockedBy: "quest_herb_delivery",
    recommended: ["慎重", "郵便配達人"],
    tags: ["生活", "配達", "記録"],
    observationTarget: "なし",
    tensionBase: 16,
    tensionRange: 14,
    summary: "宿場に残された古い手紙を、記録上の宛先まで届ける。簡単な確認依頼。",
    outcomes: { full: ["成功", "持ち帰り"], partial: ["再配達", "部分成功"], fail: [] }
  },
  {
    id: "quest_wedding_support",
    title: "結婚式の手伝い",
    category: "生活",
    danger: "低",
    area: "町の小さな祝宴会場",
    durationBand: "near_10m",
        // ★ 2026-09-21・EX-140【3】：掃除クリアで開く6件のひとつ（親を酒場から掃除へ付け替えた）。
    unlockedBy: "quest_guild_cleanup",
    recommended: ["世話焼き", "郵便配達人", "豪胆"],
    tags: ["生活", "祝宴", "運搬", "案内", "地域"],
    observationTarget: "なし",
    tensionBase: 15,
    tensionRange: 15,
    summary: "町の小さな結婚式を手伝う。会場設営、料理の運搬、招待客の案内、夜間の見回り、迷子対応を行う。",
    outcomes: { full: ["成功", "感謝"], partial: [], fail: ["小さな失敗"] }
  },
  {
    id: "quest_guild_cleanup",
    title: "ギルドの掃除",
    category: "生活",
    danger: "低",
    area: "ギルドの中",
    // ★ 2026-09-21・EX-140【3】：1分 → 20秒（`near_20s` は EX-133 で潰さず残してあった帯）。
    durationBand: "near_20s",
    // ★ 2026-09-21・EX-140【3】：序盤の流れは **酒場 → 掃除 → 6件**（外へ出す → ギルドの中を知る → 世界が開く）。
    //   ★ **この依頼が6件の解禁元**（廃屋・結婚式・夕市・夜道・小橋・森の薬草採集）。
    //   ★ **一度きり**。酒場と同じく、一度行ったら二度と掲示板に出ない。
    oneTime: true,
    unlockedBy: "quest_tavern_errand",
    // ★ 本作で唯一、報告書の書き手が受付嬢（アルメナ）になる例外（2026-08-18・EX-064）。
    //   文は定型で、可変部は参加者の名前だけ（記録係＋出した冒険者＋エルシー。記録係も現場にいる）。
    //   ★ 語彙の判定・工程エンジン・担い手の選出を使わない。app.js はこの2つの旗で分岐する
    //   （例外であることがこのデータから読めるようにするための旗。id のハードコードでは分岐しない）。
    reportAuthor: "receptionist",
    fixedReport: true,
    // ★ 金の例外（2026-09-23・EX-144）：**ギルド内の仕事なので費用も報酬も無い**（設計ページの仮の値）。
    money: { fee: 0, reward: 0 },
    recommended: ["世話焼き", "記録", "慎重"],
    tags: ["生活", "掃除", "ギルド", "地域"],
    observationTarget: "なし",
    // tensionBase を持たせない＝緊張度の抽選も使わない（定型文のため）
    // ★ あらすじだけは掲示板に出る受付の貼り紙の文体（依頼主＝ギルド自身のため）
    summary: "ギルドの大掃除を行います。手すきの方はお手伝いください。お昼はこちらで用意します。——受付",
    // ★ 結末は1種（定型文なので分岐しない）。app.js の定型報告書と同じ語にする
    outcomes: { full: ["おつかれさまでした"], partial: [], fail: [] }
  },
  {
    id: "quest_old_house_cleanup",
    title: "廃屋の片付け",
    category: "生活",
    danger: "低",
    area: "町外れの古い家屋",
    durationBand: "near_1m",
    // ★ 2026-09-21・EX-140【3】裁定2：`unlockedAfterCount: 2` をやめ、掃除へ付け替えた。
    //   ⚠️ 新しい流れでは達成数2件は**酒場＋掃除でしか満たせない**ので、条件としては意味を失っていた。
    //     さらに**将来ここへ依頼を足すと、廃屋の解禁が黙って前にずれる**（罠になる）。
    //   ★ 2026-08-06 の「廃屋を別の特定クエストに繋ぎ直す」は当時却下したが、却下理由（順路が塞がる）は
    //     **掃除が全員必ず通る地点なので今回は成立しない**。理由が無効になったうえでの撤回。
    unlockedBy: "quest_guild_cleanup",
    recommended: ["慎重", "豪胆", "記録"],
    tags: ["生活", "片付け", "記録", "荷運び", "古物"],
    observationTarget: "なし",
    tensionBase: 28,
    tensionRange: 20,
    summary: "町外れの古い家屋を片付ける。壊れた家具、古い手紙、小物、埃をかぶった生活用品を整理する。",
    outcomes: { full: ["成功", "整理完了"], partial: ["一部保留"], fail: [] }
  },
  {
    id: "quest_field_mystery",
    title: "畑を荒らす「なにか」の追い払い",
    category: "戦闘",
    danger: "低",
    area: "村はずれの畑",
    durationBand: "short_30m",
    unlockedBy: "quest_signpost",
    recommended: ["戦士", "慎重", "観察"],
    tags: ["戦闘", "追い払い", "未同定", "畑"],
    observationTarget: "「なにか」",
    tensionBase: 45,
    tensionRange: 15,
    enemyId: "enemy_field_pest",
    battleEffectiveItemIds: ["item_bandage"],
    summary: "畑を荒らす未同定の小さな影を追い払う。討伐ではなく、畑の外へ押し返すことが目的。",
    outcomes: { full: ["追い払い"], partial: ["追い払い中止"], fail: ["追い払い失敗"] }
  },
  {
    id: "quest_barn_bite",
    title: "納屋に巣食う噛みつく「なにか」の討伐",
    category: "戦闘",
    danger: "中",
    area: "古い納屋",
    durationBand: "short_1h",
    unlockedBy: "quest_field_mystery",
    recommended: ["戦士", "豪胆", "観察"],
    tags: ["戦闘", "討伐", "未同定", "納屋"],
    observationTarget: "嚙みつく「なにか」",
    // ★ 観察記録の既定を引く種別（2026-09-15・EX-105）。生態目録の分類語と同じ語を使う。
    //   専用分岐（`generateAdventurerObservationNote` の依頼固有の関数）を持つ対象には要らない。
    //   ⚠️ この依頼は専用分岐を持たないので、これが無いと「詳細な記録はできなかった」に落ちていた。
    observationKind: "獣",
    tensionBase: 72,
    tensionRange: 18,
    enemyId: "enemy_barn_biter",
    battleEffectiveItemIds: ["item_bandage"],
    summary: "納屋の奥に巣食い、家畜や人に噛みつく未同定の相手を仕留める。追い払いではなく討伐が必要。",
    outcomes: { full: ["討伐"], partial: ["討伐中止"], fail: ["討伐失敗"] }
  },
  {
    id: "quest_old_bridge_repair",
    // ★ 工程の担い手は人間だけ（2026-08-06・EX-056）。力量の計算はこれまでどおりエルシーも数える。
    fieldworkHumanOnly: true,
    title: "古い小橋の応急修理",
    category: "保全",
    danger: "低",
    area: "村はずれの小川",
    durationBand: "short_30m",
        // ★ 2026-09-21・EX-140【3】：掃除クリアで開く6件のひとつ（親を「夕市帰りの親子の付き添い」から掃除へ）。
    unlockedBy: "quest_guild_cleanup",
    recommended: ["戦士", "慎重", "見習い盾役"],
    tags: ["保全", "修繕", "水辺", "足場", "応急処置", "地域"],
    observationTarget: "なし",
    tensionBase: 30,
    tensionRange: 20,
    summary: "村はずれの小川にかかる古い小橋を応急修理する。板の緩み、手すり、足場を確認し、通行できる状態に戻す。",
    outcomes: { full: ["応急修理", "通行可"], partial: ["一部保留"], fail: [] }
  },
  {
    id: "quest_church_patrol",
    // ★ 工程の担い手は人間だけ（2026-08-06・EX-056）。力量の計算はこれまでどおりエルシーも数える。
    fieldworkHumanOnly: true,
    title: "辺境教会周辺の定期巡回",
    category: "保全",
    danger: "低",
    area: "辺境教会の外縁",
    durationBand: "mid_2h",
    unlockedBy: "quest_old_bridge_repair",
    recommended: ["斥候", "慎重", "見習い盾役"],
    tags: ["保全", "巡回", "安全確認", "定期", "地域", "辺境教会", "祈り場"],
    observationTarget: "なし",
    tensionBase: 20,
    tensionRange: 15,
    summary: "辺境教会の周辺を巡回し、道、柵、鐘楼、花壇、礼拝堂外縁に異常がないか確認する。最近、夜明け前に小さな灯りを見たという話がある。",
    outcomes: { full: ["異常なし", "軽微な対処"], partial: ["要再確認", "小さな違和感"], fail: [] }
  },
  {
    id: "quest_herb_delivery",
    // ★ 担い手に犬を許す（2026-08-18・EX-057 裁定）。においで薬草を見分けるのは犬の領分で、
    //   むしろエルシーの見せ場。犬が担い手のときは犬固有の文（fieldworkSupportTexts）が出る。
    //   （2026-08-06 の EX-056 で一度 fieldworkHumanOnly: true を付けたが、犬用の文面が入ったので外した）
    title: "薬草包みの納品",
    category: "輸送",
    danger: "低",
    area: "雨待ちの街道",
    durationBand: "short_30m",
    unlockedBy: "quest_wedding_support",
    recommended: ["薬草師", "斥候", "慎重"],
    tags: ["輸送", "配達", "薬草", "街道", "壊れ物", "地域"],
    observationTarget: "なし",
    tensionBase: 28,
    tensionRange: 22,
    summary: "村の調合所から受け取った薬草包みを、街道沿いの診療所へ届ける。濡れや揺れに気をつけながら、指定の時刻までに納品する。",
    outcomes: { full: ["納品完了", "時刻内納品"], partial: ["一部注意"], fail: [] }
  },
  {
    id: "quest_missing_herbalist",
    // ★ 工程の担い手は人間だけ（2026-08-06・EX-056）。力量の計算はこれまでどおりエルシーも数える。
    fieldworkHumanOnly: true,
    title: "帰ってこない薬草採りの確認",
    // ★ 2026-09-15（EX-103）に 救助 → 捜索 へ付け替えた。**分類が実態と合っていなかった**——
    //   あらすじは「朝に出た村人が夕方になっても戻らない。森の浅い場所を確認し、必要なら保護して連れ帰る」で、
    //   `tags` も最初から「捜索」を持っている。★ 成長 stat が 探索+支援 → 探索+調査 に変わるのは、
    //   **分類が正しくなった結果**であって副作用ではない（2026-09-15 の裁定）。
    category: "捜索",
    danger: "中",
    area: "薄明の森の浅瀬",
    durationBand: "mid_2h",
    unlockedBy: "quest_barn_bite",
    recommended: ["斥候", "薬草師", "慎重"],
    tags: ["救助", "捜索", "薬草", "森", "足跡", "帰還", "地域"],
    observationTarget: "なし",
    tensionBase: 58,
    tensionRange: 28,
    summary: "朝に薬草を採りに出た村人が、夕方になっても戻らない。森の浅い場所を確認し、必要なら保護して連れ帰る。",
    outcomes: { full: ["保護", "発見"], partial: ["痕跡確認"], fail: [] }
  },
  {
    id: "quest_evening_market_escort",
    // ★ 工程の担い手は人間だけ（2026-08-06・EX-056）。力量の計算はこれまでどおりエルシーも数える。
    fieldworkHumanOnly: true,
    title: "夕市帰りの親子の付き添い",
    category: "護衛",
    danger: "低",
    area: "夕暮れの街道",
    durationBand: "near_10m",
        // ★ 2026-09-21・EX-140【3】：掃除クリアで開く6件のひとつ（親を酒場から掃除へ付け替えた）。
    unlockedBy: "quest_guild_cleanup",
    recommended: ["見習い盾役", "斥候", "慎重"],
    tags: ["護衛", "付き添い", "夕方", "街道", "親子", "地域", "帰還"],
    observationTarget: "なし",
    tensionBase: 42,
    tensionRange: 25,
    summary: "夕市から帰る親子を、町外れの家まで付き添う。荷物を持ち、暗くなる前に安全な道を選んで帰す。",
    outcomes: { full: ["無事帰宅", "安全確認"], partial: ["遠回り帰宅"], fail: [] }
  },
  {
    id: "quest_caravan_escort",
    // ★ 捜索チェーンに関わる依頼（2026-09-20・EX-138 の裁定b）。**同時に1本まで**。
    //   チェーンは物語の一本道で、2本並ぶと「どの隊商の話か」が報告書から読めなくなる。
    chainSlot: true,
    title: "街道の外れを行く隊商の護衛",
    category: "護衛",
    danger: "中",
    area: "生活圏の外縁を抜ける街道",
    durationBand: "mid_3h",
    unlockedBy: "quest_barn_bite",
    recommended: ["戦士", "見習い盾役", "斥候"],
    tags: ["護衛", "隊商", "戦闘", "街道", "撤退判断", "掴み"],
    observationTarget: "なし",
    tensionBase: 55,
    tensionRange: 25,
    enemyId: "enemy_road_raiders",
    battleEffectiveItemIds: ["item_bandage"],
    summary: "生活圏の外縁を抜ける隊商を護る。道中で野盗に会敵しうる。強行突破・煙幕での離脱回避・護り切れず撤退の三つに分かれる。",
    // ★ 交戦回避（依頼未達）は未達（2026-08-01・段階4で直した）。挑まずに隊商ごと引き返した回で、
    //   名前のとおり依頼を達していない。移行前は登録漏れで完全成功として成長計算されていた。
    outcomes: { full: ["護衛成功", "護衛成功（負傷）"], partial: ["隊商通過（遅延あり）", "隊商通過（荷の一部損失）"], fail: ["荷を置いて撤退", "護衛失敗", "交戦回避（依頼未達）"] }
  },
  {
    id: "quest_caravan_search",
    // ★ 捜索チェーンに関わる依頼（2026-09-20・EX-138 の裁定b）。**同時に1本まで**。
    //   チェーンは物語の一本道で、2本並ぶと「どの隊商の話か」が報告書から読めなくなる。
    chainSlot: true,
    // ★ 工程の担い手は人間だけ（2026-08-06・EX-056）。力量の計算はこれまでどおりエルシーも数える。
    fieldworkHumanOnly: true,
    title: "隊商の緊急捜索",
    category: "捜索",
    danger: "中",
    area: "生活圏の外縁を抜ける街道",
    durationBand: "mid_2h",
    recommended: ["斥候"],
    tags: ["捜索", "隊商", "緊急", "護衛失敗"],
    observationTarget: "なし",
    tensionBase: 50,
    tensionRange: 25,
    hidden: true,
    summary: "護り切れなかった隊商を追う緊急の捜索依頼。足跡を読む斥候か、鼻の利く者が要る。",
    // 結末は工程ではなく編成で決まる例外。上から順に見て、当たった最初のものを採る。
    outcomeOverride: {
      rules: [{ when: ["斥候かエルシーがいる"], outcome: "隊商奪還" }],
      default: "手がかりのみ"
    },
    outcomes: { full: ["隊商奪還"], partial: ["手がかりのみ"], fail: [] }
  },
  {
    id: "quest_caravan_lastchance",
    // ★ 捜索チェーンに関わる依頼（2026-09-20・EX-138 の裁定b）。**同時に1本まで**。
    //   チェーンは物語の一本道で、2本並ぶと「どの隊商の話か」が報告書から読めなくなる。
    chainSlot: true,
    // ★ 工程の担い手は人間だけ（2026-08-06・EX-056）。力量の計算はこれまでどおりエルシーも数える。
    fieldworkHumanOnly: true,
    title: "最後の手がかり",
    category: "捜索",
    danger: "高",
    area: "生活圏の外縁を抜ける街道",
    durationBand: "mid_3h",
    recommended: ["斥候"],
    tags: ["捜索", "隊商", "最後", "緊急"],
    observationTarget: "なし",
    tensionBase: 60,
    tensionRange: 25,
    hidden: true,
    summary: "手がかりが尽きかけた再捜索。これを逃せば、隊商はもう戻らない。",
    // 結末は工程ではなく編成で決まる例外（捜索チェーンの2段目）。
    outcomeOverride: {
      rules: [{ when: ["斥候かエルシーがいる"], outcome: "辛くも奪還" }],
      default: "隊商喪失"
    },
    outcomes: { full: [], partial: ["辛くも奪還"], fail: ["隊商喪失"] }
  },
  {
    id: "quest_old_stele_rubbing",
    title: "古い石碑の拓本",
    category: "記録",
    // ★ 担い手は人間だけ（2026-09-11・EX-074 で追加。EX-056 と同じ宣言）。
    //   判定用語彙を担い手の選出に繋いだところ、犬だけが〈記録〉〈留める〉の語を持つ編成で
    //   エルシーが担い手になり、「エルシーは確認の順番を崩さず、書き損じのないまま終えた。」が出た
    //   （scripts/check-elsie-actions.js が違反1件として検出）。
    //   ★ この依頼は category が「記録」で、効いた瞬間の文面は statKey（investigation）で選ばれる。
    //   investigation には犬固有の文が無いので、どの工程を犬が担っても人間用の記録の文が出る。
    //   だから工程単位ではなく依頼単位で外す（薬草包みの納品は exploration に犬固有の文があるので外さない）。
    fieldworkHumanOnly: true,
    danger: "低",
    area: "旧街道脇の石碑",
    durationBand: "short_30m",
    unlockedBy: "quest_lingering_light",
    recommended: ["斥候", "薬草師", "慎重"],
    tags: ["記録", "石碑", "拓本", "旧街道", "文字", "歴史", "地域"],
    observationTarget: "なし",
    tensionBase: 34,
    tensionRange: 24,
    summary: "旧街道脇に残る古い石碑の文字を、拓本として写し取る。苔や欠けで読みにくいが、無理に削らず、読める範囲を記録する。",
    outcomes: { full: ["拓本完了", "保存優先"], partial: ["一部判読"], fail: [] }
  },
  // ★ v2（2026-09-13・EX-092）。設計は DECISION_LOG 2026-09-13「「夜道に残る灯りの調査」を作り直す（v2）」。
  //   ★ v1 の特殊裁定（outcomeOverride で結末を直に決める）をやめ、**通常の戦闘計算に乗せた**。
  //   ランタンは特殊分岐ではなく `battleWeakenedBy`（敵の弱体化）で表す＝育成で越えられる形が自動的に成立する。
  {
    id: "quest_lingering_light",
    title: "夜道に残る灯りの調査",
    // ★ category は「調査」ではなく「戦闘」（2026-09-13・裁定）。
    //   ⚠️ **2026-09-13・EX-093 以降、この依頼の成長は category ではなく
    //     `hiddenTags.growthStats`（夜＝combat/survival ／ 昼＝investigation）が決める。**
    //     category が効くのはハイライトの分岐と掲示板の表示だけ。
    category: "戦闘",
    // ★ 危険度は「高」。ランタンなしでは押し戻される依頼を「低」で掲示すると掲示板が嘘をつく。
    danger: "高",
    area: "村はずれの道",
    durationBand: "near_10m",
        // ★ 2026-09-21・EX-140【3】：掃除クリアで開く6件のひとつ（親を酒場から掃除へ付け替えた）。
    unlockedBy: "quest_guild_cleanup",
    recommended: ["戦士", "慎重", "観察"],
    tags: ["戦闘", "夜道", "怪異", "記録"],
    observationTarget: "残る灯り",
    // ★ 緊張度は高め（設計8）。
    tensionBase: 78,
    tensionRange: 14,
    enemyId: "enemy_night_light",
    // ★ 相手から仕掛けられる＝「挑むかどうか」の判断が起きない（設計4「夜闇からの攻撃に手も足も出ない」）。
    //   段階1を経ないので `withdraw_first` が出ず、**観察記録（生態目録）が残る**。v1 からの後退を避けるための要。
    battleAmbush: true,
    // ★ 倒していない間だけ掲示板に戻る（2026-09-13・EX-093／設計7「定期的に出現する」）。
    //   間隔は EX-049 で確定している「クールタイムは消化数1〜3」に合わせた。
    reappearAfterCount: { min: 1, max: 3 },
    // ★ ランタンは「敵の弱体化」として表す。値は結末分布の目標から実測で決めた（下の DECISION_LOG 参照）。
    // ★ 実測で決めた（基準4人・n=2,000）：ランタンありは 勝利 100.0%／深手・戦闘不能が出た回 8.1%。
    battleWeakenedBy: { itemId: "item_lantern", hp: 0.20, threat: 0.25 },
    summary: "夜になると誰も持っていない灯りが見えるという道を調べる。昼は何も起きない。灯りは近づく者を拒む。",
    // ★ 昼の空振りは partial に置く（v1 は full だった）。**昼に行けばノーリスクで満額成長**になるのを避ける。
    // ⚠️ 結末名は依頼をまたいで**1つの表**に畳まれる（`buildGrowthTierByResult`）。**同じ名前を
    //   別の段に置くと、後勝ちで他の依頼の成長倍率が黙って変わる。** 実際、最初は「異常なし」と
    //   書いていて、辺境教会の巡回（full の「異常なし」）を partial に落としていた。
    //   ⚠️ ここに載せ忘れた結末は GROWTH_TIER_BY_RESULT の既定 full（満額成長）に落ちるうえ、
    //     ハイライトの失敗判定も効かなくなる（どちらも沈黙で通る）。
    outcomes: { full: ["灯りの正体を確かめた"], partial: ["接近調査は断念", "昼に灯りは出ず"], fail: ["夜道から押し戻された"] }
  },
  {
    // ★ 買い出しクエスト（2026-09-23・EX-144）。出典は Notion「設計：金と在庫と買い出しクエスト」。
    //   ★ **隊商護衛をクリアすると解禁**。依頼主は**その隊商の大将**（護衛した相手に、今度は買い物を頼む）。
    //   ★ `shopping` の旗で分岐する（id のハードコードでは分岐しない。定型報告書の `fixedReport` と同じ流儀）。
    //   ★ 支給品の枠は「持たせる」ではなく**「置いておく」**＝欲しい物の書き付け（半透明で出る）。
    //     1人2枠なので、**多く連れて行けば多く買える**（荷物持ちは人数。ステータスではない）。
    //   ★ **交渉の高い者を送ると安く買える**（パーティで一番高い交渉の値で、最大2割引き。data-money.js）。
    //   ⚠️ 代金は**帰ってきたときに**払う（値引きは店で決まるので）。遠征費は帯どおり（近）、報酬は無い
    //     （自分のための買い物。酒場の酒樽と同じ扱い）。**値はすべて仮置き。**
    //   ⚠️ 文面（本文・結末）は仮。チャット側が書き直す待ち。
    id: "quest_shopping",
    title: "隊商の大将に買い出しを頼む",
    shopping: true,
    category: "生活",
    danger: "低",
    area: "町の広場に荷を解いた隊商",
    durationBand: "near_1m",
    unlockedBy: "quest_caravan_escort",
    recommended: ["世話焼き", "豪胆"],
    tags: ["生活", "買い出し", "運搬", "隊商"],
    observationTarget: "なし",
    summary: "護衛した隊商の大将が、町の広場で荷を解いている。欲しい支給品を書き付けにして、買い付けを頼みに行く。",
    money: { reward: 0 },
    // ★ 人間がいなければ話が通せない（犬は伝えられない）＝手ぶらで戻る。それ以外は必ず買い付けになる。
    outcomes: { full: ["買い付け"], partial: [], fail: ["手ぶらで戻った"] }
  }
];

// ★ 退避（2026-09-14・EX-096）。**削除ではなく退避**——`masterVocabRetired`（`data-vocab.js`）と同じ形。
//   「夜道に残る灯りの調査」v1 を、2026-09-13（EX-092）に v2 へ作り直した。v1 は判断が済むまで
//   `hidden: true` で残していたが、v2 が目標の結末分布を満たし、観察記録も全結末で残る
//   （v1 からの後退が解消された）ので、**比較の役目が終わったと裁定して掲示板から外した**。
//
// ★ **戻し方**：`quest` を `masterQuests` の石碑の次の位置へ戻す。あわせて次の3つが要る。
//   1. `data-outcomes.js` の `masterOutcomesRetired.quest_lingering_light_v1` を
//      **`window.masterOutcomeTexts`** へ（`app.js` の `questOutcomeText` が読む唯一の名前）
//   2. `app.js` の `canUseItemInQuest` の `allowedByQuest` に下の `allowedItemIds` を足す
//      （★ 既定は全禁止なので、書かないと支給品の行が一切出ない）
//   3. `app.js` に次の**4つ**を戻す（どれか1つでも欠けると落ちる）：
//      `generateReport` の `quest.id === "quest_lingering_light_v1"` 分岐 ／
//      `generateLightInvestigationLogs` ／ `lightObservationRecordText` ／
//      `lightInvestigationInteractionText` ／ `LIGHT_HISTORY_LABEL`（下の `historyLabel`）
//      ※ コードは commit `2ae88eb` までに残っている（`git show 2ae88eb:app.js`）。
//
// ⚠️ **消してはいけないもの（いま未使用に見えるが、戻すときに要る）**：
//   - `app.js` の `OUTCOME_CONDITIONS` の `夜である` と `ランタンを持っている`
//     （下の `outcomeOverride` が参照する。生きた依頼からは既に使われていない）
//   - `app.js` の `lightInvestigationResponseText` の**夜側の分岐**
//     （生きた呼び出しは v2 の昼ルートだけで `isNight` は false 固定）
//
// ⚠️ **ここは「読むための控え」であって、これだけでは復元できない。** 本文の並べ方（古地図の有無で
//    増える行・観察記録が出ないときだけ足す行・最後の1行を `afterglow` にする扱い）はコードにしかない。
//    **復元元は git**（上の commit）で、下の `logLines` は「何が書かれていたか」を読むための控え。
//    ★ `masterVocabRetired` は実行可能なリテラルをそのまま置いているが、こちらは本文が関数の中に
//    あったので同じ形にはできなかった。**文字列そのものは1行も落とさず写してある**（2026-09-14 に照合済み）。
//
// ⚠️ **旧セーブは戻さなくても壊れない。** v1 時代の報告書は `questId: "quest_lingering_light"` を
//    持っており、その id は v2 が継いでいるので、石碑の解放（`getClearedQuestIds`）も
//    報告書の表示も引き続き成立する（2026-09-14 に実機で確認済み）。
window.masterQuestsRetired = {
  // 依頼定義そのもの（2026-09-13 に `_v1` へ改名した状態のまま）
  quest: {
    id: "quest_lingering_light_v1",
    hidden: true,
    title: "夜道に残る灯りの調査（v1・退避）",
    category: "調査",
    danger: "低",
    area: "村はずれの道",
    durationBand: "near_10m",
    unlockedBy: "quest_tavern_errand",
    recommended: ["慎重", "記録", "観察"],
    tags: ["調査", "夜道", "怪異", "記録"],
    observationTarget: "残る灯り",
    tensionBase: 62,
    tensionRange: 28,
    summary: "夜になると誰も持っていない灯りが見えるという道を調べる。昼は通常の道として確認する。",
    // ★ この依頼だけ、結末が時間帯と支給品で決まっていた（工程も戦闘も通らない）。
    outcomeOverride: {
      rules: [
        { when: ["夜である", "ランタンを持っている"], outcome: "調査成功" },
        { when: ["夜である"], outcome: "確認のみ" }
      ],
      default: "異常なし"
    },
    outcomes: { full: ["異常なし", "調査成功"], partial: ["確認のみ"], fail: [] }
  },
  // `allowedByQuest` の行（app.js の `canUseItemInQuest`）
  allowedItemIds: ["item_lantern", "item_obs_sheet", "item_map"],
  // 結末ラベル → 名簿の履歴に出る語（app.js の `LIGHT_HISTORY_LABEL`）
  historyLabel: { 調査成功: "夜間調査", 確認のみ: "灯り確認", 異常なし: "昼間確認" },
  // ★ 本文（`generateLightInvestigationLogs` が組んでいた行）の控え。**文字列はそのまま。**
  //   ⚠️ 並べ方の条件（括弧書きの部分）は散文で書いてあるだけで、実行できる形ではない。
  //   `{隊}` は `partySubject(party)`。抽選で選ぶ行は関数名を添えた（関数自体は v2 も使うものだけ残した）。
  logLines: {
    昼: [
      "昼の道には、人の足跡と荷車の跡が残っているだけだった。",
      "（lightInvestigationResponseText：昼・ランタン有無で選ぶ。★ この関数は v2 の昼ルートも使うので残してある）",
      "（古地図を持っているときだけ）古地図と照らしても、道筋そのものに新しい変化は見つからなかった。",
      "問題の灯りは見えず、報告書には「昼間の異常は確認できず」と記されている。",
      "依頼人は、やはり夜にだけ見えるのだと言った。"
    ],
    夜_ランタンあり: [
      "夜道の先に、小さな灯りが一つ浮かんで見えた。",
      "ランタンの明かりを地面に落とすと、帰り道の轍がはっきり見えた。",
      "（lightInvestigationResponseText：夜・ランタンあり）",
      "（lightInvestigationInteractionText：同行者どうしのやり取り。出ない回もある）",
      "灯りはしばらく揺れたあと、道の曲がり角の向こうで消えた。",
      "（観察記録が出ないときだけ）報告書には「ランタンなしでの再調査は避けること」と書き添えられている。"
    ],
    夜_ランタンなし: [
      "夜道の先に、小さな灯りが一つ浮かんで見えた。",
      "足元が暗く、帰り道の目印もすぐに見えなくなった。",
      "（lightInvestigationResponseText：夜・ランタンなし）",
      "{隊}は深追いせず、その場で引き返した。",
      "報告書には「灯りは確認。ただし接近調査は不可」とだけ残っている。"
    ],
    // 夜のときだけ末尾に付く観察記録の行（`lightObservationRecordText`）。
    // ★ 観察記録票を持つ人間がいるときだけ出る。`{記録者}` はその持ち手の表示名。
    観察記録: [
      "{記録者}は観察記録票に、灯りが見えた位置と消えた方角を書き残した。",
      "報告書には、{記録者}の記録として灯りの揺れ方と見えた高さが追記されている。",
      "{記録者}は、灯りが道の曲がり角の向こうで消えたことだけを観察記録票に残した。"
    ],
    // 同行者どうしのやり取り（`lightInvestigationInteractionText`）。
    // ★ ソロのときは出ない。組み合わせが成立した行の中から1つ引く。
    やり取り: [
      "（ミナ＋ガッド）{ミナ}が灯りの位置を読み上げると、{ガッド}は道の端で足場を確かめた。",
      "（ミナ＋エルネ）{ミナ}が消えた方角を記録し、{エルネ}は帰り道の目印を確認した。",
      "（ガッド＋エルネ）{エルネ}が「ここまでにしましょう」と言うと、{ガッド}は不満を飲み込んで引き返した。"
    ]
  }
};
