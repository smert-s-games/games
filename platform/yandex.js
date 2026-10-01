(function (global) {
  "use strict";

  function languageOf(ysdk) {
    var fromSdk = ysdk && ysdk.environment && ysdk.environment.i18n && ysdk.environment.i18n.lang;
    var raw = String(fromSdk || navigator.language || "ru").toLowerCase().replace("_", "-");
    if (raw.indexOf("ru") === 0) return "ru";
    if (raw.indexOf("en") === 0) return "en";
    return raw.slice(0, 2);
  }

  function callReady(ysdk) {
    try {
      if (ysdk && ysdk.features && ysdk.features.LoadingAPI) ysdk.features.LoadingAPI.ready();
    } catch (err) {
      console.error(err);
    }
  }

  function callGameplay(ysdk, method) {
    try {
      if (ysdk && ysdk.features && ysdk.features.GameplayAPI && ysdk.features.GameplayAPI[method]) {
        ysdk.features.GameplayAPI[method]();
      }
    } catch (err) {
      console.error(err);
    }
  }

  function showFullscreen(ysdk) {
    return new Promise(function (resolve) {
      if (!ysdk || !ysdk.adv || !ysdk.adv.showFullscreenAdv) {
        resolve(false);
        return;
      }
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        resolve(true);
      }
      try {
        ysdk.adv.showFullscreenAdv({
          callbacks: {
            onClose: finish,
            onError: finish
          }
        });
      } catch (err) {
        finish();
      }
    });
  }

  function showRewarded(ysdk) {
    return new Promise(function (resolve) {
      if (!ysdk || !ysdk.adv || !ysdk.adv.showRewardedVideo) {
        resolve(false);
        return;
      }
      var rewarded = false;
      var done = false;
      function finish(value) {
        if (done) return;
        done = true;
        resolve(value);
      }
      try {
        ysdk.adv.showRewardedVideo({
          callbacks: {
            onRewarded: function () { rewarded = true; },
            onClose: function () { finish(rewarded); },
            onError: function () { finish(false); }
          }
        });
      } catch (err) {
        finish(false);
      }
    });
  }

  function createApi(ysdk) {
    var playerPromise = null;

    function player() {
      if (!ysdk || !ysdk.getPlayer) return Promise.resolve(null);
      if (!playerPromise) {
        playerPromise = ysdk.getPlayer().catch(function () { return null; });
      }
      return playerPromise;
    }

    return {
      lang: languageOf(ysdk),
      ready: function () { callReady(ysdk); },
      gameplayStart: function () { callGameplay(ysdk, "start"); },
      gameplayStop: function () { callGameplay(ysdk, "stop"); },
      onPause: function (fn) {
        if (ysdk && ysdk.on) ysdk.on("game_api_pause", fn);
      },
      onResume: function (fn) {
        if (ysdk && ysdk.on) ysdk.on("game_api_resume", fn);
      },
      showInterstitial: function () { return showFullscreen(ysdk); },
      showRewarded: function () { return showRewarded(ysdk); },
      pullSave: function () {
        return player().then(function (p) {
          if (!p || !p.getData) return null;
          return p.getData().then(function (data) {
            return data && data.save ? data.save : null;
          }).catch(function () { return null; });
        });
      },
      pushSave: function (data) {
        return player().then(function (p) {
          if (!p || !p.setData) return;
          return p.setData({ save: data }, true).catch(function () {});
        });
      }
    };
  }

  function init() {
    var start = (typeof YaGames !== "undefined")
      ? YaGames.init().catch(function (err) {
          console.error(err);
          return null;
        })
      : Promise.resolve(null);
    return start.then(createApi);
  }

  global.YandexPlatform = { init: init };
})(window);
