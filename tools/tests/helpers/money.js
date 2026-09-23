// 金のテスト用の共通処理（2026-09-23・EX-144）。
const { BASELINE_PATH, allParties } = require("./axes");
const baseline = require(BASELINE_PATH);

// ★ 結末は乱数で決まる。対比較の基準（全依頼 × 編成30 × seed4）から、
//   **指定した段になる組**を1つ引き、同じ遠征を作って帰還まで畳む。
//   出発の支払いは本物の経路（moveMoney）で行い、帰還は checkExpeditionCompletion に任せる。
async function settleExpedition(page, { questId, tier }) {
  const parties = allParties();
  // ★ 支給品の軸の行（`supplies` 列あり）は編成の表が別なので使わない
  const row = baseline.rows.find((r) => r.quest === questId && r.tier === tier && r.supplies == null);
  if (!row) throw new Error(`基準に ${questId} の ${tier} が無い`);
  return page.evaluate(({ questId, party, seed, tier }) => {
    const quest = getQuest(questId);
    const moneyBefore = state.money;
    const fee = questFee(quest);
    moveMoney(-fee, questFeeLabel(quest), quest.title);
    settleNegativeMoney(); // ★ 出発と同じ：遠征費で割り込んだら、その場で借金の判定
    const now = Date.now();
    state.expeditions = [...getExpeditions(), {
      id: `exp_test_${seed}_${tier}`, questId, adventurerIds: party, adventurerItemIds: {}, itemIds: [],
      startTime: now - 60_000, durationMs: 1, seed, departTimeOfDay: "昼", departWeather: "晴れ",
      firstRunOfQuest: false, elsieAtGuild: true, fee
    }];
    party.forEach((id) => { const a = getAdventurer(id); if (a) a.status = "遠征中"; });
    checkExpeditionCompletion();
    const report = state.reports[0];
    return { tier: GROWTH_TIER_BY_RESULT[report.result], result: report.result, fee, reward: report.money.reward, moneyBefore, moneyAfter: state.money };
  }, { questId, party: parties[row.partyIndex], seed: row.seed, tier });
}

// 所持金を直接置く（借金の前提を作るため）。★ 帳簿には書かない＝テストの前提づくりであって出入りではない。
async function setMoney(page, value) {
  await page.evaluate((v) => { state.money = v; saveState(); render(); }, value);
}

// 本物の経路で「出費」を起こす（出発と同じく、減らしたら借金の判定まで通す）。
async function spend(page, amount) {
  return page.evaluate((a) => {
    moveMoney(-a, "テスト用の出費");
    settleNegativeMoney();
    saveState();
    return { money: state.money, debt: JSON.parse(JSON.stringify(state.debt)), gameOver: state.gameOver, events: state.moneyEvents.length };
  }, amount);
}

// 買い出しを1回、帰還まで畳む（2026-09-23・EX-144）。出発は本物の経路（startExpedition）を通す。
//   party … 冒険者 id の配列／wishes … 書き付け（品 id の並び。★ 共有の荷と同じ枠で、容量は1人2枠）
//   negotiation … 指定すると、出発前にその値を全員の交渉に置く（値引きの比較用）
async function runShopping(page, { party, wishes, negotiation = null }) {
  return page.evaluate(({ party, wishes, negotiation }) => {
    if (negotiation != null) party.forEach((id) => { const a = getAdventurer(id); if (a) a.stats.negotiation = negotiation; });
    const moneyBefore = state.money;
    selectedQuestId = "quest_shopping";
    selectedAdventurerIds = [...party];
    selectedSharedItems = [...wishes];
    selectedObsHolders = [];
    startExpedition();
    const exp = state.expeditions.find((e) => e.questId === "quest_shopping");
    if (!exp) return { error: "出発できなかった" };
    exp.startTime = Date.now() - exp.durationMs - 1_000; // 所要時間を過ぎたことにする
    checkExpeditionCompletion();
    const report = state.reports[0];
    return {
      result: report.result,
      shopping: report.money.shopping,
      fee: report.money.fee,
      moneyBefore,
      moneyAfter: state.money,
      stock: JSON.parse(JSON.stringify(state.stock)),
      owned: stockOwnedTotal()
    };
  }, { party, wishes, negotiation });
}

// 通常の依頼を1回、本物の出発経路で出して帰還まで畳む（共有の荷・記録票の検証用）
async function runDispatch(page, { questId, party, shared = [], obsHolders = [] }) {
  return page.evaluate(({ questId, party, shared, obsHolders }) => {
    selectedQuestId = questId;
    selectedAdventurerIds = [...party];
    selectedSharedItems = [...shared];
    selectedObsHolders = [...obsHolders];
    startExpedition();
    const exp = state.expeditions.find((e) => e.questId === questId);
    if (!exp) return { error: "出発できなかった" };
    const departed = { itemMap: JSON.parse(JSON.stringify(exp.adventurerItemIds)), shared: [...(exp.sharedItemIds ?? [])], stockAtDepart: JSON.parse(JSON.stringify(state.stock)), ownedAtDepart: stockOwnedTotal() };
    exp.startTime = Date.now() - exp.durationMs - 1_000;
    checkExpeditionCompletion();
    const report = state.reports[0];
    return { ...departed, report: { result: report.result, observationNotes: report.observationNotes, usedItemIds: report.usedItemIds ?? null }, stockAfter: JSON.parse(JSON.stringify(state.stock)), ownedAfter: stockOwnedTotal() };
  }, { questId, party, shared, obsHolders });
}

// 棚を直接置く（テストの前提づくり。帳簿には書かない）
async function setStock(page, stock) {
  await page.evaluate((s) => { state.stock = s; saveState(); render(); }, stock);
}

module.exports = { settleExpedition, setMoney, spend, runShopping, runDispatch, setStock };
