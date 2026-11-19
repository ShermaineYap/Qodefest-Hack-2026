/*
 * Lantern Assistant chat panel. Plain JS, no framework, no CDN, no chrome.* calls.
 * Embed:  <div id="assistant"></div>
 *         <script src="panel.js"></script>
 *         <script>Lantern.start({ endpoint: "https://<host>/api/agent/chat", getPageUrl: async () => null })</script>
 * In the extension, pass getPageUrl = async () => (await chrome.tabs.query({active:true,currentWindow:true}))[0]?.url
 * Everything is rendered with textContent: model output is never inserted as HTML.
 */
(function () {
  "use strict";

  var UI = {
    en: {
      title: "Lantern Assistant",
      sub: "Paste a link or a message. I will check it for scam signs.",
      placeholder: "Paste a link or message…",
      send: "Check",
      checking: "Checking…",
      starters: ["Is this link real?", "Someone asked me for money", "Is this message a scam?"],
      checked: "What I checked",
      notChecked: "What I could not check",
      call: "Call",
      tryAgainHelp: "Please try again in a moment.",
      why: "Why?",
      clicked: "What if I already clicked?",
      another: "Check another",
      clickedAnswer: [
        "Do not type any password, OTP or card number on that page.",
        "If you already did, call your bank's number on the back of your card now.",
        "If money left your account, call 997 (National Scam Response Centre) straight away.",
      ],
      lang: "BM",
    },
    ms: {
      title: "Pembantu Lantern",
      sub: "Tampal pautan atau mesej. Saya akan semak tanda penipuan.",
      placeholder: "Tampal pautan atau mesej…",
      send: "Semak",
      checking: "Sedang menyemak…",
      starters: ["Pautan ini betul ke?", "Ada orang minta duit", "Mesej ini penipuan ke?"],
      checked: "Apa yang saya semak",
      notChecked: "Apa yang saya tidak dapat semak",
      call: "Hubungi",
      tryAgainHelp: "Sila cuba lagi sebentar lagi.",
      why: "Kenapa?",
      clicked: "Kalau saya dah klik?",
      another: "Semak lain",
      clickedAnswer: [
        "Jangan taip kata laluan, OTP atau nombor kad di halaman itu.",
        "Jika sudah, hubungi nombor bank di belakang kad anda sekarang.",
        "Jika wang sudah keluar, hubungi 997 (Pusat Respons Scam Kebangsaan) segera.",
      ],
      lang: "EN",
    },
  };

  var ICON = { HIGH: "🔴", MEDIUM: "🟡", LOW: "🟢", NOT_CHECKED: "⚠️" };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function start(opts) {
    var root = document.getElementById((opts && opts.mount) || "assistant");
    if (!root) throw new Error("Lantern Assistant: mount element not found");
    var endpoint = (opts && opts.endpoint) || "/api/agent/chat";
    var getPageUrl = (opts && opts.getPageUrl) || function () { return Promise.resolve(null); };
    var lang = (opts && opts.lang) || "en";
    var last = null; // last verdict, kept in memory only
    var lastInput = "";
    var busy = false;

    root.textContent = "";
    root.classList.add("shou");

    var head = el("div", "shou-head");
    var brand = el("div", "shou-brand");
    brand.appendChild(el("span", "shou-mark", "🏮"));
    var titleEl = el("span", "shou-title");
    brand.appendChild(titleEl);
    var langBtn = el("button", "shou-lang");
    langBtn.type = "button";
    head.appendChild(brand);
    head.appendChild(langBtn);

    var log = el("div", "shou-log");
    log.setAttribute("aria-live", "polite");
    var chips = el("div", "shou-chips");
    var form = el("form", "shou-form");
    var input = el("textarea", "shou-input");
    input.rows = 2;
    var sendBtn = el("button", "shou-send");
    sendBtn.type = "submit";
    form.appendChild(input);
    form.appendChild(sendBtn);

    root.appendChild(head);
    root.appendChild(log);
    root.appendChild(chips);
    root.appendChild(form);

    function L() { return UI[lang]; }

    function paintStatic() {
      titleEl.textContent = L().title;
      langBtn.textContent = L().lang;
      input.placeholder = L().placeholder;
      sendBtn.textContent = busy ? L().checking : L().send;
    }

    function setChips(list) {
      chips.textContent = "";
      list.forEach(function (label) {
        var b = el("button", "shou-chip", label);
        b.type = "button";
        b.onclick = function () { onQuick(label); };
        chips.appendChild(b);
      });
    }

    function scroll() { log.scrollTop = log.scrollHeight; }

    function addUser(text) {
      var m = el("div", "shou-msg shou-user", text);
      log.appendChild(m);
      scroll();
    }

    function addBot(lines) {
      var m = el("div", "shou-msg shou-bot");
      lines.forEach(function (l) { m.appendChild(el("p", null, l)); });
      log.appendChild(m);
      scroll();
      return m;
    }

    function addVerdict(res) {
      var v = res.verdict;
      var card = el("div", "shou-msg shou-bot shou-card shou-" + v.tier);
      card.appendChild(el("div", "shou-verdict", ICON[v.tier] + " " + v.title));
      if (v.bullets.length) {
        var ul = el("ul", "shou-bullets");
        v.bullets.forEach(function (b) { ul.appendChild(el("li", null, b)); });
        card.appendChild(ul);
      }
      if (v.checked.length) card.appendChild(el("div", "shou-meta", L().checked + ": " + v.checked.join(", ") + "."));
      if (v.notChecked.length) card.appendChild(el("div", "shou-meta", L().notChecked + ": " + v.notChecked.join(", ") + "."));
      if (v.contact) card.appendChild(el("div", "shou-contact", "📞 " + v.contact.label + ": " + v.contact.phone));

      var act = el("button", "shou-action shou-action-" + v.action.kind, v.action.label);
      act.type = "button";
      act.onclick = function () { onAction(v); };
      card.appendChild(act);

      var trace = el("div", "shou-trace",
        res.toolCalls.map(function (t) { return t.name + (t.ok ? "" : " ✗"); }).join(" → ") +
        (res.model && res.model.used ? " · " + res.model.name : " · rules only") + " · " + res.ms + " ms");
      card.appendChild(trace);
      log.appendChild(card);
      scroll();
      setChips(v.quickReplies);
    }

    function onAction(v) {
      if (v.action.kind === "call_997" && v.contact) { window.location.href = "tel:" + v.contact.phone.replace(/[^0-9+]/g, ""); return; }
      if (v.action.kind === "try_again") { if (lastInput) ask(lastInput); return; }
      if (v.action.kind === "go_back") { addBot([lang === "ms" ? "Bagus. Tutup tab itu dan jangan masukkan apa-apa butiran." : "Good. Close that tab and do not enter any details."]); return; }
      if (v.action.kind === "ask_trusted") { addBot([lang === "ms" ? "Tunjukkan pautan ini kepada anak atau orang yang anda percaya sebelum membukanya." : "Show this to your child or someone you trust before you open it."]); return; }
      if (v.action.kind === "open") { addBot([lang === "ms" ? "Anda boleh buka, tetapi berhenti jika ia minta kata laluan atau wang." : "You can open it, but stop if it asks for a password or money."]); }
    }

    function onQuick(label) {
      var u = UI[lang];
      if (label === u.why && last) {
        addUser(label);
        addBot(last.verdict.bullets.length ? last.verdict.bullets : [last.verdict.title]);
        return;
      }
      if (label === u.clicked) { addUser(label); addBot(u.clickedAnswer); setChips([u.another]); return; }
      if (label === u.another) { input.value = ""; input.focus(); setChips(u.starters); return; }
      if (u.starters.indexOf(label) >= 0) { input.focus(); input.placeholder = L().placeholder; return; }
      ask(label);
    }

    function ask(text) {
      if (busy || !text.trim()) return;
      busy = true; lastInput = text; paintStatic(); sendBtn.disabled = true;
      addUser(text);
      var pending = addBot([L().checking]);
      pending.classList.add("shou-pending");
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 13000);
      Promise.resolve(getPageUrl())
        .catch(function () { return null; })
        .then(function (pageUrl) {
          return fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, pageUrl: pageUrl || undefined, lang: lang }),
            signal: ctrl.signal,
          });
        })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (res) { pending.remove(); last = res; addVerdict(res); })
        .catch(function () {
          // Fail closed: never green when we could not check.
          pending.remove();
          var res = {
            verdict: { tier: "NOT_CHECKED", title: lang === "ms" ? "Saya tidak dapat semak ini." : "I could not check this.",
              bullets: [L().tryAgainHelp], checked: [], notChecked: [], contact: null,
              action: { kind: "try_again", label: lang === "ms" ? "Cuba lagi" : "Try again" }, quickReplies: [L().another] },
            toolCalls: [], model: { used: false, name: null }, ms: 0,
          };
          last = res; addVerdict(res);
        })
        .finally(function () { clearTimeout(timer); busy = false; sendBtn.disabled = false; paintStatic(); input.value = ""; });
    }

    form.onsubmit = function (e) { e.preventDefault(); ask(input.value); };
    input.onkeydown = function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input.value); } };
    langBtn.onclick = function () { lang = lang === "en" ? "ms" : "en"; paintStatic(); setChips(L().starters); };

    paintStatic();
    addBot([L().sub]);
    setChips(L().starters);

    return { ask: ask, setLang: function (l) { lang = l === "ms" ? "ms" : "en"; paintStatic(); setChips(L().starters); } };
  }

  window.Lantern = { start: start };
})();
