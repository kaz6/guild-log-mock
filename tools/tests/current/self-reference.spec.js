// 自己参照の再発防止（2026-10-21）。
//
// ★ 何を守るか：報告書の1文の中で、同じ冒険者が「する側」と「される側」の両方に入る形
//   （「ミナは不用意に触ろうとして、ミナに止められた」）が1件も出ないこと。
//   原因は役を探す findByTrait が該当者なしのとき先頭の人間を返すこと。ミナ＋ロウのように
//   戦士も斥候もミナになる編成で、止める側と触る側が同じ人になった（DECISION_LOG 2026-10-21）。
// ★ 走査は今回の発見と同じ条件：全依頼 × 編成30 × seed 40。
// ★ 「（鉄鍋に14ダメージ！）」のような数値表記は、主語が別なので対象外にする。
// ★ 壊した版で赤くなることは、検出の関数そのものを既知の悪い文に当てて確かめる（下の1本目）。
//   ＋ GUILD_LOG_DIR に修正前の木を指すと、2本目が赤くなる（手で確かめる用。修正前＝ dfb1afe）。
const { test, expect } = require("@playwright/test");
const { sweep } = require("../../sweep");
const { allParties } = require("../helpers/axes");

// 1文の中で同じ名前が「は／が／も」のあとにもう一度「に／を／へ／から／と」付きで出る形
function selfReference(sentence, names) {
  if (/ダメージ/.test(sentence)) return null;
  for (const n of names) {
    if (new RegExp(`${n}[はがも][^。]{0,60}?${n}(に|を|へ|から|と(?!き))`).test(sentence)) return n;
  }
  return null;
}
const NAMES = ["ミナ", "鉄鍋", "エルネ・シェルカ", "エルネ", "ロウ", "エルシー"];

test("検出の関数が、既知の悪い文を拾い、正しい文は拾わない", () => {
  expect(selfReference("封蝋は古いが、まだ保たれていた。ミナは不用意に触ろうとして、ミナに止められた。", NAMES)).toBe("ミナ");
  expect(selfReference("エルネ・シェルカは不用意に触ろうとして、エルネ・シェルカに止められた。", NAMES)).toBe("エルネ・シェルカ");
  expect(selfReference("封蝋は古いが、まだ保たれていた。ミナは不用意に触ろうとして、ロウに止められた。", NAMES)).toBeNull();
  expect(selfReference("鉄鍋はよろけた拍子に、野盗の一撃をまともに受けた！（鉄鍋に14ダメージ！）", NAMES)).toBeNull();
});

test("全依頼 × 編成30 × seed40 で、同じ人が「する側」と「される側」に入る文が0件", async () => {
  const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
  const rows = await sweep({
    axes: { party: allParties(), seed: seeds },
    lines: true, keepLines: true, quiet: true,
    // ★ probe はページの中で走る（閉包を持てない）ので、検出の式をここにも書く（上の selfReference と同じ）
    probe: (r, ctx) => {
      const names = ["ミナ", "鉄鍋", "エルネ・シェルカ", "エルネ", "ロウ", "エルシー"];
      const hits = [];
      (ctx.lines || []).forEach((t) => {
        t.split(/(?<=。)/).forEach((s) => {
          if (/ダメージ/.test(s)) return;
          names.forEach((n) => {
            if (new RegExp(n + "[はがも][^。]{0,60}?" + n + "(に|を|へ|から|と(?!き))").test(s)) hits.push(s);
          });
        });
      });
      return hits.length ? { hits } : null;
    }
  });
  const failed = rows.filter((r) => r.error);
  expect(failed.map((r) => `${r.quest}/${r.seed}: ${r.error}`), "生成に失敗した組がある").toEqual([]);
  const found = [...new Set(rows.flatMap((r) => r.hits || []))];
  expect(found, "同じ人が主語と相手の両方に入っている文がある").toEqual([]);
});
