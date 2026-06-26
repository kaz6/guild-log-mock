const STORAGE_KEY = "expeditionGuildLogMockV011";
const DEMO_DURATION_MS = 10000;
const MOCK_VERSION = "v0.1.1";

const masterAdventurers = [
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
    history: []
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
    history: []
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
    history: []
  }
];

const masterQuests = [
  {
    id: "quest_herb",
    title: "森の薬草採集",
    danger: "低",
    area: "薄明の森",
    recommended: ["斥候", "薬草師"],
    observationTarget: "森喰い兎",
    summary: "森の浅い場所で薬草を採集する。小型の獣による荷荒らしが報告されている。"
  },
  {
    id: "quest_signpost",
    title: "古い道標の確認",
    danger: "低",
    area: "古い街道",
    recommended: ["斥候"],
    observationTarget: "なし",
    summary: "雨で傾いた道標を確認し、街道記録と照合する。戦闘は想定されていない。"
  },
  {
    id: "quest_letter",
    title: "届けられなかった手紙",
    danger: "低",
    area: "雨待ちの街道",
    recommended: ["慎重", "郵便配達人"],
    observationTarget: "なし",
    summary: "宿場に残された古い手紙を、記録上の宛先まで届ける。簡単な確認依頼。"
  }
];

const masterItems = [
  { id: "item_bandage", name: "包帯", tags: ["治療", "負傷ログ"], note: "負傷時のログや撤退判断に影響する。" },
  { id: "item_map", name: "古地図", tags: ["道迷い", "街道照合"], note: "街道・森・古い道標の記録照合に使える。" },
  { id: "item_whistle", name: "笛", tags: ["合流", "撤退"], note: "視界が悪い場所での合流ログに影響する。" },
  { id: "item_pot", name: "携帯鍋", tags: ["休憩", "士気"], note: "休憩ログや関係性ログに影響する。" },
  { id: "item_oilcase", name: "油紙の手紙入れ", tags: ["手紙", "雨", "記録保護"], note: "紙の依頼書や手紙を濡らさず運ぶ。" }
];

const masterObservations = [
  {
    id: "obs_rabbit",
    name: "森喰い兎",
    category: "通常敵",
    testimony: ["森の浅い場所で荷物を荒らす小型の獣。"],
    facts: ["薬草袋や革袋を噛み破る。"],
    inference: ["食料や薬草の匂いに寄ってくる可能性がある。"],
    next: ["雨天時にも活動するか。", "火や金属音を恐れるか。"]
  },
  {
    id: "obs_mushroom",
    name: "泥被り茸",
    category: "採集対象",
    testimony: ["湿った倒木の近くに生える薬用茸。"],
    facts: ["泥をかぶった個体ほど香りが強い。"],
    inference: ["雨上がりに採集量が増える可能性がある。"],
    next: ["調合時の効果差を確認する。"]
  }
];

const app = document.getElementById("app");
const viewTitle = document.getElementById("viewTitle");
const navButtons = [...document.querySelectorAll(".nav-button")];
const resetButton = document.getElementById("resetButton");

let state = loadState();
let route = "home";
let selectedQuestId = state.selectedQuestId ?? null;
let selectedAdventurerIds = state.selectedAdventurerIds ?? [];
let selectedItemIds = state.selectedItemIds ?? [];
let editingAdventurerId = null;

function createInitialState() {
  return {
    adventurers: structuredClone(masterAdventurers),
    quests: structuredClone(masterQuests),
    items: structuredClone(masterItems),
    observations: structuredClone(masterObservations),
    reports: [],
    expedition: null,
    worldState: {
      daysPassed: 0,
      totalReportsOpened: 0,
      totalExpeditions: 0,
      attachmentScore: 0,
      recordDensity: 0,
      anomalyPressure: 0,
      archiveSeed: Math.floor(Math.random() * 1000000)
    },
    selectedQuestId: null,
    selectedAdventurerIds: [],
    selectedItemIds: []
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const base = createInitialState();
    const parsed = JSON.parse(raw);
    return { ...base, ...parsed, worldState: { ...base.worldState, ...(parsed.worldState ?? {}) } };
  } catch (error) {
    console.warn("保存データの読み込みに失敗したため初期化します", error);
    return createInitialState();
  }
}

function saveState() {
  state.selectedQuestId = selectedQuestId;
  state.selectedAdventurerIds = selectedAdventurerIds;
  state.selectedItemIds = selectedItemIds;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setRoute(nextRoute) {
  route = nextRoute;
  editingAdventurerId = null;
  render();
}

function getDisplayName(adventurer) {
  return adventurer.nickname?.trim() || adventurer.name;
}

function getQuest(id) {
  return state.quests.find((quest) => quest.id === id);
}

function getItem(id) {
  return state.items.find((item) => item.id === id);
}

function getAdventurer(id) {
  return state.adventurers.find((adv) => adv.id === id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function checkExpeditionCompletion() {
  if (!state.expedition) return;
  const elapsed = Date.now() - state.expedition.startTime;
  if (elapsed < state.expedition.durationMs) return;

  const report = generateReport(state.expedition);
  state.reports.unshift(report);
  state.expedition.adventurerIds.forEach((id) => {
    const adv = getAdventurer(id);
    if (adv) adv.status = "待機中";
  });
  state.expedition = null;
  saveState();
}

function render() {
  checkExpeditionCompletion();
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.route === route));

  const titles = {
    home: "ギルド",
    quests: "依頼掲示板",
    adventurers: "冒険者名簿",
    observations: "観察記録",
    report: "報告書"
  };
  viewTitle.textContent = titles[route] ?? "ギルド";

  if (route === "home") renderHome();
  if (route === "quests") renderQuests();
  if (route === "adventurers") renderAdventurers();
  if (route === "observations") renderObservations();
  if (route === "report") renderReportDetail(state.activeReportId);
}

function renderHome() {
  const unopened = state.reports.filter((report) => !report.opened);
  const latestReports = state.reports.slice(0, 3);
  const expedition = state.expedition;

  app.innerHTML = `
    <div class="grid-2">
      <section class="card">
        <div class="card-body reception">
          <div class="reception-portrait" aria-hidden="true"></div>
          <div>
            <p class="eyebrow">Guild Reception</p>
            <h3>受付嬢</h3>
            <div class="speech">
              ${unopened.length > 0
                ? `おかえりなさい。未開封の報告書が ${unopened.length} 通、届いています。落ち着いて、一通ずつ確認しましょう。`
                : expedition
                  ? "遠征中の一行があります。扉の音がしたら、私が報告書をお持ちしますね。"
                  : "本日の依頼掲示板を確認できます。出発前の支給品も、忘れずに選んでくださいね。"}
            </div>
            <div class="button-row" style="margin-top: 16px;">
              <button class="primary-button" onclick="setRoute('quests')">依頼を選ぶ</button>
              <button class="secondary-button" onclick="setRoute('adventurers')">名簿を見る</button>
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-body">
          <div class="card-title">
            <div>
              <p class="eyebrow">Reports</p>
              <h3>報告書棚</h3>
            </div>
            <span class="status-pill">未開封 ${unopened.length}</span>
          </div>
          <div class="content">
            ${latestReports.length === 0 ? `<div class="empty">まだ報告書は届いていません。</div>` : latestReports.map(reportCardHtml).join("")}
          </div>
        </div>
      </section>
    </div>

    ${expedition ? expeditionProgressHtml(expedition) : ""}
  `;
}

function reportCardHtml(report) {
  const quest = getQuest(report.questId);
  return `
    <article class="report-card ${report.opened ? "" : "unopened"}">
      <h3>${escapeHtml(quest?.title ?? "報告書")}</h3>
      <p>${escapeHtml(report.summary)}</p>
      <div class="button-row" style="margin-top: 14px;">
        <button class="small-button" onclick="openReport('${report.id}')">${report.opened ? "読み返す" : "開封する"}</button>
      </div>
    </article>
  `;
}

function expeditionProgressHtml(expedition) {
  const quest = getQuest(expedition.questId);
  const elapsed = Math.max(0, Date.now() - expedition.startTime);
  const pct = Math.min(100, Math.floor((elapsed / expedition.durationMs) * 100));
  const party = expedition.adventurerIds.map(getAdventurer).filter(Boolean).map(getDisplayName).join(" / ");

  return `
    <section class="card">
      <div class="card-body">
        <div class="card-title">
          <div>
            <p class="eyebrow">Expedition in Progress</p>
            <h3>遠征中：${escapeHtml(quest?.title)}</h3>
          </div>
          <span class="status-pill away">遠征中</span>
        </div>
        <p class="muted">編成：${escapeHtml(party)}</p>
        <div class="progress-shell" style="margin: 14px 0;">
          <div class="progress-bar" style="width: ${pct}%"></div>
        </div>
        <div class="button-row">
          <button class="secondary-button" onclick="advanceTimeForMock()">Mock用：扉の音を待たず報告書を届ける</button>
        </div>
      </div>
    </section>
  `;
}

function renderQuests() {
  const selectedQuest = getQuest(selectedQuestId);
  const canStart = selectedQuestId && selectedAdventurerIds.length > 0 && !state.expedition;

  app.innerHTML = `
    <section class="card">
      <div class="card-body">
        <div class="card-title">
          <div>
            <p class="eyebrow">Quest Board</p>
            <h3>依頼選択</h3>
          </div>
          ${state.expedition ? `<span class="status-pill away">遠征中のため新規出発不可</span>` : `<span class="status-pill good">出発可能</span>`}
        </div>
        <div class="grid-3">
          ${state.quests.map(questCardHtml).join("")}
        </div>
      </div>
    </section>

    <div class="grid-2">
      <section class="card">
        <div class="card-body">
          <div class="card-title">
            <div>
              <p class="eyebrow">Party</p>
              <h3>冒険者選択</h3>
            </div>
            <span class="status-pill">${selectedAdventurerIds.length}/3人</span>
          </div>
          <div class="content">
            ${state.adventurers.map(selectableAdventurerHtml).join("")}
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-body">
          <div class="card-title">
            <div>
              <p class="eyebrow">Supplies</p>
              <h3>支給品選択</h3>
            </div>
            <span class="status-pill">${selectedItemIds.length}/2個</span>
          </div>
          <div class="content">
            ${state.items.map(selectableItemHtml).join("")}
          </div>
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card-body">
        <div class="card-title">
          <div>
            <p class="eyebrow">Dispatch</p>
            <h3>出発確認</h3>
          </div>
        </div>
        ${selectedQuest ? dispatchSummaryHtml(selectedQuest) : `<div class="empty">まず依頼を選んでください。</div>`}
        <div class="button-row" style="margin-top: 16px;">
          <button class="primary-button" ${canStart ? "" : "disabled"} onclick="startExpedition()">遠征開始</button>
          <button class="ghost-button" onclick="clearSelections()">選択解除</button>
        </div>
      </div>
    </section>
  `;
}

function questCardHtml(quest) {
  const selected = selectedQuestId === quest.id;
  return `
    <article class="quest-card ${selected ? "selected" : ""}" onclick="selectQuest('${quest.id}')">
      <h3>${escapeHtml(quest.title)}</h3>
      <p class="muted">${escapeHtml(quest.summary)}</p>
      <div class="kv">
        <span>危険度</span><strong>${escapeHtml(quest.danger)}</strong>
        <span>地域</span><strong>${escapeHtml(quest.area)}</strong>
        <span>観察対象</span><strong>${escapeHtml(quest.observationTarget)}</strong>
      </div>
      <div class="tags">${quest.recommended.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
    </article>
  `;
}

function selectableAdventurerHtml(adventurer) {
  const selected = selectedAdventurerIds.includes(adventurer.id);
  const disabled = adventurer.status !== "待機中";
  return `
    <article class="adventurer-card ${selected ? "selected" : ""}" onclick="toggleAdventurer('${adventurer.id}')">
      <div class="card-title">
        <div>
          <h3>${adventurer.favorite ? "★ " : ""}${escapeHtml(getDisplayName(adventurer))}</h3>
          <p class="muted">${escapeHtml(adventurer.job)} / ${escapeHtml(adventurer.personality)} / 前職：${escapeHtml(adventurer.background)}</p>
        </div>
        <span class="status-pill ${disabled ? "away" : ""}">${escapeHtml(adventurer.status)}</span>
      </div>
      <p class="muted">${escapeHtml(adventurer.memo)}</p>
    </article>
  `;
}

function selectableItemHtml(item) {
  const selected = selectedItemIds.includes(item.id);
  return `
    <article class="item-card ${selected ? "selected" : ""}" onclick="toggleItem('${item.id}')">
      <h3>${escapeHtml(item.name)}</h3>
      <p class="muted">${escapeHtml(item.note)}</p>
      <div class="tags">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
    </article>
  `;
}

function dispatchSummaryHtml(quest) {
  const party = selectedAdventurerIds.map(getAdventurer).filter(Boolean);
  const items = selectedItemIds.map(getItem).filter(Boolean);
  return `
    <div class="kv">
      <span>依頼</span><strong>${escapeHtml(quest.title)}</strong>
      <span>編成</span><strong>${party.length ? party.map(getDisplayName).map(escapeHtml).join(" / ") : "未選択"}</strong>
      <span>支給品</span><strong>${items.length ? items.map((item) => escapeHtml(item.name)).join(" / ") : "なし"}</strong>
      <span>所要時間</span><strong>Mockでは約10秒</strong>
    </div>
  `;
}

function renderAdventurers() {
  const selected = editingAdventurerId ? getAdventurer(editingAdventurerId) : state.adventurers[0];
  if (!editingAdventurerId) editingAdventurerId = selected?.id;

  app.innerHTML = `
    <div class="grid-2">
      <section class="card">
        <div class="card-body">
          <div class="card-title">
            <div>
              <p class="eyebrow">Roster</p>
              <h3>冒険者一覧</h3>
            </div>
          </div>
          <div class="content">
            ${state.adventurers.map((adv) => adventurerListCardHtml(adv)).join("")}
          </div>
        </div>
      </section>
      <section class="card">
        <div class="card-body" id="adventurerEditor">
          ${selected ? adventurerEditorHtml(selected) : `<div class="empty">冒険者がいません。</div>`}
        </div>
      </section>
    </div>
  `;
}

function adventurerListCardHtml(adventurer) {
  const selected = editingAdventurerId === adventurer.id;
  return `
    <article class="adventurer-card ${selected ? "selected" : ""}" onclick="editAdventurer('${adventurer.id}')">
      <div class="card-title">
        <div>
          <h3>${adventurer.favorite ? "★ " : "☆ "}${escapeHtml(getDisplayName(adventurer))}</h3>
          <p class="muted">本名：${escapeHtml(adventurer.name)}</p>
        </div>
        <span class="status-pill ${adventurer.status !== "待機中" ? "away" : ""}">${escapeHtml(adventurer.status)}</span>
      </div>
      <div class="tags">
        <span class="tag">${escapeHtml(adventurer.job)}</span>
        <span class="tag">${escapeHtml(adventurer.personality)}</span>
        <span class="tag">${escapeHtml(adventurer.background)}</span>
      </div>
    </article>
  `;
}

function adventurerEditorHtml(adventurer) {
  return `
    <div class="card-title">
      <div>
        <p class="eyebrow">Record Makeup</p>
        <h3>${escapeHtml(getDisplayName(adventurer))}</h3>
      </div>
      <button class="small-button" onclick="toggleFavorite('${adventurer.id}')">${adventurer.favorite ? "★ お気に入り" : "☆ お気に入り"}</button>
    </div>

    <div class="kv">
      <span>本名</span><strong>${escapeHtml(adventurer.name)}</strong>
      <span>職業</span><strong>${escapeHtml(adventurer.job)}</strong>
      <span>性格</span><strong>${escapeHtml(adventurer.personality)}</strong>
      <span>前職</span><strong>${escapeHtml(adventurer.background)}</strong>
    </div>

    <hr class="soft" />

    <div class="form-row">
      <label for="nicknameInput">あだ名</label>
      <input id="nicknameInput" value="${escapeHtml(adventurer.nickname)}" placeholder="例：ミナ、鉄鍋" />
    </div>
    <div class="form-row">
      <label for="memoInput">記録係メモ</label>
      <textarea id="memoInput" placeholder="この冒険者について覚えておきたいこと">${escapeHtml(adventurer.memo)}</textarea>
    </div>
    <div class="button-row">
      <button class="primary-button" onclick="saveAdventurerMemo('${adventurer.id}')">記録を保存</button>
    </div>

    <hr class="soft" />
    <p class="meta-label">最近の記録</p>
    ${adventurer.history.length === 0 ? `<div class="empty">まだ遠征記録はありません。</div>` : `
      <div class="log-list">
        ${adventurer.history.slice(0, 5).map((line) => `<div class="log-line afterglow">${escapeHtml(line)}</div>`).join("")}
      </div>
    `}
  `;
}

function renderObservations() {
  app.innerHTML = `
    <section class="card">
      <div class="card-body">
        <div class="card-title">
          <div>
            <p class="eyebrow">Observation Notes</p>
            <h3>観察記録</h3>
          </div>
          <span class="status-pill">${state.observations.length}件</span>
        </div>
        <p class="muted">遠征で確認された証言・事実・推定・次に調べることを記録します。</p>
        <div class="grid-2" style="margin-top: 16px;">
          ${state.observations.map(observationHtml).join("")}
        </div>
      </div>
    </section>
  `;
}

function observationHtml(obs) {
  return `
    <article class="observation-card">
      <div class="card-title">
        <div>
          <h3>${escapeHtml(obs.name)}</h3>
          <p class="muted">分類：${escapeHtml(obs.category)}</p>
        </div>
      </div>
      ${observationSectionHtml("証言", obs.testimony)}
      ${observationSectionHtml("確認された事実", obs.facts)}
      ${observationSectionHtml("推定", obs.inference)}
      ${observationSectionHtml("次に調べること", obs.next)}
    </article>
  `;
}

function observationSectionHtml(title, lines) {
  return `
    <p class="meta-label">${escapeHtml(title)}</p>
    <ul>
      ${lines.map((line) => `<li class="muted">${escapeHtml(line)}</li>`).join("")}
    </ul>
  `;
}

function renderReportDetail(reportId) {
  const report = state.reports.find((item) => item.id === reportId);
  if (!report) {
    setRoute("home");
    return;
  }
  const quest = getQuest(report.questId);
  const party = report.adventurerIds.map(getAdventurer).filter(Boolean).map(getDisplayName).join(" / ");
  const items = report.itemIds.map(getItem).filter(Boolean).map((item) => item.name).join(" / ") || "なし";

  app.innerHTML = `
    <section class="card">
      <div class="card-body">
        <div class="card-title">
          <div>
            <p class="eyebrow">Opened Report</p>
            <h3>${escapeHtml(quest?.title ?? "報告書")}</h3>
          </div>
          <span class="status-pill good">開封済み</span>
        </div>
        <div class="kv">
          <span>地域</span><strong>${escapeHtml(quest?.area)}</strong>
          <span>編成</span><strong>${escapeHtml(party)}</strong>
          <span>支給品</span><strong>${escapeHtml(items)}</strong>
          <span>結果</span><strong>${escapeHtml(report.result)}</strong>
        </div>
        <hr class="soft" />
        <p class="meta-label">遠征ログ</p>
        <div class="log-list">
          ${report.logs.map((entry) => `<div class="log-line ${entry.kind}">${escapeHtml(entry.text)}</div>`).join("")}
        </div>
        <hr class="soft" />
        <p class="meta-label">観察記録更新</p>
        ${report.observationText.length === 0
          ? `<div class="empty">この報告書で更新された観察記録はありません。</div>`
          : `<div class="log-list">${report.observationText.map((line) => `<div class="log-line afterglow">${escapeHtml(line)}</div>`).join("")}</div>`}
        <div class="button-row" style="margin-top: 18px;">
          <button class="primary-button" onclick="setRoute('home')">ギルドへ戻る</button>
          <button class="secondary-button" onclick="setRoute('observations')">観察記録を見る</button>
          <button class="secondary-button" onclick="setRoute('adventurers')">名簿にメモする</button>
        </div>
      </div>
    </section>
  `;
}

function selectQuest(id) {
  selectedQuestId = id;
  saveState();
  render();
}

function toggleAdventurer(id) {
  const adv = getAdventurer(id);
  if (!adv || adv.status !== "待機中") return;
  if (selectedAdventurerIds.includes(id)) {
    selectedAdventurerIds = selectedAdventurerIds.filter((advId) => advId !== id);
  } else {
    if (selectedAdventurerIds.length >= 3) return;
    selectedAdventurerIds = [...selectedAdventurerIds, id];
  }
  saveState();
  render();
}

function toggleItem(id) {
  if (selectedItemIds.includes(id)) {
    selectedItemIds = selectedItemIds.filter((itemId) => itemId !== id);
  } else {
    if (selectedItemIds.length >= 2) return;
    selectedItemIds = [...selectedItemIds, id];
  }
  saveState();
  render();
}

function clearSelections() {
  selectedQuestId = null;
  selectedAdventurerIds = [];
  selectedItemIds = [];
  saveState();
  render();
}

function startExpedition() {
  if (!selectedQuestId || selectedAdventurerIds.length === 0 || state.expedition) return;
  selectedAdventurerIds.forEach((id) => {
    const adv = getAdventurer(id);
    if (adv) adv.status = "遠征中";
  });
  state.worldState.totalExpeditions += 1;
  state.expedition = {
    id: `exp_${Date.now()}`,
    questId: selectedQuestId,
    adventurerIds: [...selectedAdventurerIds],
    itemIds: [...selectedItemIds],
    startTime: Date.now(),
    durationMs: DEMO_DURATION_MS,
    seed: Math.floor(Math.random() * 1000000)
  };
  selectedQuestId = null;
  selectedAdventurerIds = [];
  selectedItemIds = [];
  saveState();
  setRoute("home");
}

function advanceTimeForMock() {
  if (!state.expedition) return;
  state.expedition.startTime = Date.now() - state.expedition.durationMs;
  saveState();
  render();
}

function openReport(id) {
  const report = state.reports.find((item) => item.id === id);
  if (!report) return;
  report.opened = true;
  if (!report.applied) {
    applyReport(report);
    report.applied = true;
  }
  state.activeReportId = id;
  saveState();
  setRoute("report");
}

function applyReport(report) {
  report.adventurerIds.forEach((id) => {
    const adv = getAdventurer(id);
    if (!adv) return;
    const line = report.adventurerHistoryLines?.[id] ?? report.historyLine;
    adv.history.unshift(line);
  });

  state.worldState.totalReportsOpened += 1;
  state.worldState.recordDensity += 1 + report.observationUpdates.length;
  state.worldState.attachmentScore += report.adventurerIds.length;
  if (report.observationUpdates.length > 0) state.worldState.anomalyPressure += 0;

  report.observationUpdates.forEach((update) => {
    const obs = state.observations.find((item) => item.id === update.id);
    if (!obs) return;
    for (const [key, lines] of Object.entries(update.add)) {
      lines.forEach((line) => {
        if (!obs[key].includes(line)) obs[key].push(line);
      });
    }
  });
}

function editAdventurer(id) {
  editingAdventurerId = id;
  renderAdventurers();
}

function saveAdventurerMemo(id) {
  const adv = getAdventurer(id);
  if (!adv) return;
  const nextNickname = document.getElementById("nicknameInput").value.trim();
  const nextMemo = document.getElementById("memoInput").value.trim();
  if (nextNickname !== adv.nickname && nextNickname) state.worldState.attachmentScore += 2;
  if (nextMemo !== adv.memo && nextMemo) {
    state.worldState.attachmentScore += 2;
    state.worldState.recordDensity += 1;
  }
  adv.nickname = nextNickname;
  adv.memo = nextMemo;
  saveState();
  renderAdventurers();
}

function toggleFavorite(id) {
  const adv = getAdventurer(id);
  if (!adv) return;
  adv.favorite = !adv.favorite;
  if (adv.favorite) state.worldState.attachmentScore += 2;
  saveState();
  renderAdventurers();
}

function makeRng(seed) {
  let value = (seed || 1) % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function pickOne(list, rng) {
  if (!list || list.length === 0) return null;
  return list[Math.floor(rng() * list.length)];
}

function pickMany(list, count, rng) {
  const pool = [...list];
  const picked = [];
  while (pool.length > 0 && picked.length < count) {
    picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return picked;
}

function hasPartyTrait(party, key, value) {
  return party.some((adv) => adv[key] === value);
}

function findByTrait(party, key, value) {
  return party.find((adv) => adv[key] === value) ?? party[0];
}

function formatNames(party) {
  return party.map(getDisplayName).join("、");
}

function generateWeatherLog(quest, party, weather, rng) {
  const leader = getDisplayName(pickOne(party, rng));
  const careful = findByTrait(party, "personality", "慎重");
  const caregiver = findByTrait(party, "personality", "世話焼き");
  const brave = findByTrait(party, "personality", "豪胆");

  const table = {
    晴れ: [
      `朝の光が差す中、一行は${quest.area}へ向かった。足取りは軽く、${leader}は出発前に装備をもう一度確かめた。`,
      `空はよく晴れていた。視界が広く、${getDisplayName(careful)}は遠くの道標まで確認しながら進んだ。`
    ],
    小雨: [
      `小雨の中、一行は外套の襟を立てて進んだ。紙の依頼書は湿りやすく、${getDisplayName(careful)}が何度も手元を確認した。`,
      `出発からしばらくして細い雨が降り始めた。${getDisplayName(caregiver)}は仲間の荷物に布をかけ、濡れやすいものを内側へ移した。`
    ],
    霧: [
      `街道には薄い霧がかかっていた。${getDisplayName(careful)}は足跡と轍を見比べ、急がずに進むことを選んだ。`,
      `霧で視界が悪い。${getDisplayName(brave)}は先に進もうとしたが、仲間の声を聞いて歩幅を落とした。`
    ],
    強風: [
      `風が強く、依頼書の端が何度も跳ねた。${leader}は荷紐を結び直し、一行は風を避けるように低い道を選んだ。`,
      `古い街道には乾いた葉が舞っていた。${getDisplayName(brave)}は笑っていたが、声は風に流されてほとんど聞こえなかった。`
    ],
    雨上がり: [
      `雨上がりの道はぬかるんでいた。${getDisplayName(careful)}は泥の深さを見て、遠回りでも固い道を選んだ。`,
      `森の入口には湿った匂いが残っていた。${getDisplayName(caregiver)}は「こういう日は足元から冷えます」と仲間に声をかけた。`
    ]
  };
  return pickOne(table[weather], rng);
}

const questEventPools = {
  quest_letter: {
    weather: ["晴れ", "小雨", "霧", "強風", "雨上がり"],
    roadEvents: ["ぬかるみ", "古い道標", "商人とのすれ違い", "封蝋の確認", "宛先の聞き込み", "犬の遠吠え"],
    outcomes: ["成功", "持ち帰り", "再配達", "部分成功"]
  },
  quest_herb: {
    weather: ["晴れ", "小雨", "霧", "雨上がり"],
    roadEvents: ["湿った足跡", "倒木", "森喰い兎", "薬草袋の破れ", "泥被り茸の群生", "休憩地点"],
    outcomes: ["成功", "小成功", "採集優先", "観察優先"]
  },
  quest_signpost: {
    weather: ["晴れ", "小雨", "霧", "強風", "雨上がり"],
    roadEvents: ["道標の傾き", "苔に隠れた文字", "旧道の分岐", "壊れた橋", "通行人の証言", "根元のゆるみ"],
    outcomes: ["成功", "応急処置", "照合保留", "再確認"]
  }
};

function roadEventText(quest, eventName, party, itemIds, rng) {
  const scout = findByTrait(party, "job", "斥候");
  const herbalist = findByTrait(party, "job", "薬草師");
  const warrior = findByTrait(party, "job", "戦士");
  const post = findByTrait(party, "background", "郵便配達人");
  const has = (id) => itemIds.includes(id);
  const name = (adv) => getDisplayName(adv);

  const generic = {
    ぬかるみ: [
      `ぬかるんだ坂道で${name(warrior)}が足を滑らせた。すぐに立ち上がったが、荷物の底には泥がついた。`,
      `${name(scout)}は泥に残った足跡を見て、同じ道を通った者がいると判断した。`
    ],
    古い道標: [
      `道の脇に古い道標が立っていた。文字は薄いが、まだ読める。${has("item_map") ? "古地図と照合すると、少しだけ表記が古いことが分かった。" : "一行は目印だけを報告書に写し取った。"}`,
      `${name(scout)}は道標の根元を調べ、最近誰かが土を踏み固めた跡を見つけた。`
    ],
    商人とのすれ違い: [
      `途中で荷車を引く商人とすれ違った。商人は「その先の家なら、夕方には戻るはずだ」と教えてくれた。`,
      `商人は手紙の宛名を見ても首をかしげたが、古い屋号だけは聞き覚えがあると言った。`
    ],
    封蝋の確認: [
      `${name(post)}は封蝋に触れず、光にかざして割れがないことだけを確認した。昔の癖が出たらしい。`,
      `封蝋は古いが、まだ保たれていた。${name(warrior)}は不用意に触ろうとして、${name(scout)}に止められた。`
    ],
    宛先の聞き込み: [
      `宛先の家はすぐには見つからなかった。${name(scout)}は井戸端で聞き込みを行い、古い表札の場所を聞き出した。`,
      `${name(post)}は家の並びを見て、表通りより裏道に残っている家だと判断した。`
    ],
    犬の遠吠え: [
      `遠くで犬が吠えた。危険はなかったが、一行は少し歩く速度を上げた。`,
      `${name(warrior)}は剣の柄に手を置いたが、吠え声はすぐに遠ざかった。`
    ],
    湿った足跡: [
      `${name(scout)}は湿った足跡を見つけ、荷物を一か所にまとめるよう合図した。小型の獣が近くを通った可能性がある。`,
      `泥の上に小さな足跡が残っていた。${name(herbalist)}は薬草袋の口を固く結び直した。`
    ],
    倒木: [
      `倒木が道をふさいでいた。${name(warrior)}が枝を払い、${name(scout)}が安全な迂回路を探した。`,
      `古い倒木の裏側に、泥被り茸がいくつか生えていた。${name(herbalist)}は無理に引き抜かず、根元の土ごと採取した。`
    ],
    森喰い兎: [
      `森喰い兎が薬草袋に飛びついた。${name(scout)}は短弓で牽制し、距離を取らせた。`,
      `草むらが揺れ、小さな影が荷袋へ走った。${name(warrior)}が足音で追い払い、袋の破れは最小限で済んだ。`
    ],
    薬草袋の破れ: [
      `薬草袋の縫い目が裂けかけていた。${has("item_bandage") ? "支給された包帯を荷紐の補修に使い、採集物を失わずに済んだ。" : "一行は外套の紐で応急処置をしたが、少量の葉を失った。"}`,
      `${name(herbalist)}は袋の中身を並べ直し、香りの強い薬草を内側へ移した。`
    ],
    泥被り茸の群生: [
      `倒木の陰に泥被り茸が群生していた。${name(herbalist)}は香りの強い個体だけを選び、採り過ぎないよう数を控えた。`,
      `泥をかぶった茸ほど香りが強い。${name(herbalist)}はその違いを報告書の余白に書き残した。`
    ],
    休憩地点: [
      `${has("item_pot") ? `${name(herbalist)}は携帯鍋で薄いスープを作った。${name(warrior)}は文句を言いながらも、最後まで飲み干した。` : `一行は倒木のそばで短い休憩を取った。温かいものはないが、靴紐を結び直す余裕はあった。`}`,
      `休憩中、${name(scout)}は森の音が途切れる場所を記録した。採集路としては使えそうだ。`
    ],
    道標の傾き: [
      `道標は片側へ傾いていた。${name(warrior)}が支え、${name(scout)}が根元の土を確認した。`,
      `傾いた道標は、近づいてみるとまだ読めた。文字の向きだけが少し怪しい。`
    ],
    苔に隠れた文字: [
      `苔に隠れた文字を、${name(scout)}が小刀の背で慎重に落とした。地名はかろうじて読めた。`,
      `文字の一部は苔で見えない。${name(warrior)}は強くこすろうとしたが、木が崩れそうだったため止められた。`
    ],
    旧道の分岐: [
      `${has("item_map") ? `古地図には、現在使われていない旧道の線が残っていた。一行は分岐を確認し、報告書に照合結果を残した。` : `旧道らしき分岐があったが、手元の記録だけでは照合しきれなかった。次回は古地図が必要。`}`,
      `分岐の先は草に覆われていた。通行量は少ないが、完全に途絶えているわけではない。`
    ],
    壊れた橋: [
      `小さな橋の板が一枚抜けていた。${name(warrior)}が先に渡り、他の者の足場を確かめた。`,
      `橋は渡れたが、荷車には危ない。報告書には「徒歩なら可、荷運びは不可」と記録された。`
    ],
    通行人の証言: [
      `通行人は「最近、道標を直そうとした者がいた」と話した。名前までは分からない。`,
      `旅人から、雨の日だけ旧道を使う者がいると聞いた。理由はまだ分からない。`
    ],
    根元のゆるみ: [
      `道標の根元は雨でゆるんでいた。${has("item_bandage") ? "包帯を仮の固定具として巻き、石を積んで補強した。" : "一行は石を積んで応急処置をした。"}`,
      `${name(scout)}は根元の土を触り、次の雨でまた傾く可能性が高いと判断した。`
    ]
  };
  return pickOne(generic[eventName] ?? [`${eventName}について、短い確認を行った。`], rng);
}

function personalEventText(quest, party, rng) {
  const candidates = [];
  party.forEach((adv) => {
    const name = getDisplayName(adv);
    if (adv.personality === "慎重") {
      candidates.push(`${name}はすぐには判断せず、報告書に残せる形で状況を整理してから仲間に伝えた。`);
      candidates.push(`${name}は「急がなくていい場面です」と言い、確認を一つ増やした。結果的に、その一手で見落としが減った。`);
    }
    if (adv.personality === "豪胆") {
      candidates.push(`${name}は先頭に立ち、面倒な道を笑って進んだ。乱暴に見えるが、危ない場所では意外と仲間を待っている。`);
      candidates.push(`${name}は「帰ったら飯だな」と言って、重い荷物を半分持った。本人は親切のつもりではなさそうだ。`);
    }
    if (adv.personality === "世話焼き") {
      candidates.push(`${name}は休憩のたびに仲間の顔色を見ていた。報告書には書きにくいが、こういう気配りは遠征を安定させる。`);
      candidates.push(`${name}は汚れた道具をその場で拭き、帰還後の整理が楽になるようにしていた。`);
    }
    if (adv.background === "郵便配達人") {
      candidates.push(`${name}は家の並びと道の曲がり方を見て、昔の配達路を思い出した。地図より早く、人の住み方を読んだ。`);
    }
    if (adv.background === "宿場の用心棒") {
      candidates.push(`${name}は人の出入りが多い場所で、自然と背中を壁に向けて立った。昔の仕事の癖らしい。`);
    }
    if (adv.background === "村の調合係") {
      candidates.push(`${name}は匂いと湿り気だけで、使える草と避ける草をより分けた。手つきに迷いがない。`);
    }
  });
  return pickOne(candidates, rng);
}

function supplyEventText(quest, party, itemIds, rng) {
  const has = (id) => itemIds.includes(id);
  const scout = findByTrait(party, "job", "斥候");
  const herbalist = findByTrait(party, "job", "薬草師");
  const warrior = findByTrait(party, "job", "戦士");
  const lines = [];
  if (has("item_bandage")) {
    lines.push(`包帯は怪我のためではなく、荷紐の補修に使われた。${getDisplayName(warrior)}は「便利だな」と雑に褒めた。`);
    lines.push(`小さな擦り傷が出たが、包帯で処置して行動を継続できた。報告書には負傷軽微とある。`);
  }
  if (has("item_map")) {
    lines.push(`${getDisplayName(scout)}は古地図を広げ、今の道と昔の道のズレを照合した。迷う前に違和感へ気づけたのが大きい。`);
    lines.push(`古地図の余白には、前任の記録係らしい細い線が残っていた。一行はその線を目印に進んだ。`);
  }
  if (has("item_whistle")) {
    lines.push(`視界が悪くなった時、笛の短い音で全員が集まった。大きな活躍ではないが、報告書には合流手段として記録された。`);
    lines.push(`${getDisplayName(warrior)}が試しに笛を吹き、思ったより大きな音に全員が少し黙った。以後、合図は短く一回に決まった。`);
  }
  if (has("item_pot")) {
    lines.push(`${getDisplayName(herbalist)}は携帯鍋で湯を沸かし、採集物の泥を落とした。休憩の短い時間が、そのまま確認作業になった。`);
    lines.push(`携帯鍋で作った薄いスープは評判が分かれた。だが、帰り道の足取りは少し軽くなった。`);
  }
  if (has("item_oilcase")) {
    lines.push(`油紙の手紙入れにより、紙の依頼書とメモは濡れずに済んだ。地味だが、記録係にはありがたい成果だ。`);
    lines.push(`${getDisplayName(scout)}は濡れた手で依頼書に触れないよう、油紙の上から内容を確認した。`);
  }
  if (lines.length === 0) return null;
  return pickOne(lines, rng);
}

function outcomeText(quest, party, itemIds, outcome, rng) {
  const scout = findByTrait(party, "job", "斥候");
  const herbalist = findByTrait(party, "job", "薬草師");
  const post = findByTrait(party, "background", "郵便配達人");
  const has = (id) => itemIds.includes(id);

  if (quest.id === "quest_letter") {
    const variants = {
      成功: {
        result: "成功",
        summary: "手紙は無事に届けられた。宛先確認の記録も残った。",
        line: `${getDisplayName(post)}の確認により、手紙は本人へ渡された。受取人は驚いたあと、何度も礼を言った。`,
        after: `帰り道、${getDisplayName(post)}は少しだけ誇らしそうだった。報告書の文字も、いつもより丁寧に見える。`,
        history: "届けられなかった手紙で、宛先確認と受け渡しを完了。"
      },
      持ち帰り: {
        result: "持ち帰り",
        summary: "受取人不在のため、手紙は濡れない状態で持ち帰られた。",
        line: `宛先の家は空き家だった。近所に預ける案も出たが、${getDisplayName(scout)}は首を振った。「本人に渡す依頼です。今日は持ち帰ります」`,
        after: `受付嬢は手紙を受け取ると、乾いた布で封筒の端をそっと押さえた。こういう判断も、ちゃんと記録に残る。`,
        history: "届けられなかった手紙を持ち帰り。封筒の保全を優先。"
      },
      再配達: {
        result: "再配達",
        summary: "宛先の所在は判明。次回の再配達が必要。",
        line: `宛先の人物は夕方まで戻らないと分かった。一行は無理に待たず、現在の所在だけを記録して帰還した。`,
        after: `報告書の最後には「次回は午後発が望ましい」とある。失敗ではない。次に繋がる記録だ。`,
        history: "手紙依頼で受取人の所在を確認。次回再配達。"
      },
      部分成功: {
        result: "部分成功",
        summary: "手紙は届けられなかったが、宛先情報は更新された。",
        line: `${has("item_map") ? "古地図の表記" : "聞き込み"}により、宛先の旧住所と現在の家屋の対応が分かった。手紙はギルドで保管する。`,
        after: `派手な成果はない。けれど、次に誰かがこの依頼を受ける時、迷う時間は短くなる。`,
        history: "手紙依頼で宛先情報を更新。次回の成功率を上げた。"
      }
    };
    return variants[outcome] ?? variants.成功;
  }

  if (quest.id === "quest_herb") {
    const variants = {
      成功: {
        result: "成功",
        summary: "薬草と泥被り茸を持ち帰った。観察記録も更新された。",
        line: `${getDisplayName(herbalist)}は必要な分だけを採集し、残りの群生地を荒らさずに残した。`,
        after: `薬草袋の底には、小さな歯形のついた革紐が残っていた。受付で保管し、観察記録へ追記する。`,
        history: "森の薬草採集で、採集と小型獣の観察を両立。"
      },
      小成功: {
        result: "小成功",
        summary: "採集量は少なめだが、状態の良い薬草を持ち帰った。",
        line: `森の湿り気が強く、採れる量は多くなかった。${getDisplayName(herbalist)}は質の良い個体だけを選んだ。`,
        after: `少ない成果でも、香りはよい。調合係からは「この量で十分」と返事があった。`,
        history: "森の薬草採集で、量より品質を優先。"
      },
      採集優先: {
        result: "成功",
        summary: "採集を優先し、予定量の薬草を確保した。",
        line: `${getDisplayName(scout)}が周囲を警戒し、${getDisplayName(herbalist)}が手早く採集した。観察は浅いが、依頼分の量は満たしている。`,
        after: `帰還後、袋を開くと森の湿った匂いが受付に広がった。`,
        history: "森の薬草採集で、予定量の確保を優先。"
      },
      観察優先: {
        result: "観察優先",
        summary: "採集量は控えめだが、森喰い兎の反応を詳しく記録した。",
        line: `${getDisplayName(scout)}はあえて荷袋を少し離して置き、森喰い兎の反応を観察した。危険は小さいが、記録としては有用。`,
        after: `報告書には、歯形の向きと噛み跡の深さまで書かれていた。こういう細かさが後で効く。`,
        history: "森の薬草採集で、森喰い兎の反応を重点観察。"
      }
    };
    return variants[outcome] ?? variants.成功;
  }

  const variants = {
    成功: {
      result: "成功",
      summary: "道標の位置を確認し、街道記録と照合した。",
      line: `${getDisplayName(scout)}は道標の向きと周囲の目印を照合し、現在の記録と大きな差がないことを確認した。`,
      after: `報告書の端には、道標の簡単なスケッチが添えられていた。地味だが、とても助かる記録だ。`,
      history: "古い道標の確認で、街道記録との照合を完了。"
    },
    応急処置: {
      result: "応急処置",
      summary: "道標の傾きを確認し、倒れないよう補強した。",
      line: `道標の根元はゆるんでいた。一行は石を積み、次の巡回までは倒れないよう応急処置をした。`,
      after: `帰還した${formatNames(party)}の靴には、道標の根元と同じ赤土がついていた。`,
      history: "古い道標の確認で、根元を応急補強。"
    },
    照合保留: {
      result: "照合保留",
      summary: "現地確認は完了。旧道との照合は次回に持ち越し。",
      line: `${has("item_map") ? "古地図は役に立ったが、旧道の記述が古すぎた。" : "古地図がなかったため、旧道の照合は保留となった。"}現地の状態だけを記録して帰還した。`,
      after: `報告書には「次回は晴天時に再確認」とある。焦らない記録は、次の事故を減らす。`,
      history: "古い道標の確認で、旧道照合を次回へ持ち越し。"
    },
    再確認: {
      result: "再確認",
      summary: "道標の文字が一部読めず、再確認が必要。",
      line: `苔に隠れた文字は一部しか読めなかった。無理に削ると木が崩れそうだったため、一行は保存を優先した。`,
      after: `読めない文字を、読めないまま残す判断。記録係としては、少しだけ嬉しい報告だった。`,
      history: "古い道標の確認で、文字保存を優先し再確認扱い。"
    }
  };
  return variants[outcome] ?? variants.成功;
}

function observationUpdateFor(quest, outcome, roadEvents) {
  if (quest.id === "quest_herb") {
    const addFacts = [];
    const addInference = [];
    const addNext = [];
    if (roadEvents.includes("森喰い兎") || roadEvents.includes("薬草袋の破れ")) {
      addFacts.push("薬草袋や荷紐に反応し、噛みつくことがある。");
      addNext.push("香りの強い薬草を囮にできるか確認する。");
    }
    if (outcome === "観察優先") {
      addFacts.push("荷袋を少し離して置くと、接近行動を観察しやすい。");
    }
    if (roadEvents.includes("泥被り茸の群生") || roadEvents.includes("倒木")) {
      addFacts.push("泥被り茸は湿った倒木の陰に群生することがある。");
      addInference.push("雨上がりや湿度の高い日に採集量が増える可能性がある。");
    }
    const updates = [];
    if (addFacts.length || addInference.length || addNext.length) {
      updates.push({
        id: "obs_rabbit",
        add: { facts: addFacts, inference: [], next: addNext }
      });
    }
    if (addInference.length || roadEvents.includes("泥被り茸の群生")) {
      updates.push({
        id: "obs_mushroom",
        add: { facts: roadEvents.includes("泥被り茸の群生") ? ["湿った倒木の陰に群生することがある。"] : [], inference: addInference, next: ["採集後すぐ乾かした場合の薬効差を確認する。"] }
      });
    }
    return updates.filter((update) => Object.values(update.add).some((lines) => lines.length > 0));
  }
  return [];
}

function observationTextFor(updates) {
  const texts = [];
  updates.forEach((update) => {
    const obs = state.observations.find((item) => item.id === update.id);
    const count = Object.values(update.add).flat().length;
    if (obs && count > 0) texts.push(`${obs.name}：${count}件の記録を追記。`);
  });
  return texts;
}

function generateReport(expedition) {
  const quest = getQuest(expedition.questId);
  const party = expedition.adventurerIds.map(getAdventurer).filter(Boolean);
  const itemIds = expedition.itemIds;
  const items = itemIds.map(getItem).filter(Boolean);
  const rng = makeRng(expedition.seed + state.worldState.totalExpeditions * 37 + state.reports.length * 101);
  const pool = questEventPools[quest.id];
  const logs = [];
  const add = (kind, text) => logs.push({ kind, text });

  const weather = pickOne(pool.weather, rng);
  const roadEvents = pickMany(pool.roadEvents, 2 + Math.floor(rng() * 2), rng);
  let outcome = pickOne(pool.outcomes, rng);

  // 支給品や人物特性で、納得感のある結果へ少しだけ寄せる。
  if (quest.id === "quest_letter" && itemIds.includes("item_oilcase") && rng() < 0.45) outcome = pickOne(["成功", "持ち帰り", "再配達"], rng);
  if (quest.id === "quest_letter" && hasPartyTrait(party, "background", "郵便配達人") && rng() < 0.45) outcome = pickOne(["成功", "部分成功", "再配達"], rng);
  if (quest.id === "quest_herb" && hasPartyTrait(party, "job", "薬草師") && rng() < 0.5) outcome = pickOne(["成功", "小成功", "採集優先"], rng);
  if (quest.id === "quest_signpost" && itemIds.includes("item_map") && rng() < 0.5) outcome = pickOne(["成功", "応急処置", "照合保留"], rng);

  const outcomeInfo = outcomeText(quest, party, itemIds, outcome, rng);
  const observationUpdates = observationUpdateFor(quest, outcome, roadEvents);
  const observationText = observationTextFor(observationUpdates);
  const personal = personalEventText(quest, party, rng);
  const supply = supplyEventText(quest, party, itemIds, rng);

  add("", `一行は「${quest.title}」のため、${quest.area}へ向かった。`);
  add("", `編成：${formatNames(party)}。支給品：${items.length ? items.map((item) => item.name).join("、") : "なし"}。`);
  add("", generateWeatherLog(quest, party, weather, rng));
  roadEvents.forEach((eventName) => add("action", roadEventText(quest, eventName, party, itemIds, rng)));
  if (personal) add("drama", personal);
  if (supply) add("drama", supply);
  add("action", outcomeInfo.line);
  add("afterglow", outcomeInfo.after);

  const adventurerHistoryLines = {};
  party.forEach((adv) => {
    const displayName = getDisplayName(adv);
    const roleNote = adv.job === "斥候" ? "確認役として" : adv.job === "薬草師" ? "採集と手当で" : adv.job === "戦士" ? "荷運びと警戒で" : "一行の一員として";
    adventurerHistoryLines[adv.id] = `${quest.title}：${outcomeInfo.result}。${displayName}は${roleNote}記録に残った。`;
  });

  return {
    id: `report_${Date.now()}`,
    questId: quest.id,
    adventurerIds: expedition.adventurerIds,
    itemIds: expedition.itemIds,
    opened: false,
    applied: false,
    result: outcomeInfo.result,
    summary: outcomeInfo.summary,
    historyLine: outcomeInfo.history,
    adventurerHistoryLines,
    logs,
    observationUpdates,
    observationText,
    hiddenTags: {
      weather,
      roadEvents,
      outcome,
      recordDensityGain: 1 + logs.length + observationText.length
    },
    createdAt: new Date().toISOString()
  };
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => setRoute(button.dataset.route));
});

resetButton.addEventListener("click", () => {
  const ok = confirm("Mockの保存データを初期化しますか？");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  state = createInitialState();
  selectedQuestId = null;
  selectedAdventurerIds = [];
  selectedItemIds = [];
  editingAdventurerId = null;
  route = "home";
  render();
});

setInterval(() => {
  if (state.expedition) render();
}, 1000);

render();
