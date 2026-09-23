// 金のテスト用の共通処理（2026-09-23・EX-144）。
const { BASELINE_PATH, allParties } = require("./axes");
const baseline = require(BASELINE_PATH);

// ★ 結末は乱数で決まる。対比較の基準（全依頼 × 編成30 × seed4）から、
//   **指定した段になる組**を1つ引き、同じ遠征を作って帰還まで畳む。
//   出発の支払いは本物の経路（moveMoney）で行い、帰還は checkExpeditionCompletion に任せる。
async function settleExpedition(page, { questId, tier }) {
  const parties = allParties();
  const row = baseline.rows.find((r) => r.quest === questId && r.tier === tier);
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

module.exports = { settleExpedition, setMoney, spend };
