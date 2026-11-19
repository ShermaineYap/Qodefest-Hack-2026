// Boot file kept separate so the extension can replace it without touching panel.js
// (Manifest V3 forbids inline scripts in extension pages).
// In the extension, set ENDPOINT to the deployed URL and pass a chrome.tabs-based getPageUrl.
(function () {
  var ENDPOINT = window.LANTERN_ENDPOINT || "/api/agent/chat";
  var getPageUrl = function () {
    if (window.chrome && chrome.tabs && chrome.tabs.query) {
      return chrome.tabs.query({ active: true, currentWindow: true }).then(function (t) { return t[0] && t[0].url; });
    }
    return Promise.resolve(null);
  };
  window.LANTERN = Lantern.start({ endpoint: ENDPOINT, getPageUrl: getPageUrl });
})();
