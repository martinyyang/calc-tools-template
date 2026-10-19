/**
 * Calc Tools analytics helper.
 * Scripts are injected only when IDs are set at build time.
 * Events: page_view (via gtag config), tool_submit, tool_result,
 * checkout_start + purchase (default OFF).
 */
(function () {
  var cfg = window.SITE_CONFIG || {};

  function allowed(name) {
    if (name === "checkout_start" || name === "purchase") {
      return !!cfg.enableCheckoutEvents;
    }
    return true;
  }

  function track(name, params) {
    if (!allowed(name)) return;
    params = params || {};
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params);
    }
    if (typeof window.plausible === "function") {
      window.plausible(name, { props: params });
    }
    if (window.umami && typeof window.umami.track === "function") {
      window.umami.track(name, params);
    }
  }

  window.CalcToolsAnalytics = { track: track };
})();
