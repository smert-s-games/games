(function (global) {
  "use strict";

  function init() {
    var params = new URLSearchParams(global.location ? global.location.search : "");
    var nav = String((global.navigator && global.navigator.language) || "ru").toLowerCase();
    var lang = nav.indexOf("en") === 0 ? "en" : "ru";
    var listeners = {};
    var store = {};

    return Promise.resolve({
      environment: { i18n: { lang: lang } },
      features: {
        LoadingAPI: {
          ready: function () { console.log("[dev-sdk] LoadingAPI.ready"); }
        },
        GameplayAPI: {
          start: function () { console.log("[dev-sdk] gameplay start"); },
          stop: function () { console.log("[dev-sdk] gameplay stop"); }
        }
      },
      adv: {
        showFullscreenAdv: function (options) {
          console.log("[dev-sdk] interstitial");
          var cb = options && options.callbacks;
          setTimeout(function () { if (cb && cb.onClose) cb.onClose(true); }, 30);
        },
        showRewardedVideo: function (options) {
          console.log("[dev-sdk] rewarded");
          var cb = options && options.callbacks;
          var grant = params.get("devReward") !== "0";
          setTimeout(function () {
            if (grant && cb && cb.onRewarded) cb.onRewarded();
            if (cb && cb.onClose) cb.onClose();
          }, 30);
        }
      },
      on: function (event, fn) {
        (listeners[event] = listeners[event] || []).push(fn);
      },
      off: function (event, fn) {
        var list = listeners[event] || [];
        listeners[event] = list.filter(function (item) { return item !== fn; });
      },
      getPlayer: function () {
        return Promise.resolve({
          getData: function () { return Promise.resolve(store.data || {}); },
          setData: function (data) {
            store.data = data;
            return Promise.resolve();
          }
        });
      }
    });
  }

  global.YaGames = { init: init };
})(window);
