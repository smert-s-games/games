(function () {
  "use strict";

  var field = document.getElementById("field");
  var hud = document.getElementById("hud");
  var hint = document.getElementById("hint");
  var modal = document.getElementById("modal");
  var modalTitle = document.getElementById("modal-title");
  var modalText = document.getElementById("modal-text");
  var modalActions = document.getElementById("modal-actions");
  var chain = document.getElementById("chain");
  var canvas = document.getElementById("board");
  var goalIcon = document.getElementById("goal-icon");
  var btnPause = document.getElementById("btn-pause");

  var platform = null;
  var content = null;
  var texts = null;
  var lang = "ru";
  var game = null;
  var view = null;
  var images = [];
  var selected = null;
  var pointer = null;
  var cursor = { c: 0, r: 0 };
  var floats = [];
  var pops = {};
  var hinted = null;
  var idleSince = 0;
  var muted = false;
  var audio = null;
  var adBusy = false;
  var playing = false;
  var saveTimer = 0;

  function t(key) {
    return texts && texts[key] ? texts[key] : key;
  }

  function itemName(tier) {
    var item = content.items[tier - 1];
    if (!item || !item.name) return String(tier);
    return item.name[lang] || item.name.en || item.name.ru || String(tier);
  }

  function storageKey() {
    return "ygames:" + (window.GAME_ID || "merge");
  }

  function readSave() {
    try {
      return JSON.parse(localStorage.getItem(storageKey()) || "null");
    } catch (err) {
      return null;
    }
  }

  function writeSaveNow() {
    var data = {
      level: game.state.levelIndex,
      best: game.state.best
    };
    if (game.state.phase === "win") data.level = game.state.levelIndex + 1;
    try {
      localStorage.setItem(storageKey(), JSON.stringify(data));
    } catch (err) {}
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (platform) platform.pushSave(data);
    }, 200);
    return data;
  }

  function mergeSave(cloud) {
    var local = readSave() || { level: 0, best: 0 };
    if (!cloud) return local;
    return {
      level: Math.max(local.level || 0, cloud.level || 0),
      best: Math.max(local.best || 0, cloud.best || 0)
    };
  }

  function createAudio() {
    var ctx = null;
    var master = null;
    function ensure() {
      if (!ctx) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        ctx = new Ctx();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.18;
        master.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    return {
      setMuted: function (value) {
        muted = value;
        if (master) master.gain.value = value ? 0 : 0.18;
      },
      unlock: function () { ensure(); },
      tone: function (freq, duration) {
        var context = ensure();
        if (!context || muted || !freq) return;
        var osc = context.createOscillator();
        var gain = context.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.8, context.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        osc.stop(context.currentTime + duration);
      },
      merge: function () { this.tone(523, 0.12); },
      win: function () {
        var self = this;
        [523, 659, 784].forEach(function (freq, index) {
          setTimeout(function () { self.tone(freq, 0.16); }, index * 90);
        });
      },
      fail: function () { this.tone(196, 0.18); }
    };
  }

  function fit() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var w = vw;
    var h = vh;
    if (w / h > 2) w = Math.floor(h * 2);
    if (h / w > 2) h = Math.floor(w * 2);
    field.style.width = w + "px";
    field.style.height = h + "px";
    if (view) view.resize();
  }

  function setChrome(visible) {
    hud.hidden = !visible;
    hint.hidden = !visible;
  }

  function button(label, className, onClick) {
    var el = document.createElement("button");
    el.type = "button";
    el.textContent = label;
    if (className) el.className = className;
    el.addEventListener("click", onClick);
    return el;
  }

  function openModal(title, text, actions, showChain) {
    modalTitle.textContent = title;
    modalText.textContent = text || "";
    modalActions.replaceChildren();
    actions.forEach(function (action) { modalActions.appendChild(action); });
    chain.hidden = !showChain;
    modal.hidden = false;
  }

  function closeModal() { modal.hidden = true; }

  function progressIndex() {
    var saved = readSave();
    if (saved && typeof saved.level === "number") return saved.level;
    return game.state.levelIndex || 0;
  }

  function showMenu() {
    playing = false;
    if (platform) platform.gameplayStop();
    setChrome(false);
    document.documentElement.lang = lang;
    openModal(
      contentTitle(),
      t("how") + " " + t("best") + ": " + game.state.best,
      [button(t("play") + " · " + t("level") + " " + (progressIndex() + 1), "", startFromMenu)],
      true
    );
  }

  function contentTitle() {
    var title = window.GAME_TITLE || {};
    return title[lang] || title.ru || title.en || "Merge";
  }

  function renderHud() {
    document.getElementById("label-level").textContent = t("level");
    document.getElementById("value-level").textContent = String(game.state.levelIndex + 1);
    document.getElementById("label-goal").textContent = t("goal");
    document.getElementById("value-goal").textContent = itemName(game.state.goalTier);
    document.getElementById("label-score").textContent = t("score");
    document.getElementById("value-score").textContent = String(game.state.score);
    document.getElementById("value-moves").textContent = t("moves") + ": " + game.state.movesLeft;
    btnPause.setAttribute("aria-label", t("pause"));
    view.drawIcon(goalIcon, game.state.goalTier);
  }

  function showHint() {
    if (selected) {
      var tier = game.tierAt(selected);
      if (tier > 0 && tier < content.items.length) {
        hint.textContent = t("result") + ": " + itemName(tier + 1);
        return;
      }
    }
    hint.textContent = t("how");
  }

  function showWin() {
    playing = false;
    platform.gameplayStop();
    audio.win();
    writeSaveNow();
    setChrome(true);
    openModal(t("winTitle"), t("winText"), [
      button(t("next"), "", goNext),
      button(t("menu"), "secondary", showMenu)
    ], false);
  }

  function showLose() {
    playing = false;
    platform.gameplayStop();
    audio.fail();
    writeSaveNow();
    var reason = game.state.loseReason === "stuck" ? t("loseStuck") : t("loseMoves");
    var actions = [];
    if (!game.state.continued) {
      actions.push(button(t("continueAd"), "", continueWithAd));
    }
    actions.push(button(t("restart"), "secondary", function () { beginLevel(game.state.levelIndex, true); }));
    actions.push(button(t("menu"), "secondary", showMenu));
    openModal(reason, "", actions, false);
  }

  function showPause(fromPlatform) {
    if (game.state.phase !== "play" && !fromPlatform) return;
    playing = false;
    platform.gameplayStop();
    openModal(t("pause"), "", [
      button(t("resume"), "", function () { resumePlay(); }),
      button(t("menu"), "secondary", showMenu)
    ], false);
  }

  function resumePlay() {
    if (game.state.phase !== "play") return;
    closeModal();
    setChrome(true);
    playing = true;
    platform.gameplayStart();
    idleSince = performance.now();
  }

  function beginLevel(index, keepScore) {
    selected = null;
    pointer = null;
    hinted = null;
    floats = [];
    pops = {};
    game.startLevel(index, Math.random, { keepScore: keepScore });
    if (game.state.best < readBest()) game.state.best = readBest();
    closeModal();
    setChrome(true);
    renderHud();
    showHint();
    playing = true;
    platform.gameplayStart();
    idleSince = performance.now();
    writeSaveNow();
  }

  function readBest() {
    var saved = readSave();
    return saved && saved.best ? saved.best : 0;
  }

  function startFromMenu() {
    var saved = readSave();
    if (saved) {
      game.state.levelIndex = saved.level || 0;
      game.state.best = Math.max(game.state.best, saved.best || 0);
    }
    if (game.state.levelIndex > 0) {
      adBusy = true;
      platform.gameplayStop();
      platform.showInterstitial().then(function () {
        adBusy = false;
        beginLevel(game.state.levelIndex, false);
      });
      return;
    }
    beginLevel(game.state.levelIndex, false);
  }

  function goNext() {
    adBusy = true;
    platform.showInterstitial().then(function () {
      adBusy = false;
      beginLevel(game.state.levelIndex + 1, true);
    });
  }

  function continueWithAd() {
    var action = modalActions.querySelector("button");
    if (action) action.disabled = true;
    adBusy = true;
    platform.showRewarded().then(function (rewarded) {
      adBusy = false;
      if (!rewarded) {
        modalText.textContent = t("adFail");
        if (action) action.disabled = false;
        return;
      }
      game.grantContinue();
      closeModal();
      setChrome(true);
      renderHud();
      playing = true;
      platform.gameplayStart();
      idleSince = performance.now();
    });
  }

  function applyMerge(result, from, to) {
    if (!result.ok) {
      audio.fail();
      return;
    }
    var center = view.cellCenter(to.c, to.r);
    pops[to.c + "," + to.r] = performance.now();
    floats.push({ x: center.x, y: center.y, text: result.gained, t0: performance.now() });
    audio.merge();
    selected = null;
    hinted = null;
    idleSince = performance.now();
    renderHud();
    showHint();
    writeSaveNow();
    if (result.result === "win") showWin();
    else if (result.result === "lose") showLose();
  }

  function tryMerge(from, to) {
    if (!from || !to) return;
    applyMerge(game.merge(from, to, Math.random), from, to);
  }

  function onTap(cell) {
    if (!cell || game.tierAt(cell) <= 0) {
      selected = null;
      showHint();
      return;
    }
    if (selected && game.canMerge(selected, cell)) {
      tryMerge(selected, cell);
      return;
    }
    selected = cell;
    showHint();
  }

  function bindPointer() {
    canvas.addEventListener("pointerdown", function (event) {
      if (!playing || game.state.phase !== "play") return;
      audio.unlock();
      canvas.setPointerCapture(event.pointerId);
      var point = view.localPoint(event.clientX, event.clientY);
      var cell = view.cellAt(point.x, point.y);
      if (!cell || game.tierAt(cell) <= 0) return;
      pointer = {
        id: event.pointerId,
        from: cell,
        tier: game.tierAt(cell),
        x: point.x,
        y: point.y,
        moved: false
      };
    });

    canvas.addEventListener("pointermove", function (event) {
      if (!pointer || event.pointerId !== pointer.id) return;
      var point = view.localPoint(event.clientX, event.clientY);
      if (Math.hypot(point.x - pointer.x, point.y - pointer.y) > 8) pointer.moved = true;
      if (pointer.moved) {
        pointer.x = point.x;
        pointer.y = point.y;
        pointer.drop = view.cellAt(point.x, point.y);
      }
    });

    function release(event) {
      if (!pointer || event.pointerId !== pointer.id) return;
      var current = pointer;
      pointer = null;
      var point = view.localPoint(event.clientX, event.clientY);
      var target = view.cellAt(point.x, point.y);
      if (current.moved) {
        if (target && game.canMerge(current.from, target)) tryMerge(current.from, target);
        else if (target && (target.c !== current.from.c || target.r !== current.from.r)) audio.fail();
        return;
      }
      onTap(current.from);
    }

    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", function () { pointer = null; });
  }

  function bindKeys() {
    window.addEventListener("keydown", function (event) {
      if (!playing || game.state.phase !== "play") return;
      var key = event.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Enter"].indexOf(key) === -1) return;
      event.preventDefault();
      if (key === "ArrowLeft") cursor.c = Math.max(0, cursor.c - 1);
      if (key === "ArrowRight") cursor.c = Math.min(game.state.cols - 1, cursor.c + 1);
      if (key === "ArrowUp") cursor.r = Math.max(0, cursor.r - 1);
      if (key === "ArrowDown") cursor.r = Math.min(game.state.rows - 1, cursor.r + 1);
      if (key === "Enter" || key === " ") onTap({ c: cursor.c, r: cursor.r });
      if (key.indexOf("Arrow") === 0) {
        selected = { c: cursor.c, r: cursor.r };
        showHint();
      }
    });
  }

  function loop(now) {
    try {
      if (view && game && game.state.grid.length) {
        if (playing && now - idleSince > 4000) {
          var moves = game.findMoves();
          hinted = moves.length ? moves[0] : null;
        } else if (playing) {
          hinted = null;
        }
        var drag = null;
        if (pointer && pointer.moved) {
          drag = { from: pointer.from, tier: pointer.tier, x: pointer.x, y: pointer.y, moved: true };
        }
        view.draw(game.state, {
          drag: drag,
          drop: pointer && pointer.drop && game.canMerge(pointer.from, pointer.drop) ? pointer.drop : null,
          selected: selected,
          hint: hinted,
          pops: pops,
          floats: floats
        }, now);
        floats = floats.filter(function (item) { return now - item.t0 < 700; });
      }
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(loop);
  }

  function loadJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error(url);
      return res.json();
    });
  }

  function loadTexts(code) {
    var order = [code, "en", "ru"];
    function next(index) {
      if (index >= order.length) throw new Error("texts");
      return loadJson("theme/texts/" + order[index] + ".json").then(function (data) {
        lang = order[index];
        return data;
      }).catch(function () { return next(index + 1); });
    }
    return next(0);
  }

  function loadImages(count) {
    var jobs = [];
    for (var i = 1; i <= count; i++) {
      jobs.push(loadImage("theme/images/item-" + i + ".png"));
    }
    return Promise.all(jobs);
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error(src)); };
      image.src = src;
    });
  }

  function applyTheme(theme) {
    var root = document.documentElement.style;
    var map = {
      background: "--background",
      board: "--board",
      cell: "--cell",
      accent: "--accent",
      text: "--text",
      hudText: "--hud-text",
      danger: "--danger"
    };
    Object.keys(map).forEach(function (key) {
      if (theme[key]) root.setProperty(map[key], theme[key]);
    });
    view.setColors(theme);
    if (theme.backgroundImage !== false) {
      document.getElementById("app").style.backgroundImage = "url(\"theme/images/bg.png\")";
    }
  }

  function fillChain() {
    chain.replaceChildren();
    images.forEach(function (image) {
      var img = document.createElement("img");
      img.src = image.src;
      img.alt = "";
      chain.appendChild(img);
    });
  }

  function boot() {
    view = MergeView.create(canvas);
    audio = createAudio();
    document.addEventListener("visibilitychange", function () {
      audio.setMuted(document.hidden);
    });
    window.addEventListener("blur", function () { audio.setMuted(true); });
    window.addEventListener("focus", function () {
      if (!document.hidden) audio.setMuted(false);
    });
    document.addEventListener("contextmenu", function (event) { event.preventDefault(); });
    window.addEventListener("resize", fit);
    btnPause.addEventListener("click", function () { showPause(false); });
    bindPointer();
    bindKeys();
    fit();

    YandexPlatform.init().then(function (api) {
      platform = api;
      platform.onPause(function () {
        audio.setMuted(true);
        if (!adBusy && game && game.state.phase === "play") showPause(true);
      });
      platform.onResume(function () {
        if (!document.hidden) audio.setMuted(false);
      });
      return Promise.all([
        loadJson("content/game.json"),
        loadJson("theme/theme.json"),
        loadTexts(platform.lang)
      ]);
    }).then(function (loaded) {
      content = loaded[0];
      texts = loaded[2];
      applyTheme(loaded[1]);
      return loadImages(content.items.length);
    }).then(function (loadedImages) {
      images = loadedImages;
      view.setImages(images);
      fillChain();
      var saved = readSave();
      game = MergeGame.createGame(content, saved);
      fit();
      view.resize();
      showMenu();
      platform.ready();
      platform.pullSave().then(function (cloud) {
        var merged = mergeSave(cloud);
        game.state.levelIndex = merged.level || 0;
        game.state.best = merged.best || 0;
        try { localStorage.setItem(storageKey(), JSON.stringify(merged)); } catch (err) {}
        if (modal && !modal.hidden && !playing) showMenu();
      });
      if (new URLSearchParams(location.search).get("play") === "1") startFromMenu();
      requestAnimationFrame(loop);
    }).catch(function (err) {
      console.error(err);
      modal.hidden = false;
      modalTitle.textContent = "Error";
      modalText.textContent = String(err && err.message ? err.message : err);
    });
  }

  boot();
})();
