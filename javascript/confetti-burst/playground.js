/*
 * confetti-burst playground - Evomedia.net Snippets
 * https://github.com/evomedia-net/evo.snippets
 * Created by Kelly Michels - dev@evomedia.net
 * Licensed under the MIT License. See LICENSE.
 *
 * A control panel for confetti.js: every firing position, every force,
 * live readings, and the settings ready to paste back into code.
 *
 *   <link rel="stylesheet" href="playground.css">
 *   <div id="playground"></div>
 *   <script src="confetti.js"></script>
 *   <script src="playground.js"></script>
 *   <script>confettiPlayground.mount('#playground');</script>
 *
 * It BUILDS its own markup rather than expecting a page full of the
 * right ids. Two pages wanted this panel - the snippet's demo and a
 * website - and page markup copied between them is markup that drifts:
 * one gains a control, the other quietly does not. Here there is one
 * source, and a host supplies an empty div.
 *
 * Colours come from --cbp-* custom properties (see playground.css), so a
 * host restyles it with its own design tokens instead of overriding
 * rules.
 */
window.confettiPlayground = (function () {
  'use strict';

  // Where the panel starts, and what "Reset" returns to. Deliberately not
  // confetti.js's own defaults (count 140, velocity 34, tumble and sway
  // untuned at 1) - those are the conservative numbers a page gets when it
  // drops the renderer in with no options. This is the tuned look: more
  // paper, thrown harder, with the tumble and sway pushed past neutral so
  // the flutter is visible on the first burst rather than needing the
  // sliders moved to find it.
  var DEFAULTS = {
    count: 205, spread: 55, velocity: 60, scalar: 1.15, stagger: 500,
    gravity: 0.8, gravityBase: 0.22, dragFace: 0.930, dragEdge: 0.985,
    tumble: 1.5, sway: 1.5, age: 9,
    // 5 is the natural-looking rate; the multiplier is acceleration / 5.
    acceleration: 5,
    // 1 is off. Two or more repeats the whole set, loopGap apart.
    //
    // 2.5s rather than the renderer's own 700ms default: pieces live 9
    // seconds here, and a gap that short lands every repeat inside the
    // previous one, so the loop reads as a single long burst.
    loop: 1, loopGap: 2500
  };

  // Mirrors confetti.js's own PAD aims, for the readout only. Kept as a
  // plain map because the renderer does not expose one - if that ever
  // changes, read it from there instead of keeping a second copy.
  var PAD_AIM = {
     1:  130,  2:   142,  3: 180,  4:   -142,  5: -130,
     6:   98,  7: 105.5,  8: 180,  9: -105.5, 10:  -98,
    11:   65, 12:    54, 13:   0, 14:    -54, 15:  -65,
    16: 49.5, 17:    30, 18:   0, 19:    -30, 20: -49.5,
    21:   35, 22:    20, 23:   0, 24:    -20, 25:  -35
  };

  var SLIDERS = [
    ['burst', 'count', 'Pieces', 20, 400, 5, function (v) { return String(v); }],
    ['burst', 'scalar', 'Size', 0.4, 3, 0.05, function (v) { return '×' + (+v).toFixed(2); }],
    ['burst', 'velocity', 'Launch speed', 10, 110, 1, function (v) { return v + ' px/f'; }],
    ['burst', 'spread', 'Spread', 10, 180, 5, function (v) { return v + '°'; }],
    ['burst', 'stagger', 'Stagger', 0, 1200, 25, function (v) { return v + ' ms'; }],
    ['air', 'acceleration', 'Acceleration', 1, 10, 0.5, function (v) {
      return (+v).toFixed(1) + '  ×' + (v / 5).toFixed(2);
    }],
    ['air', 'gravityBase', 'Gravity', 0.05, 0.9, 0.01, function (v) { return (+v).toFixed(2); }],
    ['air', 'dragFace', 'Drag — face-on', 0.8, 1, 0.002, function (v) { return ((+v) * 100).toFixed(1) + '%'; }],
    ['air', 'dragEdge', 'Drag — edge-on', 0.8, 1, 0.002, function (v) { return ((+v) * 100).toFixed(1) + '%'; }],
    ['air', 'tumble', 'Tumble', 0, 3, 0.05, function (v) { return '×' + (+v).toFixed(2); }],
    ['air', 'sway', 'Sway', 0, 4, 0.05, function (v) { return '×' + (+v).toFixed(2); }],
    ['air', 'age', 'Age', 0.5, 20, 0.5, function (v) { return (+v).toFixed(1) + ' s'; }]
  ];

  var PALETTES = {
    Brand: ['#1565c0', '#2563eb', '#16a34a', '#22c55e', '#f59e0b', '#93c5fd'],
    Festive: ['#e11d48', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'],
    Monotone: ['#1565c0', '#2563eb', '#3b82f6', '#93c5fd', '#cbd5e1']
  };

  var SETS = {
    'Four corners': [21, 25, 5, 1],
    'Across the top': [1, 2, 3, 4, 5],
    'Across the bottom': [21, 22, 23, 24, 25],
    // Left and right rise together in pairs rather than one whole side and
    // then the other, so the burst reads as two columns climbing at once.
    // Order is firing order - the stagger walks the array.
    'Up both sides': [21, 25, 16, 20, 11, 15, 6, 10, 1, 5],
    // A lap of the edge: along the bottom, up the right, back across the
    // top, down the left. Exactly the 16 perimeter cells, each adjacent to
    // the last, and 16 is adjacent to 21 - so with a loop on it the walk
    // closes and keeps going round.
    'Walk the screen': [21, 22, 23, 24, 25, 20, 15, 10, 5, 4, 3, 2, 1, 6, 11, 16],
    'Centre': [13]
  };

  // Built-in looks. Not the same thing as a saved setup: these ship with
  // the snippet and cannot be deleted, so there is always something known
  // to fall back to when a slider hunt has gone wrong.
  //
  // Natural was tuned against the panel's own readings rather than by eye
  // - terminal fall 237 px/s, peak rise 764 px, 2% of launch speed left
  // after a second, flutter 150-1247 px/s - which is inside every band the
  // verdict checks, and centred in them rather than sitting on an edge.
  //
  // The wide cone and the heavy sway are doing the work the renderer
  // cannot: `spread` is applied once at launch and drag kills sideways
  // velocity within about fifteen frames, so a burst stops widening almost
  // immediately. Throwing the cone wider at launch and leaning on sway is
  // the closest this model gets to air that keeps working on the paper.
  var LOOKS = {
    Natural: {
      // gravityBase is pinned as well as gravity. The panel's "Gravity"
      // slider drives gravityBase, so a look that set only `gravity` would
      // inherit whatever the last hunt left behind and stop matching the
      // readings it was tuned against.
      velocity: 52, gravity: 0.85, gravityBase: 0.22,
      dragFace: 0.925, dragEdge: 0.991,
      tumble: 1.25, spread: 90, sway: 2.5, age: 12, acceleration: 5
    }
  };

  var STORE = 'confettiPlaygroundPresets';

  // Palettes the panel writes rather than reads. A preset naming one of
  // these has to carry its colours; a preset naming a host palette should
  // not, or it would pin an old copy of a palette the host has since
  // changed.
  var OWNED = { Random: 1, Custom: 1 };

  // Saved setups carry the numbering they were written in, so each old
  // scheme gets a way back to the current one. Positions are moved rather
  // than dropped - every one of them has an exact cell here.
  //
  // v1: the 3x3 numbered 1-9 in calculator order, halves for the cells
  //     between. 7 -> 1, 7.5 -> 2, 8 -> 3 ... 2.5 -> 24, 3 -> 25.
  //     3.5 and 6.5 are the exception: they stepped diagonally between
  //     rows and had no cell of their own, so they land on the end of
  //     their row.
  // v2: the 5x5 in calculator order, 21 22 23 24 25 across the top. A
  //     vertical flip. It never shipped, but it did run on a review
  //     server, and a preset that quietly points at the mirror image of
  //     where it was written is worse than one that refuses to load.
  function padFromV1(k) {
    if (!isFinite(k)) return 13;
    var base = Math.floor(k), half = k - base >= 0.5 ? 1 : 0;
    base = Math.max(1, Math.min(9, base));
    var col = Math.min(4, ((base - 1) % 3) * 2 + half);
    var rowFromTop = 2 - Math.floor((base - 1) / 3);
    return rowFromTop * 2 * 5 + col + 1;
  }

  function padFromV2(k) {
    if (!isFinite(k)) return 13;
    var i = Math.max(1, Math.min(25, Math.round(k))) - 1;
    return (4 - Math.floor(i / 5)) * 5 + (i % 5) + 1;
  }

  // Six hues at ONE lightness, spaced around the wheel with a little
  // jitter so the set reads as chosen rather than as six random colours.
  // The single lightness is the part that matters: mix light and dark and
  // the light pieces read as gaps in the burst rather than as colours.
  function randomPalette() {
    var start = Math.random() * 360;
    var light = 49 + Math.random() * 7;
    var sat = 62 + Math.random() * 16;
    var out = [];
    for (var i = 0; i < 6; i++) {
      out.push(hslHex((start + i * 60 + (Math.random() - 0.5) * 26 + 360) % 360, sat, light));
    }
    return out;
  }

  // Where a click on Snap 45 should land.
  //
  // Off a multiple, it goes to the NEAREST one - 60 and 52 both give 45,
  // which is the point: 45 is the angle people actually want and the
  // slider is a clumsy way to hit it. Already on a multiple, it advances
  // to the next, so repeated clicks walk 45, 90, 135 rather than sticking.
  //
  // No click counter anywhere: landing on a multiple IS the state, so the
  // second click behaves differently because the world changed, not
  // because something remembered.
  function snap45(deg) {
    var v = (Math.abs(deg % 45) < 0.5) ? deg + 45 : Math.round(deg / 45) * 45;
    // Back into (-180, 180], the range the slider speaks. 180 is left
    // alone rather than folded to -180, which would look like a click
    // that did nothing.
    v = ((v % 360) + 360) % 360;
    return v > 180 ? v - 360 : v;
  }

  function rgbOf(hex) {
    var n = parseInt(String(hex).replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function hexOf(rgb) {
    return '#' + rgb.map(function (v) {
      var h = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return h.length < 2 ? '0' + h : h;
    }).join('');
  }

  function relLum(rgb) {
    var c = rgb.map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function contrast(a, b) {
    var l1 = relLum(a), l2 = relLum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  // Label colour for a swatch: the INVERSE, so #ffffff reads as #000000.
  //
  // An inverse only works at the ends of the range though. #808080
  // inverts to #7f7f7f - a contrast ratio of 1.0, which is text you
  // cannot see at all, and the middle of the range is exactly where a
  // colour picker leaves you. So where the inverse does not clear 4.5:1
  // the label falls back to whichever of black or white does. Every
  // colour Kelly named behaves as asked; the unreadable ones are the only
  // ones that differ, and they were never readable.
  function labelOn(hex) {
    var bg = rgbOf(hex);
    var inv = [255 - bg[0], 255 - bg[1], 255 - bg[2]];
    if (contrast(inv, bg) >= 4.5) return hexOf(inv);
    return relLum(bg) > 0.18 ? '#000000' : '#ffffff';
  }

  function hslHex(h, s, l) {
    s /= 100; l /= 100;
    var a = s * Math.min(l, 1 - l);
    function chan(n) {
      var k = (n + h / 30) % 12;
      var v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
      var hx = Math.round(255 * v).toString(16);
      return hx.length < 2 ? '0' + hx : hx;
    }
    return '#' + chan(0) + chan(8) + chan(4);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function mount(target, options) {
    var host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) throw new Error('confettiPlayground: no element matched ' + target);
    if (typeof window.confettiBurst !== 'function') {
      host.appendChild(el('p', 'cbp-hint', 'confetti.js did not load, so there is nothing to drive.'));
      return null;
    }

    var opts = options || {};
    var S = Object.assign({}, DEFAULTS, opts.defaults || {});
    // The palette the panel opens on, kept separately because `palette` is
    // reassigned on every pick and so cannot be its own restore point.
    var DEFAULT_PALETTE = opts.palette || 'Brand';
    var palette = DEFAULT_PALETTE;
    var palettes = Object.assign({}, opts.palettes || PALETTES);
    // {at, dir} - dir null means "use the position's own aim", which is
    // what lets one cannon be turned without disturbing the others.
    // The bottom row - 21, 23, 25 - which is where 1, 3, 5 pointed before
    // the pad was flipped to phone order. Confetti rising from below the
    // bottom edge is the shape the panel should open on.
    // The positions the panel opens on, and the ones Reset returns to. Named
    // once because they used to be written twice and the copies disagreed:
    // Reset installed 1, 2, 3 - the top-left corner, a state the page never
    // starts in and a poor default for confetti, since it drops the burst out
    // of the ceiling in a corner rather than throwing it up from the floor.
    var DEFAULT_CANNONS = [21, 23, 25];
    function defaultCannons() {
      return DEFAULT_CANNONS.map(function (n) { return { at: n, dir: null }; });
    }
    var cannons = defaultCannons();

    host.classList.add('cbp');
    var grid = el('div', 'cbp-grid');
    var refs = {};

    // ── firing ────────────────────────────────────────────────────────
    function aimOf(c) {
      if (c.dir !== null) return c.dir;
      var lo = Math.floor(c.at), hi = Math.ceil(c.at), k = c.at - lo;
      return k === 0 ? PAD_AIM[lo] : PAD_AIM[lo] + (PAD_AIM[hi] - PAD_AIM[lo]) * k;
    }

    function fire() {
      if (!cannons.length) { status('Pick at least one position first.'); return; }
      // Read live, so a slider moves confetti already in the air.
      window.confettiBurstTuning = {
        gravity: S.gravityBase, dragFace: S.dragFace,
        dragEdge: S.dragEdge, tumble: S.tumble, sway: S.sway
      };
      // Per cannon, not a budget split between them. Dividing meant every
      // position you added made every burst weaker - the opposite of what
      // adding a cannon should do - while the slider went on reading 300.
      // The number on the control now describes what one cannon fires.
      var per = S.count;
      cannons.forEach(function (c, i) {
        setTimeout(function () {
          var call = {
            origin: c.at, count: per, spread: S.spread, velocity: S.velocity,
            gravity: S.gravity, scalar: S.scalar, age: S.age,
            acceleration: S.acceleration,
            loop: S.loop, loopDelay: S.loopGap,
            colors: palettes[palette]
          };
          // Per cannon, not per press: a row of five going off in
          // sequence should sound like five, and a loop should sound
          // like it is still running rather than like one long silence.
          if (refs.playSound) refs.playSound();
          // Omitted rather than sent as null, so the renderer falls back
          // to the position's own aim instead of reading null as a bearing.
          if (c.dir !== null) call.direction = c.dir;
          try { window.confettiBurst(call); }
          catch (e) { status('Burst failed: ' + e.message); }
        }, i * S.stagger);
      });
      status(cannons.length === 1
        ? 'Fired from position ' + cannons[0].at + '. ' + S.count + ' pieces.'
        : cannons.length + ' cannons, ' + S.stagger + 'ms apart. '
          + S.count + ' pieces each, ' + (cannons.length * S.count) + ' in the air.');
    }

    function status(msg) { if (refs.status) refs.status.textContent = msg; }

    // The same clamp confetti.js applies, so the readings below cannot
    // report a rate the renderer would have refused to use.
    function accelK() { return Math.max(1, Math.min(10, +S.acceleration || 5)) / 5; }

    // ── the same integrator confetti.js runs ──────────────────────────
    // Not a formula about it: a closed form would describe a model the
    // renderer no longer uses the moment either one changes.
    function simulate(frames) {
      var vy = -S.velocity, y = 0, peak = 0, tilt = 0;
      for (var f = 0; f < frames; f++) {
        tilt += 0.10 * S.tumble;
        var face = Math.abs(Math.cos(tilt));
        vy *= S.dragEdge + (S.dragFace - S.dragEdge) * face;
        vy += S.gravity * S.gravityBase * accelK();
        y += vy;
        if (y < peak) peak = y;
      }
      return { peak: -peak, vy: vy };
    }

    function readings() {
      var long = simulate(900), short = simulate(60);
      var settle = Math.abs(long.vy) * 60;
      var left = Math.abs(short.vy) / S.velocity;
      var g = S.gravity * S.gravityBase * accelK();
      var tFace = g / (1 - S.dragFace) * 60;
      var tEdge = g / (1 - S.dragEdge) * 60;

      refs.rTerminal.textContent = settle.toFixed(0) + ' px/s';
      refs.rPeak.textContent = long.peak.toFixed(0) + ' px';
      refs.rDecay.textContent = (left * 100).toFixed(0) + '%';
      refs.rFlutter.textContent = tFace.toFixed(0) + '–' + tEdge.toFixed(0) + ' px/s';

      var notes = [];
      if (settle >= 420) notes.push('falls like debris rather than paper');
      if (settle <= 120) notes.push('hangs in the air');
      if (long.peak <= 700) notes.push('may not clear the screen from an edge');
      if (left >= 0.35) notes.push('still at launch speed after a second, so it reads mechanical');
      if (Math.abs(tEdge - tFace) < 60) notes.push('barely flutters — the two drags are too close');
      refs.verdict.textContent = notes.length
        ? 'Watch out — ' + notes.join('; ') + '.'
        : 'Inside the band that reads as paper.';

      refs.emit.textContent = emit();
    }

    function emit() {
      var list = cannons.map(function (c) {
        return c.dir === null ? String(c.at) : '{ origin: ' + c.at + ', direction: ' + Math.round(c.dir) + ' }';
      }).join(', ');
      return 'confettiBurst({\n' +
        '  origin: ' + (cannons.length === 1 ? cannons[0].at : '/* one of */ ' + list) + ',\n' +
        '  count: ' + S.count + ',\n' +
        '  spread: ' + S.spread + ',\n' +
        '  velocity: ' + S.velocity + ',\n' +
        '  gravity: ' + (+S.gravity).toFixed(2) + ',\n' +
        '  scalar: ' + (+S.scalar).toFixed(2) + ',\n' +
        '  acceleration: ' + (+S.acceleration).toFixed(1) + ',\n' +
        '  age: ' + (+S.age).toFixed(1) +
        (S.loop > 1 ? ',\n  loop: ' + S.loop + ',\n  loopDelay: ' + S.loopGap : '') + '\n' +
        '});\n\n' +
        '// confetti.js constants\n' +
        'var GRAVITY   = ' + (+S.gravityBase).toFixed(2) + ';\n' +
        'var DRAG_FACE = ' + (+S.dragFace).toFixed(3) + ';\n' +
        'var DRAG_EDGE = ' + (+S.dragEdge).toFixed(3) + ';\n' +
        '// tumble ×' + (+S.tumble).toFixed(2) + '   sway ×' + (+S.sway).toFixed(2);
    }

    // ── panels ────────────────────────────────────────────────────────
    function panel(title) {
      var p = el('div', 'cbp-panel');
      p.appendChild(el('h3', null, title));
      grid.appendChild(p);
      return p;
    }

    function slider(parent, key, label, min, max, step, fmt) {
      var wrap = el('div', 'cbp-ctl');
      var lab = el('label');
      var id = 'cbp-' + key + '-' + Math.random().toString(36).slice(2, 7);
      lab.htmlFor = id;
      lab.appendChild(el('span', null, label));
      var out = el('output');
      out.textContent = fmt(S[key]);
      lab.appendChild(out);
      var input = document.createElement('input');
      input.type = 'range';
      input.id = id;
      input.min = min; input.max = max; input.step = step; input.value = S[key];
      input.addEventListener('input', function () {
        S[key] = parseFloat(input.value);
        out.textContent = fmt(S[key]);
        readings();
      });
      wrap.appendChild(lab);
      wrap.appendChild(input);
      parent.appendChild(wrap);
      refs['s_' + key] = input;
      refs['o_' + key] = out;
      refs['f_' + key] = fmt;
    }

    // Positions
    var pPos = panel('Where it fires from');
    pPos.appendChild(el('p', 'cbp-hint',
      'Numbered like a phone keypad — 1 2 3 across the top — so 1 and 5 are the ' +
      'top corners, 21 and 25 the bottom ones, and 13 is dead centre. Pick as ' +
      'many as you like; they fire in the order shown.'));
    var pad = el('div', 'cbp-pad');
    [ 1,  2,  3,  4,  5,
      6,  7,  8,  9, 10,
     11, 12, 13, 14, 15,
     16, 17, 18, 19, 20,
     21, 22, 23, 24, 25].forEach(function (n) {
      var b = el('button', null, String(n));
      b.type = 'button';
      b.setAttribute('data-at', n);
      b.addEventListener('click', function () {
        var i = cannons.map(function (c) { return c.at; }).indexOf(n);
        if (i === -1) cannons.push({ at: n, dir: null }); else cannons.splice(i, 1);
        paint();
      });
      pad.appendChild(b);
    });
    pPos.appendChild(pad);

    var setRow = el('div', 'cbp-row');
    Object.keys(SETS).forEach(function (name) {
      var b = el('button', 'cbp-btn cbp-btn--sm', name);
      b.type = 'button';
      b.addEventListener('click', function () {
        cannons = SETS[name].map(function (n) { return { at: n, dir: null }; });
        paint();
      });
      setRow.appendChild(b);
    });
    pPos.appendChild(setRow);

    var listInput = document.createElement('input');
    listInput.type = 'text';
    listInput.setAttribute('aria-label', 'Firing positions');
    listInput.addEventListener('change', function () {
      cannons = listInput.value.split(/[,\s]+/).filter(Boolean).map(function (raw) {
        var bits = String(raw).split('@');
        return {
          at: Math.round(parseFloat(bits[0]) * 100) / 100,
          dir: bits.length > 1 && bits[1] !== '' ? parseFloat(bits[1]) : null
        };
      }).filter(function (c) { return isFinite(c.at) && c.at >= 1 && c.at <= 25; });
      paint();
    });
    pPos.appendChild(listInput);
    pPos.appendChild(el('p', 'cbp-hint',
      'The top edge is 1, 2, 3, 4, 5 — the half-steps have cells of their own ' +
      'now, so whole numbers reach every one. Any fraction still lands between ' +
      'neighbours: 4.1 is a tenth of the way from 4 to 5. Add @ and an angle to ' +
      'aim one: 1@90.'));

    // Per-cannon aim
    var pAim = panel('Aim, per cannon');
    pAim.appendChild(el('p', 'cbp-hint',
      '0° is straight up, 180° straight down. Each starts on its ' +
      'position’s own aim — move one and only that one changes.'));
    var aims = el('div', 'cbp-aims');
    pAim.appendChild(aims);

    function paintAims() {
      aims.innerHTML = '';
      if (!cannons.length) {
        aims.appendChild(el('p', 'cbp-hint', 'No positions selected.'));
        return;
      }
      cannons.forEach(function (c) {
        var row = el('div', 'cbp-aim');
        row.appendChild(el('span', 'cbp-aim-at', String(c.at)));
        // Which way this one is pointing, as a picture. A slider reading
        // "-105°" is a number you have to convert; an arrow is the answer.
        // Drawn pointing up, because up is 0 on the compass the aim uses,
        // so the rotation is the bearing with no conversion in between.
        // Snap to 45. Drawn as the thing it does - a baseline, a ray at
        // 45 degrees off it, and the arc between them - because a button
        // that looks like its own result needs no reading.
        var snap = el('button', 'cbp-aim-snap');
        snap.type = 'button';
        snap.title = 'Snap Angle 45°';
        snap.setAttribute('aria-label', 'Snap the aim to the next 45 degrees');
        snap.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M4 19H20M4 19L17 6"/>' +
          '<path class="cbp-aim-snap-arc" d="M12 19A8 8 0 0 0 9.66 13.34"/>' +
          '</svg>';

        var arrow = el('span', 'cbp-aim-arrow');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 21V4M12 3l-6 7M12 3l6 7"/></svg>';
        var sl = document.createElement('input');
        sl.type = 'range'; sl.min = -180; sl.max = 180; sl.step = 5;
        sl.value = Math.round(aimOf(c));
        sl.setAttribute('aria-label', 'Aim for position ' + c.at);
        var deg = el('span', 'cbp-aim-deg');
        // Where the arrow is actually pointing, UNWRAPPED - it keeps
        // counting past 360 and below 0 rather than being folded back into
        // a circle. The bearing itself wraps, and if the transform wrapped
        // with it the arrow would take the long way round: -5 normalises to
        // 355, and CSS interpolates rotate(355deg) -> rotate(0deg) as 355
        // degrees of travel backwards, not 5 forwards. That is the spin.
        //
        // Not gimbal lock, despite looking like one: this is a single
        // rotation about one axis, so there is nothing to lock. It is the
        // shortest-arc problem, and in 2D it is solved with arithmetic
        // rather than with anything as heavy as a quaternion.
        var turn = null;

        function label() {
          var raw = Math.round(+sl.value);
          var d = ((raw % 360) + 360) % 360;
          var word = d === 0 ? ' up' : d === 180 ? ' down' : d === 90 ? ' right' : d === 270 ? ' left' : '';
          deg.textContent = sl.value + '°' + word;
          if (turn === null) {
            // The slider is already -180..180, which is the short way from
            // straight up, so the first paint needs no correction.
            turn = raw;
          } else {
            // Step by the signed difference in (-180, 180]: always the
            // short way from wherever the arrow currently is.
            var here = ((turn % 360) + 360) % 360;
            turn += ((d - here) + 540) % 360 - 180;
          }
          arrow.style.transform = 'rotate(' + turn + 'deg)';
        }
        label();
        sl.addEventListener('input', function () {
          c.dir = parseFloat(sl.value);
          label();
          listInput.value = text();
          readings();
        });
        snap.addEventListener('click', function () {
          sl.value = String(snap45(parseFloat(sl.value)));
          // Same path the slider takes, so the arrow, the readout, the
          // positions field and the readings all move together.
          sl.dispatchEvent(new Event('input'));
        });
        row.appendChild(snap);
        row.appendChild(arrow);
        row.appendChild(sl);
        row.appendChild(deg);
        aims.appendChild(row);
      });
    }

    // The burst
    var pBurst = panel('The burst');
    // Physics
    var pAir = panel('Physics');
    SLIDERS.forEach(function (s) {
      slider(s[0] === 'burst' ? pBurst : pAir, s[1], s[2], s[3], s[4], s[5], s[6]);
    });

    // Loop. Ten is the ceiling and it is the renderer that enforces it,
    // not this checkbox - a number typed into the emitted snippet gets
    // clamped the same way. Unchecked is 1, which is "fire once", so
    // there is no separate off state to keep in step.
    var loopRow = el('div', 'cbp-ctl');
    var loopLab = el('label', 'cbp-check');
    var loopBox = document.createElement('input');
    loopBox.type = 'checkbox';
    loopLab.appendChild(loopBox);
    loopLab.appendChild(el('span', null, 'Loop'));
    var loopOut = el('output');
    loopLab.appendChild(loopOut);
    var loopSl = document.createElement('input');
    loopSl.type = 'range';
    loopSl.min = 2; loopSl.max = 10; loopSl.step = 1;
    loopSl.setAttribute('aria-label', 'How many times to fire');
    loopRow.appendChild(loopLab);
    loopRow.appendChild(loopSl);
    pBurst.appendChild(loopRow);

    // How far apart the repeats land. This has to be a control, not a
    // constant: a piece lives `age` seconds, and any gap much shorter than
    // that lands the next volley while the last one is still in full
    // flight - four bursts merge into one continuous cloud and the Loop
    // checkbox looks broken. It was fixed at 700ms against a 9s default
    // age, which is exactly that.
    var gapRow = el('div', 'cbp-ctl');
    var gapLab = el('label', null);
    var gapText = el('span', null, 'Repeat every');
    var gapOut = el('output');
    gapLab.appendChild(gapText);
    gapLab.appendChild(gapOut);
    var gapSl = document.createElement('input');
    gapSl.type = 'range';
    gapSl.min = 0.3; gapSl.max = 6; gapSl.step = 0.1;
    gapSl.setAttribute('aria-label', 'Seconds between repeats');
    gapRow.appendChild(gapLab);
    gapRow.appendChild(gapSl);
    pBurst.appendChild(gapRow);

    function syncLoop() {
      var on = S.loop > 1;
      loopBox.checked = on;
      loopSl.value = on ? S.loop : 3;
      loopSl.disabled = !on;
      gapSl.value = S.loopGap / 1000;
      gapSl.disabled = !on;
      gapOut.textContent = (S.loopGap / 1000).toFixed(1) + ' s';
      gapRow.style.opacity = on ? '' : '0.55';
      loopOut.textContent = on
        ? '×' + S.loop + ' over ' + (((S.loop - 1) * S.loopGap) / 1000).toFixed(1) + ' s'
        : 'fires once';
    }
    loopBox.addEventListener('change', function () {
      S.loop = loopBox.checked ? Math.max(2, +loopSl.value || 3) : 1;
      syncLoop(); paint();
    });
    loopSl.addEventListener('input', function () {
      S.loop = Math.max(2, Math.min(10, +loopSl.value));
      syncLoop(); paint();
    });
    gapSl.addEventListener('input', function () {
      S.loopGap = Math.round(Math.max(0.3, Math.min(6, +gapSl.value)) * 1000);
      syncLoop(); paint();
    });
    refs.syncLoop = syncLoop;
    syncLoop();
    pAir.appendChild(el('p', 'cbp-hint',
      'The gap between the two drags is the flutter: face-on the sheet floats, ' +
      'edge-on it knifes down.'));

    // Palette
    var pPal = panel('Colour');
    palettes.Random = randomPalette();
    // Seeded from whatever palette the host opened on, so the six pickers
    // start somewhere deliberate rather than on six identical blacks.
    palettes.Custom = (palettes[palette] || []).slice(0, 6);
    while (palettes.Custom.length < 6) palettes.Custom.push('#2563eb');
    var palRow = el('div', 'cbp-row');
    var swatches = el('div', 'cbp-swatches');

    function selectPalette(name) {
      palette = name;
      [].forEach.call(palRow.children, function (o) {
        o.setAttribute('aria-pressed', String(o.textContent === name));
      });
      paintSwatches();
    }

    function paintSwatches() {
      swatches.innerHTML = '';
      (palettes[palette] || []).forEach(function (c) {
        var sw = el('span', 'cbp-swatch');
        sw.style.background = c;
        sw.title = c;
        swatches.appendChild(sw);
      });
    }

    Object.keys(palettes).forEach(function (name) {
      var b = el('button', 'cbp-btn cbp-btn--sm', name);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(name === palette));
      b.addEventListener('click', function () {
        // Random re-rolls every press, so it is a "give me another" rather
        // than one more fixed palette you can only pick once.
        if (name === 'Random') palettes.Random = randomPalette();
        selectPalette(name);
      });
      palRow.appendChild(b);
    });
    pPal.appendChild(palRow);
    pPal.appendChild(swatches);
    paintSwatches();
    pPal.appendChild(el('p', 'cbp-hint',
      'Random re-rolls each time you press it. Six hues at one lightness — a ' +
      'much lighter piece reads as a gap in the burst rather than as a colour.'));

    // Six colours of your own. Each opens the OS colour picker, wears the
    // colour it holds and prints its hex, so the grid is both the control
    // and the readout - there is nothing else to look at to know what you
    // chose. Editing any of them selects Custom, because changing a colour
    // and then having to remember to press a button for it to count is a
    // step that exists only to be forgotten.
    var customGrid = el('div', 'cbp-colours');
    palettes.Custom.forEach(function (hex, i) {
      var cell = el('label', 'cbp-colour');
      var inp = document.createElement('input');
      inp.type = 'color';
      inp.value = hex;
      inp.setAttribute('aria-label', 'Custom colour ' + (i + 1));
      var face = el('span', 'cbp-colour-face');

      function wear(v) {
        cell.style.background = v;
        face.textContent = v.toUpperCase();
        face.style.color = labelOn(v);
      }
      wear(hex);

      inp.addEventListener('input', function () {
        palettes.Custom[i] = inp.value;
        wear(inp.value);
        selectPalette('Custom');
      });
      cell.appendChild(inp);
      cell.appendChild(face);
      customGrid.appendChild(cell);
    });
    pPal.appendChild(customGrid);
    refs.customGrid = customGrid;
    refs.repaintCustom = function () {
      [].forEach.call(customGrid.children, function (cell, i) {
        var v = palettes.Custom[i];
        if (!v) return;
        cell.querySelector('input').value = v;
        cell.style.background = v;
        var f = cell.querySelector('.cbp-colour-face');
        f.textContent = v.toUpperCase();
        f.style.color = labelOn(v);
      });
    };

    // Sound, if the host asked for it
    if (opts.sound) {
      var pSnd = panel('Sound');
      var useSound = document.createElement('input');
      useSound.type = 'checkbox';
      var check = el('label', 'cbp-check');
      check.appendChild(useSound);
      check.appendChild(el('span', null, 'Use sound'));
      pSnd.appendChild(check);

      var picker = el('div', 'cbp-row');
      var filePick = document.createElement('input');
      filePick.type = 'file';
      filePick.accept = 'audio/*';
      picker.appendChild(filePick);
      pSnd.appendChild(picker);

      var soundNote = el('p', 'cbp-hint',
        'Plays once per cannon, so a row of five sounds like five. Browsers ' +
        'refuse to play audio until the page has been interacted with, so ' +
        'sound is the caller’s job, not the renderer’s.');
      pSnd.appendChild(soundNote);

      // What `sound` may be:
      //   true            panel, playing the bundled confetti.mp3
      //   '<url>'         panel, playing that clip by default
      //   { clip: null }  panel with nothing bundled — the visitor brings
      //                   a file of their own
      //
      // That last one is not a curiosity. The bundled clip is Pixabay
      // Content License, not CC0, and its licence draws the line at
      // re-hosting the raw file as an audio asset in its own right — so a
      // public site can offer the control without serving the file. See
      // NOTICE.md.
      var bundled = opts.sound === true ? 'confetti.mp3'
        : typeof opts.sound === 'string' ? opts.sound
        : (opts.sound && 'clip' in opts.sound) ? opts.sound.clip
        : null;
      var soundUrl = bundled;
      var objectUrl = null;

      function soundReady() { return !!soundUrl; }
      function syncSound() {
        useSound.disabled = !soundReady();
        if (useSound.disabled) useSound.checked = false;
        picker.hidden = false;
      }
      if (!bundled) {
        soundNote.textContent =
          'Choose an audio file and it plays once per cannon — a row of five ' +
          'sounds like five. Nothing is uploaded: the file is read from your ' +
          'machine and never leaves it.';
      }
      syncSound();
      filePick.addEventListener('change', function () {
        // Revoked before replacing: each object URL pins its blob in
        // memory until released.
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        var f = filePick.files && filePick.files[0];
        objectUrl = f ? URL.createObjectURL(f) : null;
        soundUrl = objectUrl || bundled;
        soundNote.textContent = f
          ? 'Using ' + f.name + '. Nothing is uploaded — it is read from your machine.'
          : bundled ? 'Using the bundled clip.' : 'Choose a file to hear anything.';
        if (f) useSound.checked = true;
        decode(f || bundled);
        syncSound();
      });
      // Decoded once, played many times.
      //
      // A fresh `new Audio(src)` per cannon looks right and is not: each
      // one is a whole media element that fetches and decodes the clip
      // again, and a row of five firing 200ms apart asks the browser for
      // five simultaneous decodes of the same file. play() resolves for
      // all of them - measured - and you still only hear the first few.
      //
      // Web Audio is the right primitive for short overlapping sounds:
      // decode to a buffer once, then each play is a throwaway source node
      // costing nothing. No element limit, no refetch, no decode latency.
      var actx = null, buffer = null;

      function audioCtx() {
        if (!actx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (AC) { try { actx = new AC(); } catch (e) { actx = null; } }
        }
        return actx;
      }

      function decode(source) {
        buffer = null;
        var c = audioCtx();
        if (!c || !source) return;
        // A File reads directly; a URL has to be fetched first, which
        // fails on a file:// page - hence the Audio fallback below.
        var bytes = (typeof File !== 'undefined' && source instanceof File && source.arrayBuffer)
          ? source.arrayBuffer()
          : (typeof fetch === 'function'
              ? fetch(source).then(function (r) { return r.arrayBuffer(); })
              : null);
        if (!bytes) return;
        bytes.then(function (b) { return c.decodeAudioData(b); })
             .then(function (buf) { buffer = buf; }, function () { buffer = null; });
      }

      if (bundled) decode(bundled);

      refs.playSound = function () {
        if (!useSound.checked) return;
        var c = audioCtx();
        if (c && buffer) {
          // Suspended until the page has been interacted with; by the time
          // a cannon fires it has been, so this resolves immediately.
          if (c.state === 'suspended' && c.resume) c.resume();
          var src = c.createBufferSource();
          src.buffer = buffer;
          src.connect(c.destination);
          src.start(0);
          return;
        }
        // No Web Audio, or the clip could not be decoded (a file:// page
        // cannot fetch its own bundled mp3). One element per play, which
        // is where the "only the first few are audible" problem lives -
        // but some sound beats none.
        new Audio(soundUrl).play().catch(function (e) {
          soundNote.textContent = 'The browser would not play it: ' + e.name + '.';
        });
      };
    }

    // Readings
    var pRead = panel('What that gives you');
    var table = el('table', 'cbp-read');
    [['Terminal fall', 'rTerminal'], ['Peak rise', 'rPeak'],
     ['Launch speed left after 1s', 'rDecay'], ['Flutter range', 'rFlutter']].forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('th', null, r[0]));
      var td = el('td', null, '—');
      tr.appendChild(td);
      table.appendChild(tr);
      refs[r[1]] = td;
    });
    pRead.appendChild(table);
    refs.verdict = el('p', 'cbp-verdict');
    pRead.appendChild(refs.verdict);
    pRead.appendChild(el('p', 'cbp-hint',
      'Run through confetti.js’s own integrator over 900 frames — not a ' +
      'formula about it, so it cannot describe a model the code no longer uses.'));

    // Presets
    var pPre = panel('Saved setups');
    var pick = document.createElement('select');
    pick.setAttribute('aria-label', 'Saved setups');
    var nameIn = document.createElement('input');
    nameIn.type = 'text';
    nameIn.placeholder = 'name this setup';
    var preRow1 = el('div', 'cbp-row');
    preRow1.appendChild(pick);
    var loadB = el('button', 'cbp-btn cbp-btn--sm', 'Load');
    var delB = el('button', 'cbp-btn cbp-btn--sm', 'Delete');
    loadB.type = delB.type = 'button';
    preRow1.appendChild(loadB);
    preRow1.appendChild(delB);
    var preRow2 = el('div', 'cbp-row');
    preRow2.appendChild(nameIn);
    var saveB = el('button', 'cbp-btn cbp-btn--go cbp-btn--sm', 'Save');
    saveB.type = 'button';
    preRow2.appendChild(saveB);
    var lookRow = el('div', 'cbp-row');
    lookRow.appendChild(el('span', 'cbp-aim-deg', 'Built in'));
    Object.keys(LOOKS).forEach(function (name) {
      var b = el('button', 'cbp-btn cbp-btn--sm', name);
      b.type = 'button';
      b.addEventListener('click', function () {
        Object.keys(LOOKS[name]).forEach(function (k) {
          if (k in S) S[k] = LOOKS[name][k];
        });
        syncSliders();
        paint();
        preNote.textContent = 'Loaded the built-in “' + name + '” look.';
      });
      lookRow.appendChild(b);
    });

    var preNote = el('p', 'cbp-hint', 'Kept in this browser only.');
    pPre.appendChild(lookRow);
    pPre.appendChild(preRow1);
    pPre.appendChild(preRow2);
    pPre.appendChild(preNote);

    function readStore() {
      try { return JSON.parse(localStorage.getItem(STORE) || '{}'); }
      catch (e) { return {}; }
    }
    function writeStore(all) {
      try { localStorage.setItem(STORE, JSON.stringify(all)); return true; }
      catch (e) { preNote.textContent = 'Could not save — storage is blocked here.'; return false; }
    }
    function refreshPresets() {
      var all = readStore(), names = Object.keys(all).sort();
      pick.innerHTML = '';
      var none = document.createElement('option');
      none.value = '';
      none.textContent = names.length ? '— pick one —' : '— none saved —';
      pick.appendChild(none);
      names.forEach(function (n) {
        var o = document.createElement('option');
        o.value = n; o.textContent = n;
        pick.appendChild(o);
      });
    }
    saveB.addEventListener('click', function () {
      var n = (nameIn.value || '').trim();
      if (!n) { preNote.textContent = 'Give it a name first.'; return; }
      var all = readStore();
      // v3 is the 5x5 in phone-keypad order. Unstamped saves are v1 (the
      // 3x3); v2 is the same 5x5 upside down. Either way the positions get
      // moved on the way back in, rather than pointing at whatever cell
      // happens to share their old number.
      all[n] = {
        v: 3, S: Object.assign({}, S), cannons: cannons.slice(), palette: palette,
        // Random re-rolls on every press and Custom is edited in place,
        // so for those two the name alone would load a different set of
        // colours than the one that was saved.
        colors: OWNED[palette] ? (palettes[palette] || []).slice() : null
      };
      if (writeStore(all)) { nameIn.value = ''; refreshPresets(); pick.value = n; preNote.textContent = 'Saved “' + n + '”.'; }
    });
    loadB.addEventListener('click', function () {
      var saved = readStore()[pick.value];
      if (!saved) return;
      Object.keys(saved.S || {}).forEach(function (k) { if (k in S) S[k] = saved.S[k]; });
      cannons = (saved.cannons || cannons).slice();
      var from = saved.v === 3 ? null : saved.v === 2 ? padFromV2 : padFromV1;
      if (from) {
        cannons = cannons.map(function (c) {
          return { at: from(c.at), dir: c.dir };
        });
      }
      var name = saved.palette || palette;
      if (OWNED[name] && saved.colors && saved.colors.length) {
        palettes[name] = saved.colors.slice();
        if (name === 'Custom' && refs.repaintCustom) refs.repaintCustom();
      }
      selectPalette(name);
      syncSliders();
      paint();
      preNote.textContent = 'Loaded “' + pick.value + '”' + (
        !from ? '.'
          : saved.v === 2
            ? ' — saved before the pad was flipped to phone order, so its positions moved.'
            : ' — saved on the old 3×3 pad, so its positions moved.');
    });
    delB.addEventListener('click', function () {
      var all = readStore();
      delete all[pick.value];
      if (writeStore(all)) { refreshPresets(); preNote.textContent = 'Deleted.'; }
    });

    // Settings to copy
    var pEmit = panel('Settings');
    refs.emit = el('pre', 'cbp-emit');
    pEmit.appendChild(refs.emit);
    var copyB = el('button', 'cbp-btn cbp-btn--sm', 'Copy');
    copyB.type = 'button';
    copyB.addEventListener('click', function () {
      navigator.clipboard.writeText(refs.emit.textContent).then(function () {
        copyB.textContent = 'Copied';
        setTimeout(function () { copyB.textContent = 'Copy'; }, 1400);
      }, function () { copyB.textContent = 'Select it instead'; });
    });
    pEmit.appendChild(copyB);

    // ── the fire row, above everything ────────────────────────────────
    var bar = el('div', 'cbp-row');
    var fireB = el('button', 'cbp-btn cbp-btn--go', 'Fire');
    fireB.type = 'button';
    fireB.addEventListener('click', function () {
      // fire() plays a sound per cannon; the click itself makes no noise.
      fire();
    });
    bar.appendChild(fireB);
    var resetB = el('button', 'cbp-btn', 'Reset');
    resetB.type = 'button';
    resetB.addEventListener('click', function () {
      S = Object.assign({}, DEFAULTS, opts.defaults || {});
      cannons = defaultCannons();
      // Palette was never restored here. A preset saves {S, cannons, palette},
      // so the panel already counts it as part of the state - leaving it out
      // meant Reset changed the numbers, kept the colours, and still said it
      // had gone back to the shipped settings.
      selectPalette(DEFAULT_PALETTE);
      syncSliders();
      paint();
      status('Back to the shipped settings.');
    });
    bar.appendChild(resetB);
    refs.status = el('span', 'cbp-hint');
    refs.status.setAttribute('role', 'status');
    bar.appendChild(refs.status);

    host.appendChild(bar);
    host.appendChild(grid);

      // The controls are long. Tuning something near the bottom meant scrolling
      // back up to fire, changing one thing, and scrolling up again - enough
      // friction that people stop experimenting.
      //
      // It appears only once the real button has scrolled out of view, so it is
      // never a duplicate of a control already on screen, and it calls the same
      // fire() rather than a copy of it.
      var floatB = el('button', 'cbp-btn cbp-btn--go cbp-fire-float', 'Fire');
      floatB.type = 'button';
      floatB.hidden = true;
      floatB.setAttribute('aria-label', 'Fire confetti');
      floatB.addEventListener('click', function () { fire(); });
      // Mounted inside the host, not on <body>. The panel's colours come from
      // --cbp-* variables scoped to .cbp and overridden by the host page, so a
      // button parked on <body> is outside that scope: --cbp-accent resolved to
      // nothing and the background computed rgba(0,0,0,0) - an invisible button
      // with text showing through it. position:fixed still pins it to the
      // viewport from here, since nothing above it establishes a containing
      // block.
      host.appendChild(floatB);

      function panelOnScreen() {
        var r = host.getBoundingClientRect();
        return r.bottom > 0 && r.top < (window.innerHeight || 0);
      }

      // A sticky or fixed header hides content behind it, but the viewport
      // does not know that: IntersectionObserver still counts the panel's Fire
      // button as visible while it sits underneath one. That left a stretch of
      // scrolling with the real button covered and the floating one not yet
      // shown - no usable Fire button at all.
      //
      // So the root box is shrunk at the top by whatever is pinned there.
      // Measured rather than configured, because this ships into other
      // people's pages and their header is not ours to know. opts.topInset
      // overrides it when the guess is wrong.
      function topInset() {
        if (typeof opts.topInset === 'number') return opts.topInset;
        var max = 0;
        var all = document.body ? document.body.getElementsByTagName('*') : [];
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (el === floatB || host.contains(el)) continue;
          var cs = window.getComputedStyle(el);
          if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
          var r = el.getBoundingClientRect();
          // Pinned across the top: full-width enough to cover, and sitting at
          // the top edge rather than merely stuck somewhere further down.
          if (!r.height || r.width < window.innerWidth * 0.5) continue;
          if (r.top > 8) continue;
          if (r.bottom > max) max = r.bottom;
        }
        return Math.round(max);
      }

      if (typeof IntersectionObserver === 'function') {
        var fireWatch = null;
        function watchFire() {
          if (fireWatch) fireWatch.disconnect();
          fireWatch = new IntersectionObserver(function (entries) {
            floatB.hidden = entries[0].isIntersecting || !panelOnScreen();
          }, { threshold: 0, rootMargin: '-' + topInset() + 'px 0px 0px 0px' });
          fireWatch.observe(fireB);
        }
        watchFire();

        // Header heights change with the viewport, so the inset is re-measured
        // rather than taken once at mount.
        var resizeT = null;
        window.addEventListener('resize', function () {
          clearTimeout(resizeT);
          resizeT = setTimeout(watchFire, 150);
        });

        // Hidden when the panel itself is gone, so it never floats over an
        // unrelated part of a page that mounts this among other content.
        new IntersectionObserver(function (entries) {
          if (!entries[0].isIntersecting) floatB.hidden = true;
        }, { threshold: 0 }).observe(host);
      }


    function syncSliders() {
      SLIDERS.forEach(function (s) {
        var k = s[1];
        if (refs['s_' + k]) {
          refs['s_' + k].value = S[k];
          refs['o_' + k].textContent = refs['f_' + k](S[k]);
        }
      });
      if (refs.syncLoop) refs.syncLoop();
    }

    function text() {
      return cannons.map(function (c) {
        return c.dir === null ? String(c.at) : c.at + '@' + Math.round(c.dir);
      }).join(', ');
    }

    function paint() {
      [].forEach.call(pad.children, function (b) {
        var n = parseFloat(b.getAttribute('data-at'));
        b.setAttribute('aria-pressed',
          String(cannons.some(function (c) { return c.at === n; })));
      });
      listInput.value = text();
      paintAims();
      readings();
    }

    refreshPresets();
    paint();
    status('Ready.');

    return {
      fire: fire,
      get settings() { return Object.assign({}, S); },
      get positions() { return cannons.slice(); }
    };
  }

  return { mount: mount, DEFAULTS: DEFAULTS };
})();
