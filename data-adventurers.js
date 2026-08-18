// ★ 死蔵の値（2026-07-31 の棚卸しで確認。**消さずに残す。次に触る人が「使われている」と誤解しないための注記**）
//   - `weapon.control` … コードのどこからも読まれていない（4人分）
//   - `accessory.capacity` … エルシーのハーネスのみ。スロット数は全員2で固定なので効いていない
//   - `obsession.lie` / `obsession.triggerTags` / `obsession.type` … 参照ゼロ
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
      // ★死蔵（参照ゼロ）
      triggerTags: ["負傷", "撤退", "仲間", "救助"],
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
      // ★死蔵（参照ゼロ）
      triggerTags: ["食料", "道具", "畑", "村", "物資"],
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
      // ★死蔵（参照ゼロ）
      triggerTags: ["記録", "観察", "なにか", "不明", "図鑑"],
      positiveLine: "曖昧な輪郭を、震える字で報告書の余白に残した。",
      dangerLine: "逃げるべき場面で、もう一度だけ対象を見ようとした。",
      idleLine: "エルネ・シェルカは、消えかけた名前を何度も書き直していた。"
    },
    traits: [
      { name: "記録が正確", type: "positive", tags: ["記録", "報告書", "観察"] },
      { name: "冷静に観察する", type: "positive", tags: ["なにか", "不明", "図鑑"] },
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
      // ★死蔵（参照ゼロ）
      triggerTags: ["帰還", "夜道", "地図", "退路", "迷子"],
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
      effect: "carry_support_item",
      capacity: 1, // ★死蔵（スロット数は全員2で固定）
      tags: ["支給品", "運搬", "救助"]
    },
    obsession: {
      label: "散歩",
      type: "walk",
      core: "外に出て、誰かと一緒に歩きたい",
      // ★死蔵（参照ゼロ）
      lie: "置いていかれると、もう呼んでもらえない",
      // ★死蔵（参照ゼロ）
      triggerTags: ["待機", "出発", "帰還", "同行"],
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
