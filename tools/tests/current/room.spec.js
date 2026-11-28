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

// 2026-11-24 作者・M1 に合わせる（P-012）→ 2026-11-27・P-015 で横長1枚に換算 → 同日・P-017 で、絵に物がある枠だけ絵の物の上に合わせ直した
//   → 2026-11-28・P-018 で、エルシーの場所・ペンをパーツの絵の位置に合わせた。
//   ★ 絵に物が無い（または対象外の）枠は、P-012 の3枚の値（枚の番号・枚の中の ％）を固定の表として持ち、
//     x＝(枚の番号×100＋x)÷3・w＝w÷3（y・h は同じ）に換算した値と、いまの ROOM_OBJECTS が一致することを確かめる（動かしていない証拠）。
const PANEL_TABLE = {
  badge: [0, 8, 80, 20, 10],
  papers: [1, 3, 84, 55, 12], pile: [1, 66, 84, 26, 12],
  grave: [2, 46, 40, 14, 20]
};
// ★ 絵に物がある枠（P-017）。位置は絵全体に対する％。assets/home の土台の絵（季節が違っても物の位置は同じ）の物の上に合わせた値。
//   受付嬢は透明な余白を除いた人の形（絵の人は x59.3〜64.1・y30.9〜43.1）を含む。カウンターは受付嬢の下から、本棚は受付嬢の左まで（受付嬢が手前）。
const PICTURE_TABLE = {
  backyard: [17, 20, 7, 32], book: [14.3, 73.4, 12, 9], board: [38.7, 27, 8.9, 13.5], shelf: [47.7, 25, 10.3, 18.3],
  receptionist: [58, 29.5, 7.5, 13.8], counter: [51.4, 43.3, 21.9, 12.1],
  // ★ P-018：エルシーの場所・ペンはパーツ（ROOM_PARTS）の絵の位置。x＝絵の真ん中−幅/2・y＝絵の下端−高さ・高さ＝幅×縦横比×(1368/677)
  //   寝床（600×437・x73.8・下端70.1・幅9.9）／ペン（300×452・x73.1・下端94.5・幅7）
  elsie: [68.85, 55.53, 9.9, 14.57], pen: [69.6, 73.19, 7, 21.31]
};
// 絵の受付嬢の人の形（絵の上の％。受付嬢の絵の透明度が半分より濃い所の外枠）。真ん中を押すと受付嬢の一言が出る
const RECEPTIONIST_FIGURE = { x: 59.3, y: 30.9, w: 4.8, h: 12.2 };
const ALL_IDS = [...Object.keys(PANEL_TABLE), ...Object.keys(PICTURE_TABLE)].sort();
test.describe("物の置き場所（絵の物に合わせた枠・P-017／ほかは拠点の絵 M1・P-012 を横長1枚に換算・P-015）", () => {
  test("絵に物がある枠は絵の物の上の値。ほかは3枚の値を換算したものと一致する（動いていない）。物の数も同じ", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const objs = await page.evaluate(() => ROOM_OBJECTS.map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, panel: o.panel })));
    expect(objs.map((o) => o.id).sort()).toEqual(ALL_IDS);
    for (const o of objs) {
      expect(o.panel, `${o.id}：枚の番号はもう持たない`).toBeUndefined();
      if (PICTURE_TABLE[o.id]) {
        const [x, y, w, h] = PICTURE_TABLE[o.id];
        expect([o.x, o.y, o.w, o.h], `${o.id}：絵の物に合わせた値`).toEqual([x, y, w, h]);
        continue;
      }
      const [p, x, y, w, h] = PANEL_TABLE[o.id];
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
    expect(ids.slice().sort()).toEqual(ALL_IDS);
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

  // ★ P-017：絵の物の上を押して、その物の働きが起きる（いまは絵の受付嬢を押すと本棚が開く、が一番目立った）。
  //   座標で押す（force の click は要素の真ん中へ送るので、重なりの手前・奥は確かめられない）。
  const pointOf = (page, xPct, yPct) => page.evaluate(([x, y]) => {
    const r = document.querySelector(".room-stage").getBoundingClientRect();
    return { x: r.left + (r.width * x) / 100, y: r.top + (r.height * y) / 100, inView: r.top + (r.height * y) / 100 < window.innerHeight };
  }, [xPct, yPct]);

  test("絵の受付嬢（人の形の真ん中）を押すと受付嬢の一言。本棚の名簿ではない。本棚の真ん中を押すと名簿（P-017）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.waitForTimeout(2200); // 受付嬢のフェードのあと
    const fig = RECEPTIONIST_FIGURE;
    const pr = await pointOf(page, fig.x + fig.w / 2, fig.y + fig.h / 2);
    expect(pr.inView).toBe(true);
    await page.mouse.click(pr.x, pr.y);
    await expect(page.locator(".room-notice")).toHaveText("はい、なんでしょう。");
    expect(await page.evaluate(() => route)).toBe("home");
    // 人の形の四隅の少し内側も受付嬢（本棚にはならない）
    for (const [dx, dy] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) {
      const q = await pointOf(page, fig.x + fig.w * dx, fig.y + fig.h * dy);
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-room-object]")?.dataset.roomObject ?? null, [q.x, q.y]);
      expect(hit, `人の形の内側(${dx},${dy})`).toBe("receptionist");
    }
    // 本棚の真ん中
    const [sx, sy, sw, sh] = PICTURE_TABLE.shelf;
    const ps = await pointOf(page, sx + sw / 2, sy + sh / 2);
    await page.mouse.click(ps.x, ps.y);
    expect(await page.evaluate(() => route)).toBe("adventurers");
    expect(errors).toEqual([]);
  });

  test("掲示板・本の真ん中を押すと、それぞれの画面が開く。触れる物は、枠の真ん中でその物の枠が手前にある（重なりで取られない）（P-017）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.evaluate(() => {
      state.adventurers[0].status = "死亡";
      state.ecologyRecord = { er_t: { id: "er_t", target: "森喰い兎", name: null, nameDraft: "", nameConfirmedAt: null, area: "", category: "", confirmed: [], guess: "", nextCheck: "", legacy: "" } };
      render();
    });
    // 触れる物すべて：枠の真ん中にある一番手前の物は、その物自身
    const wrong = await page.evaluate(() => {
      const r = document.querySelector(".room-stage").getBoundingClientRect();
      const out = [];
      for (const o of ROOM_OBJECTS) {
        if (!o.act || (o.show && !o.show()) || (o.enabled && !o.enabled())) continue;
        const x = r.left + (r.width * (o.x + o.w / 2)) / 100;
        const y = r.top + (r.height * (o.y + o.h / 2)) / 100;
        if (y >= window.innerHeight) continue; // 窓の外（画面の下）は別の確かめ
        const got = document.elementFromPoint(x, y)?.closest("[data-room-object]")?.dataset.roomObject ?? null;
        if (got !== o.id) out.push(`${o.id}：真ん中を押すと ${got}`);
      }
      return out;
    });
    expect(wrong).toEqual([]);
    for (const [id, expected] of [["board", "quests"], ["book", "ecology"]]) {
      const [x, y, w, h] = PICTURE_TABLE[id];
      const p = await pointOf(page, x + w / 2, y + h / 2);
      expect(p.inView, `${id} が画面に入る`).toBe(true);
      await page.mouse.click(p.x, p.y);
      expect(await page.evaluate(() => route), id).toBe(expected);
      await page.evaluate(() => setRoute("home"));
    }
    // 用途の無いカウンターとバックヤードは、押しても何も起きない（枠も反応も無い）
    for (const id of ["counter", "backyard"]) {
      await expect(page.locator(`button[data-room-object="${id}"]`), id).toHaveCount(0);
    }
    expect(errors).toEqual([]);
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

// ── ホームのパーツ（絵に無い物の透明な絵・影はコード）・2026-11-28・P-018 ──────────────────
//   寝床（エルシー）とペン。置き場所は ROOM_PARTS の表の数だけ。背景の層の上・押せる枠の下。季節にかかわらず同じ絵。
//   ★ 影の向き・長さ・濃さ・押せる枠の合わせ方は仮・作者未確認。
test.describe("ホームのパーツ（P-018）", () => {
  const partInfo = (page) => page.evaluate(() => {
    const st = document.querySelector(".room-stage").getBoundingClientRect();
    return ROOM_PARTS.map((p) => {
      const el = document.querySelector(`.room-part[data-part="${p.id}"]`);
      const img = el.querySelector("img");
      const r = img.getBoundingClientRect();
      return { id: p.id, table: { x: p.x, y: p.y, w: p.w }, loaded: [img.complete, img.naturalWidth, img.naturalHeight], src: img.getAttribute("src"),
        cx: ((r.left + r.right) / 2 - st.left) / st.width * 100, bottom: (r.bottom - st.top) / st.height * 100, w: r.width / st.width * 100 };
    });
  });

  test("パーツの層が出る：寝床とペン。絵は読み込めている。表の位置（真ん中・下端・幅）に置かれ、季節が替わっても同じ絵", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await devSeason(page, "summer");
    let parts = await partInfo(page);
    expect(parts.map((p) => p.id)).toEqual(["elsie", "pen"]);
    expect(parts.find((p) => p.id === "elsie").loaded).toEqual([true, 600, 437]);
    expect(parts.find((p) => p.id === "pen").loaded).toEqual([true, 300, 452]);
    for (const p of parts) {
      expect(Math.abs(p.cx - p.table.x), `${p.id} の真ん中`).toBeLessThan(0.3);
      expect(Math.abs(p.bottom - p.table.y), `${p.id} の下端`).toBeLessThan(0.3);
      expect(Math.abs(p.w - p.table.w), `${p.id} の幅`).toBeLessThan(0.3);
    }
    const srcs = parts.map((p) => p.src);
    for (const season of ["spring", "autumn", "winter"]) {
      await devSeason(page, season);
      parts = await partInfo(page);
      expect(parts.map((p) => p.src), season).toEqual(srcs);
      for (const p of parts) expect(p.loaded[0], `${season} ${p.id}`).toBe(true);
    }
    // 重なりの順：背景の層（.room-tg）と受付嬢の上・押せる枠（.room-objects）の下
    const order = await page.evaluate(() => {
      const kids = [...document.querySelector(".room-stage").children].map((c) => c.className.split(" ")[0]);
      return { parts: kids.indexOf("room-parts"), uk: kids.indexOf("room-uk"), tg: kids.lastIndexOf("room-tg"), objects: kids.indexOf("room-objects") };
    });
    expect(order.parts).toBeGreaterThan(order.tg);
    expect(order.parts).toBeGreaterThan(order.uk);
    expect(order.parts).toBeLessThan(order.objects);
    // ?dev なしでも出る（開発用の道具ではない）
    await page.evaluate(() => { localStorage.clear(); });
    await page.goto(PLAIN_URL);
    await page.waitForTimeout(300);
    await interview(page);
    await expect(page.locator(".room-dev")).toHaveCount(0);
    await expect(page.locator(".room-part")).toHaveCount(2);
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });

  test("夕方の色寄せは受付嬢と同じ（パーツの絵にも同じ色寄せがかかる）。昼はかからない", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await devSeason(page, "summer");
    const at = async (hour) => {
      await page.evaluate((h) => { roomState.devHour = h; syncRoomView(); }, hour);
      return page.evaluate(() => ({
        uk: getComputedStyle(document.querySelector(".room-uk")).filter,
        parts: [...document.querySelectorAll(".room-part img")].map((i) => getComputedStyle(i).filter)
      }));
    };
    const evening = await at(17);
    expect(evening.uk).not.toBe("none");
    for (const f of evening.parts) expect(f).toBe(evening.uk);
    const noon = await at(12);
    for (const f of noon.parts) expect(f).toBe(noon.uk);
    expect(noon.parts[0]).not.toBe(evening.parts[0]);
    expect(errors).toEqual([]);
  });

  test("押せる枠：寝床・ペンの枠はパーツの絵の位置の上。絵の真ん中を押すとそれぞれの働き（エルシーの一言・ペンの吹き出し）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const d = await page.evaluate(() => {
      const st = document.querySelector(".room-stage").getBoundingClientRect();
      return ["elsie", "pen"].map((id) => {
        const img = document.querySelector(`.room-part[data-part="${id}"] img`).getBoundingClientRect();
        const fr = document.querySelector(`[data-room-object="${id}"] .room-frame`).getBoundingClientRect();
        const pct = (a, b, k) => (a - b) / (k === "x" ? st.width : st.height) * 100;
        return { id, x: pct(fr.left, img.left, "x"), y: pct(fr.top, img.top, "y"), w: pct(fr.width, 0, "x"), h: pct(fr.height, 0, "y"), iw: pct(img.width, 0, "x"), ih: pct(img.height, 0, "y") };
      });
    });
    for (const r of d) {
      expect(Math.abs(r.x), `${r.id} 枠の左`).toBeLessThan(0.6);
      expect(Math.abs(r.y), `${r.id} 枠の上`).toBeLessThan(0.6);
      expect(Math.abs(r.w - r.iw), `${r.id} 枠の幅`).toBeLessThan(0.6);
      expect(Math.abs(r.h - r.ih), `${r.id} 枠の高さ`).toBeLessThan(0.6);
    }
    // 表の値だけで決まる（roomPartBox は ROOM_PARTS から出る）
    const same = await page.evaluate(() => ["elsie", "pen"].every((id) => {
      const o = ROOM_OBJECTS.find((x) => x.id === id); const b = roomPartBox(id);
      return o.x === b.x && o.y === b.y && o.w === b.w && o.h === b.h;
    }));
    expect(same).toBe(true);
    // 絵の真ん中を押す
    const at = (id) => page.evaluate((i) => { const r = document.querySelector(`.room-part[data-part="${i}"] img`).getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, inView: r.bottom < window.innerHeight }; }, id);
    const e = await at("elsie");
    expect(e.inView).toBe(true);
    await page.mouse.click(e.x, e.y);
    await expect(page.locator(".room-notice")).toHaveText("エルシーは尻尾を振った。");
    const pn = await at("pen");
    if (pn.inView) {
      await page.mouse.click(pn.x, pn.y);
      await expect(page.locator(".room-bubble")).toHaveCount(1);
      expect(await page.evaluate(() => roomMenu)).toBe("pen");
    }
    expect(errors).toEqual([]);
  });

  test("影はコードで描く：?dev=1 の時刻で向き・長さ・濃さが変わる（朝は左へ長く薄く・昼は真下に短く濃く・夕は右へ長く薄く）。冬は弱い", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await devSeason(page, "summer");
    const shadow = async (hour, season) => {
      if (season) await devSeason(page, season);
      await page.evaluate((h) => { roomState.devHour = h; syncRoomView(); }, hour);
      await page.waitForTimeout(50);
      return page.evaluate(() => {
        const stage = document.querySelector(".room-stage");
        const cs = getComputedStyle(stage);
        const part = document.querySelector('.room-part[data-part="elsie"]').getBoundingClientRect();
        const sh = document.querySelector('.room-part[data-part="elsie"] .room-shadow').getBoundingClientRect();
        return { dx: Number(cs.getPropertyValue("--sh-dx")), len: Number(cs.getPropertyValue("--sh-len")), a: Number(cs.getPropertyValue("--sh-a")),
          off: ((sh.left + sh.right) / 2 - (part.left + part.right) / 2) / part.width, wRatio: sh.width / part.width, bg: getComputedStyle(document.querySelector('.room-part[data-part="elsie"] .room-shadow')).backgroundImage };
      });
    };
    const morning = await shadow(7);
    const noon = await shadow(12);
    const evening = await shadow(17);
    expect(noon.dx).toBe(0);
    expect(morning.dx).toBeLessThan(0);
    expect(evening.dx).toBeGreaterThan(0);
    expect(morning.off).toBeLessThan(noon.off - 0.2);
    expect(evening.off).toBeGreaterThan(noon.off + 0.2);
    expect(morning.len).toBeGreaterThan(noon.len);
    expect(evening.len).toBeGreaterThan(noon.len);
    expect(morning.wRatio).toBeGreaterThan(noon.wRatio * 1.5);
    expect(noon.a).toBeGreaterThan(morning.a);
    expect(noon.a).toBeGreaterThan(evening.a);
    expect(noon.bg).toContain("radial-gradient");
    // 冬は弱める
    const winterNoon = await shadow(12, "winter");
    expect(winterNoon.a).toBeLessThan(noon.a);
    expect(winterNoon.a).toBeGreaterThan(0);
    // 影は絵に焼き込まない：パーツの絵そのものは時刻で変わらない
    expect(errors).toEqual([]);
  });

  test("パーツの表の数だけで置き場所が決まる：表の x・y・w を書き換えて窓を作り直すと、絵がその位置へ動く（絵や描画の側に位置を持たない）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.evaluate(() => {
      const p = ROOM_PARTS.find((q) => q.id === "elsie");
      p.x = 40; p.y = 60; p.w = 12;
      roomView = null; roomState.objectsHtml = null; // 窓を作り直す
      render();
    });
    await page.waitForTimeout(200);
    const e = (await partInfo(page)).find((p) => p.id === "elsie");
    expect(Math.abs(e.cx - 40)).toBeLessThan(0.3);
    expect(Math.abs(e.bottom - 60)).toBeLessThan(0.3);
    expect(Math.abs(e.w - 12)).toBeLessThan(0.3);
    // 表の列は全部のパーツで同じ（id・絵・絵の大きさ・位置 x／y・幅 w・影）
    const keys = await page.evaluate(() => [...new Set(ROOM_PARTS.map((p) => Object.keys(p).sort().join()))]);
    expect(keys).toEqual(["ih,img,id,iw,shadow,w,x,y".split(",").sort().join()]);
    expect(errors).toEqual([]);
  });
});

// ── ?dev=1 のパーツ置き直しと、共通の出口「今の値を写す」・2026-11-28・P-019 ──────────────────
//   ?dev=1 のときだけ、ホームに「置き直す」と「今の値を写す」が出る。動かした値は localStorage の DEV_MODE 専用の鍵（ゲームのセーブとは別）。
//   ROOM_PARTS（コードの中の値）は書き換えない。★ 切り替えやボタンの置き場所・刻み（0.5）・書き出す文の形は仮。
test.describe("?dev=1 のパーツ置き直し（P-019）", () => {
  const DEV_KEY = "expeditionGuildLogMockDevParts";
  const partRect = (page, id) => page.evaluate((i) => {
    const r = document.querySelector(`.room-part[data-part="${i}"] img`).getBoundingClientRect();
    const st = document.querySelector(".room-stage").getBoundingClientRect();
    return { cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, stW: st.width, stH: st.height,
      px: ((r.left + r.right) / 2 - st.left) / st.width * 100, pb: (r.bottom - st.top) / st.height * 100, pw: r.width / st.width * 100 };
  }, id);
  const now = (page, id) => page.evaluate((i) => { const p = roomPartNow(ROOM_PARTS.find((q) => q.id === i)); return { x: p.x, y: p.y, w: p.w }; }, id);
  const table = (page, id) => page.evaluate((i) => { const p = ROOM_PARTS.find((q) => q.id === i); return { x: p.x, y: p.y, w: p.w }; }, id);
  const dragMouse = async (page, from, dx, dy) => {
    await page.mouse.move(from.cx, from.cy);
    await page.mouse.down();
    await page.mouse.move(from.cx + dx / 2, from.cy + dy / 2, { steps: 4 });
    await page.mouse.move(from.cx + dx, from.cy + dy, { steps: 4 });
    await page.mouse.up();
  };

  test("?dev なしでは「置き直す」も「今の値を写す」も出ない。localStorage に置いた値も効かない", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const t = await table(page, "elsie");
    await page.evaluate(([k]) => { localStorage.setItem(k, JSON.stringify({ elsie: { x: 20, y: 30, w: 15 } })); }, [DEV_KEY]);
    await page.goto(PLAIN_URL);
    await page.waitForTimeout(400);
    for (const sel of ["[data-room-dev-edit]", "[data-room-dev-copy]", ".room-dev", ".room-dev-out"]) await expect(page.locator(sel), sel).toHaveCount(0);
    const e = await partRect(page, "elsie");
    expect(Math.abs(e.px - t.x), "置いた値は効かない（x）").toBeLessThan(0.3);
    expect(Math.abs(e.pb - t.y), "置いた値は効かない（y）").toBeLessThan(0.3);
    expect(Math.abs(e.pw - t.w), "置いた値は効かない（w）").toBeLessThan(0.3);
    expect(await page.evaluate(() => roomPartNow(ROOM_PARTS[0]) === ROOM_PARTS[0])).toBe(true);
    // ?dev=1 を付けると、置いた値が効く
    await page.goto(PLAIN_URL + "?dev=1");
    await page.waitForTimeout(400);
    const d = await partRect(page, "elsie");
    expect(Math.abs(d.px - 20)).toBeLessThan(0.3);
    expect(Math.abs(d.pw - 15)).toBeLessThan(0.3);
    expect(errors.filter((x) => !/favicon/.test(x))).toEqual([]);
  });

  test("?dev=1：「置き直す」で寝床をマウスで引きずると位置が変わり、出口の文に新しい値が出る。コードの表は変わらず、ゲームのセーブには混ざらない", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await expect(page.locator("[data-room-dev-edit]")).toHaveCount(1);
    await expect(page.locator("[data-room-dev-copy]")).toHaveCount(1);
    const t0 = await table(page, "elsie");
    await page.locator("[data-room-dev-edit]").click();
    await expect(page.locator("[data-room-dev-edit]")).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => document.querySelector(".room-scroll").scrollIntoView({ block: "center" })); // ボタンを押して動いた画面を、窓が見える位置に戻す
    await page.waitForTimeout(200);
    const before = await partRect(page, "elsie");
    await dragMouse(page, before, before.stW * 0.05, -before.stH * 0.03);
    const after = await partRect(page, "elsie");
    expect(after.px - before.px, "右へ 5%").toBeGreaterThan(4.7);
    expect(after.px - before.px).toBeLessThan(5.3);
    expect(after.pb - before.pb, "上へ 3%").toBeLessThan(-2.7);
    expect(after.pb - before.pb).toBeGreaterThan(-3.3);
    const n = await now(page, "elsie");
    expect(n.x * 10 % 1, "0.1 刻み").toBeCloseTo(0, 5);
    // 出口：小数第1位まで・動かしたものに印
    await page.locator("[data-room-dev-copy]").click();
    const text = await page.locator(".room-dev-out").inputValue();
    expect(text).toContain(`{ id: "elsie", x: ${n.x.toFixed(1)}, y: ${n.y.toFixed(1)}, w: ${n.w.toFixed(1)} },  // 動かした`);
    expect(text).toMatch(/\{ id: "pen", x: 73\.1, y: 94\.5, w: 7\.0 \},\n?/);
    expect(text).not.toMatch(/id: "pen".*動かした/);
    await expect(page.locator(".room-dev-copystate")).not.toHaveText("");
    // コードの中の表は変わらない／保存は DEV_MODE 専用の鍵だけ（ゲームのセーブには混ざらない）
    expect(await table(page, "elsie")).toEqual(t0);
    const stored = await page.evaluate((k) => ({ dev: JSON.parse(localStorage.getItem(k)), game: localStorage.getItem(STORAGE_KEY) }), DEV_KEY);
    expect(stored.dev.elsie).toEqual(n);
    expect(stored.game).not.toContain("devParts");
    expect(stored.game).not.toContain(`"${DEV_KEY}"`);
    // リロードしても動かした位置が残る。置き直しの切り替えは入らない
    await page.reload();
    await page.waitForTimeout(400);
    const r = await partRect(page, "elsie");
    expect(Math.abs(r.px - after.px)).toBeLessThan(0.3);
    await expect(page.locator("[data-room-dev-edit]")).toHaveAttribute("aria-pressed", "false");
    // 押せる枠も付いてくる（寝床の枠はパーツの絵の位置の上）
    const fr = await page.evaluate(() => {
      const img = document.querySelector('.room-part[data-part="elsie"] img').getBoundingClientRect();
      const f = document.querySelector('[data-room-object="elsie"] .room-frame').getBoundingClientRect();
      return { dx: f.left - img.left, dy: f.top - img.top, dw: f.width - img.width };
    });
    expect(Math.abs(fr.dx)).toBeLessThan(6);
    expect(Math.abs(fr.dy)).toBeLessThan(6);
    expect(errors.filter((x) => !/favicon/.test(x))).toEqual([]);
  });

  test("「大きく」「小さく」は選んだパーツの幅を変える（足元の真ん中は動かさない）。「元に戻す」でコードの値に戻る", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const t0 = await table(page, "elsie");
    await page.locator("[data-room-dev-edit]").click();
    // 選ぶ前は押せない
    await expect(page.locator('[data-room-dev-size="1"]')).toBeDisabled();
    await page.evaluate(() => document.querySelector(".room-scroll").scrollIntoView({ block: "center" }));
    await page.waitForTimeout(200);
    const c = await partRect(page, "elsie");
    await page.mouse.click(c.cx, c.cy); // 動かさずに押す＝選ぶだけ
    await expect(page.locator('[data-room-dev-size="1"]')).toBeEnabled();
    const base = await now(page, "elsie");
    expect(base).toEqual(t0);
    await page.locator('[data-room-dev-size="1"]').click();
    await page.locator('[data-room-dev-size="1"]').click();
    expect((await now(page, "elsie")).w).toBeCloseTo(t0.w + 1, 5);
    await page.locator('[data-room-dev-size="-1"]').click();
    const w = await now(page, "elsie");
    expect(w.w).toBeCloseTo(t0.w + 0.5, 5);
    expect([w.x, w.y]).toEqual([t0.x, t0.y]);
    const r = await partRect(page, "elsie");
    expect(Math.abs(r.px - t0.x)).toBeLessThan(0.3);
    expect(Math.abs(r.pb - t0.y)).toBeLessThan(0.3);
    expect(Math.abs(r.pw - (t0.w + 0.5))).toBeLessThan(0.3);
    // 元に戻す
    await page.locator("[data-room-dev-reset]").click();
    expect(await now(page, "elsie")).toEqual(t0);
    expect(await page.evaluate((k) => localStorage.getItem(k), DEV_KEY)).toBeNull();
    await page.locator("[data-room-dev-copy]").click();
    expect(await page.locator(".room-dev-out").inputValue()).not.toContain("動かした");
    expect(errors.filter((x) => !/favicon/.test(x))).toEqual([]);
  });

  test("置き直しの間は、押せる枠の働き（吹き出し・画面の移動）が止まる。切り替えを戻すと働く", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.locator("[data-room-dev-edit]").click();
    // 画面の移動：本棚・掲示板を押しても動かない（直接呼んでも）
    for (const id of ["board", "shelf"]) {
      const b = await page.evaluate((i) => { const r = document.querySelector(`[data-room-object="${i}"] .room-frame`).getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; }, id);
      await page.mouse.click(b.x, b.y);
      expect(await page.evaluate(() => route), `${id} を押しても動かない`).toBe("home");
      await page.evaluate((i) => tapRoomObject(i), id);
      expect(await page.evaluate(() => route), `${id} を直接呼んでも動かない`).toBe("home");
    }
    // 吹き出し：受付嬢の一言・書類の吹き出しも出ない
    const u = await page.evaluate(() => { const r = document.querySelector('[data-room-object="receptionist"] .room-frame').getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; });
    await page.mouse.click(u.x, u.y);
    await page.evaluate(() => tapRoomObject("papers"));
    await page.evaluate(() => tapRoomObject("pen"));
    await expect(page.locator(".room-notice")).toBeHidden();
    await expect(page.locator(".room-bubble")).toHaveCount(0);
    // 開いていた吹き出しは、置き直しに入ると閉じる
    await page.locator("[data-room-dev-edit]").click();
    await page.evaluate(() => tapRoomObject("papers"));
    await expect(page.locator(".room-bubble")).toHaveCount(1);
    await page.locator("[data-room-dev-edit]").click();
    await expect(page.locator(".room-bubble")).toHaveCount(0);
    // 切り替えを戻すと、枠は今までどおり働く
    await page.locator("[data-room-dev-edit]").click();
    await page.locator('[data-room-object="board"]').click({ force: true });
    expect(await page.evaluate(() => route)).toBe("quests");
    expect(errors.filter((x) => !/favicon/.test(x))).toEqual([]);
  });

  test("スマホ：パーツの上で始めた指の動きはパーツを動かし、それ以外の所で始めた動きは部屋を見渡す", async ({ page }) => {
    const errors = await freshPage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.waitForTimeout(300);
    await interview(page);
    await page.locator("[data-room-dev-edit]").click();
    await page.evaluate(() => document.querySelector(".room-scroll").scrollIntoView({ block: "center" })); // 窓を画面の真ん中へ（上の固定の目次に隠れない位置）
    await page.waitForTimeout(200);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    const touchDrag = async (x0, y0, dx) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
      for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + dx * i / 10, y: y0 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(500);
    };
    const left = () => page.evaluate(() => document.querySelector(".room-scroll").scrollLeft);
    // ① パーツの上で始める：パーツが動き、部屋は動かない
    const c = await partRect(page, "elsie");
    expect(c.cx, "寝床が画面の中に見える").toBeGreaterThan(20);
    expect(c.cx).toBeLessThan(370);
    const s0 = await left();
    const x0 = (await now(page, "elsie")).x;
    await touchDrag(c.cx, c.cy, -60);
    expect(Math.abs((await left()) - s0), "部屋は動かない").toBeLessThan(2);
    const x1 = (await now(page, "elsie")).x;
    expect(x0 - x1, "パーツは指と同じ向きに動く（左へ）").toBeGreaterThan(3);
    // ② パーツ以外の所で始める：部屋を見渡す（パーツは動かない）。パーツの無い高さ（窓の上のほう）から始める
    const box = await page.locator(".room-scroll").boundingBox();
    const s1 = await left();
    await touchDrag(300, box.y + 150, -150);
    expect(Math.abs((await left()) - s1), "部屋を見渡す").toBeGreaterThan(60);
    expect((await now(page, "elsie")).x).toBe(x1);
    expect(errors.filter((x) => !/favicon/.test(x))).toEqual([]);
  });

  test("出口は1つ：DEV_EXPORTS に1件足すと、同じ「今の値を写す」の文に載る（道具を増やしても出口は増えない）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.evaluate(() => { DEV_EXPORTS.push({ id: "t", title: "試験の道具", text: () => "{ id: \"t\", v: 1.0 }," }); });
    await expect(page.locator("[data-room-dev-copy]")).toHaveCount(1);
    await page.locator("[data-room-dev-copy]").click();
    const text = await page.locator(".room-dev-out").inputValue();
    expect(text).toContain("// パーツの表（ROOM_PARTS）の x・y・w");
    expect(text).toContain("// 試験の道具\n{ id: \"t\", v: 1.0 },");
    expect(errors.filter((x) => !/favicon/.test(x))).toEqual([]);
  });
});

// ── ?dev=1「12通りを見る」・2026-11-28・P-022 ──────────────────────────────────
//   季節4つ × 朝・昼・夕の12枚を一度に並べる。?dev=1 のときだけ。重ね窓は body に付く（#app の外）。
//   ★ 常設の窓の季節・時刻（roomState.devSeason／devHour）には触れない。値・文字・並べ方は仮。
test.describe("?dev=1「12通りを見る」（P-022）", () => {
  const SEASONS = ["spring", "summer", "autumn", "winter"];
  const HOURS = ["7", "12", "17"];
  const minis = (page) => page.evaluate(() => [...document.querySelectorAll(".room-sheet .room-mini")].map((m) => {
    const st = m.querySelector(".room-stage");
    const cs = getComputedStyle(st);
    const vis = (sel) => [...m.querySelectorAll(sel)].filter((n) => !n.closest("[hidden]") && getComputedStyle(n).display !== "none");
    const tgs = vis(".room-tg").map((g) => ({ t: g.dataset.t, op: Number(g.style.opacity), st: g.querySelector(".room-st").getAttribute("src"), dapple: !g.querySelector(".room-sun").hidden }));
    return { season: st.dataset.season, hour: st.dataset.hour, caption: m.querySelector("figcaption").textContent, tgs,
      uk: getComputedStyle(m.querySelector(".room-uk")).opacity, parts: m.querySelectorAll(".room-part").length, objects: m.querySelectorAll(".room-objects, .room-hit").length,
      shDx: cs.getPropertyValue("--sh-dx"), shA: cs.getPropertyValue("--sh-a"), ukf: cs.getPropertyValue("--ukf"),
      leaves: m.querySelectorAll(".room-leaf").length, flakes: m.querySelectorAll(".room-flake").length,
      w: m.getBoundingClientRect().width, h: st.getBoundingClientRect().height, sw: st.getBoundingClientRect().width };
  }));

  test("?dev=1 なしでは「12通りを見る」が出ない。関数を呼んでも開かない", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.goto(PLAIN_URL);
    await page.waitForTimeout(400);
    await expect(page.locator("[data-room-dev-sheet]")).toHaveCount(0);
    await page.evaluate(() => openRoomSheet());
    await expect(page.locator(".room-sheet")).toHaveCount(0);
    expect(errors.filter((x) => !/favicon/.test(x))).toEqual([]);
  });

  test("?dev=1：押すと12枚の窓が出る。季節4つ×朝・昼・夕がすべて違う組で、文字が付く。1秒ごとの再描画でも残る", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await expect(page.locator(".room-sheet")).toHaveCount(0);
    await page.locator("[data-room-dev-sheet]").click();
    await expect(page.locator(".room-sheet .room-mini")).toHaveCount(12);
    await page.waitForTimeout(1500); // ホームは1秒ごとに描き直される（重ね窓は #app の外にあるので残る）
    await expect(page.locator(".room-sheet .room-mini")).toHaveCount(12);
    expect(await page.evaluate(() => document.querySelector(".room-sheet").parentNode === document.body)).toBe(true);
    const m = await minis(page);
    const pairs = m.map((x) => `${x.season}/${x.hour}`);
    expect(new Set(pairs).size, "12枚の（季節, 時刻）がすべて違う").toBe(12);
    expect(pairs).toEqual(SEASONS.flatMap((s) => HOURS.map((h) => `${s}/${h}`)));
    expect(m.map((x) => x.caption)).toEqual(["春・朝", "春・昼", "春・夕", "夏・朝", "夏・昼", "夏・夕", "秋・朝", "秋・昼", "秋・夕", "冬・朝", "冬・昼", "冬・夕"]);
    // 12枚とも：絵が出る・受付嬢が出る・パーツが2つ・押せる枠は無い・窓の中に絵の全体が入る（切れない・伸びない）
    for (const x of m) {
      const id = `${x.season}/${x.hour}`;
      expect(x.tgs.length, id).toBeGreaterThan(0);
      expect(x.tgs.every((g) => g.st), id + " 絵が付く").toBe(true);
      expect(Number(x.uk), id + " 受付嬢").toBe(1);
      expect(x.parts, id + " パーツ").toBe(2);
      expect(x.objects, id + " 押せる枠は無い").toBe(0);
      expect(Math.abs(x.sw / x.h - 1368 / 677), id + " 縦横比").toBeLessThan(0.01);
    }
    expect(errors.filter((x) => !/favicon/.test(x))).toEqual([]);
  });

  test("12枚は季節と時刻のとおりに出る：冬は木漏れ日が無い／夏だけ朝昼夕で絵が変わる／影と受付嬢の色寄せが時刻で変わる／雪は冬・落ち葉は秋", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.locator("[data-room-dev-sheet]").click();
    const m = await minis(page);
    const at = (s, h) => m.find((x) => x.season === s && x.hour === String(h));
    for (const h of HOURS) {
      expect(at("winter", h).tgs.every((g) => g.st.endsWith("winter-orig.jpg") && !g.dapple), "冬は木漏れ日の層が無い").toBe(true);
      for (const s of ["spring", "autumn"]) expect(at(s, h).tgs.every((g) => g.st.endsWith(`${s}-static.jpg`) && g.dapple), s).toBe(true);
    }
    expect(at("summer", 7).tgs.map((g) => g.st.split("/").pop())).toEqual(["summer-morning-static.jpg"]);
    expect(at("summer", 12).tgs.map((g) => g.st.split("/").pop())).toEqual(["summer-static.jpg"]);
    expect(at("summer", 17).tgs.map((g) => g.st.split("/").pop())).toEqual(["summer-evening-static.jpg"]);
    // 影：朝は負・昼は0・夕は正。冬は薄い
    expect(Number(at("spring", 7).shDx)).toBeLessThan(0);
    expect(Number(at("spring", 12).shDx)).toBe(0);
    expect(Number(at("spring", 17).shDx)).toBeGreaterThan(0);
    expect(Number(at("winter", 12).shA)).toBeLessThan(Number(at("spring", 12).shA));
    // 受付嬢の色寄せは夏の朝・夕だけ動く（ほかの季節は昼の1枚のまま）
    expect(at("summer", 7).ukf).not.toBe(at("summer", 12).ukf);
    expect(at("summer", 17).ukf).not.toBe(at("summer", 12).ukf);
    expect(at("autumn", 17).ukf).toBe(at("autumn", 12).ukf);
    // 粒
    expect(at("winter", 12).flakes).toBeGreaterThan(0);
    expect(at("autumn", 12).leaves).toBeGreaterThan(0);
    expect(at("spring", 12).flakes + at("spring", 12).leaves + at("summer", 12).flakes + at("summer", 12).leaves).toBe(0);
    expect(errors.filter((x) => !/favicon/.test(x))).toEqual([]);
  });

  test("開いても閉じても、常設の窓の季節・時刻・絵は変わらない。押せる枠は開いている間は押せない。閉じると元に戻る", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await devSeason(page, "winter");
    await page.evaluate(() => { roomState.devHour = 8; syncRoomView(); });
    const snap = () => page.evaluate(() => {
      const st = document.querySelector(".room-window .room-stage"); // 常設の窓の段（12枚は body の重ね窓の中）
      return { devSeason: roomState.devSeason, devHour: roomState.devHour, season: st.dataset.season, hour: st.dataset.hour, stages: document.querySelectorAll(".room-stage").length,
        srcs: [...st.querySelectorAll("img[src]")].map((i) => i.getAttribute("src")).join("|"), pressed: document.querySelector('[data-room-dev-season="winter"]').getAttribute("aria-pressed") };
    });
    const before = await snap();
    expect(before.stages).toBe(1);
    await page.locator("[data-room-dev-sheet]").click();
    const open = await snap();
    expect(open.stages, "常設の1つと12枚").toBe(13);
    expect({ ...open, stages: 0 }).toEqual({ ...before, stages: 0 });
    // 開いている間は、下の押せる枠（掲示板）を押しても画面は動かない
    const box = await page.locator('[data-room-object="board"]').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect(await page.evaluate(() => route)).toBe("home");
    // 閉じる
    await page.locator("[data-room-sheet-close]").click();
    await expect(page.locator(".room-sheet")).toHaveCount(0);
    expect(await snap()).toEqual(before);
    // もう一度開いても12枚（開いたまま重ねて呼んでも増えない）
    await page.locator("[data-room-dev-sheet]").click();
    await page.evaluate(() => openRoomSheet());
    await expect(page.locator(".room-sheet")).toHaveCount(1);
    await expect(page.locator(".room-sheet .room-mini")).toHaveCount(12);
    await page.locator("[data-room-sheet-close]").click();
    await page.locator('[data-room-object="board"]').click({ force: true });
    expect(await page.evaluate(() => route), "閉じたあとは枠が働く").toBe("quests");
    expect(errors.filter((x) => !/favicon/.test(x))).toEqual([]);
  });
});
