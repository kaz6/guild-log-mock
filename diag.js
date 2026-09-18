// 診断モード（2026-09-18・EX-129）。実機でしか出ない例外を、その場で画面に出すためのもの。
//
// ★ URL に `?diag=1` が無いときは**何もしない**。読み込まれても素通りするので、
//   通常の配信（https://kaz6.github.io/guild-log-mock/）の見え方は1ピクセルも変わらない。
// ★ このファイルはゲームの状態を**読むだけ**で、一切書き換えない。
// ⚠️ 原因が分かったら消すこと（恒久で残すかは別の裁定。EX-129 の案C）。
(function () {
  if (!/(^|[?&])diag=1($|&)/.test(location.search)) return;

  var MAX = 5;                 // 画面に出す件数（同じ例外が毎秒出るので、件数だけ数えて本文は最新のもの）
  var seen = {};               // 例外の署名 → 回数
  var order = [];              // 署名の並び（出た順）
  var box = null;

  function ensureBox() {
    if (box) return box;
    box = document.createElement("div");
    box.setAttribute("id", "diagBox");
    box.style.cssText = [
      "position:fixed", "left:0", "right:0", "top:0", "z-index:99999",
      "max-height:60vh", "overflow:auto",
      "background:#3a0d0d", "color:#ffe9e9",
      "font:12px/1.5 monospace", "padding:10px 12px",
      "white-space:pre-wrap", "word-break:break-all",
      "border-bottom:2px solid #ff6b6b"
    ].join(";");
    (document.body || document.documentElement).appendChild(box);
    return box;
  }

  // 例外が起きた時点のゲームの状態。★ 読めなければ黙って諦める（診断で落ちては本末転倒）。
  function snapshot() {
    try {
      // ⚠️ `state` は `let` 宣言なので `window.state` では引けない（裸の識別子で読む）。
      var s = state;
      if (!s) return "state: 未定義";
      return [
        "遠征: " + (s.expedition ? s.expedition.questId : "なし"),
        "報告書: " + ((s.reports && s.reports.length) || 0) + "件",
        "暦: " + ((s.worldState && s.worldState.daysPassed) != null ? s.worldState.daysPassed : "?") + "日",
        "倍率: " + (typeof getDemoSpeed === "function" ? getDemoSpeed() : "?")
      ].join(" / ");
    } catch (e) { return "state: 読めず（" + e.message + "）"; }
  }

  function record(title, message, where, stack) {
    var key = title + "|" + message + "|" + where;
    if (!seen[key]) { seen[key] = 0; order.push(key); }
    seen[key] += 1;
    var lines = [];
    lines.push("診断モード（?diag=1）。この赤い帯は診断のときだけ出ます。");
    lines.push("画面ごとスクリーンショットを撮って送ってください。");
    lines.push("");
    lines.push("■ " + title + "（" + seen[key] + "回目）");
    lines.push(message || "(メッセージなし)");
    if (where) lines.push("場所: " + where);
    lines.push("状態: " + snapshot());
    if (stack) {
      lines.push("--- スタック ---");
      lines.push(String(stack).split("\n").slice(0, 8).join("\n"));
    }
    if (order.length > 1) {
      lines.push("");
      lines.push("■ これまでに出た例外 " + order.length + "種");
      order.slice(0, MAX).forEach(function (k) {
        lines.push("  " + seen[k] + "回  " + k.split("|").slice(0, 2).join(" / "));
      });
    }
    ensureBox().textContent = lines.join("\n");
  }

  window.addEventListener("error", function (ev) {
    // ★ スクリプトの読み込み失敗（配信の取りこぼし）もここに来る。本文とは別物なので分けて出す。
    if (ev.target && ev.target !== window && ev.target.src) {
      record("スクリプトが読み込めていない", String(ev.target.src), "", "");
      return;
    }
    var where = ev.filename ? (ev.filename.split("/").pop() + ":" + ev.lineno + ":" + ev.colno) : "";
    record("例外", ev.message, where, ev.error && ev.error.stack);
  }, true); // ★ capture で拾う（読み込み失敗のイベントは bubble しない）

  // ★ 例外にならない異常も拾う。EX-097 の「依頼が引けない遠征を畳む」は console.warn だけを出して
  //   静かに終わるので、これが無いと**画面にも帯にも何も出ない**まま遠征が消える。
  ["warn", "error"].forEach(function (level) {
    var orig = console[level];
    console[level] = function () {
      try {
        var text = Array.prototype.map.call(arguments, function (a) {
          return (a && a.stack) ? a.stack : String(a);
        }).join(" ");
        record("console." + level, text, "", "");
      } catch (e) { /* 診断で落ちない */ }
      return orig.apply(console, arguments);
    };
  });

  window.addEventListener("unhandledrejection", function (ev) {
    var r = ev.reason;
    record("未処理の reject", (r && r.message) || String(r), "", r && r.stack);
  });
})();
