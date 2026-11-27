// ホームの窓（EX-161 段階1）。触れる物から今ある画面を開く。2026-11-27・P-015：3枚と ◀▶ をやめ、横長の部屋1枚の背景（絵の層）にした。
const { test, expect } = require("@playwright/test");
const { PLAIN_URL, freshPage, interview } = require("../helpers/app");


test.describe("ホームの窓（EX-161）", () => {
  test("◀▶ と3枚の作りは無い。窓の中は横長の1枚で、1秒ごとの再描画のあとも物は残る（2026-11-25 作者・P-015）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    for (const sel of [".room-arrow", ".room-strip", ".room-panel"]) await expect(page.locator(sel), sel).toHaveCount(0);
    expect(await page.evaluate(() => typeof roomPanel + typeof shiftRoom + typeof ROOM_PANELS)).toBe("undefinedundefinedundefined");
    await expect(page.locator(".room-stage")).toHaveCount(1);
    await page.waitForTimeout(1300);
    await expect(page.locator('[data-room-object="board"]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("掲示板・本・書類の山から今ある画面が開く。用途の無い物は枠も反応も無い", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.locator('[data-room-object="board"]').click({ force: true });
    expect(await page.evaluate(() => route)).toBe("quests");
    await page.evaluate(() => { setRoute("home"); });
    // ★ 本（生態目録）は最初の生き物に出会うまで枠も反応も無い（EX-163 段階3）。枠を1つ立ててから押す
    expect(await page.locator('button[data-room-object="book"]').count(), "出会う前の本は触れない").toBe(0);
    await page.evaluate(() => {
      state.ecologyRecord = { er_t: { id: "er_t", target: "森喰い兎", name: null, nameDraft: "", nameConfirmedAt: null, area: "", category: "", confirmed: [], guess: "", nextCheck: "", legacy: "" } };
      saveState(); render();
    });
    await page.locator('[data-room-object="book"]').click({ force: true });
    expect(await page.evaluate(() => route)).toBe("ecology");
    await page.evaluate(() => { setRoute("home"); });
    await page.locator('[data-room-object="pile"]').click({ force: true });
    expect(await page.evaluate(() => route)).toBe("home");
    // 押すと報告書棚が見える位置まで動く（画面は home のまま）
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => { const r = document.getElementById("reportShelf").getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight; })).toBe(true);
    // 2026-11-24 作者：本棚は名簿類を開くようになった（P-014）ので、用途の無い物から外す
    for (const id of ["badge", "counter", "backyard"]) {
      await expect(page.locator(`button[data-room-object="${id}"]`)).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test("本棚を押すと名簿の画面が開く。書類の吹き出しの名簿と同じ画面（P-014・2026-11-24 作者）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    // 本棚に枠（触れる物）が出る
    await expect(page.locator('button[data-room-object="shelf"]')).toHaveCount(1);
    await page.locator('[data-room-object="shelf"]').click({ force: true });
    const viaShelf = await page.evaluate(() => ({ route, title: document.getElementById("viewTitle").textContent }));
    expect(viaShelf.route).toBe("adventurers");
    await page.evaluate(() => setRoute("home"));
    await page.locator('[data-room-object="papers"]').click({ force: true });
    await page.locator(".room-bubble-item", { hasText: "名簿" }).click();
    const viaPapers = await page.evaluate(() => ({ route, title: document.getElementById("viewTitle").textContent }));
    expect(viaShelf).toEqual(viaPapers);
    expect(errors).toEqual([]);
  });

  test("墓標は死者がいないと出ない。いれば出て、押すと準備中", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await expect(page.locator('[data-room-object="grave"]')).toHaveCount(0);
    await page.evaluate(() => { state.adventurers[0].status = "死亡"; render(); });
    await expect(page.locator('button[data-room-object="grave"]')).toHaveCount(1);
    await page.locator('button[data-room-object="grave"]').click({ force: true });
    await expect(page.locator(".room-notice")).toContainText("準備中");
    // 別の画面へ移って戻っても、一言は居残らない
    await page.evaluate(() => { setRoute("quests"); setRoute("home"); });
    await expect(page.locator(".room-notice")).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("今のホームの文が窓の下に残っている", async ({ page }) => {
    await freshPage(page);
    await interview(page);
    await expect(page.locator(".reception .speech")).toBeVisible();
    const order = await page.evaluate(() => {
      const w = document.querySelector(".room-window").getBoundingClientRect().bottom;
      return document.querySelector(".reception .speech").getBoundingClientRect().top >= w;
    });
    expect(order).toBe(true);
  });
});

test.describe("吹き出しの目次と帳簿（EX-161 段階2）", () => {
  test("書類→帳簿／名簿、ペン→報告メモ。入口が違っても開く先は同じ画面", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.locator('[data-room-object="papers"]').click({ force: true });
    await expect(page.locator(".room-bubble-item")).toHaveText(["帳簿", "名簿"]);
    await page.locator(".room-bubble-item", { hasText: "帳簿" }).click();
    expect(await page.evaluate(() => route)).toBe("ledger");
    await expect(page.locator(".paper-meter")).toHaveCount(3);
    await page.evaluate(() => setRoute("home"));
    await page.locator('[data-room-object="papers"]').click({ force: true });
    await page.locator(".room-bubble-item", { hasText: "名簿" }).click();
    const viaPapers = await page.evaluate(() => ({ route, title: document.getElementById("viewTitle").textContent }));
    await page.evaluate(() => setRoute("home"));
    await page.locator('[data-route="adventurers"]').click();
    const viaNav = await page.evaluate(() => ({ route, title: document.getElementById("viewTitle").textContent }));
    expect(viaPapers).toEqual(viaNav);
    await page.evaluate(() => { setRoute("home"); });
    await page.locator('[data-room-object="pen"]').click({ force: true });
    // 綴じるカードは最初の報告書を開くまで出ない＝目次にも出さない
    await expect(page.locator(".room-bubble-item")).toHaveText(["報告メモ"]);
    await page.locator(".room-bubble-item", { hasText: "報告メモ" }).click();
    expect(await page.evaluate(() => route)).toBe("observations");
    expect(errors).toEqual([]);
  });

  test("ホームの計器は外れ、帳簿と出発の画面に出る。1秒の再描画でも吹き出しは残り、枠を移すと閉じる", async ({ page }) => {
    await freshPage(page);
    await interview(page);
    await expect(page.locator("#app > .paper-meters")).toHaveCount(0);
    await page.evaluate(() => setRoute("quests"));
    await expect(page.locator(".paper-meters")).toContainText("所持金");
    await expect(page.locator(".paper-meters")).toContainText("持ち物");
    await expect(page.locator(".paper-meters")).toContainText("在席");
    await page.evaluate(() => { setRoute("home"); });
    await page.locator('[data-room-object="papers"]').click({ force: true });
    await page.waitForTimeout(1300);
    await expect(page.locator(".room-bubble")).toHaveCount(1);
    // もう一度押すと閉じる（2026-11-27・P-015：◀▶ をやめたので、枠を移して閉じる動きは無い）
    await page.locator('[data-room-object="papers"]').click({ force: true });
    await expect(page.locator(".room-bubble")).toHaveCount(0);
  });

  test("ペン→記録を綴じる：報告書を開いたあとは目次に出て、綴じるカードまで動く", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.evaluate(() => {
      const r = generateReport({ questId: "quest_tavern_errand", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 1, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
      r.id = "report_room_bind"; r.opened = true;
      state.reports.unshift(r); render();
    });
    await page.locator('[data-room-object="pen"]').click({ force: true });
    await expect(page.locator(".room-bubble-item")).toHaveText(["記録を綴じる", "報告メモ"]);
    await page.locator(".room-bubble-item", { hasText: "記録を綴じる" }).click();
    await page.waitForTimeout(900);
    await expect(page.locator(".room-bubble")).toHaveCount(0);
    expect(await page.evaluate(() => { const r = document.getElementById("bindCard").getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight; })).toBe(true);
    expect(errors).toEqual([]);
  });

  test("受付嬢とエルシーをタップすると一言（仮）が出て、押すたびに替わる", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const notice = page.locator(".room-notice");
    await page.locator('button[data-room-object="receptionist"]').click({ force: true });
    await expect(notice).toHaveText("はい、なんでしょう。");
    await page.locator('button[data-room-object="receptionist"]').click({ force: true });
    await expect(notice).toHaveText("記録員さん、今日もお疲れさまです。");
    // 別の画面へ移って戻ると一言は消える（2026-11-27・P-015：枚を移して消す動きは無い）。戻ってエルシーを押す
    await page.evaluate(() => { setRoute("quests"); setRoute("home"); });
    await expect(notice).toBeHidden();
    await page.locator('button[data-room-object="elsie"]').click({ force: true });
    await expect(notice).toHaveText("エルシーは尻尾を振った。");
    await page.locator('button[data-room-object="elsie"]').click({ force: true });
    await expect(notice).toHaveText("撫でると、エルシーは目を細めた。");
    expect(errors).toEqual([]);
  });
});

// 2026-11-24 作者・M1 に合わせる（P-012）→ 2026-11-27・P-015 で横長1枚に換算した。
//   ★ 物の「絵の上の場所」は動かさない。P-012 の3枚の値（枚の番号・枚の中の ％）を固定の表として持ち、
//     x＝(枚の番号×100＋x)÷3・w＝w÷3（y・h は同じ）に換算した値と、いまの ROOM_OBJECTS が一致することを確かめる。
const PANEL_TABLE = {
  backyard: [0, 46, 18, 23, 41], book: [0, 37, 78, 38, 12], badge: [0, 8, 80, 20, 10],
  board: [1, 13, 28, 26, 18], shelf: [1, 42, 22, 53, 27], papers: [1, 3, 84, 55, 12], pile: [1, 66, 84, 26, 12],
  receptionist: [2, 3, 30, 15, 14], counter: [2, 0, 46, 24, 12], grave: [2, 46, 40, 14, 20], elsie: [2, 3, 62, 23, 8], pen: [2, 3, 80, 32, 16]
};
test.describe("物の置き場所（拠点の絵 M1・P-012 を横長1枚に換算・P-015）", () => {
  test("各物の位置が、3枚の値を換算したものと一致する（絵の上の場所は動いていない）。物の数も同じ", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const objs = await page.evaluate(() => ROOM_OBJECTS.map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, panel: o.panel })));
    expect(objs.map((o) => o.id).sort()).toEqual(Object.keys(PANEL_TABLE).sort());
    for (const o of objs) {
      const [p, x, y, w, h] = PANEL_TABLE[o.id];
      expect(o.panel, `${o.id}：枚の番号はもう持たない`).toBeUndefined();
      expect(Math.abs(o.x - (p * 100 + x) / 3), `${o.id} の x`).toBeLessThan(0.01);
      expect(Math.abs(o.w - w / 3), `${o.id} の w`).toBeLessThan(0.01);
      expect(o.y, `${o.id} の y`).toBe(y);
      expect(o.h, `${o.id} の h`).toBe(h);
    }
    // 画面でも、死者がいて目録の枠があれば、全部が窓の中に出る
    await page.evaluate(() => {
      state.adventurers[0].status = "死亡";
      state.ecologyRecord = { er_t: { id: "er_t", target: "森喰い兎", name: null, nameDraft: "", nameConfirmedAt: null, area: "", category: "", confirmed: [], guess: "", nextCheck: "", legacy: "" } };
      render();
    });
    const ids = await page.locator(".room-objects [data-room-object]").evaluateAll((els) => els.map((e) => e.dataset.roomObject));
    expect(ids.slice().sort()).toEqual(Object.keys(PANEL_TABLE).sort());
    expect(errors).toEqual([]);
  });

  test("枠は重ならず、触れる範囲（左右±1・上下±3＝3枚のときの±3と同じ大きさ）も絵の外へ出ない", async ({ page }) => {
    await freshPage(page);
    await interview(page);
    const problems = await page.evaluate(() => {
      const bad = [];
      for (const o of ROOM_OBJECTS) {
        const mx = o.act ? ROOM_HIT_MARGIN_X : 0;
        const my = o.act ? ROOM_HIT_MARGIN_Y : 0;
        if (o.x - mx < 0 || o.y - my < 0 || o.x + o.w + mx > 100 || o.y + o.h + my > 100) bad.push(`${o.id}：絵の外へ出る`);
      }
      for (const a of ROOM_OBJECTS) for (const b of ROOM_OBJECTS) {
        if (a.id >= b.id) continue;
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) bad.push(`${a.id}と${b.id}：枠が重なる`);
      }
      return bad;
    });
    expect(problems).toEqual([]);
  });
});

// ── ホームの背景（拠点の絵の層）・2026-11-27・P-015 ──────────────────────────────
//   試作「木漏れ日の層」の絵と動きを入れる。季節4つ（冬は扉を閉めた絵で木漏れ日の層なし）／夏は朝・昼・夕を時刻でなめらかに／
//   受付嬢は透明度だけで出す／雪は冬の窓の中だけ・落ち葉は秋。★ 季節と時刻の決め方（端末の日付・時刻）は仮・作者未確認。
const devSeason = async (page, season) => {
  await page.locator(`[data-room-dev-season="${season}"]`).click();
  await page.waitForTimeout(100);
};
const stageInfo = (page) => page.evaluate(() => {
  const stage = document.querySelector(".room-stage");
  const scroll = document.querySelector(".room-scroll");
  const sr = stage.getBoundingClientRect();
  const vr = scroll.getBoundingClientRect();
  return { w: sr.width, h: sr.height, left: sr.left, right: sr.right, vLeft: vr.left, vRight: vr.right, vW: vr.width, vH: vr.height, scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth, scrollLeft: scroll.scrollLeft };
});

test.describe("ホームの背景（絵の層・P-015）", () => {
  test("背景の層が出る：土台の絵・木漏れ日の層・受付嬢の層。絵は読み込めている（1368×677のまま）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await devSeason(page, "summer");
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const vis = (el) => !el.closest("[hidden]");
      const st = [...document.querySelectorAll(".room-st")].filter(vis);
      const dp = [...document.querySelectorAll(".room-dp")].filter(vis);
      const uk = document.querySelector(".room-uk");
      return { st: st.map((i) => [i.complete, i.naturalWidth, i.naturalHeight]), dp: dp.map((i) => [i.complete, i.naturalWidth]), uk: [uk.complete, uk.naturalWidth, uk.naturalHeight] };
    });
    expect(r.st.length).toBeGreaterThan(0);
    for (const s of r.st) expect(s).toEqual([true, 1368, 677]);
    expect(r.dp.length).toBeGreaterThan(0);
    for (const d of r.dp) expect(d).toEqual([true, 1368]);
    expect(r.uk).toEqual([true, 330, 230]);
    expect(errors).toEqual([]);
  });

  test("季節：?dev=1 の操作で絵が変わる。冬は木漏れ日の層が無い（扉を閉めた絵）。受付嬢の層はどの季節にもある", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const srcOf = () => page.evaluate(() => {
      const g = document.querySelector('.room-tg[data-t="noon"]');
      return { st: g.querySelector(".room-st").getAttribute("src"), dp: g.querySelector(".room-dp").getAttribute("src"), sunHidden: g.querySelector(".room-sun").hidden, season: document.querySelector(".room-stage").dataset.season, uk: Boolean(document.querySelector(".room-uk")) };
    });
    await page.evaluate(() => { roomState.devHour = 12; });
    const seen = {};
    for (const s of ["spring", "summer", "autumn", "winter"]) {
      await devSeason(page, s);
      const v = await srcOf();
      seen[s] = v;
      expect(v.season).toBe(s);
      expect(v.uk, `${s}：受付嬢の層`).toBe(true);
      await expect(page.locator(".room-uk"), `${s}：受付嬢が見える`).toBeVisible();
    }
    expect(seen.spring.st).toBe("assets/home/spring-static.jpg");
    expect(seen.summer.st).toBe("assets/home/summer-static.jpg");
    expect(seen.autumn.st).toBe("assets/home/autumn-static.jpg");
    expect(seen.winter.st).toBe("assets/home/winter-orig.jpg");
    for (const s of ["spring", "summer", "autumn"]) { expect(seen[s].sunHidden, `${s}：木漏れ日の層`).toBe(false); expect(seen[s].dp).toBe(`assets/home/${s}-dapple.jpg`); }
    expect(seen.winter.sunHidden, "冬は木漏れ日の層が無い").toBe(true);
    // 画面に見える木漏れ日の層は、冬は0枚・夏は1枚以上
    expect(await page.locator(".room-dp:visible").count()).toBe(0);
    await devSeason(page, "summer");
    expect(await page.locator(".room-dp:visible").count()).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("雪は冬だけ（窓の中）。落ち葉は秋だけ。揺れは動きを減らす設定で止まる", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const counts = () => page.evaluate(() => ({ flakes: document.querySelectorAll(".room-flake").length, leaves: document.querySelectorAll(".room-leaf").length }));
    await devSeason(page, "winter");
    expect(await counts()).toEqual({ flakes: 26, leaves: 0 });
    // 雪は窓の範囲（右の壁・冬だけ足した窓）の中にだけ置く
    expect(await page.evaluate(() => document.querySelector(".room-flake").parentElement.className)).toBe("room-snowwin");
    await devSeason(page, "autumn");
    expect(await counts()).toEqual({ flakes: 0, leaves: 9 });
    await devSeason(page, "summer");
    expect(await counts()).toEqual({ flakes: 0, leaves: 0 });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".room-tg:not([hidden]) .room-dp")).animationName)).toBe("room-sway");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".room-tg:not([hidden]) .room-dp")).animationName), "動きを減らす設定では揺らさない").toBe("none");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".room-fx")).display), "雪・落ち葉も止める").toBe("none");
    expect(errors).toEqual([]);
  });

  test("夏は朝・昼・夕を時刻でなめらかに切り替える（7時＝朝・12時＝昼・17時＝夕。6時より前は朝・18時より後は夕のまま）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await devSeason(page, "summer");
    const at = async (hour) => {
      await page.evaluate((h) => { roomState.devHour = h; syncRoomView(); }, hour);
      return page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".room-tg")].map((g) => [g.dataset.t, g.hidden ? 0 : Number(g.style.opacity)])));
    };
    expect(await at(5)).toEqual({ morning: 1, noon: 0, evening: 0 });
    expect(await at(7)).toEqual({ morning: 1, noon: 0, evening: 0 });
    expect(await at(12)).toEqual({ morning: 0, noon: 1, evening: 0 });
    expect(await at(17)).toEqual({ morning: 0, noon: 0, evening: 1 });
    expect(await at(19)).toEqual({ morning: 0, noon: 0, evening: 1 });
    const mid = await at(9.5);
    expect(mid.morning).toBeCloseTo(0.5, 5);
    expect(mid.noon).toBeCloseTo(0.5, 5);
    expect(mid.evening).toBe(0);
    const mid2 = await at(14.5);
    expect(mid2.noon).toBeCloseTo(0.5, 5);
    expect(mid2.evening).toBeCloseTo(0.5, 5);
    // 夕の絵が読み込まれている
    expect(await page.locator('.room-tg[data-t="evening"] .room-st').getAttribute("src")).toBe("assets/home/summer-evening-static.jpg");
    // 夏以外は時刻を変えても昼の1枚
    await devSeason(page, "autumn");
    expect(await at(7)).toEqual({ morning: 0, noon: 1, evening: 0 });
    expect(errors).toEqual([]);
  });

  test("季節は端末の日付で決まる（3〜5月＝春・6〜8月＝夏・9〜11月＝秋・12〜2月＝冬）。?dev なしでは操作が出ず、効かない", async ({ page }) => {
    const errors = await freshPage(page);
    await page.evaluate(() => { localStorage.clear(); });
    await page.goto(PLAIN_URL);
    await page.waitForTimeout(300);
    await interview(page);
    await expect(page.locator(".room-dev")).toHaveCount(0);
    const r = await page.evaluate(() => {
      roomState.devSeason = "winter"; roomState.devHour = 3; // 操作を無理に書き込んでも効かない
      const m = new Date().getMonth() + 1;
      const expected = m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter";
      return { got: roomSeasonNow(), expected, hour: roomHourNow() };
    });
    expect(r.got).toBe(r.expected);
    expect(r.hour).toBeGreaterThanOrEqual(6);
    expect(r.hour).toBeLessThanOrEqual(18);
    // 月ごとの対応そのものを確かめる
    const map = await page.evaluate(() => {
      const real = Date; const out = {};
      for (let m = 1; m <= 12; m++) { globalThis.Date = class extends real { constructor(...a) { if (a.length) super(...a); else super(2026, m - 1, 15, 12, 0); } }; out[m] = roomSeasonNow(); }
      globalThis.Date = real; return out;
    });
    expect(map).toEqual({ 1: "winter", 2: "winter", 3: "spring", 4: "spring", 5: "spring", 6: "summer", 7: "summer", 8: "summer", 9: "autumn", 10: "autumn", 11: "autumn", 12: "winter" });
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });

  test("横の画面：絵が切れない（幅いっぱいに全体が入る）。縮めも伸ばしもしない（比は 1368:677）", async ({ page }) => {
    const errors = await freshPage(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await interview(page);
    const s = await stageInfo(page);
    expect(s.scrollWidth, "横になぞる余地が無い（全体が入っている）").toBeLessThanOrEqual(s.clientWidth);
    expect(s.left).toBeGreaterThanOrEqual(s.vLeft - 0.5);
    expect(s.right).toBeLessThanOrEqual(s.vRight + 0.5);
    expect(Math.abs(s.w / s.h - 1368 / 677)).toBeLessThan(0.01);
    // 幅いっぱい（上限に当たっていない広さ）
    expect(s.w).toBeGreaterThan(s.vW - 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("横の画面で上限（画面の高さの70%・仮）に当たったら、絵は大きくならず左右に余白が出る", async ({ page }) => {
    const errors = await freshPage(page);
    await page.setViewportSize({ width: 2400, height: 600 });
    await interview(page);
    const s = await stageInfo(page);
    expect(s.h).toBeLessThanOrEqual(600 * 0.7 + 1);
    expect(Math.abs(s.w / s.h - 1368 / 677)).toBeLessThan(0.01);
    expect(s.left, "左に余白").toBeGreaterThan(s.vLeft + 20);
    expect(s.right, "右に余白").toBeLessThan(s.vRight - 20);
    expect(s.scrollWidth).toBeLessThanOrEqual(s.clientWidth);
    expect(errors).toEqual([]);
  });

  test("縦の画面（スマホ）：窓の高さは従来どおり（高さの半分・最低280）。絵は高さに合わせ、受付嬢が見える位置から始まる。なぞると動き、端で止まる", async ({ page }) => {
    const errors = await freshPage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.waitForTimeout(300);
    await interview(page);
    const s0 = await stageInfo(page);
    expect(s0.vH, "窓の高さ").toBeCloseTo(422, 0);
    expect(Math.abs(s0.w / s0.h - 1368 / 677)).toBeLessThan(0.01);
    expect(s0.scrollWidth, "なぞって見渡せる").toBeGreaterThan(s0.clientWidth + 100);
    // 最初は受付嬢が見える（仮）
    const ukIn = () => page.evaluate(() => {
      const u = document.querySelector(".room-uk").getBoundingClientRect();
      const v = document.querySelector(".room-scroll").getBoundingClientRect();
      return u.left >= v.left - 1 && u.right <= v.right + 1;
    });
    expect(await ukIn(), "受付嬢が見える位置から始まる").toBe(true);
    expect(s0.scrollLeft).toBeGreaterThan(0);
    // 指でなぞる（CDP の touch イベントで、指の押す→動かす→離すを再現）。★ 指を右へ動かすと絵は右へ流れて見える＝scrollLeft は減る。端で止まり、回り込まない
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    const box = await page.locator(".room-scroll").boundingBox();
    const y = Math.round(box.y + 100);
    const drag = async (dx) => { // dx>0：指を右へ
      const x0 = dx > 0 ? 100 : 300; // ★ 画面の端から始めない（端からの右なぞりはブラウザの「戻る」操作になる）
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
      for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + dx * i / 10, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(500);
    };
    const left = () => page.evaluate(() => document.querySelector(".room-scroll").scrollLeft);
    const start = await left();
    await drag(200);
    const afterRight = await left();
    expect(start - afterRight, "指を右へ動かすと、絵は右へ流れる（scrollLeft は減る）").toBeGreaterThan(120);
    await drag(-200);
    expect(await left() - afterRight, "指を左へ動かすと、絵は左へ流れる").toBeGreaterThan(120);
    // 端で止まる（回り込まない）。★ 端でさらに動かす操作は、試験の環境ではブラウザの「戻る」になってしまう（実機では端からの操作だけ）ので、位置で確かめる
    const max = await page.evaluate(() => { const e = document.querySelector(".room-scroll"); return e.scrollWidth - e.clientWidth; });
    expect(max).toBeGreaterThan(100);
    const ends = await page.evaluate(() => {
      const e = document.querySelector(".room-scroll");
      e.scrollLeft = -500; const lo = e.scrollLeft;
      e.scrollLeft = 99999; const hi = e.scrollLeft;
      return { lo, hi, overscroll: getComputedStyle(e).overscrollBehaviorX };
    });
    expect(ends.lo, "左端で止まる（回り込まない）").toBe(0);
    expect(Math.abs(ends.hi - max), "右端で止まる").toBeLessThan(2);
    expect(ends.overscroll, "端で外へ引っ張らない").toBe("contain");
    expect(errors).toEqual([]);
  });

  test("1秒ごとの再描画でも窓は外されない：なぞった位置・揺れ・受付嬢のフェードがそのまま続く。ホームを離れて戻ると位置が戻り、フェードをやり直す", async ({ page }) => {
    const errors = await freshPage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.waitForTimeout(300);
    await interview(page);
    await page.evaluate(() => { document.querySelector(".room-window").__mark = "same"; });
    await page.waitForTimeout(2200); // フェードが終わるまで
    expect(await page.locator(".room-uk").getAttribute("class")).toContain("fade");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector(".room-uk")).opacity)).toBe("1");
    await page.evaluate(() => { document.querySelector(".room-scroll").scrollLeft = 120; });
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => {
      const a = document.querySelector(".room-tg:not([hidden]) .room-dp").getAnimations()[0];
      return { t: a.currentTime, left: document.querySelector(".room-scroll").scrollLeft };
    });
    // 遠征が出ているあいだは1秒ごとに描き直される。ここでは続けて3回描き直す
    await page.evaluate(() => { render(); render(); render(); });
    await page.waitForTimeout(1300);
    const after = await page.evaluate(() => {
      const a = document.querySelector(".room-tg:not([hidden]) .room-dp").getAnimations()[0];
      return { same: document.querySelector(".room-window").__mark, t: a.currentTime, left: document.querySelector(".room-scroll").scrollLeft, uk: getComputedStyle(document.querySelector(".room-uk")).opacity };
    });
    expect(after.same, "窓の要素が同じまま").toBe("same");
    expect(after.left, "なぞった位置が戻らない").toBe(before.left);
    expect(after.t, "揺れが最初からやり直しになっていない").toBeGreaterThan(before.t);
    expect(after.uk, "フェードをやり直していない").toBe("1");
    // ホームを離れて戻る：なぞった位置は戻り、受付嬢はまたフェードで出る（ホームを開いたときに1回）
    await page.evaluate(() => setRoute("quests"));
    await page.evaluate(() => setRoute("home"));
    const back = await page.evaluate(() => ({ left: document.querySelector(".room-scroll").scrollLeft, cls: document.querySelector(".room-uk").className, uk: getComputedStyle(document.querySelector(".room-uk")).opacity }));
    expect(back.left).toBe(120);
    expect(back.cls).toContain("fade");
    expect(Number(back.uk)).toBeLessThan(1);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector(".room-uk")).opacity)).toBe("1");
    expect(errors).toEqual([]);
  });

  test("遠征が出ているあいだ（毎秒の描き直し）も、窓は同じ要素のまま・押しは落ちない", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.evaluate(() => {
      state.expeditions = [{ id: "exp_room", questId: "quest_tavern_errand", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 1, departTimeOfDay: "昼", departWeather: "晴れ", startTime: Date.now(), durationMs: 3600000 }];
      saveState(); render();
    });
    expect(await page.evaluate(() => hasExpeditions())).toBe(true);
    await page.evaluate(() => { document.querySelector(".room-window").__mark = "same"; });
    await page.waitForTimeout(2300); // 毎秒の描き直しが2回以上
    expect(await page.evaluate(() => document.querySelector(".room-window").__mark)).toBe("same");
    await page.locator('[data-room-object="board"]').click({ force: true });
    expect(await page.evaluate(() => route)).toBe("quests");
    expect(errors).toEqual([]);
  });

  test("物の枠は絵の上の決まった場所に出る（枠を測って、表の％と合う）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const r = await page.evaluate(() => {
      const st = document.querySelector(".room-stage").getBoundingClientRect();
      return ROOM_OBJECTS.map((o) => {
        const el = document.querySelector(`[data-room-object="${o.id}"]`);
        if (!el) return null;
        const fr = (el.querySelector(".room-frame") ?? el).getBoundingClientRect();
        return { id: o.id, x: (fr.left - st.left) / st.width * 100 - o.x, y: (fr.top - st.top) / st.height * 100 - o.y, w: fr.width / st.width * 100 - o.w, h: fr.height / st.height * 100 - o.h };
      }).filter(Boolean);
    });
    expect(r.length).toBeGreaterThan(5);
    for (const d of r) for (const k of ["x", "y", "w", "h"]) expect(Math.abs(d[k]), `${d.id} の ${k}`).toBeLessThan(0.6);
    expect(errors).toEqual([]);
  });
});
