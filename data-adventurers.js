// ★ 死蔵の値（2026-07-31 の棚卸しで確認。**消さずに残す。次に触る人が「使われている」と誤解しないための注記**）
//   - `weapon.control` … コードのどこからも読まれていない（4人分）
//   - ~~`accessory.capacity`~~ … ★ 2026-09-23・EX-145 で**使われるようになった**（共有の荷の容量に足す。下のハーネスの注記）
//   - `obsession.lie` / `obsession.type` … 参照ゼロ
//   - ~~`obsession.triggerTags`~~ … ★ 2026-10-14・EX-148 段階2で**使われるようになった**（特殊裁定のフック。中身は語彙×依頼の属性の定義＋文面。`app.js` の `drawFieldworkHook`）
//   - `traits[].tags` … 表示されるのは name と type だけ
//   ※ `obsession.dangerLine` は別タスクで出口を作るので**死蔵として扱わない**。
//
// ★ 性格値は `tendencies`（1〜5・**育たない**・UIに数値を出さない）、育成値は `stats`（0〜255・育つ）。
//   2026-07-31 に分離した。目的が違うものを同じ入れ物に入れると、片方の規約がもう片方に伝染するため。
window.masterAdventurers = [
  {
    id: "adv_mina",
    name: "ミナ・レイフォード",
    nickname: "ミナ",
    favorite: true,
    job: "斥候",
    personality: "慎重",
    background: "郵便配達人",
    memo: "道をよく覚えている。無理をしない判断ができる。手紙配達系の依頼に向いていそう。",
    status: "待機中",
    history: [],
    tendencies: { memory: 5, caution: 4, courage: 3, kindness: 3, curiosity: 4 },
    stats: { combat: 12, exploration: 28, investigation: 10, negotiation: 10, support: 10, survival: 18 },
    weapon: {
      name: "短弓と配達短剣",
      type: "弓 / 短剣",
      range: "中距離",
      power: 20,
      guard: 20,
      control: 5, // ★死蔵（参照ゼロ）
      tags: ["牽制", "足止め", "記録補助"]
    },
    accessory: {
      name: "道標の小札",
      effect: "帰り道や目印を見落としにくい。",
      tags: ["記憶", "道案内", "慎重"]
    },
    obsession: {
      label: "贖罪",
      type: "atonement",
      core: "見捨てた側になりたくない",
      // ★死蔵（参照ゼロ）
      lie: "自分だけ安全に帰る資格はない",
      triggerTags: [
        // ★ 特殊裁定のフック（2026-10-14・EX-148 段階2）。器は死蔵だった triggerTags のまま、中身を
        //   判定用語彙（工程の行為×対象）＋依頼の属性に書き換えた。**文面だけ**で、結末・報酬・配分は動かさない。
        //   引けるのは**その工程の担い手だけ**。1遠征につき最大1本。文面は Notion「特殊裁定の文面（段階2・仮）」。
        { id: "mina_deliver", label: "届け切る", steps: [{ acts: ["伝える"], targets: ["人"] }], questTags: ["配達"],
          lines: ["{名前}は預かった言付けを胸の内で繰り返しながら、足を止めなかった。", "休むよう勧められても、{名前}は「先に届けてから」とだけ言った。"] ,
          // ★ 段階3（試行・2026-10-14）：取引は両側に意味があるときだけ成立する。片側だけなら段階2の一行だけ。
          //   gain＝上がるもの／cost＝下がるもの。成立したら段階2の一行のあとに続けて tradeLines の一行を出す。
          trade: { gain: "tierUp", cost: "selfInjuryUp",
            lines: ["届け終えてから、{名前}はようやく自分の足の傷に気づいた。", "{名前}は刻限に間に合わせたが、帰り道はほかの者に肩を借りた。"] } },
        { id: "mina_last", label: "最後尾に戻る", steps: [{ acts: ["手当て"], targets: ["人"] }],
          lines: ["{名前}は全員の顔を確かめてから、最後に歩き出した。", "{名前}は自分の荷を下ろして、まず手当てを待つ者のそばに膝をついた。"] },
        { id: "mina_persist", label: "打ち切れない", steps: [{ acts: ["察する"], targets: ["人"] }], questCategory: "捜索",
          lines: ["引き上げの声がかかってからも、{名前}はしばらく茂みの奥を見ていた。", "日が傾いても、{名前}は「もう一度だけ」と言って、来た道を数歩戻った。"] }
      ],
      positiveLine: "最後尾の足音を確認してから、ようやく歩き出した。",
      dangerLine: "撤退できる状況でも、倒れた影の方へ戻ろうとした。",
      idleLine: "何もない道で、何度も背後を振り返っていた。"
    },
    traits: [
      { name: "面倒見がいい", type: "positive", tags: ["仲間", "救助", "住民"] },
      { name: "よく気がつく", type: "positive", tags: ["観察", "小さな異変"] },
      { name: "自分を後回しにする", type: "flaw", tags: ["負傷", "包帯", "撤退"] }
    ]
  },
  {
    id: "adv_gadd",
    name: "ガッド・オルベイン",
    nickname: "鉄鍋",
    favorite: false,
    job: "戦士",
    personality: "豪胆",
    background: "宿場の用心棒",
    memo: "前に出る癖がある。危険度が低い依頼でも、念のため包帯を持たせたい。",
    status: "待機中",
    history: [],
    // ★ curiosity は 1（2026-07-31）。255スケールでは ガッド12 / ロウ13 と**1目盛だけ差**が付いており、
    //   1〜5 に戻すとどちらも 2 になって「好奇心が最も高い人」の選出が入れ替わってしまう。
    //   絶対値のしきい値（4以上／3未満）では 1 と 2 の違いは出ないので、順序を保つ方を採った。
    tendencies: { memory: 2, caution: 1, courage: 5, kindness: 4, curiosity: 1 },
    stats: { combat: 30, exploration: 10, investigation: 10, negotiation: 13, support: 10, survival: 15 },
    weapon: {
      name: "鉄鍋槌",
      type: "鈍器",
      range: "近距離",
      power: 50,
      guard: 30,
      control: 2, // ★死蔵（参照ゼロ）
      tags: ["押し返し", "威圧", "前衛"]
    },
    accessory: {
      name: "焦げた鍋つかみ",
      effect: "熱いものや荒い作業に少し強い。",
      tags: ["豪胆", "料理", "前に出る"]
    },
    obsession: {
      label: "収集",
      type: "hoarding",
      core: "欠乏に戻りたくない",
      // ★死蔵（参照ゼロ）
      lie: "蓄えがなければ、また何も持たない自分に戻ってしまう",
      triggerTags: [
        { id: "gadd_carry", label: "持ち帰る", steps: [{ acts: ["運ぶ"], targets: ["重い"] }, { acts: ["採る"] }], questTags: ["片付け", "古物", "畑", "採集"],
          lines: ["{名前}は使えそうな枝や布切れを拾い、もう入らない袋に押し込んだ。", "帰り道、{名前}の背負い袋だけが、来たときよりふくらんでいた。"] },
        { id: "gadd_feed", label: "食わせる", steps: [{ acts: ["火と食"] }],
          lines: ["{名前}は干し肉を一切れ取り出し、しばらく眺めてから、鍋に落とした。", "みんなの椀によそい終えてから、{名前}は鍋の底をさらって自分の分にした。"] }
      ],
      positiveLine: "使えそうな物を拾い集め、帰り道の荷を少しだけ重くした。",
      dangerLine: "捨ててよいはずの古道具を、どうしても置いていけなかった。",
      idleLine: "鉄鍋は袋の中身を何度も数え直していた。"
    },
    traits: [
      { name: "気前がいい", type: "positive", tags: ["食料", "住民", "生活依頼"] },
      { name: "場を和ませる", type: "positive", tags: ["祝宴", "村", "会話"] },
      { name: "生活の匂いに情が移る", type: "flaw", tags: ["台所", "道具", "畑", "廃屋"] }
    ]
  },
  {
    id: "adv_elne",
    name: "エルネ・シェルカ",
    nickname: "",
    favorite: false,
    job: "薬草師",
    personality: "世話焼き",
    background: "村の調合係",
    memo: "採集依頼で頼りになる。休憩時の観察が細かい。",
    status: "待機中",
    history: [],
    tendencies: { memory: 4, caution: 4, courage: 2, kindness: 5, curiosity: 3 },
    stats: { combat: 10, exploration: 10, investigation: 14, negotiation: 10, support: 28, survival: 12 },
    weapon: {
      name: "薬草師の杖",
      type: "杖",
      range: "近距離",
      power: 20,
      guard: 30,
      control: 4, // ★死蔵（参照ゼロ）
      tags: ["支援", "足場確認", "制止"]
    },
    accessory: {
      name: "乾燥薬草の匂い袋",
      effect: "疲労や軽い不調に気づきやすい。",
      tags: ["手当", "気配り", "薬草"]
    },
    obsession: {
      label: "統制",
      type: "control",
      core: "不明なまま終わらせたくない",
      // ★死蔵（参照ゼロ）
      lie: "名前も記録もないものは、存在しなかったことにされてしまう",
      triggerTags: [
        { id: "elne_again", label: "もう一度見る", steps: [{ acts: ["記録"], targets: ["生き物"] }],
          lines: ["引き上げる前に、{名前}はもう一度だけ振り返り、帳面に何か書き足した。", "{名前}は同じところを二度、三度と見直し、そのたびに字が小さくなった。"] },
        { id: "elne_order", label: "手順を崩さない", steps: [{ acts: ["手当て"], targets: ["人"] }],
          lines: ["{名前}は急かされても、薬を量る手を一度も速めなかった。", "{名前}は包帯を巻く前に、決まった順に傷を確かめ、それを書き留めた。"] }
      ],
      positiveLine: "曖昧な輪郭を、震える字で報告書の余白に残した。",
      dangerLine: "逃げるべき場面で、もう一度だけ対象を見ようとした。",
      idleLine: "エルネ・シェルカは、消えかけた名前を何度も書き直していた。"
    },
    traits: [
      { name: "記録が正確", type: "positive", tags: ["記録", "報告書", "観察"] },
      { name: "冷静に観察する", type: "positive", tags: ["なにか", "不明", "生態目録"] },
      { name: "記録を優先しすぎる", type: "flaw", tags: ["危険", "観察", "撤退"] }
    ]
  },
  {
    id: "adv_row",
    name: "ロウ",
    nickname: "",
    favorite: false,
    job: "見習い盾役",
    personality: "我慢強い",
    background: "門番見習い",
    memo: "判断は少し遅いが、一度決めると粘る。仲間の前に立ち、退路をふさがない位置を気にする。",
    status: "待機中",
    history: [],
    tendencies: { memory: 3, caution: 3, courage: 4, kindness: 3, curiosity: 2 },
    stats: { combat: 22, exploration: 12, investigation: 10, negotiation: 10, support: 12, survival: 25 },
    weapon: {
      name: "見習い盾と短槍",
      type: "盾 / 槍",
      range: "近距離",
      power: 30,
      guard: 50,
      control: 3, // ★死蔵（参照ゼロ）
      tags: ["守り", "足止め", "前衛"]
    },
    accessory: {
      name: "門番見習いの笛紐",
      effect: "合図と立ち位置の確認を忘れにくい。",
      tags: ["合図", "責任感", "退路確認"]
    },
    obsession: {
      label: "回帰",
      type: "return",
      core: "帰れる場所があると確認したい",
      // ★死蔵（参照ゼロ）
      lie: "帰り道を見失ったら、自分もそこに置き去りになる",
      triggerTags: [
        { id: "row_check", label: "確かめるまで進まない", steps: [{ acts: ["進む"] }], questTags: ["帰還", "夜道", "撤退判断", "足跡"],
          lines: ["{名前}は先へ進む前に、来た道の目印をひとつずつ確かめた。", "分かれ道で、{名前}だけが振り返り、帰りの道を声に出して数えた。"] },
        // ★ ロウ①の取引は外した（2026-10-14・Q6＝C）。工程の依頼では負傷がほとんど起きず（ロウ①が当たる依頼で軽症が出る遠征は0.4%）、
        //   取引の「得」の側（負傷を軽くする）に守るものが構造的に無い。再挑戦の条件＝戦闘の側（エンジン外）へ特殊裁定を広げるとき。
        { id: "row_close", label: "最後に閉める", steps: [{ acts: ["前に立つ"], targets: ["人"] }], // 2026-10-14：「護衛」の条件を外した（〈前に立つ×人〉だけ）
          lines: ["全員が通り抜けるまで、{名前}は道の口に立って動かなかった。", "最後の一人が過ぎたのを見届けてから、{名前}は背を向けた。"] }
      ],
      positiveLine: "戦う前に、まず帰り道のぬかるみを確かめていた。",
      dangerLine: "敵を見るより先に、退路がまだ同じ場所にあるかを確かめてしまった。",
      idleLine: "ロウは古地図を畳んでは開き、同じ道を何度も指でなぞっていた。"
    },
    traits: [
      { name: "慎重に進む", type: "positive", tags: ["退路", "罠", "夜道"] },
      { name: "道を覚える", type: "positive", tags: ["地図", "帰還", "探索"] },
      { name: "退路を疑いすぎる", type: "flaw", tags: ["迷子", "帰還", "撤退"] }
    ]
  },
  {
    id: "adv_elsie",
    name: "エルシー",
    nickname: "",
    favorite: false,
    job: "ギルド犬",
    personality: "穏やか",
    background: "ギルド所属",
    species: "dog",
    special: true,
    canSolo: false,
    memo: "小柄で立ち耳のギルド犬。ふさふさの尾を振りおだやかな雰囲気だが、嗅覚と警戒に長け追跡や帰還を助ける。戦闘の主力にはならない。",
    status: "待機中",
    history: [],
    tendencies: { memory: 3, caution: 4, courage: 1, kindness: 4, curiosity: 3 },
    // ★ 犬を探索特化にする（2026-08-06・EX-057）。交渉・支援・戦闘は 0（犬がやらないこと）、
    //   探索と生存で人間の一位（ミナ28・ロウ25）を抜く。調査は据え置き＝**犬にできない行為の
    //   担い手になる圧を上げないため**。戦闘0は与ダメに波及しない（simulateBattle は人間だけ）。
    stats: { combat: 0, exploration: 32, investigation: 10, negotiation: 0, support: 0, survival: 30 },
    accessory: {
      name: "専用ハーネス",
      // ★ 2026-09-21・EX-140【2】：内部キー 「carry_support_item」 がそのまま名簿の「効果」欄に出ていた。
      //   ★ ここは表示専用の欄（`adventurerAccessoryDetailHtml` が出すだけで、コードは1行も読んでいない）。
      //   他の4人と同じ「一文で書く」形に揃えた。⚠️ `capacity` の数は効果の文に書かない（2026-09-21 の裁定。数を出さない）。
      effect: "支給品を背負って運べる。",
      // ★ 2026-09-23・EX-145：**共有の荷の容量にこのぶん足す**（設計ページ「ハーネスはパーティの荷が増える」）。
      //   エルシーを連れると、2枠＋この値だけ荷が増える。**値は仮置き**（制作の最後に作者が調整する）。
      capacity: 1,
      tags: ["支給品", "運搬", "救助"]
    },
    obsession: {
      label: "散歩",
      type: "walk",
      core: "外に出て、誰かと一緒に歩きたい",
      // ★死蔵（参照ゼロ）
      lie: "置いていかれると、もう呼んでもらえない",
      triggerTags: [
        { id: "elsie_trail", label: "足音を追う", inParty: true, steps: [{ acts: ["察する"], targets: ["人"] }],
          lines: ["{名前}は急に鼻を地面に寄せ、ひとりで茂みのほうへ数歩進んで、振り返った。", "{名前}の耳が、同じ方角へ何度も立った。"] },
        // ★ 引き金が依頼の tags（工程の語ではない）。エルシーのフックは inParty＝編成にいれば引ける（担い手でなくてよい）。
        { id: "elsie_lead", label: "帰り道を引く", inParty: true, anyStep: true, questTags: ["帰還"],
          lines: ["帰り道、{名前}は一行の先に立ち、ときどき振り返って全員がついてくるのを確かめた。", "寄り道しかけた者の袖を、{名前}がそっと咥えて引いた。"] }
      ],
      positiveLine: "エルシーは門を出る前から、しっぽを大きく振っていた。",
      dangerLine: "エルシーは離れた足音を追いかけようとして、何度も振り返った。",
      idleLine: "エルシーは誰かの足元に鼻先を寄せて、出発を待っていた。"
    },
    traits: [
      { name: "穏やか", type: "positive", tags: ["同行", "住民", "待機"] },
      { name: "賢さ", type: "positive", tags: ["嗅覚", "警戒", "追跡"] },
      { name: "さみしがり", type: "flaw", tags: ["単独", "出発", "帰還"] }
    ]
  }
];

// ★ 受付嬢（アルメナ）。冒険者ではないので masterAdventurers には入れない（編成にも名簿にも出さない）。
//   名前は 2026-08-03 に確定（由来はローマの出産・記録の女神カルメンタ。一次案のカルミナから音を変えた）。
//   現状の用途は行方不明の段階文言の {名前} のフォールバックだけ（2026-09-11・EX-072）。
//   ★ ホーム画面の見出しは「受付嬢」のままで、名乗りの演出は未実装。ここを実装するときに一緒に見ること。
window.masterReceptionist = {
  name: "アルメナ",
  title: "受付嬢"
};
