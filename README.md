# Bullseye Range

A first-person shooting gallery you play in the browser: knock the targets down, drop the
flags, put down the armed shooters who fire back, and douse the drum fires burning out on
the range. Clear every quota to move on to the next level.

**Play it:** https://zijing1234567890-beep.github.io/bullseye-range/

Plain HTML, CSS and canvas JavaScript. No build step, no dependencies — open `index.html`
and it runs.

## Controls

| Input | Action |
| --- | --- |
| Mouse | aim the crosshair |
| Left click | fire (hold it down to keep firing) |
| Right click | aim down the sights — with the katana, raise the guard |
| `1` – `8` (or the wheel) | AK-47 · pistol · shotgun · katana · energy pistols · sniper · flamethrower · fire extinguisher |
| `F` | med kit (heals 45 hp) |
| `R` | reload |
| `A` / `D` | turn |
| `P` / `Esc` | pause |

## Weapons

- **AK-47** — 30 rounds, full auto.
- **Pistol** — 12 rounds, quick and steady.
- **Shotgun** — 6 shells, eight pellets a shot.
- **Energy pistols** — loaded with 3 energy cells dropped by shooters, then unlimited for
  the round.
- **Sniper rifle** — 3 cartridge rounds dropped by shooters load it; a scoped shot kicks
  the sights down.
- **Flamethrower** — burns the knife men before they reach you.
- **Fire extinguisher** — a pressurised 90-blast foam extinguisher. It is the only thing
  that puts the drum fires out (see below), and the blast chokes a shooter so he cannot
  draw a bead on you for a couple of seconds.
- **Katana** — no ammo. Cuts shooters down inside 4.6 m, turns their rounds aside while
  the guard is raised (or from the front at any time), and **slices incoming rounds clean
  in two** if you swing while they are on you.

## Fires

Every round there are drum fires burning out in the grass — one to four of them, never
right in front of you. Nothing else in the rack touches them: lead and flame only feed
them. Take the fire extinguisher (`8`) and hold the blast on a drum: foam breaks over the
steel with every burst, and once it has had enough it hisses out for good (120 points, and
the HUD's Fires row ticks over). A round is not over while a fire is still burning, so put
them all out to move on.

## Between levels

Clearing a level lays out three things from the range shop on the clear card and you pick
one — a power-up paid for out of your score that lasts for the next round only. Click the
card you want, or wave all three away ("No thanks", or `Enter`) and play on as you are. A
card you cannot afford is greyed out and says how short you are. The prices climb 60 points
per level, and the roll is three different items each time.

- **Bandolier** — half again as many rounds in every magazine.
- **Speedloaders** — reloads take 40% less time.
- **Flak vest** — every hit does half damage.
- **Field kit** — you start the round at full health with 5 med kits.
- **Cold nerves** — the shooters take 70% longer to line you up.

## Files

- `index.html` — the page and HUD
- `style.css` — styling
- `game.js` — the whole game

---

_This project was built with Lemon Code, an AI coding agent, on behalf of the repository owner._
