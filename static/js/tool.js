/**
 * Placeholder calculator.
 * Swap this file (and the tool page copy) for the next site's business logic.
 */
(function () {
  var form = document.getElementById("tool-form");
  if (!form) return;

  var valueEl = document.getElementById("tool-value");
  var factorEl = document.getElementById("tool-factor");
  var outEl = document.getElementById("tool-result");
  var lineEl = document.getElementById("tool-result-line");
  var checkoutBtn = document.getElementById("checkout-start");
  var cfg = window.SITE_CONFIG || {};
  var provider = cfg.paymentProvider || (cfg.enableStripe ? "stripe" : "none");
  var paymentsOn = cfg.paymentsEnabled === true || (provider && provider !== "none");

  if (checkoutBtn && paymentsOn) {
    checkoutBtn.hidden = false;
    checkoutBtn.addEventListener("click", function () {
      if (window.CalcToolsAnalytics) {
        window.CalcToolsAnalytics.track("checkout_start", { tool: "placeholder" });
      }
      fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool: "placeholder" }),
      })
        .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
        .then(function (pack) {
          if (pack.data && pack.data.url) {
            window.location.href = pack.data.url;
            return;
          }
          if (lineEl) lineEl.textContent = (pack.data && pack.data.error) || "Payments are off.";
        })
        .catch(function () {
          if (lineEl) lineEl.textContent = "Checkout is unavailable (PAYMENT_PROVIDER is none or Functions are not bound).";
        });
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var value = Number(valueEl && valueEl.value);
    var factor = Number(factorEl && factorEl.value);
    if (window.CalcToolsAnalytics) {
      window.CalcToolsAnalytics.track("tool_submit", { tool: "placeholder" });
    }
    if (!Number.isFinite(value) || !Number.isFinite(factor)) {
      if (outEl) outEl.textContent = "—";
      if (lineEl) lineEl.textContent = "Enter two numbers.";
      return;
    }
    var result = value * factor;
    if (outEl) outEl.textContent = String(result);
    if (lineEl) lineEl.textContent = value + " × " + factor + " = " + result;
    if (window.CalcToolsAnalytics) {
      window.CalcToolsAnalytics.track("tool_result", { tool: "placeholder" });
    }
  });
})();
