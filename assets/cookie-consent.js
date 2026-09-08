/* ────────────────────────────────────────────────────────────
   FWKV · Cookie consent logic (shared, loaded on every page)

   Behaviour
   ─────────
   * The first time you visit, a slim banner appears at the bottom
     asking whether you agree to cookies. No cookie is set until you
     answer.
   * "Yes"      → stores fwkv_cookie_consent=yes   (1 year)
   * "Fuck no"  → stores fwkv_cookie_consent=no    (1 year), so we
                  stop asking and nothing else gets stored.
   * Your answer is kept in localStorage AND in a first-party cookie
     (localStorage works even if third-party cookies are blocked).
   * If an answer already exists the banner never appears again.
   ──────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var STORAGE_KEY = "fwkv_cookie_consent"; // localStorage key + cookie name
  var POLICY_URL = "/legal/cookies/";       // relative to site root
  var LIFETIME_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

  /* Already answered? (yes | no | null) */
  function getChoice() {
    var v = null;
    try { v = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    if (v === "yes" || v === "no") return v;

    try {
      var m = document.cookie.match(
        new RegExp("(?:^|; )" + STORAGE_KEY.replace(/([.*+?^=!:${}()|[\]/\\])/g, "\\$1") + "=([^;]*)")
      );
      if (m) {
        var cv = decodeURIComponent(m[1]);
        if (cv === "yes" || cv === "no") return cv;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function remember(choice) {
    try { localStorage.setItem(STORAGE_KEY, choice); } catch (e) { /* ignore */ }
    try {
      var d = new Date();
      d.setTime(d.getTime() + LIFETIME_MS);
      document.cookie =
        STORAGE_KEY + "=" + encodeURIComponent(choice) +
        "; expires=" + d.toUTCString() + "; path=/; SameSite=Lax";
    } catch (e) { /* ignore */ }
  }

  function dismiss(banner) {
    banner.classList.remove("is-open");
    banner.setAttribute("aria-hidden", "true");
    setTimeout(function () {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    }, 260);
  }

  function buildBanner() {
    var banner = document.createElement("div");
    banner.id = "fwkv-cookie-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookie consent");
    banner.setAttribute("aria-hidden", "false");

    banner.innerHTML =
      '<p class="fwkv-cookie-text">We use <strong>one cookie</strong> — it only remembers your answer below and is stored <strong>locally in your browser</strong> (we have no server to collect it). No tracking, no ads, no analytics. Do you agree?</p>' +
      '<a class="fwkv-cookie-link" href="' + POLICY_URL + '">Cookie Policy</a>' +
      '<div class="fwkv-cookie-actions">' +
        '<button type="button" class="fwkv-cookie-btn yes" data-choice="yes">Yes</button>' +
        '<button type="button" class="fwkv-cookie-btn no" data-choice="no">Fuck no</button>' +
      '</div>';

    document.body.appendChild(banner);

    banner.querySelectorAll(".fwkv-cookie-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        remember(btn.getAttribute("data-choice") === "no" ? "no" : "yes");
        dismiss(banner);
      });
    });

    requestAnimationFrame(function () {
      banner.classList.add("is-open");
    });
  }

  function init() {
    if (getChoice()) return; // already answered → never show again
    buildBanner();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
