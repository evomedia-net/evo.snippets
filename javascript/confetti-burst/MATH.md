<!--
Evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
Created by Kelly Michels · kelly@evomedia.net
Licensed under the MIT License. See LICENSE.
-->

# evo.confetti — the math

Four of these are exact and one is an honest approximation. Each section ends by
naming the line of `confetti.js` it governs — including the two places the
renderer deliberately departs from the physics, and why.

Notation: `v` is velocity, `g` gravity, `k` the drag coefficient `b/m`, `dt` the
frame time, `θ` the tumble angle.

---

## 1 · The drag ODE

Linear (Stokes) drag on a light particle:

```
dv/dt = g − kv
```

First-order linear, so separate and integrate:

```
∫ dv / (g − kv) = ∫ dt   ⇒   −(1/k) ln(g − kv) = t + C
```

With `v(0) = v₀`:

```
v(t) = g/k + (v₀ − g/k) · e^(−kt)
```

As `t → ∞` the exponential dies and leaves terminal velocity `v∞ = g/k` —
exactly where drag balances gravity, which you can also read off by setting
`dv/dt = 0`.

---

## 2 · Why multiplying by a constant is exact

Take the horizontal case, no gravity: `dv/dt = −kv`, so `v(t) = v₀·e^(−kt)`.
Sample it one frame apart:

```
v(t + dt) = v(t) · e^(−k·dt)
```

So `v *= drag` is **not an approximation** of the differential equation — it *is*
its solution, provided `drag = e^(−k·dt)`.

A drag of 0.97 at 60 fps means `k = −ln(0.97) · 60 ≈ 1.83 s⁻¹`.

It also shows why the naive form is framerate-dependent: the constant is only
right for the `dt` it was derived at. The framerate-independent form raises it to
the frame time.

> **In the code:** `var decay = Math.pow(keep, dt)` — that is `keep^dt =
> e^(dt·ln keep)`, the exact form. This section describes the renderer as
> written.

---

## 3 · Discrete terminal velocity

The renderer applies **drag first and gravity second**, which makes the
per-frame update, with `d` = decay:

```
v(n+1) = v(n)·d + g·dt
```

At equilibrium `v(n+1) = v(n) = v*`:

```
v*(1 − d) = g·dt   ⇒   v* = g·dt / (1 − d)
```

Order matters, and it is worth being exact about it. Applying gravity *before*
drag gives `v* = g·dt·d / (1 − d)` instead — the same expression with an extra
factor of `d`, about 3% lower at `d = 0.97`. Both are correct for the loop that
produced them; they are not interchangeable.

Sanity check against §1: with `d = e^(−k·dt) ≈ 1 − k·dt`, the denominator is
`k·dt`, so `v* ≈ g/k`. Discrete and continuous agree in the limit.

> **In the code:** `p.vx *= decay; p.vy *= decay;` then
> `p.vy += p.gravity * gravity * dt;`. The fall-speed knob is really the ratio
> `g·dt / (1 − d)`, which is why the panel's Gravity and Drag sliders reach for
> the same effect from opposite ends.

---

## 4 · The tumble projection

A flat rectangle rotating about an in-plane axis, viewed head-on, tilt
`θ(t) = ωt`. Rotate its extent about that axis and project orthographically: the
projection drops `z`, so the extent across the axis scales by `cos θ` while the
extent along the axis is unchanged.

```
visible extent = w · cos θ
```

That is the physics. The renderer departs from it twice, deliberately — worth
saying plainly rather than claiming the code is purer than it is.

**It scales width, not height.** The pieces tumble about a vertical axis here, so
it is the same cosine applied to the other extent.

**It uses `|cos θ|` with a floor.** The signed form passes through zero edge-on
and goes negative on the back face, which is correct and looks wrong: a piece
scaled to exactly zero width vanishes for a frame and reads as a flicker rather
than as paper turning. The renderer clamps at `MIN_FACE` so a sliver always
remains.

**Brightness is two shades, not a curve.** Lambert's cosine law gives intensity
∝ `|cos θ|` under head-on light, and a continuous dim is the faithful
implementation. The renderer switches between a face colour and a darker edge
colour at `|cos θ| = 0.5` instead. Paper is not a Lambertian diffuser anyway — it
is thin and partly translucent — and two flat shades read as a sheet flipping
more clearly than a smooth gradient does at this size.

> **In the code:** `face = Math.abs(Math.cos(p.tilt))`, then
> `p.w * Math.max(face, MIN_FACE)` for the projection and
> `face > 0.5 ? p.color : p.colorEdge` for the shade. The same cosine drives the
> drag term in §3 — which is what makes a piece float when it is flat to the
> airflow and drop when it turns edge-on.

---

## 5 · The wobble — the one honest hack

Real falling paper obeys coupled nonlinear equations: the chaotic "falling paper
problem" of fluid dynamics, where the sheet sheds vortices alternately off each
edge and slides sideways in response. There is no closed form to derive.

```
x += A · sin(ωt + φ)
```

This is a first-harmonic approximation. Real flutter is roughly periodic at the
vortex-shedding frequency, and a single sine captures the dominant mode — enough
that the eye reads it as paper rather than as a falling dot.

> **In the code:** applied to *position* rather than velocity, so drag cannot
> damp it away. The sway is still there at the bottom of the screen when
> everything else has slowed to a drift — which is exactly when real confetti
> flutters most visibly.

---

## Status of each claim

| Piece | Result | Status |
| --- | --- | --- |
| Drag ODE | `v(t) = g/k + (v₀ − g/k)e^(−kt)` | exact |
| `v *= drag` | `drag = e^(−k·dt)` | exact, and what the code does |
| Terminal velocity | `v* = g·dt / (1 − d)` | exact for drag-then-gravity |
| Tumble projection | extent ∝ `cos θ` | exact; the code clamps `\|cos θ\|` |
| Shading | Lambert ∝ `\|cos θ\|` | the code uses two shades instead |
| Wobble | `A·sin(ωt + φ)` | one-term approximation of chaos |

Every number here is checkable. Drag 0.97 at 60 fps gives `k ≈ 1.83 s⁻¹`; with
`g = 900`, `dt = 1/60` and `d = 0.97` you get `v* = 500 px/s` drag-then-gravity,
`485 px/s` the other way round.

---

Part of [evo.confetti](README.md) in
[Evomedia.net Snippets](https://github.com/evomedia-net/evo.snippets).
A rendered version lives at
[evomedia.net/evo-confetti-math.html](https://evomedia.net/evo-confetti-math.html).
