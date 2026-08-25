# evo.confetti — setup guide

A step-by-step guide to adding confetti to a web page.

**You do not need to know much to do this.** If you can save a file and open it
in a browser, you can finish this in about five minutes. There is nothing to
install, no account to make, no command line, and no "build step" — you copy one
file and add three lines.

---

## What you need

1. **A text editor.** Notepad on Windows or TextEdit on a Mac will do. If you
   want something nicer and free, [VS Code](https://code.visualstudio.com) is the
   common choice.
2. **A web browser.** The one you are reading this in.

That is the whole list.

---

# Part 1 — Get it working (5 minutes)

We will make a page from scratch that fires confetti when you click a button.
Once that works, Part 2 shows how to put it into a site you already have.

## Step 1 — Make a folder

Make a new folder anywhere — your Desktop is fine. Call it `confetti-test`.

## Step 2 — Put `confetti.js` in it

Copy the file `confetti.js` into that folder.

Your folder now looks like this:

```
confetti-test/
  confetti.js
```

## Step 3 — Make the web page

**Shortcut:** a finished version of this page ships with the code as
`example.html`. Copy it into your folder next to `confetti.js`, double-click it,
and skip to Step 4. It is the same page built below, so read on if you would
rather see how it is put together.

In your text editor, create a new file, paste in **all** of the text below, and
save it into the same folder with the name `index.html`.

> **Saving in Notepad:** choose *File → Save As*, set **Save as type** to
> *All Files*, then type `index.html`. If you skip that, Notepad saves it as
> `index.html.txt` and it will not open as a web page.

```html
<!DOCTYPE html>
<html>
  <head>
    <title>My confetti page</title>
  </head>
  <body>

    <h1>Congratulations!</h1>

    <button type="button" id="party">Click me</button>

    <script src="confetti.js"></script>
    <script>
      document.getElementById('party').addEventListener('click', function () {
        confettiBurst();
      });
    </script>

  </body>
</html>
```

Your folder now looks like this:

```
confetti-test/
  confetti.js
  index.html
```

## Step 4 — Open it

Double-click `index.html`. It opens in your browser.

Click the button. **You should get confetti.**

That is it — you are done. There is no server to run and nothing to upload. The
page works straight off your computer.

---

## What those three lines actually do

Worth understanding, because you will be moving them around in Part 2.

```html
<script src="confetti.js"></script>
```

This loads the confetti code. It has to come **before** any code that uses it,
which is why it sits above the second `<script>` block. `src="confetti.js"` means
*"the file called confetti.js, in the same folder as this page."*

```html
<script>
  document.getElementById('party').addEventListener('click', function () {
    confettiBurst();
  });
</script>
```

Read it right to left: *when the thing with `id="party"` is **clicked**, run
`confettiBurst()`.* The `id="party"` on the button is what connects the two — if
you rename one you must rename the other.

`confettiBurst()` is the whole interface. Calling it with nothing at all gives
you a sensible default burst.

---

# Part 2 — Put it in your own site

## Step 1 — Copy the file into your site

Put `confetti.js` wherever your site keeps its other files. Many sites have a
folder called `js`, `assets`, `static` or `public`. If yours does not, next to
your HTML file is perfectly fine.

## Step 2 — Load it on the page

Add this line just before the closing `</body>` tag:

```html
<script src="confetti.js"></script>
```

**The path has to match where you put the file.** This trips up nearly everyone
the first time:

| Where the file is | What to write |
| --- | --- |
| Same folder as the page | `src="confetti.js"` |
| In a `js` folder | `src="js/confetti.js"` |
| In a folder, page is one level deep | `src="../js/confetti.js"` |
| Anywhere, using a full path from the site root | `src="/js/confetti.js"` |

If you are unsure, the last one — starting with `/` — is usually the safest on a
real website.

## Step 3 — Fire it

Add a second `<script>` block **after** the first, with whichever of these you
want.

**When a button is clicked**

```html
<button type="button" id="party">Celebrate</button>

<script>
  document.getElementById('party').addEventListener('click', function () {
    confettiBurst();
  });
</script>
```

**As soon as the page finishes loading**

```html
<script>
  window.addEventListener('load', function () {
    confettiBurst();
  });
</script>
```

**When a form is submitted**

```html
<script>
  document.getElementById('signup-form').addEventListener('submit', function () {
    confettiBurst();
  });
</script>
```

---

# Part 3 — Make it yours

`confettiBurst()` takes an optional list of settings. Everything is optional, so
change one thing at a time and see what happens.

```js
confettiBurst({
  count: 200,
  origin: 23
});
```

The four worth trying first:

| Setting | Try | What it does |
| --- | --- | --- |
| `count` | `50` … `400` | How many pieces. Must be between 1 and 2000. |
| `origin` | `1` … `25` | Where it fires from. See the grid below. |
| `velocity` | `20` … `80` | How hard it is thrown. |
| `colors` | `['#ff0000', '#00ff00']` | Your own colours. |

### Choosing a position

`origin` can be a number from 1 to 25, laid out over the screen like the keys on
a phone:

```
 1  2  3  4  5      <- top of the screen
 6  7  8  9 10
11 12 13 14 15      <- 13 is dead centre
16 17 18 19 20
21 22 23 24 25      <- bottom of the screen
```

So `origin: 23` fires up from the bottom middle, and `origin: 21` from the bottom
left corner. The edges aim themselves inward, so confetti fired from a corner
still lands on the screen.

### Two cannons

Fire it more than once, slightly apart:

```js
confettiBurst({ origin: 21 });
setTimeout(function () { confettiBurst({ origin: 25 }); }, 150);
```

`setTimeout` means *"wait this many milliseconds, then do it"*. The small gap is
what makes it read as two cannons rather than one big burst.

The full list of settings is in [README.md](README.md).

---

# If something did not work

Work down this list — it is roughly in order of how often each one is the cause.

### Nothing happens when I click

**Check the file name first.** In your folder, is the file called `index.html`
or `index.html.txt`? Windows hides the `.txt` by default. In File Explorer turn
on *View → File name extensions* to see the real name.

**Then check for a typo in the id.** The `id="party"` on the button and the
`getElementById('party')` in the script have to match exactly, including
capital letters.

### I get an error mentioning `confettiBurst`

Open the browser console — press **F12**, then click the **Console** tab.

If it says *`confettiBurst is not defined`*, the browser could not find
`confetti.js`. Almost always the path is wrong. Click the **Network** tab,
reload, and look for `confetti.js` in red with a **404** next to it. 404 means
"no file there" — go back to the table in Part 2, Step 2.

### The confetti is behind something / I cannot see it

The confetti draws on a layer over the whole page, but some page layouts can trap
it underneath. If your page has a big wrapper element with a CSS `transform`,
`filter`, or its own `z-index`, try moving your `<script>` block out of that
element, closer to the bottom of the page.

### It looks like a firework, not paper

It is being thrown too hard. Lower `velocity`, or raise `acceleration` so it
slows down faster:

```js
confettiBurst({ velocity: 25, acceleration: 7 });
```

Real paper loses its speed almost immediately and then flutters down — that is
the difference between confetti and sparks. There is a
[write-up of the physics](https://evomedia.net/evo-confetti-math.html) if you are
curious.

### It is slow, or my phone struggles

Lower `count`. Every piece is drawn individually, so 400 pieces is four times the
work of 100. Around 200 is comfortable on a laptop, around 80 on a phone.

### I asked for 5000 pieces and got 2000

That is on purpose. `count` is capped at 2000, and the browser console will tell
you when it caps. Beyond that a page can freeze, which is a worse experience than
slightly less confetti.

---

# Checking it is installed

Open the console (**F12** → **Console**), type this and press Enter:

```js
typeof confettiBurst
```

- `"function"` — installed correctly.
- `"undefined"` — the file did not load. See *I get an error mentioning
  confettiBurst* above.

Then type this and press Enter to fire one from the console:

```js
confettiBurst()
```

---

# Removing it

Delete the `<script src="confetti.js"></script>` line and the file. Nothing else
is left behind — it does not save anything to the browser, and it adds nothing to
the page until the first time you fire it.

---

# One thoughtful extra

Some people get motion sickness from animation, and every operating system has a
setting for that. If you would like to respect it, wrap your call like this:

```js
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  confettiBurst();
}
```

That means *"unless this person asked for less motion, fire the confetti."* It is
two lines and it is a kind thing to do.
