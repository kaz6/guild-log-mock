// 会話の文から「話し手つきの文の一覧」を書き出す（口調の検査 tools/voice-check の入力 (a)。2026-10-30・EX-168【3】）。
//
// ★ なぜブラウザで回すか：面接の台本は描画の中（renderInterview）に書かれていて、Node 単体では読めない（EX-160 の未達）。
//   会話の窓はすべて speechWindow(id, 段落) を通るので、そこを素通しで包んで、渡された段落を全部写し取る（表示は変えない）。
// ★ 話し手の決め方（データで分かるものだけ）：
//   - 行頭の「名前:」（面接の扉の音のあと。台本の書式）→ その名前。同じ段落の続く行も同じ話し手。名乗る前の表示（男・女性 など）は下の表で本人へ寄せる
//   - それ以外 → 窓のカードの見出し（h3）。受付嬢のカードは「受付嬢」、固有依頼の連鎖は本人（連鎖の id から）
//   - ホームのタップの一言（ROOM_REACTIONS）は表から直に読む。エルシーの行は地の文なので「語り」
// ★ 道：面接（記名／無記名 × 志望動機3つ × 名簿を保存／あとで）・序盤の受付嬢の会話2つ・白紙の本・命名の直後の一言・
//   固有依頼の連鎖（文面のある人ぜんぶの相談と感謝）・体験版の終わりの合図（文は表から）・タップの一言。
//   ★ 道を足したら、ここにも足す（漏れは表に合わない文として出ず、黙って抜ける）。
//
// 使い方：node tools/voice-lines.js [出力先.json]   （省略時は標準出力）
//   ★ プレイヤー名は「【主人公】」のまま入れて描く（口調の表で呼び方を見るため）。呼び名は既定のあだ名。source は窓の id とページ。
const fs = require("fs");
const path = require("path");
const http = require("http");

const REPO = path.resolve(__dirname, "..");

function requirePlaywright() {
  for (const c of [process.env.PLAYWRIGHT_MODULE, "playwright", "@playwright/test", "/opt/node22/lib/node_modules/playwright"].filter(Boolean)) {
    try { return require(c); } catch (e) { /* 次を試す */ }
  }
  throw new Error("playwright が見つかりません。PLAYWRIGHT_MODULE に playwright のパスを入れてください。");
}

// 名乗る前の表示 → 本人（面接の台本の書式。app.js の renderInterview の注記どおり）
const LABEL_TO_SPEAKER = { "男": "鉄鍋", "ガッド": "鉄鍋", "女性": "ミナ", "女性2": "エルネ", "男2": "ロウ", "犬": "エルシー" };

async function collect() {
  const { chromium } = requirePlaywright();
  // ★ file:// は localStorage を全部で共有するので、使い捨ての HTTP で開く（走っているテストの保存を踏まない）
  const server = http.createServer((req, res) => {
    fs.readFile(path.join(REPO, decodeURIComponent(req.url.split("?")[0])), (e, b) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200); res.end(b);
    });
  });
  await new Promise((ok) => server.listen(0, ok));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForTimeout(800);
    return await page.evaluate((LABEL_TO_SPEAKER) => {
      const PROTAGONIST = "【主人公】";
      const out = [];
      const seen = new Set();
      const strip = (html) => html.replace(/<[^>]+>/g, "");
      // 窓のカードの見出し（描画のあとで決まるので、写し取りは描画のあとに読む）
      let pending = [];
      const orig = speechWindow;
      // eslint-disable-next-line no-global-assign
      speechWindow = function (id, paragraphs, ...rest) { pending.push({ id, paragraphs }); return orig.call(this, id, paragraphs, ...rest); };
      const flush = (fallbackSpeaker) => {
        pending.forEach(({ id, paragraphs }) => {
          const el = document.querySelector(`[data-window="${id}"]`);
          const h3 = el?.closest(".card")?.querySelector("h3")?.innerText?.trim();
          const bond = id.match(/^bond_(bond_[a-z]+)_/);
          const card = bond ? getDisplayName(getAdventurer(bondChainEntries().find((e) => e.id === bond[1]).adventurerId)) : (h3 || fallbackSpeaker);
          paragraphs.forEach((p, pi) => {
            let carried = null; // ★ 同じ段落の中では、直前の「名前:」の話し手を引き継ぐ（台本の書式）
            p.forEach((raw) => {
            const line = strip(raw);
            const m = line.match(/^([^:：]{1,4})[:：](.*)$/);
            if (m) carried = LABEL_TO_SPEAKER[m[1]] ?? m[1];
            const speaker = carried ?? card;
            const text = m ? m[2] : line;
            const key = `${speaker}\u0000${text}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ speaker, text, source: `${id}#${pi + 1}` });
            });
          });
        });
        pending = [];
      };
      // ── 面接（記名／無記名 × 志望動機3つ × 名簿を保存／あとで）──
      for (const named of [true, false]) for (let motive = 0; motive < 3; motive++) for (const memoSaved of [true, false]) {
        interviewDraft = { name: named ? PROTAGONIST : INTERVIEW_UNNAMED, unnamed: !named, motive, memoSaved };
        for (let step = 0; step <= 13; step++) { interviewStep = step; renderInterview(); flush("受付嬢"); }
      }
      // ── ホームに出る会話（状態を作って描く）──
      state.player = { name: PROTAGONIST, personality: null, personalityLabel: null, personalityTags: [], interviewDone: true, appointedAt: Date.now(), motive: "money" };
      const home = () => { setRoute("home"); flush("受付嬢"); };
      state.receptionTalks = { sixOpen: { at: 1, read: false } }; home();
      state.receptionTalks = { sixOpen: { at: 1, read: true }, firstSix: { at: 1, read: false } }; home();
      state.receptionTalks = { sixOpen: { at: 1, read: true }, firstSix: { at: 1, read: true } };
      state.ecologyBook = { at: 1, read: false }; home(); state.ecologyBook = { at: 1, read: true };
      // 固有依頼の連鎖：文面のある人の相談と感謝
      const entries = bondChainEntries().filter((e) => e.consult);
      entries.forEach((entry, i) => {
        state.bondChain = { started: true };
        entries.slice(0, i).forEach((prev) => { state.bondChain[prev.id] = { consultAt: 1, consultRead: true, thanksAt: 1, thanksRead: true, thanksReadAt: 0 }; });
        state.bondChain[entry.id] = { consultAt: 1 }; home();
        state.bondChain[entry.id] = { consultAt: 1, consultRead: true, thanksAt: 1 }; home();
      });
      // 命名の直後の一言（名前は仮の例）
      firstNameSealParagraphs("ふくみみ").forEach((p, pi) => p.forEach((line) => out.push({ speaker: "受付嬢", text: strip(line), source: `firstNameSeal#${pi + 1}` })));
      // 体験版の終わりの合図（/trial/ でだけ出る。文は表から）
      TRIAL_END_PARAGRAPHS.forEach((p, pi) => p.forEach((line) => out.push({ speaker: "受付嬢", text: strip(line), source: `trialEnd#${pi + 1}` })));
      // タップの一言（受付嬢は台詞、エルシーは地の文）
      ROOM_REACTIONS.receptionist.forEach((line, i) => out.push({ speaker: "受付嬢", text: line, source: `ROOM_REACTIONS.receptionist[${i}]` }));
      ROOM_REACTIONS.elsie.forEach((line, i) => out.push({ speaker: "語り", text: line, source: `ROOM_REACTIONS.elsie[${i}]` }));
      // eslint-disable-next-line no-global-assign
      speechWindow = orig;
      return out;
    }, LABEL_TO_SPEAKER);
  } finally {
    await browser.close();
    server.close();
  }
}

if (require.main === module) {
  collect().then((rows) => {
    const json = JSON.stringify(rows, null, 1);
    if (process.argv[2]) fs.writeFileSync(process.argv[2], json + "\n"); else process.stdout.write(json + "\n");
  }).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { collect };
