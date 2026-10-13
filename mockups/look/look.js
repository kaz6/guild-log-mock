// 見た目の見本（EX-152）で3案が共通に使う動き。★ 見本は本体から切り離してある：
//   app.js を読まない／localStorage を使わない／データは sample.js（本物の出力の写し）を読むだけ。
(function () {
  "use strict";
  var S = window.LOOK_SAMPLE;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function todayLabel() {
    var d = new Date();
    return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  }
  function stampDate(ms) {
    var d = new Date(ms);
    return (d.getMonth() + 1) + "/" + d.getDate();
  }

  // 計器にするのは、今の画面にもう出ている値だけ（★ 性格値・親愛・未読件数は計器にしない）
  function gauges() {
    var atGuild = S.adventurers.filter(function (a) { return a.status === "待機中"; }).length;
    return [
      { key: "money", label: "所持金", value: S.money, unit: "", max: Math.max(300, S.money), text: String(S.money) },
      { key: "stock", label: "棚", value: S.stockOwned, max: S.stockLimit, text: S.stockOwned + "／" + S.stockLimit },
      { key: "guild", label: "在席", value: atGuild, max: S.adventurers.length, text: atGuild + "／" + S.adventurers.length }
    ];
  }

  // ── 一行ずつ出す文字 ──
  // ★ 読み飛ばせる（画面のどこを押しても全部出る）。既読（読了ハンコ済み）の報告書は最初から全部出す。
  var timer = null;
  function playLines(container, lines, instant, onDone) {
    clearTimeout(timer);
    container.innerHTML = "";
    var els = lines.map(function (l) {
      var p = document.createElement("p");
      p.className = "log-line" + (l.kind ? " log-" + l.kind : "");
      p.textContent = l.text;
      container.appendChild(p);
      return p;
    });
    if (instant || reduceMotion) {
      els.forEach(function (p) { p.classList.add("shown"); });
      if (onDone) onDone();
      return function () {};
    }
    var i = 0, ci = 0, done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      els.forEach(function (p, k) { p.textContent = lines[k].text; p.classList.add("shown"); });
      if (onDone) onDone();
    }
    function step() {
      if (done) return;
      if (i >= els.length) { finish(); return; }
      var p = els[i], full = lines[i].text;
      if (ci === 0) { p.textContent = ""; p.classList.add("shown", "typing"); }
      ci += 2;
      p.textContent = full.slice(0, ci);
      if (ci >= full.length) {
        p.classList.remove("typing");
        i += 1; ci = 0;
        timer = setTimeout(step, 260);
      } else {
        timer = setTimeout(step, 28);
      }
    }
    step();
    return finish;
  }

  window.Look = { S: S, esc: esc, todayLabel: todayLabel, stampDate: stampDate, gauges: gauges, playLines: playLines };

  // ── 画面の切り替え（報告書／拠点）とハンコ ──
  // ★ ハンコはこの画面の中だけで覚える（保存しない）。押すと次に開いたときは即表示になる。
  document.addEventListener("DOMContentLoaded", function () {
    if (typeof window.renderLook !== "function") return;
    var view = { screen: (location.hash === "#base") ? "base" : "report", reportIndex: 0 };
    var skip = function () {};
    function draw() {
      var out = window.renderLook(view);
      document.getElementById("look").innerHTML = out.html;
      document.querySelectorAll("[data-screen]").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-screen") === view.screen);
        b.onclick = function () { view.screen = b.getAttribute("data-screen"); location.hash = view.screen === "base" ? "base" : ""; draw(); };
      });
      document.querySelectorAll("[data-open]").forEach(function (b) {
        b.onclick = function () { view.reportIndex = Number(b.getAttribute("data-open")); view.screen = "report"; location.hash = ""; draw(); };
      });
      var rep = S.reports[view.reportIndex];
      var box = document.getElementById("lines");
      if (box && rep) {
        var stampBtn = document.getElementById("stampBtn");
        skip = playLines(box, rep.logs, !!rep.readStampAt, function () {
          if (stampBtn) stampBtn.disabled = false;
          var hint = document.getElementById("skipHint");
          if (hint) hint.style.visibility = "hidden";
        });
        if (stampBtn) stampBtn.onclick = function (e) {
          e.stopPropagation();
          if (!rep.readStampAt) { rep.readStampAt = Date.now(); draw(); }
        };
      }
    }
    document.addEventListener("click", function (e) {
      if (e.target.closest("button, a")) return;
      skip();
    });
    draw();
  });
})();
