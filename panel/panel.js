/* Ask SHOU panel - plain HTML/CSS/JS, no framework, no chrome.* calls.
 *
 * Drop-in contract for the extension side panel:
 *   window.SHOU.start({
 *     root: document.querySelector('#app'),          // optional
 *     endpoint: 'https://our-app.vercel.app',        // optional, defaults to same origin
 *     getPageUrl: async () => (await chrome.tabs.query({active:true,currentWindow:true}))[0].url
 *   })
 * The panel never stores a transcript. Everything below is memory only.
 */
(function () {
  "use strict";

  var UI = {
    en: {
      title: "Ask SHOU",
      placeholder: "Paste a link or a message here.",
      inputLabel: "Paste a link or a message here.",
      checkLink: "Check this link",
      checkMessage: "Check this message",
      checking: "Checking…",
      speak: "Could not check this.",
      empty: "Paste a link or a message first.",
      offline: "Could not reach the checker. Nothing was checked.",
      blocked: "The checker refused this request.",
      rulesOnly: "Checked by rules only.",
      whatChecked: "What I checked",
      notChecked: "Could not check",
      subject: "Checking",
      footNote: "We check the address and the words. We do not open the page.",
      goBack: "Good. Close that page and do not enter anything.",
      askSomeone:
        "Show this to someone you trust before you open it.",
      openNote: "Opened in a new tab. Only continue if you were expecting it.",
      call997: "If this is a phone, tap the button again to call. On a computer, dial 997.",
      callBank: "Call the number on the back of your bank card.",
      clicked:
        "If you clicked, do not type anything. Close the page, then call your bank.",
      tryAgain: "Try again",
      retried: "Trying again.",
      close: "Close",
    },
    ms: {
      title: "Tanya SHOU",
      placeholder: "Tampal pautan atau mesej di sini.",
      inputLabel: "Tampal pautan atau mesej di sini.",
      checkLink: "Semak pautan ini",
      checkMessage: "Semak mesej ini",
      checking: "Menyemak…",
      speak: "Tidak dapat menyemak ini.",
      empty: "Tampal pautan atau mesej dahulu.",
      offline: "Tidak dapat hubungi pemeriksa. Tiada apa yang disemak.",
      blocked: "Pemeriksa menolak permintaan ini.",
      rulesOnly: "Disemak dengan peraturan sahaja.",
      whatChecked: "Apa yang disemak",
      notChecked: "Tidak dapat disemak",
      subject: "Menyemak",
      footNote: "Kami semak alamat dan perkataan. Kami tidak buka halaman itu.",
      goBack: "Bagus. Tutup halaman itu dan jangan masukkan apa-apa.",
      askSomeone: "Tunjukkan ini kepada orang yang anda percaya sebelum membukanya.",
      openNote: "Dibuka dalam tab baru. Teruskan hanya jika anda memang menunggunya.",
      call997: "Jika ini telefon, tekan butang sekali lagi untuk membuat panggilan. Di komputer, dail 997.",
      callBank: "Hubungi nombor di belakang kad bank anda.",
      clicked: "Jika anda sudah klik, jangan taip apa-apa. Tutup halaman itu, kemudian hubungi bank anda.",
      tryAgain: "Cuba lagi",
      retried: "Cuba lagi.",
      close: "Tutup",
    },
  };

  var state = {
    locale: "en",
    endpoint: "",
    getPageUrl: null,
    busy: false,
    lastPayload: null,
    sessionId: makeId(),
  };

  var el = {};

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function t(key) {
    return UI[state.locale][key];
  }

  function node(tag, className, text) {
    var item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined && text !== null) item.textContent = String(text);
    return item;
  }

  function urlFor(path) {
    if (!state.endpoint) return path;
    var base = state.endpoint.replace(/\/+$/, "");
    if (base.indexOf("/api/agent/chat") > -1) return base;
    return base + path;
  }

  function looksLikeUrl(text) {
    var value = text.trim();
    if (!value) return false;
    if (/^https?:\/\/\S+$/i.test(value)) return true;
    return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/\S*)?$/i.test(value);
  }

  function refreshChrome() {
    document.documentElement.lang = state.locale === "ms" ? "ms" : "en";
    el.title.textContent = t("title");
    el.input.placeholder = t("placeholder");
    el.input.setAttribute("aria-label", t("inputLabel"));
    el.foot.textContent = t("footNote");
    el.page.textContent = state.locale === "ms" ? "Guna halaman ini" : "Use this page";
    updateSend();
    Array.prototype.forEach.call(document.querySelectorAll(".lang-btn"), function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-lang") === state.locale ? "true" : "false");
    });
  }

  function updateSend() {
    var text = el.input.value.trim();
    el.send.textContent = text && !looksLikeUrl(text) ? t("checkMessage") : t("checkLink");
    el.send.disabled = state.busy;
    el.input.disabled = state.busy;
  }

  function setLocale(locale) {
    if (locale !== "en" && locale !== "ms") return;
    state.locale = locale;
    refreshChrome();
  }

  function newTurn(userText) {
    var turn = node("div", "turn");
    if (userText) turn.appendChild(node("div", "bubble", userText));
    el.log.appendChild(turn);
    el.log.scrollTop = el.log.scrollHeight;
    return turn;
  }

  function renderChecking(turn) {
    var box = node("div", "checking");
    box.appendChild(node("span", "dot"));
    box.appendChild(node("span", null, t("checking")));
    box.setAttribute("role", "status");
    turn.appendChild(box);
    return box;
  }

  function tierClass(tier) {
    if (tier === "HIGH") return "high";
    if (tier === "MEDIUM") return "medium";
    if (tier === "LOW") return "low";
    return "not-checked";
  }

  function renderVerdict(turn, data) {
    var verdict = data.verdict;
    var card = node("section", "card " + tierClass(verdict.tier));
    card.setAttribute("aria-label", verdict.label);

    var head = node("h2", null, verdict.label);
    card.appendChild(head);
    if (verdict.summary) card.appendChild(node("p", "summary", verdict.summary));

    if (verdict.basis === "rules_only" && verdict.tier !== "NOT_CHECKED") {
      card.appendChild(node("p", "basis", t("rulesOnly")));
    }

    if (verdict.subject && verdict.subject.value) {
      card.appendChild(node("p", "subject", t("subject") + ": " + verdict.subject.value));
    }

    if (verdict.reasons && verdict.reasons.length > 0) {
      var list = node("ul", "reasons");
      verdict.reasons.forEach(function (reason) {
        list.appendChild(node("li", null, reason.text));
      });
      card.appendChild(list);
    }

    var detail = document.createElement("details");
    detail.appendChild(node("summary", null, t("whatChecked")));
    var checklist = node("ul", "checklist");
    (verdict.checked || []).forEach(function (id) {
      checklist.appendChild(node("li", "yes", prettyId(id)));
    });
    (verdict.notChecked || []).forEach(function (entry) {
      checklist.appendChild(
        node("li", "no", prettyId(entry.id) + " — " + (entry.why || "")),
      );
    });
    detail.appendChild(checklist);
    card.appendChild(detail);

    var actions = node("div", "actions");
    (verdict.actions || []).forEach(function (action) {
      var button = node("button", "primary", action.label);
      button.type = "button";
      button.addEventListener("click", function () {
        handleAction(action, card, data);
      });
      actions.appendChild(button);
      if (action.caption) actions.appendChild(node("p", "caption", action.caption));
    });
    card.appendChild(actions);

    if (verdict.quickReplies && verdict.quickReplies.length > 0) {
      var chips = node("div", "chips");
      verdict.quickReplies.forEach(function (reply) {
        var chip = node("button", "chip", reply.label);
        chip.type = "button";
        chip.addEventListener("click", function () {
          handleQuickReply(reply, card, detail, data);
        });
        chips.appendChild(chip);
      });
      card.appendChild(chips);
    }

    turn.appendChild(card);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function prettyId(id) {
    var text = String(id).replace(/_/g, " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function note(card, text) {
    var existing = card.querySelector(".note");
    if (existing) existing.remove();
    card.appendChild(node("p", "note", text));
    el.log.scrollTop = el.log.scrollHeight;
  }

  function handleAction(action, card, data) {
    if (action.id === "go_back" || action.id === "check_another") {
      note(card, t("goBack"));
      if (action.id === "check_another") reset();
      return;
    }
    if (action.id === "open_link") {
      var host = (data.verdict.subject && data.verdict.subject.value || "").split("/")[0];
      if (host) window.open("https://" + host, "_blank", "noopener,noreferrer");
      note(card, t("openNote"));
      return;
    }
    if (action.id === "call_997") {
      window.location.href = "tel:997";
      note(card, t("call997"));
      return;
    }
    if (action.id === "call_bank") {
      note(card, t("callBank"));
      return;
    }
    if (action.id === "ask_someone") {
      note(card, t("askSomeone"));
      return;
    }
    if (action.id === "check_again" && state.lastPayload) {
      submit(state.lastPayload.text, state.lastPayload.followUp);
    }
  }

  function handleQuickReply(reply, card, detail, data) {
    if (reply.id === "why" || reply.id === "what_checked") {
      detail.open = true;
      return;
    }
    if (reply.id === "clicked") {
      note(card, t("clicked"));
      return;
    }
    if (reply.id === "another") {
      reset();
      return;
    }
    if (reply.id === "already_paid" && state.lastPayload) {
      submit(state.lastPayload.text, "already_paid");
    }
  }

  function reset() {
    el.input.value = "";
    el.input.focus();
    updateSend();
  }

  function renderLocalNotChecked(turn, message) {
    var card = node("section", "card not-checked");
    card.appendChild(node("h2", null, t("speak")));
    card.appendChild(node("p", "summary", message));
    var actions = node("div", "actions");
    var button = node("button", "primary", UI[state.locale].tryAgain || "Try again");
    button.type = "button";
    button.addEventListener("click", function () {
      if (state.lastPayload) submit(state.lastPayload.text, state.lastPayload.followUp);
    });
    actions.appendChild(button);
    card.appendChild(actions);
    turn.appendChild(card);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function submit(text, followUp) {
    var value = String(text || "").trim();
    if (!value || state.busy) {
      if (!value) note(el.log, t("empty"));
      return;
    }
    state.busy = true;
    updateSend();
    state.lastPayload = { text: value, followUp: followUp || null };

    var turn = newTurn(value);
    var checking = renderChecking(turn);

    var pageUrl = null;
    try {
      pageUrl = state.getPageUrl ? state.getPageUrl() : null;
    } catch (error) {
      pageUrl = null;
    }
    if (pageUrl && typeof pageUrl.then === "function") {
      pageUrl = pageUrl.catch(function () {
        return null;
      });
    }

    Promise.resolve(pageUrl)
      .then(function (resolved) {
        var payload = {
          sessionId: state.sessionId,
          text: value,
          locale: state.locale,
          policyId: "shou-v1",
          surface: "standalone",
          clientVersion: "0.1.0",
        };
        if (typeof resolved === "string" && /^https?:\/\//i.test(resolved)) {
          payload.pageUrl = resolved;
        }
        if (followUp) payload.followUp = followUp;

        var controller = new AbortController();
        var timer = setTimeout(function () {
          controller.abort();
        }, 13000);

        return fetch(urlFor("/api/agent/chat"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }).finally(function () {
          clearTimeout(timer);
        });
      })
      .then(function (response) {
        if (!response.ok) {
          return response.json().then(
            function (body) {
              throw new Error((body && body.error && body.error.code) || "HTTP_" + response.status);
            },
            function () {
              throw new Error("HTTP_" + response.status);
            },
          );
        }
        return response.json();
      })
      .then(function (data) {
        checking.remove();
        renderVerdict(turn, data);
      })
      .catch(function (error) {
        checking.remove();
        var code = error && error.message ? error.message : "";
        var message = t("offline");
        if (code === "NO_INPUT" || code === "BAD_REQUEST") message = t("empty");
        if (code === "ORIGIN_DENIED") message = t("blocked");
        if (code === "RATE_LIMITED") message = t("blocked");
        renderLocalNotChecked(turn, message);
      })
      .then(function () {
        state.busy = false;
        updateSend();
      });
  }

  function start(options) {
    var config = window.SHOU_CONFIG || {};
    state.endpoint = (options && options.endpoint) || config.endpoint || "";
    state.getPageUrl = (options && options.getPageUrl) || config.getPageUrl || null;

    el.log = document.querySelector("#log");
    el.form = document.querySelector("#form");
    el.input = document.querySelector("#input");
    el.send = document.querySelector("#send");
    el.page = document.querySelector("#page");
    el.title = document.querySelector("#title");
    el.foot = document.querySelector("#foot-note");

    if (state.getPageUrl) {
      el.page.hidden = false;
      el.page.addEventListener("click", function () {
        try {
          var value = state.getPageUrl();
          Promise.resolve(value)
            .then(function (url) {
              if (typeof url === "string" && /^https?:\/\//i.test(url)) {
                submit(url);
              } else {
                note(el.log, t("empty"));
              }
            })
            .catch(function () {
              note(el.log, t("empty"));
            });
        } catch (error) {
          note(el.log, t("empty"));
        }
      });
    }

    el.form.addEventListener("submit", function (event) {
      event.preventDefault();
      submit(el.input.value);
    });
    el.input.addEventListener("input", updateSend);
    el.input.addEventListener("keydown", function (event) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        submit(el.input.value);
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll(".lang-btn"), function (button) {
      button.addEventListener("click", function () {
        setLocale(button.getAttribute("data-lang"));
      });
    });

    refreshChrome();
    el.input.focus();
  }

  window.SHOU = { start: start };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      start();
    });
  } else {
    start();
  }
})();
