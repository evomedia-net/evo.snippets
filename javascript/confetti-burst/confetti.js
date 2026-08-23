/*
 * confetti-burst - Evomedia.net Snippets
 * https://github.com/evomedia-net/evo.snippets
 * Created by Kelly Michels - dev@evomedia.net
 * Licensed under the MIT License. See LICENSE.
 *
 * A confetti burst that falls like paper. One file, no dependencies, no
 * build step: drop it in a <script> tag and call window.confettiBurst().
 */
window.confettiBurst = (function () {
  'use strict';
  var canvas, ctx, parts = [], raf = 0, lastT = 0;

  // Per-frame constants, at 60fps. dt normalises other frame rates.
  //
  // Each can be overridden live through `window.confettiBurstTuning`,
  // which nothing sets by default. It exists so a tuning page can drive
  // THIS renderer rather than a copy of it — a copy lets the numbers
  // someone dialled in drift from the numbers that ship, which defeats
  // the point of tuning. Read once per frame, so moving a slider moves
  // confetti already in the air.
  var GRAVITY = 0.22;
  // Velocity retained per frame. The gap between the two is the flutter:
  // face-on the sheet keeps 93% and settles at a terminal 0.22/0.07 =
  // 3.1 px/frame (~190 px/s, a drift you can follow with your eye);
  // edge-on it keeps 98.5% and knifes down several times faster.
  var DRAG_FACE = 0.930;
  var DRAG_EDGE = 0.985;
  // Never let a sheet turn perfectly invisible at exactly edge-on.
  var MIN_FACE = 0.12;

  // ── firing positions ───────────────────────────────────────────────
  // Laid out like a numpad, so the four corners are the four corner keys:
  //
  //     7  8  9        top-left     top     top-right
  //     4  5  6        left       centre    right
  //     1  2  3        bottom-left  bottom  bottom-right
  //
  // Each key carries its own AIM as well as its position, because the two
  // are not independent: a cannon in the top-left firing straight up is
  // just a cannon pointed off-screen. The aim is a default — pass `angle`
  // and it wins, so a pad number stays a shorthand rather than a preset.
  //
  // Origins sit slightly outside the edge, so a burst reads as arriving
  // from beyond the frame rather than being born on it.
  //
  // -90 is straight up; positive angles point downward, because y grows
  // downward on a canvas.
  // `direction` is a compass, not canvas maths: 0 is straight up, 90 is
  // right, 180 is straight down, 270 is left. The canvas wants -90 for
  // up, because y grows downward — correct for the arithmetic and
  // unreadable in a table, where the aim is the thing a person actually
  // reads. Converted once, at the entry point, so only one convention
  // ever reaches the particle loop.
  var PAD = {
    1: { origin: { x: -0.02, y: 1.02 }, direction: 35 },
    2: { origin: { x: 0.50, y: 1.04 }, direction: 0 },
    3: { origin: { x: 1.02, y: 1.02 }, direction: -35 },
    4: { origin: { x: -0.02, y: 0.50 }, direction: 65 },
    5: { origin: { x: 0.50, y: 0.55 }, direction: 0 },
    6: { origin: { x: 1.02, y: 0.50 }, direction: -65 },
    7: { origin: { x: -0.02, y: -0.02 }, direction: 130 },
    8: { origin: { x: 0.50, y: -0.04 }, direction: 180 },
    9: { origin: { x: 1.02, y: -0.02 }, direction: -130 }
  };

  function toCanvasAngle(direction) { return direction - 90; }

  // Fractions slide between neighbouring keys, so a row of cannons can be
  // written 7, 7.5, 8, 8.5, 9 — five evenly spaced across the top edge —
  // without inventing a second coordinate system for the in-between ones.
  // The aim is interpolated too, so a cannon halfway along an edge leans
  // halfway between its neighbours' aims.
  //
  // Consecutive keys are adjacent WITHIN a row (7-8-9, 4-5-6, 1-2-3), so
  // those fractions land where you would point. 3.5 and 6.5 are the two
  // that step between rows, and they slide diagonally across the middle
  // of the screen — defined, and rarely what anyone wants.
  function padAt(n) {
    n = Math.max(1, Math.min(9, n));
    var lo = Math.floor(n), hi = Math.ceil(n), k = n - lo;
    var a = PAD[lo];
    if (k === 0) return a;
    var b = PAD[hi];
    return {
      origin: {
        x: a.origin.x + (b.origin.x - a.origin.x) * k,
        y: a.origin.y + (b.origin.y - a.origin.y) * k
      },
      direction: a.direction + (b.direction - a.direction) * k
    };
  }

  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * k);
    var g = Math.round(((n >> 8) & 255) * k);
    var b = Math.round((n & 255) * k);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function layer() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;' +
      'pointer-events:none;z-index:9400';   // under q-notify (9500)
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', size);
    size();
  }

  function size() {
    // Cap DPR at 2: a 3x display quadruples the fill cost for no visible gain.
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function tuned(key, fallback) {
    var t = window.confettiBurstTuning;
    return (t && typeof t[key] === 'number') ? t[key] : fallback;
  }

  function step(t) {
    // Normalise to 60fps frames, clamped so an alt-tab pause cannot
    // teleport every particle off screen in one giant step.
    var dt = lastT ? Math.min((t - lastT) / 16.67, 3) : 1;
    lastT = t;

    // Hoisted out of the particle loop: read once a frame, not 400 times.
    var gravity = tuned('gravity', GRAVITY);
    var dragFace = tuned('dragFace', DRAG_FACE);
    var dragEdge = tuned('dragEdge', DRAG_EDGE);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      var face;

      if (p.still) {
        p.fade += dt * 0.024;
        p.life = p.fade < 0.3 ? p.fade / 0.3
                              : Math.max(0, 1 - (p.fade - 0.3) / 0.7);
        if (p.fade >= 1) { parts.splice(i, 1); continue; }
        face = 1;
      } else {
        p.tilt += p.tiltSpeed * dt;
        p.rot += p.rotSpeed * dt;

        // How much of the sheet the air sees, 1 face-on and 0 edge-on.
        face = Math.abs(Math.cos(p.tilt));

        // Drag follows the tumble, so the piece floats when it is flat to
        // the airflow and drops when it turns edge-on.
        var keep = dragEdge + (dragFace - dragEdge) * face;
        var decay = Math.pow(keep, dt);
        p.vx *= decay;
        p.vy *= decay;
        p.vy += p.gravity * gravity * dt;
        p.vx += p.drift * 0.012 * dt;

        // A falling sheet slides sideways across the air spilling off its
        // edges. Applied to POSITION rather than velocity so drag cannot
        // damp it away — the sway should still be there at the bottom of
        // the screen, when everything else has slowed to a drift.
        p.swayPhase += p.swaySpeed * dt;
        p.x += p.vx * dt + Math.sin(p.swayPhase) * p.swayAmp * dt;
        p.y += p.vy * dt;

        p.life -= p.decay * dt;
        if (p.life <= 0 || p.y > window.innerHeight + 60) {
          parts.splice(i, 1);
          continue;
        }
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // Two shades, flipped as the sheet turns: paper catching the light.
      ctx.fillStyle = face > 0.5 ? p.color : p.colorEdge;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Foreshortened by the tumble, so it reads as a sheet turning in
        // three dimensions rather than a rectangle spinning flat.
        var w = p.w * Math.max(face, MIN_FACE);
        ctx.fillRect(-w / 2, -p.h / 2, w, p.h);
      }
      ctx.restore();
    }

    if (parts.length) {
      raf = requestAnimationFrame(step);
    } else {
      // Stop the loop entirely when idle. A permanently running rAF on a
      // long-lived page is a background CPU cost for nothing.
      raf = 0;
      lastT = 0;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  return function fire(opts) {
    opts = opts || {};

    // `origin: 7` is shorthand for a pad position, and 7.5 for halfway to
    // the next one. Resolved BEFORE the defaults are applied, so the pad's
    // own aim can be told apart from an angle the caller actually asked
    // for — after Object.assign, every call looks like it specified one.
    var pad = null;
    if (typeof opts.origin === 'number') {
      if (!isFinite(opts.origin)) {
        throw new Error('confettiBurst: origin must be 1-9 (numpad) or {x, y}');
      }
      pad = padAt(opts.origin);
    }

    var o = Object.assign({
      // velocity is px per frame at 60fps, applied directly — no hidden
      // multiplier between the preset and the pixels it moves.
      count: 140, spread: 70, velocity: 34, gravity: 1, drift: 0, scalar: 1,
      roundRatio: 0,
      // Seconds, because that is what anyone tuning it is thinking in.
      // Most pieces leave the bottom of the screen well before this, so
      // it mainly governs the ones that drift.
      age: 9,
      // Aim as a compass: 0 up, 90 right, 180 down, 270 left. A cannon at
      // the left edge firing straight up throws half its pieces
      // off-screen; leaning it inward is what makes a row of them read as
      // a row.
      //
      // `angle` is the raw canvas form and still works — it is what the
      // presets and tests were written against — but `direction` wins if
      // both are given, being the one a person means.
      direction: 0,
      origin: { x: 0.5, y: 0.62 },
      // A neutral default so the snippet looks right out of the box.
      // Pass your own palette — six or so hues, all of similar
      // lightness, or the light ones read as gaps in the burst.
      colors: ['#2563eb', '#16a34a', '#f59e0b', '#e11d48', '#7c3aed', '#0891b2']
    }, opts);

    if (pad) {
      o.origin = pad.origin;
      // The pad's own aim, unless the caller asked for one. Checked on
      // `opts` rather than `o`, because after Object.assign every call
      // carries a direction.
      if (opts.direction === undefined && opts.angle === undefined) {
        o.direction = pad.direction;
      }
    }

    // One convention from here down. A wrap rather than a clamp: 350 and
    // -10 are the same aim, which is what a compass does.
    var aim = (opts.angle !== undefined && opts.direction === undefined)
      ? o.angle
      : toCanvasAngle(((o.direction % 360) + 360) % 360);
    o.angle = aim;

    // Seconds to per-frame decay, at 60fps.
    var decay = 1 / (Math.max(0.2, o.age) * 60);

    layer();

    // size() otherwise runs only at creation and on resize, so a canvas
    // created before layout (hidden tab, zero-size viewport) stays 0x0 for
    // good and nothing ever draws. Re-measure only when it is degenerate:
    // assigning canvas.width clears the bitmap, which would wipe a burst
    // already in flight.
    if (!canvas.width || !canvas.height) size();

    // Read the OS setting at fire time, not load time: a user can change it
    // mid-session and the next burst must respect it.
    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var tumbleK = tuned('tumble', 1);
    var swayK = tuned('sway', 1);
    var ox = o.origin.x * window.innerWidth;
    var oy = o.origin.y * window.innerHeight;

    for (var i = 0; i < o.count; i++) {
      var ang = (o.angle + (Math.random() - 0.5) * o.spread) * Math.PI / 180;
      var v = o.velocity * (0.75 + Math.random() * 0.5);
      var c = o.colors[i % o.colors.length];
      var p = {
        x: ox, y: oy,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        // Deliberately wide: big pieces read as foreground and small ones
        // as distance, which is what stops a burst looking like one shape
        // stamped 140 times. Squared so small pieces outnumber large.
        w: (9 + Math.pow(Math.random(), 2) * 20) * o.scalar,
        h: (6 + Math.pow(Math.random(), 2) * 12) * o.scalar,
        // Two independent rotations. `tilt` turns the sheet end over end
        // and drives both the foreshortening and the drag; `rot` spins it
        // in its own plane. One angle for both would tie the flutter to
        // the spin and the whole burst would pulse in step.
        tilt: Math.random() * Math.PI * 2,
        tiltSpeed: (0.05 + Math.random() * 0.11) * tumbleK * (Math.random() < 0.5 ? -1 : 1),
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.11,
        swayPhase: Math.random() * Math.PI * 2,
        swaySpeed: 0.04 + Math.random() * 0.05,
        swayAmp: (0.6 + Math.random() * 1.1) * swayK,
        color: c,
        colorEdge: shade(c, 0.66),
        round: Math.random() < o.roundRatio,
        // Held per particle, not read from a shared config, so a second
        // burst with different physics does not rewrite the first one.
        gravity: o.gravity,
        drift: o.drift,
        life: 1, still: still, fade: 0, decay: decay
      };
      if (still) {
        var r = Math.random();
        p.x = ox + Math.cos(ang) * v * 14 * (0.4 + r);
        p.y = oy + Math.sin(ang) * v * 10 * (0.4 + r) + r * 40;
        p.vx = p.vy = p.vr = 0;
        p.tiltSpeed = p.rotSpeed = p.swaySpeed = p.swayAmp = 0;
      }
      parts.push(p);
    }

    if (!raf) raf = requestAnimationFrame(step);
  };
})();
