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
    stats: { memory: 28, caution: 22, courage: 16, kindness: 16, curiosity: 22, combat: 12, exploration: 28, investigation: 10, negotiation: 10, support: 10, survival: 18 },
    weapon: {
      name: "短弓と配達短剣",
      type: "弓 / 短剣",
      range: "中距離",
      power: 2,
      guard: 2,
      control: 5,
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
      lie: "自分だけ安全に帰る資格はない",
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
    stats: { memory: 12, caution: 10, courage: 28, kindness: 22, curiosity: 12, combat: 30, exploration: 10, investigation: 10, negotiation: 13, support: 10, survival: 15 },
    weapon: {
      name: "鉄鍋槌",
      type: "鈍器",
      range: "近距離",
      power: 5,
      guard: 3,
      control: 2,
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
      lie: "蓄えがなければ、また何も持たない自分に戻ってしまう",
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
    stats: { memory: 22, caution: 22, courage: 12, kindness: 28, curiosity: 16, combat: 10, exploration: 10, investigation: 14, negotiation: 10, support: 28, survival: 12 },
    weapon: {
      name: "薬草師の杖",
      type: "杖",
      range: "近距離",
      power: 2,
      guard: 3,
      control: 4,
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
      lie: "名前も記録もないものは、存在しなかったことにされてしまう",
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
    stats: { memory: 16, caution: 16, courage: 22, kindness: 16, curiosity: 13, combat: 22, exploration: 12, investigation: 10, negotiation: 10, support: 12, survival: 25 },
    weapon: {
      name: "見習い盾と短槍",
      type: "盾 / 槍",
      range: "近距離",
      power: 3,
      guard: 5,
      control: 3,
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
      lie: "帰り道を見失ったら、自分もそこに置き去りになる",
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
    stats: { memory: 16, caution: 22, courage: 10, kindness: 22, curiosity: 16, combat: 10, exploration: 14, investigation: 10, negotiation: 10, support: 20, survival: 18 },
    accessory: {
      name: "専用ハーネス",
      effect: "carry_support_item",
      capacity: 1,
      tags: ["支給品", "運搬", "救助"]
    },
    obsession: {
      label: "散歩",
      type: "walk",
      core: "外に出て、誰かと一緒に歩きたい",
      lie: "置いていかれると、もう呼んでもらえない",
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
