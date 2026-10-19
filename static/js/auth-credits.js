/**
 * Auth / credits interface stubs.
 * Enable when next paid tool ships.
 *
 * Do not implement a full account, wallet, or quota system in this template.
 * The next paid tool should replace these no-ops and set ENABLE_AUTH_CREDITS=true.
 */
(function () {
  var cfg = window.SITE_CONFIG || {};
  var enabled = !!cfg.enableAuthCredits;

  window.CalcToolsAuthCredits = {
    enabled: enabled,

    // enable when next paid tool ships
    getSession: function () {
      return Promise.resolve(null);
    },

    // enable when next paid tool ships
    getBalance: function () {
      return Promise.resolve(0);
    },

    // enable when next paid tool ships
    consume: function () {
      return Promise.reject(new Error("auth/credits disabled — enable when next paid tool ships"));
    },
  };
})();
