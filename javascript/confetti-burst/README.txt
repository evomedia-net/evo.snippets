Evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
Created by Kelly Michels · dev@evomedia.net
Licensed under the MIT License. See LICENSE.

confetti-burst
==============

A confetti burst that falls like paper. One file, no dependencies, no build
step, no framework.

Open demo.html in a browser to see it. Nothing to install and nothing to
serve - it is a file you double-click.

Why it looks different
----------------------

Most confetti effects give each piece a velocity and gravity, and nothing
else. Velocity only ever grows, so every piece flies a clean ballistic arc and
leaves the screen at launch speed. That is how a spark moves.

Paper is nearly all surface and almost no mass. It loses its launch speed in a
fraction of a second, then descends slowly, swaying. Four forces, not one:

| | |
| --- | --- |
| gravity | the easy one |
| drag | velocity is multiplied by a retention factor each frame, not clamped. The launch reads as a pop that bleeds off, and terminal velocity falls out of the arithmetic (g / (1 - keep)) rather than being pinned there - about 270 px/s by default, slow enough to follow with your eye |
| tumble | the piece is a flat sheet turning end over end, and the drag follows its area into the airflow. Face-on it keeps 93% of its speed and floats; edge-on it keeps 98.5% and knifes downward. That alternation is the flutter - it is not an effect layered on top |
| sway | a slow sine applied to position rather than velocity, so the drag cannot damp it away. The sway matters most at the bottom of the screen, when everything else has slowed to a drift |

Each piece is also drawn in two shades and flips between them as it turns
edge-on, which is a sheet catching the light.

Use
---

    <script src="confetti.js"></script>
    <script>
      confettiBurst();                        // straight up from the middle
      confettiBurst({ origin: 7 });           // from the top-left corner
      confettiBurst({ origin: 3, direction: 315, count: 200 });
    </script>

It creates its own canvas on the first call and removes nothing - call it as
often as you like.

Firing positions
----------------

Positions are numbered like a numpad, so the corner keys are the screen
corners:

    7  8  9      top-left     top      top-right
    4  5  6      left       centre     right
    1  2  3      bottom-left  bottom   bottom-right

Each key carries its own aim as well as its position, because the two are
not independent: a corner cannon firing straight up throws half its pieces
off-screen, and one at the top throws all of them.

Fractions slide between neighbouring keys - position and aim together - so a
row of cannons is written 7, 7.5, 8, 8.5, 9: five evenly spaced across the
top edge, each leaning a little further round than the last. Consecutive keys
are adjacent within a row, so every row takes half steps. 3.5 and 6.5 are
the two that step between rows and slide diagonally across the middle: defined,
and rarely what anyone wants.

A volley is just repeated calls - the renderer draws one burst, and the caller
decides how many and how far apart:

    [1, 3, 9, 7].forEach(function (at, i) {
      setTimeout(function () { confettiBurst({ origin: at, count: 60 }); }, i * 220);
    });

Sound
-----

The renderer has no audio, on purpose. Browsers refuse to play sound
until the page has been interacted with, and only the caller knows whether
that has happened - a burst fired by a server push on a page nobody has
touched throws NotAllowedError every time. So sound is the caller's job:

    document.getElementById('celebrate').addEventListener('click', function () {
      new Audio('confetti.mp3').play();   // inside the gesture, so it is allowed
      confettiBurst({ origin: 5 });
    });

demo.html has a Use sound checkbox and a file picker, so you can try it
with the bundled clip or any audio file on your machine - nothing is uploaded.

confetti.mp3 is third-party content and not covered by this repository's
MIT licence. See NOTICE.md (NOTICE.md) before shipping it anywhere.

Options
-------

| Option | Default | What it does |
| --- | --- | --- |
| count | 140 | pieces in this burst |
| origin | { x: 0.5, y: 0.62 } | 1-9 for a numpad position (fractions allowed), or {x, y} in fractions of the viewport |
| direction | position's own aim, else 0 | a compass: 0 straight up, 90 right, 180 straight down, 270 left. Wraps, so 350 and -10 are the same aim |
| spread | 70 | degrees of cone around the aim |
| velocity | 34 | launch speed, px per frame at 60fps, applied straight to position |
| gravity | 1 | multiplier on the built-in constant |
| age | 9 | seconds a piece lives. Most leave the bottom of the screen well before this, so it mainly governs the ones that drift |
| scalar | 1 | size multiplier |
| drift | 0 | a steady sideways push, for wind |
| roundRatio | 0 | fraction drawn as circles instead of rectangles |
| colors | six-hue default | your palette. Six or so hues of similar lightness - a much lighter one reads as a gap in the burst |

angle is also accepted: the raw canvas convention, where -90 is up. Use
direction unless you have a reason not to; direction wins if both are given.

Tuning
------

window.confettiBurstTuning overrides the physics constants live, and is read
once per frame - so a slider moves confetti already in the air:

    window.confettiBurstTuning = {
      gravity: 0.22,     // per-frame constant
      dragFace: 0.930,   // speed kept per frame, sheet flat to the airflow
      dragEdge: 0.985,   // ...and turned edge-on. The GAP between these is the flutter
      tumble: 1,         // multiplier on how fast pieces turn
      sway: 1            // multiplier on the sideways slide
    };

Nothing sets it by default. It exists so a tuning page drives this renderer
rather than a copy - a copy lets the numbers someone dialled in drift from the
numbers that ship, which defeats the point of tuning.

The parts that are not the physics
----------------------------------

Three rules that are not negotiable, and are the reason this is worth copying
rather than rewriting:

- prefers-reduced-motion is read at fire time, not at load. Someone who
  changes the OS setting mid-session is respected by the very next burst.
  Full-screen particle motion is a vestibular trigger; the effect degrades to a
  still scatter that fades in and out, so the moment is still marked and
  nothing travels across the screen.
- pointer-events: none. The canvas covers the viewport, so without it
  every click in your app lands on confetti instead of your app.
- z-index: 9400 - high enough to clear dialogs and tooltips, low enough
  to sit under a toast. Confetti is the garnish; the message that says what
  actually happened has to stay readable through it. Adjust it to your stack,
  but keep it below whatever announces the outcome.

Two more worth knowing:

- The canvas is aria-hidden. Confetti is decorative, so it says nothing to a
  screen reader - which means **the outcome it celebrates still needs
  announcing** through a live region or a toast. The animation is the garnish;
  the toast is the message.
- The animation loop stops entirely when the last piece is gone. A permanently
  running requestAnimationFrame on a long-lived page is background CPU spent
  on nothing.

Browser support
---------------

Any browser with <canvas> and requestAnimationFrame. No ES modules, no
optional chaining, no arrow functions in the renderer - it parses in old
engines as well as new ones.
