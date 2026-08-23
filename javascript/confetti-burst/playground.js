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

  // What the renderer ships, so "Reset" means something exact.
  var DEFAULTS = {
    count: 165, spread: 55, velocity: 48, scalar: 1.15, stagger: 500,
    gravity: 0.8, gravityBase: 0.22, dragFace: 0.930, dragEdge: 0.985,
    tumble: 1, sway: 1, age: 9
  };

  // Mirrors confetti.js's own PAD aims, for the readout only. Kept as a
  // plain map because the renderer does not expose one - if that ever
  // changes, read it from there instead of keeping a second copy.
  var PAD_AIM = { 1: 35, 2: 0, 3: -35, 4: 65, 5: 0, 6: -65, 7: 130, 8: 180, 9: -130 };

  var SLIDERS = [
    ['burst', 'count', 'Pieces', 20, 400, 5, function (v) { return String(v); }],
    ['burst', 'scalar', 'Size', 0.4, 3, 0.05, function (v) { return '×' + (+v).toFixed(2); }],
    ['burst', 'velocity', 'Launch speed', 10, 110, 1, function (v) { return v + ' px/f'; }],
    ['burst', 'spread', 'Spread', 10, 180, 5, function (v) { return v + '°'; }],
    ['burst', 'stagger', 'Stagger', 0, 1200, 25, function (v) { return v + ' ms'; }],
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
    'Four corners': [1, 3, 9, 7],
    'Across the top': [7, 7.5, 8, 8.5, 9],
    'Across the bottom': [1, 1.5, 2, 2.5, 3],
    'Centre': [5]
  };

  var STORE = 'confettiPlaygroundPresets';

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
    var palette = opts.palette || 'Brand';
    var palettes = opts.palettes || PALETTES;
    // {at, dir} - dir null means "use the position's own aim", which is
    // what lets one cannon be turned without disturbing the others.
    var cannons = [{ at: 1, dir: null }, { at: 2, dir: null }, { at: 3, dir: null }];

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
      var per = Math.max(5, Math.round(S.count / cannons.length));
      cannons.forEach(function (c, i) {
        setTimeout(function () {
          var call = {
            origin: c.at, count: per, spread: S.spread, velocity: S.velocity,
            gravity: S.gravity, scalar: S.scalar, age: S.age,
            colors: palettes[palette]
          };
          // Omitted rather than sent as null, so the renderer falls back
          // to the position's own aim instead of reading null as a bearing.
          if (c.dir !== null) call.direction = c.dir;
          try { window.confettiBurst(call); }
          catch (e) { status('Burst failed: ' + e.message); }
        }, i * S.stagger);
      });
      status(cannons.length === 1
        ? 'Fired from position ' + cannons[0].at + '.'
        : cannons.length + ' cannons, ' + S.stagger + 'ms apart.');
    }

    function status(msg) { if (refs.status) refs.status.textContent = msg; }

    // ── the same integrator confetti.js runs ──────────────────────────
    // Not a formula about it: a closed form would describe a model the
    // renderer no longer uses the moment either one changes.
    function simulate(frames) {
      var vy = -S.velocity, y = 0, peak = 0, tilt = 0;
      for (var f = 0; f < frames; f++) {
        tilt += 0.10 * S.tumble;
        var face = Math.abs(Math.cos(tilt));
        vy *= S.dragEdge + (S.dragFace - S.dragEdge) * face;
        vy += S.gravity * S.gravityBase;
        y += vy;
        if (y < peak) peak = y;
      }
      return { peak: -peak, vy: vy };
    }

    function readings() {
      var long = simulate(900), short = simulate(60);
      var settle = Math.abs(long.vy) * 60;
      var left = Math.abs(short.vy) / S.velocity;
      var g = S.gravity * S.gravityBase;
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
        '  count: ' + Math.max(5, Math.round(S.count / Math.max(1, cannons.length))) + ',\n' +
        '  spread: ' + S.spread + ',\n' +
        '  velocity: ' + S.velocity + ',\n' +
        '  gravity: ' + (+S.gravity).toFixed(2) + ',\n' +
        '  scalar: ' + (+S.scalar).toFixed(2) + ',\n' +
        '  age: ' + (+S.age).toFixed(1) + '\n' +
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
      'Numbered like a numpad, so 1 3 7 9 are the four screen corners. Pick as ' +
      'many as you like — they fire in the order shown.'));
    var pad = el('div', 'cbp-pad');
    [7, 8, 9, 4, 5, 6, 1, 2, 3].forEach(function (n) {
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
          at: Math.round(parseFloat(bits[0]) * 2) / 2,
          dir: bits.length > 1 && bits[1] !== '' ? parseFloat(bits[1]) : null
        };
      }).filter(function (c) { return isFinite(c.at) && c.at >= 1 && c.at <= 9; });
      paint();
    });
    pPos.appendChild(listInput);
    pPos.appendChild(el('p', 'cbp-hint',
      'Halves land between neighbours — 7, 7.5, 8, 8.5, 9 is five across the top. ' +
      'Add @ and an angle to aim one: 7@90.'));

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
        var sl = document.createElement('input');
        sl.type = 'range'; sl.min = -180; sl.max = 180; sl.step = 5;
        sl.value = Math.round(aimOf(c));
        sl.setAttribute('aria-label', 'Aim for position ' + c.at);
        var deg = el('span', 'cbp-aim-deg');
        function label() {
          var d = ((Math.round(+sl.value) % 360) + 360) % 360;
          var word = d === 0 ? ' up' : d === 180 ? ' down' : d === 90 ? ' right' : d === 270 ? ' left' : '';
          deg.textContent = sl.value + '°' + word;
        }
        label();
        sl.addEventListener('input', function () {
          c.dir = parseFloat(sl.value);
          label();
          listInput.value = text();
          readings();
        });
        row.appendChild(sl);
        row.appendChild(deg);
        aims.appendChild(row);
      });
    }

    // The burst
    var pBurst = panel('The burst');
    // The air
    var pAir = panel('The air');
    SLIDERS.forEach(function (s) {
      slider(s[0] === 'burst' ? pBurst : pAir, s[1], s[2], s[3], s[4], s[5], s[6]);
    });
    pAir.appendChild(el('p', 'cbp-hint',
      'The gap between the two drags is the flutter: face-on the sheet floats, ' +
      'edge-on it knifes down.'));

    // Palette
    var pPal = panel('Colour');
    var palRow = el('div', 'cbp-row');
    Object.keys(palettes).forEach(function (name) {
      var b = el('button', 'cbp-btn cbp-btn--sm', name);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(name === palette));
      b.addEventListener('click', function () {
        palette = name;
        [].forEach.call(palRow.children, function (o) {
          o.setAttribute('aria-pressed', String(o.textContent === name));
        });
      });
      palRow.appendChild(b);
    });
    pPal.appendChild(palRow);

    // Sound, if the host asked for it
    if (opts.sound) {
      var useSound = document.createElement('input');
      useSound.type = 'checkbox';
      var check = el('label', 'cbp-check');
      check.appendChild(useSound);
      check.appendChild(el('span', null, 'Use sound'));
      pPal.appendChild(check);

      var picker = el('div', 'cbp-row');
      picker.hidden = true;
      var filePick = document.createElement('input');
      filePick.type = 'file';
      filePick.accept = 'audio/*';
      picker.appendChild(filePick);
      pPal.appendChild(picker);

      var soundNote = el('p', 'cbp-hint',
        'Browsers refuse to play audio until the page has been interacted with, ' +
        'so sound is the caller’s job, not the renderer’s.');
      pPal.appendChild(soundNote);

      var soundUrl = opts.sound === true ? 'confetti.mp3' : opts.sound;
      var objectUrl = null;
      useSound.addEventListener('change', function () { picker.hidden = !useSound.checked; });
      filePick.addEventListener('change', function () {
        // Revoked before replacing: each object URL pins its blob in
        // memory until released.
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        var f = filePick.files && filePick.files[0];
        objectUrl = f ? URL.createObjectURL(f) : null;
        soundUrl = objectUrl || (opts.sound === true ? 'confetti.mp3' : opts.sound);
        soundNote.textContent = f
          ? 'Using ' + f.name + '. Nothing is uploaded — it is read from your machine.'
          : 'Using the bundled clip.';
      });
      refs.playSound = function () {
        if (!useSound.checked) return;
        // A fresh Audio each time, so a second burst overlaps rather than
        // restarting the first.
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
    var preNote = el('p', 'cbp-hint', 'Kept in this browser only.');
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
      all[n] = { S: Object.assign({}, S), cannons: cannons.slice(), palette: palette };
      if (writeStore(all)) { nameIn.value = ''; refreshPresets(); pick.value = n; preNote.textContent = 'Saved “' + n + '”.'; }
    });
    loadB.addEventListener('click', function () {
      var saved = readStore()[pick.value];
      if (!saved) return;
      Object.keys(saved.S || {}).forEach(function (k) { if (k in S) S[k] = saved.S[k]; });
      cannons = (saved.cannons || cannons).slice();
      palette = saved.palette || palette;
      syncSliders();
      paint();
      preNote.textContent = 'Loaded “' + pick.value + '”.';
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
      if (refs.playSound) refs.playSound();
      fire();
    });
    bar.appendChild(fireB);
    var resetB = el('button', 'cbp-btn', 'Reset');
    resetB.type = 'button';
    resetB.addEventListener('click', function () {
      S = Object.assign({}, DEFAULTS, opts.defaults || {});
      cannons = [{ at: 1, dir: null }, { at: 2, dir: null }, { at: 3, dir: null }];
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

    function syncSliders() {
      SLIDERS.forEach(function (s) {
        var k = s[1];
        if (refs['s_' + k]) {
          refs['s_' + k].value = S[k];
          refs['o_' + k].textContent = refs['f_' + k](S[k]);
        }
      });
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
