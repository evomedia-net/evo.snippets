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
      confettiBurst({ origin: 1 });           // from the top-left corner
      confettiBurst({ origin: 25, direction: 315, count: 200 });
    </script>

It creates its own canvas on the first call and removes nothing - call it as
often as you like.

Firing positions
----------------

Positions are numbered like a phone keypad - 1 2 3 across the top - on a
5×5 grid, so the corner keys are the screen corners and 13 is dead centre:

     1  2  3  4  5      top-left    ..    top    ..    top-right
     6  7  8  9 10
    11 12 13 14 15      left        ..   centre  ..    right
    16 17 18 19 20
    21 22 23 24 25      bottom-left ..   bottom  ..    bottom-right

Phone order, not the calculator order a numeric keypad uses - that one runs
7 8 9 along the top. Both are fairly called "a numpad"; only one of them is
the layout people touch every day. Reading 1 2 3 at the top of a grid and
having it mean the bottom of the screen is a trap you fall into once per
sitting.

Each key carries its own aim as well as its position, because the two are
not independent: a corner cannon firing straight up throws half its pieces
off-screen, and one at the top throws all of them.

This was a 3×3 until the half-steps earned cells of their own. The nine
positions it had are all still here - 1 3 5 11 13 15 21 23 25 keep their old
origins and their old hand-tuned aims, so a corner burst looks exactly as it
did. The sixteen new cells aim inward with a slight upward bias, which lands
within a few degrees of the tuned nine.

A row of cannons across the top is 1, 2, 3, 4, 5 - whole numbers reach every
position now, where the 3×3 needed 7, 7.5, 8, 8.5, 9 to say the same thing.

Fractions still slide between neighbouring keys, position and aim together, and
any fraction works, not only halves: 4.1 is a tenth of the way from 4 to
5. Consecutive keys are adjacent within a row; the four that step between
rows (5.5, 10.5, 15.5, 20.5) slide diagonally across the screen:
defined, and rarely what anyone wants.

A volley is just repeated calls - the renderer draws one burst, and the caller
decides how many and how far apart:

    [21, 25, 5, 1].forEach(function (at, i) {
      setTimeout(function () { confettiBurst({ origin: at, count: 60 }); }, i * 220);
    });

loop does the simplest version of this for you - the same burst again, up to
ten times:

    confettiBurst({ origin: 13, loop: 3, loopDelay: 600 });

The playground
--------------

demo.html is a full control panel - every firing position, every force,
live readings, and the settings ready to paste back into code. Open it and
play; nothing to install.

The palette row carries a Random button that re-rolls on every press:
six hues spaced round the wheel at one lightness, because mixing light and
dark makes the light pieces read as gaps in the burst rather than as
colours. Swatches under the row show whichever palette is in hand, so you
can see what you rolled without firing.

Loop has a Repeat every control beside it. It has to be a control
rather than a constant: pieces live age seconds, so any gap much shorter
than that merges the volleys into one continuous cloud and the checkbox
looks broken.

Sound is decoded once into a Web Audio buffer and each play is a
throwaway source node. A fresh new Audio(src) per cannon looks equivalent
and is not - every one is a media element that fetches and decodes the clip
again, and a row of five firing 200 ms apart asks for five simultaneous
decodes of the same file. play() resolves for all of them and you still
hear only the first few. The Audio path remains as a fallback for a
file:// page, which cannot fetch its own bundled clip.

Below it, a 3 × 2 grid of your own six colours. Each cell opens the
OS colour picker, then wears the colour it holds and prints its hex - the
control and the readout are the same object, so there is nothing else to
look at to know what you chose. Editing any of them selects Custom.

The hex is printed in the inverse of the cell's colour, so #ffffff
reads as #000000. An inverse only works at the ends of the range,
though: #808080 inverts to #7f7f7f, a contrast ratio of 1.0, and the
middle of the range is exactly where a colour picker leaves you. Where the
inverse does not clear 4.5:1 the label falls back to whichever of black or
white does.

Random and Custom are the two palettes the panel rewrites rather than
reads, so a saved setup on either keeps the exact colours it was saved
with. A setup on one of the host's own palettes keeps only the name, and
so follows the host if those colours later change.

The panel is a component, not page markup:

    <link rel="stylesheet" href="playground.css">
    <div id="playground"></div>
    <script src="confetti.js"></script>
    <script src="playground.js"></script>
    <script>confettiPlayground.mount('#playground', { sound: true });</script>

It builds its own DOM, so a host supplies an empty div rather than a page
full of the right ids. That matters because two pages wanted this panel -
this demo and a website - and markup copied between them is markup that
drifts: one gains a control and the other quietly does not.

Colours come from --cbp-* custom properties, so a host restyles it with
its own design tokens instead of overriding rules:

    #playground { --cbp-accent-override: #336699; --cbp-font-override: var(--font-sans); }

mount() returns a handle with fire(), settings and positions, for a
page that wants to drive it from elsewhere.

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
| origin | { x: 0.5, y: 0.62 } | 1-25 for a keypad position on the 5×5 grid (any fraction allowed), or {x, y} in fractions of the viewport |
| direction | position's own aim, else 0 | a compass: 0 straight up, 90 right, 180 straight down, 270 left. Wraps, so 350 and -10 are the same aim |
| spread | 70 | degrees of cone around the aim |
| velocity | 34 | launch speed, px per frame at 60fps, applied straight to position |
| gravity | 1 | multiplier on the built-in constant |
| acceleration | 5 | how fast the launch speed bleeds off, on a 1-10 scale where 5 is the natural-looking rate. The multiplier is acceleration / 5, so 2.5 is half the pull and 7.5 half again as much. It scales gravity rather than replacing it - gravity is the raw constant, this is the dial. 1 is the floor because 0 is not a slow burst, it is no fall at all. Note the rise is drag-limited on this renderer, so the peak height moves about 27% across the whole range while the fall speed changes a great deal |
| loop | 1 | fire the same burst again, up to 10 times. Clamped, because a runaway loop is a browser you have to kill |
| loopDelay | 700 | milliseconds between repeats. Worth setting deliberately: a gap much shorter than age lands each volley inside the last one, and the loop reads as a single long burst rather than as repeats. The playground defaults it to 2500 against its 9-second age for exactly that reason |
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
