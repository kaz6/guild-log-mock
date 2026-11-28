// ホームの部屋の「季節 × 時刻（12通り）」を1枚の PNG に撮る道具（2026-11-28・P-022）。
//
//   使い方：node tools/room-sheet.js <出力先.png>
//   ★ 出力はリポジトリに残さない（scratchpad など作業場の外に置く）。ホームの絵・パーツ・影を変えた PR は、これで撮った1枚を PR に付ける。
//
//   ★ 撮るだけ：?dev=1 のホームで「12通りを見る」を押し、出てきた一覧（app.js の openRoomSheet）の12枚を撮る。
//     描き方はアプリ側の1つだけ（ここに絵を組み直す処理は持たない）。各マスの下の文字（春・朝 など）は一覧の側が持っている。
//   ★ 外部依存（playwright）があるので tools/。Chromium の場所は環境で変わる：
//     PLAYWRIGHT_MODULE（playwright のパス）／PLAYWRIGHT_CHROMIUM（ブラウザの実行ファイル）で上書きできる。
//   ★ reducedMotion は使わない（雪と落ち葉の層が隠れて、見たい組み合わせが写らなくなる）。

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const VIEWPORT = { width: 1440, height: 1500 }; // 12枚が1画面に収まる高さ（重ね窓は画面に固定されるため）

function requirePlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node22/lib/node_modules/playwright"].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* 次を試す */ }
  }
  throw new Error(
    "playwright が見つかりません。PLAYWRIGHT_MODULE に playwright のパスを入れてください。\n" +
    `試した場所: ${candidates.join(" / ")}`
  );
}

function findBrowser() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    for (const dir of fs.readdirSync(root).filter((d) => d.startsWith("chromium")).sort().reverse()) {
      for (const rel of ["chrome-linux64/chrome", "chrome-linux/chrome", "chrome-win/chrome.exe", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
        const p = path.join(root, dir, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (e) { /* 既定の解決に任せる */ }
  return undefined; // playwright 自身に解決させる
}

async function main() {
  const out = process.argv[2];
  if (!out || out.startsWith("-")) {
    console.error("使い方: node tools/room-sheet.js <出力先.png>");
    process.exit(2);
  }
  const { chromium } = requirePlaywright();
  const browser = await chromium.launch({ executablePath: findBrowser() });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
    const errors = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push("console.error: " + m.text()); });
    await page.goto(`file://${REPO}/index.html?dev=1`);
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* 私用モード等 */ } });
    await page.reload();
    await page.waitForTimeout(400);
    // 面接を飛ばしてホームへ（画面を押して進めない。面接の完了の関数を直に呼ぶ）
    await page.evaluate(() => { interviewDraft.name = "カズ"; interviewComplete(); });
    await page.locator("[data-room-dev-sheet]").click();
    const grid = page.locator(".room-sheet-grid");
    await grid.waitFor();
    // 絵の読み込みを待つ（★ src の付いた img だけ。重みが0の層の img には src が無い）
    await page.waitForFunction(() => [...document.querySelectorAll(".room-sheet img[src]")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
    await page.waitForTimeout(600); // 層の切り替えの0.4秒（transition）が終わるのを待つ
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    await grid.screenshot({ path: out });
    if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
    else console.log(`撮りました: ${out}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
