(function (global) {
  "use strict";

  function createGame(content, saved) {
    var items = content.items || [];
    var levels = content.levels || [];
    var state = {
      levelIndex: saved && saved.level ? saved.level : 0,
      score: 0,
      best: saved && saved.best ? saved.best : 0,
      grid: [],
      cols: 4,
      rows: 4,
      movesLeft: 0,
      goalTier: 2,
      phase: "menu",
      loseReason: null,
      continued: false,
      spawnTable: [1],
      spawnCount: 1
    };

    function levelDef(index) {
      if (!levels.length) {
        return { cols: 4, rows: 4, goalTier: 2, moves: 20, fill: 0.45, spawn: [1] };
      }
      if (index < levels.length) return levels[index];
      var last = levels[levels.length - 1];
      var extra = index - levels.length + 1;
      return {
        cols: last.cols,
        rows: last.rows,
        goalTier: last.goalTier,
        moves: Math.max(24, last.moves - extra * 2),
        fill: last.fill,
        spawn: last.spawn || content.spawn,
        spawnCount: last.spawnCount || content.spawnCount,
        seed: last.seed
      };
    }

    function emptyGrid(cols, rows) {
      var grid = [];
      for (var r = 0; r < rows; r++) {
        var row = [];
        for (var c = 0; c < cols; c++) row.push(0);
        grid.push(row);
      }
      return grid;
    }

    state.grid = emptyGrid(state.cols, state.rows);

    function cells() {
      var list = [];
      for (var r = 0; r < state.rows; r++) {
        for (var c = 0; c < state.cols; c++) {
          list.push({ c: c, r: r, tier: state.grid[r][c] });
        }
      }
      return list;
    }

    function emptyCells() {
      return cells().filter(function (cell) { return cell.tier === 0; });
    }

    function inGrid(pos) {
      return !!pos && pos.c >= 0 && pos.r >= 0 && pos.c < state.cols && pos.r < state.rows;
    }

    function tierAt(pos) {
      if (!inGrid(pos)) return 0;
      return state.grid[pos.r][pos.c];
    }

    function clampTier(tier) {
      if (tier < 1) return 1;
      if (tier >= items.length) return items.length;
      return tier;
    }

    function pickTier(table, random) {
      var source = table && table.length ? table : [1];
      var index = Math.floor(random() * source.length);
      if (index < 0) index = 0;
      if (index >= source.length) index = source.length - 1;
      return clampTier(source[index]);
    }

    function canMerge(from, to) {
      if (!inGrid(from) || !inGrid(to)) return false;
      if (from.c === to.c && from.r === to.r) return false;
      var tier = state.grid[from.r][from.c];
      if (tier <= 0 || tier !== state.grid[to.r][to.c]) return false;
      if (tier >= items.length) return false;
      return true;
    }

    function findMoves() {
      var buckets = {};
      var list = cells();
      for (var i = 0; i < list.length; i++) {
        var cell = list[i];
        if (cell.tier <= 0 || cell.tier >= items.length) continue;
        if (!buckets[cell.tier]) buckets[cell.tier] = [];
        buckets[cell.tier].push(cell);
      }
      var moves = [];
      for (var key in buckets) {
        if (buckets[key].length >= 2) moves.push([buckets[key][0], buckets[key][1]]);
      }
      return moves;
    }

    function place(spot, tier) {
      state.grid[spot.r][spot.c] = tier;
      return tier >= state.goalTier;
    }

    function spawnOne(random) {
      var spots = emptyCells();
      if (!spots.length) return null;
      var index = Math.floor(random() * spots.length) % spots.length;
      var spot = spots[index];
      var tier = pickTier(state.spawnTable, random);
      var reached = place(spot, tier);
      return { c: spot.c, r: spot.r, tier: tier, reached: reached };
    }

    function ensureMove(random) {
      if (findMoves().length) return;
      var spots = emptyCells();
      if (spots.length >= 2) {
        place(spots[0], 1);
        place(spots[1], 1);
        return;
      }
      var all = cells();
      if (all.length < 2) return;
      state.grid[all[0].r][all[0].c] = 1;
      state.grid[all[1].r][all[1].c] = 1;
    }

    function addScore(tier) {
      var item = items[tier - 1];
      var gained = item && item.score ? item.score : tier * 2;
      state.score += gained;
      if (state.score > state.best) state.best = state.score;
      return gained;
    }

    function startLevel(index, random, options) {
      random = random || Math.random;
      options = options || {};
      var def = levelDef(index);
      state.levelIndex = index;
      state.cols = def.cols;
      state.rows = def.rows;
      state.goalTier = def.goalTier;
      state.movesLeft = def.moves;
      state.grid = emptyGrid(def.cols, def.rows);
      state.spawnTable = (def.spawn || content.spawn || [1]).slice();
      state.spawnCount = def.spawnCount || content.spawnCount || 1;
      state.phase = "play";
      state.loseReason = null;
      state.continued = false;
      if (!options.keepScore) state.score = 0;

      var fill = def.fill == null ? 0.5 : def.fill;
      var count = Math.floor(def.cols * def.rows * fill);
      var seed = def.seed || state.spawnTable;
      for (var i = 0; i < count; i++) {
        var spots = emptyCells();
        if (!spots.length) break;
        var spot = spots[Math.floor(random() * spots.length) % spots.length];
        place(spot, pickTier(seed, random));
      }
      var placed = cells();
      for (var n = 0; n < placed.length; n++) {
        if (placed[n].tier >= state.goalTier) state.grid[placed[n].r][placed[n].c] = 1;
      }
      ensureMove(random);
      return state;
    }

    function finishIfNeeded(reached) {
      if (reached || cellReachesGoal()) return "win";
      if (state.movesLeft <= 0) {
        state.loseReason = "moves";
        return "lose";
      }
      if (!findMoves().length) {
        state.loseReason = "stuck";
        return "lose";
      }
      return "play";
    }

    function cellReachesGoal() {
      var list = cells();
      for (var i = 0; i < list.length; i++) {
        if (list[i].tier >= state.goalTier) return true;
      }
      return false;
    }

    function merge(from, to, random) {
      random = random || Math.random;
      if (state.phase !== "play") return { ok: false, reason: "phase" };
      if (!canMerge(from, to)) return { ok: false, reason: "pair" };
      var tier = state.grid[from.r][from.c];
      var next = tier + 1;
      state.grid[from.r][from.c] = 0;
      state.grid[to.r][to.c] = next;
      state.movesLeft -= 1;
      var gained = addScore(next);
      var spawned = [];
      var reached = next >= state.goalTier;
      for (var i = 0; i < state.spawnCount; i++) {
        var spawnedCell = spawnOne(random);
        if (!spawnedCell) break;
        spawned.push(spawnedCell);
        if (spawnedCell.reached) reached = true;
      }
      var result = finishIfNeeded(reached);
      state.phase = result;
      return {
        ok: true,
        next: next,
        gained: gained,
        spawned: spawned,
        result: result,
        from: { c: from.c, r: from.r },
        to: { c: to.c, r: to.r }
      };
    }

    function grantContinue() {
      state.movesLeft += 10;
      state.continued = true;
      state.loseReason = null;
      if (!findMoves().length) {
        var filled = cells().filter(function (cell) { return cell.tier > 0; });
        filled.sort(function (a, b) { return b.tier - a.tier; });
        for (var i = 0; i < filled.length && i < 2; i++) {
          state.grid[filled[i].r][filled[i].c] = 1;
        }
        ensureMove(Math.random);
      }
      state.phase = "play";
    }

    return {
      state: state,
      items: items,
      startLevel: startLevel,
      merge: merge,
      canMerge: canMerge,
      findMoves: findMoves,
      grantContinue: grantContinue,
      tierAt: tierAt,
      levelDef: levelDef,
      cells: cells
    };
  }

  global.MergeGame = { createGame: createGame };
})(window);
