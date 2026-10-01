(function (global) {
  "use strict";

  function roundRect(ctx, x, y, w, h, radius) {
    var r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function create(canvas) {
    var ctx = canvas.getContext("2d");
    var cssW = 1;
    var cssH = 1;
    var colors = {
      board: "#f7f3e8",
      cell: "#e7f2df",
      accent: "#2f8a45",
      text: "#1b3324"
    };
    var metrics = null;
    var images = [];
    var dirty = true;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      cssW = Math.max(1, rect.width);
      cssH = Math.max(1, rect.height);
      var dpr = Math.min(2, global.devicePixelRatio || 1);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
    }

    function setImages(list) { images = list || []; }

    function setColors(next) {
      colors.board = next.board || colors.board;
      colors.cell = next.cell || colors.cell;
      colors.accent = next.accent || colors.accent;
      colors.text = next.text || colors.text;
    }

    function layout(cols, rows) {
      var pad = 8;
      var gap = Math.max(4, Math.min(10, cssW * 0.018));
      var availW = cssW - pad * 2;
      var availH = cssH - pad * 2;
      var cell = Math.floor(Math.min(
        (availW - gap * (cols - 1)) / cols,
        (availH - gap * (rows - 1)) / rows
      ));
      if (cell < 8) cell = 8;
      var boardW = cell * cols + gap * (cols - 1);
      var boardH = cell * rows + gap * (rows - 1);
      var panelPad = Math.max(8, Math.round(cell * 0.16));
      var panelW = boardW + panelPad * 2;
      var panelH = boardH + panelPad * 2;
      metrics = {
        cols: cols,
        rows: rows,
        cell: cell,
        gap: gap,
        ox: (cssW - panelW) / 2 + panelPad,
        oy: (cssH - panelH) / 2 + panelPad,
        panelX: (cssW - panelW) / 2,
        panelY: (cssH - panelH) / 2,
        panelW: panelW,
        panelH: panelH
      };
    }

    function cellRect(c, r) {
      return {
        x: metrics.ox + c * (metrics.cell + metrics.gap),
        y: metrics.oy + r * (metrics.cell + metrics.gap),
        s: metrics.cell
      };
    }

    function cellAt(x, y) {
      if (!metrics) return null;
      var step = metrics.cell + metrics.gap;
      var c = Math.floor((x - metrics.ox) / step);
      var r = Math.floor((y - metrics.oy) / step);
      if (c < 0 || r < 0 || c >= metrics.cols || r >= metrics.rows) return null;
      var rect = cellRect(c, r);
      if (x < rect.x || y < rect.y || x > rect.x + rect.s || y > rect.y + rect.s) return null;
      return { c: c, r: r };
    }

    function localPoint(clientX, clientY) {
      var rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function drawItem(tier, x, y, size) {
      var image = images[tier - 1];
      if (image) {
        ctx.drawImage(image, x, y, size, size);
        return;
      }
      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "700 " + Math.round(size * 0.28) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(tier), x + size / 2, y + size / 2);
    }

    function contains(list, c, r) {
      if (!list) return false;
      for (var i = 0; i < list.length; i++) {
        if (list[i].c === c && list[i].r === r) return true;
      }
      return false;
    }

    function draw(state, fx, now) {
      if (!metrics || dirty || metrics.cols !== state.cols || metrics.rows !== state.rows) {
        layout(state.cols, state.rows);
        dirty = false;
      }
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.save();
      roundRect(ctx, metrics.panelX, metrics.panelY, metrics.panelW, metrics.panelH, 22);
      ctx.fillStyle = colors.board;
      ctx.fill();
      ctx.restore();

      var drag = fx && fx.drag;
      var pulse = 0.45 + 0.55 * Math.abs(Math.sin(now / 280));

      for (var r = 0; r < state.rows; r++) {
        for (var c = 0; c < state.cols; c++) {
          var rect = cellRect(c, r);
          roundRect(ctx, rect.x, rect.y, rect.s, rect.s, Math.max(8, rect.s * 0.18));
          ctx.fillStyle = colors.cell;
          ctx.fill();

          var hinted = fx && (contains(fx.hint, c, r) || (fx.selected && fx.selected.c === c && fx.selected.r === r));
          var dropOk = drag && fx.drop && fx.drop.c === c && fx.drop.r === r;
          if (hinted || dropOk) {
            ctx.save();
            ctx.globalAlpha = dropOk ? 1 : pulse;
            ctx.lineWidth = 3;
            ctx.strokeStyle = colors.accent;
            ctx.stroke();
            ctx.restore();
          }

          var tier = state.grid[r] ? state.grid[r][c] : 0;
          var hidden = drag && drag.moved && drag.from.c === c && drag.from.r === r;
          if (tier > 0 && !hidden) {
            var scale = 1;
            var pop = fx && fx.pops && fx.pops[c + "," + r];
            if (pop) {
              var t = Math.min(1, (now - pop) / 180);
              scale = 1 + Math.sin(t * Math.PI) * 0.18;
            }
            var size = rect.s * 0.86 * scale;
            var ix = rect.x + (rect.s - size) / 2;
            var iy = rect.y + (rect.s - size) / 2;
            drawItem(tier, ix, iy, size);
          }
        }
      }

      if (drag && drag.moved) {
        var sizeDrag = metrics.cell * 0.9;
        drawItem(drag.tier, drag.x - sizeDrag / 2, drag.y - sizeDrag / 2, sizeDrag);
      }

      var floats = fx && fx.floats || [];
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 18px sans-serif";
      for (var i = 0; i < floats.length; i++) {
        var item = floats[i];
        var age = (now - item.t0) / 700;
        if (age < 0 || age > 1) continue;
        ctx.globalAlpha = 1 - age;
        ctx.fillStyle = colors.text;
        ctx.fillText("+" + item.text, item.x, item.y - age * 28);
        ctx.globalAlpha = 1;
      }
    }

    function drawIcon(target, tier) {
      var icon = target.getContext("2d");
      var size = target.width;
      icon.clearRect(0, 0, size, size);
      var image = images[tier - 1];
      if (image) icon.drawImage(image, 0, 0, size, size);
    }

    return {
      resize: resize,
      setImages: setImages,
      setColors: setColors,
      cellAt: cellAt,
      localPoint: localPoint,
      draw: draw,
      drawIcon: drawIcon,
      cellCenter: function (c, r) {
        var rect = cellRect(c, r);
        return { x: rect.x + rect.s / 2, y: rect.y + rect.s / 2 };
      }
    };
  }

  global.MergeView = { create: create };
})(window);
