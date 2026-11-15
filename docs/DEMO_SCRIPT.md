# Demo script and submission checklist (M6)

Live site: https://osvajavi.github.io/bioenanos/ · Code: https://github.com/OsvaJavi/bioenanos

Two formats:
- **Part A, 3-minute live demo**: for local judging and the rehearsal (spec M6).
- **Part B, 30-second video**: the official Space Apps project demo. The submission guide allows a video of up to 30 s *or* a deck of up to 7 slides, and longer demos are not eligible for Global Judging. Part C has a 7-slide alternative.

All figures below use the default parameters and come from `web/data/routes.json` and `tools/sensitivity.py`. If the data is regenerated, re-check them.

---

## Part A — 3-minute live demo

Before starting: open the live site in a clean browser window at 1440 px or wider, in ROVER mode with no site selected. Close every other tab.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:20 | Full map, AP-1 base marked | "We are the first crew at Arcadia Planitia, 40° north on Mars, where orbital radar shows ice a few metres down. Our base is AP-1. Before anyone leaves it, they need to know: can we get there, how, and what will it cost us?" |
| 0:20–0:45 | Switch layers: elevation → slope → thermal → detail (CTX) | "Every layer is real orbital data, reprojected onto one 200-metre grid around the base: elevation from the HRSC–MOLA blend, slope and roughness derived from it, THEMIS thermal infrared, Viking colour, and a CTX terrain model for close-up detail. Nothing is loaded from other servers at runtime; the whole map ships with the page." |
| 0:45–1:25 | Select **AP-9 · ISRU Site** in ROVER | "AP-9 is where we would mine ice. The optimal route avoids slopes the rover cannot climb, and it is only 3 % longer than a straight line, because this plain is extremely flat: 0.84° on average. The rover is modelled on a real electric car's numbers, adapted to Mars gravity and atmosphere. The round trip takes 61.4 kWh of a 96 kWh battery. With a 20 % reserve, the verdict is ROUND TRIP OK." Press play at ×3600: "Here is the battery draining along the profile." |
| 1:25–1:45 | Select **APMR · Paleo-megaripples** | "The ancient megaripples are 118 km away. Same rover, same model: 123 kWh round trip. The app says ONE-WAY ONLY. You can get there, but not back without recharging." |
| 1:45–2:30 | Switch to ON FOOT, AP-9; point at the form and the alerts | "On foot, the question is oxygen. Here is the astronaut: body, suit and PLSS, gear and walking speed. Walking to AP-9 and back needs 3,896 litres of oxygen and five EVAs of eight hours. The model also flags two real risks: on short climbs the metabolic rate passes 1,000 watts, and the estimated core temperature reaches 38.9 °C inside one EVA." Change the speed to 1.3 m/s: "Walk faster and it drops to four EVAs, but every hour outside burns about 25 % more oxygen." (AP-9: 33.2 h → 25.5 h; 99 → 125 L/h; total 3,896 → 3,773 L.) |
| 2:30–2:50 | Open **About / Assumptions** | "Every number that is an assumption is listed here, with its source. The biggest one is rolling resistance on regolith: with 0.30 instead of 0.15, AP-9 also becomes ONE-WAY ONLY. That is the first thing a real mission would need to measure." |
| 2:50–3:00 | Back to the map | "Arcadia Planitia Surface Navigator: real data, honest physics, and an answer to 'can we get there and back?' for every site. Thank you." |

Backup if the network fails: `npm run serve` on a laptop, then open http://localhost:4173/bioenanos/ (same site, offline).

---

## Part B — 30-second video (official demo)

Record the screen at 1080p and add English subtitles (required for video demos). Target 75–80 spoken words.

| Time | On screen | Voice-over / subtitle |
|---|---|---|
| 0:00–0:03 | Title card: project name, team name, member names | "We are *<team name>*: *<names>*." |
| 0:03–0:07 | Full map of Arcadia Planitia | "Our challenge: a survival map for the first crew on Mars." |
| 0:07–0:12 | Layers changing | "Arcadia Planitia Surface Navigator turns NASA and ESA orbital data into a 200-metre map around our base." |
| 0:12–0:20 | AP-9 rover route + verdict, then APMR ONE-WAY ONLY | "Pick a site and it plans the safest route, with the rover's battery round trip, or the warning that you can't come back." |
| 0:20–0:26 | ON FOOT: oxygen, EVAs, heat alert | "On foot, it counts oxygen, EVAs and body heat." |
| 0:26–0:30 | Map + URL | "Before anyone leaves the base, they know the cost. Try it: osvajavi.github.io/bioenanos." |

Host it publicly (YouTube unlisted or Google Drive "anyone with the link"). Test the link in a private window.

---

## Part C — 7-slide alternative

1. Title: project name, team name, members, challenge (*Interplanetary Survival Guide: Martian Map*).
2. The problem: first crew at AP-1 must decide where they can go and return from.
3. The data: HRSC–MOLA DEM, CTX DTM, THEMIS, Viking MDIM. Screenshot of the layers.
4. Rover: AP-9 route and battery profile; APMR ONE-WAY ONLY.
5. On foot: oxygen, EVAs and heat/metabolic alerts.
6. Honesty: assumptions panel and the sensitivity table (rolling resistance dominates).
7. What's next: in-situ measurement of rolling resistance, finer DEMs, more sites; live URL.

---

## Submission checklist

Project page (English only; every required field must be filled):
- [ ] **Project name:** Arcadia Planitia Surface Navigator.
- [ ] **High-level summary** (what it does, how it answers the challenge, why it matters).
- [ ] **Link to project demo:** Part B video (≤ 30 s, English subtitles) *or* Part C deck (≤ 7 slides), publicly accessible.
- [ ] **Link to final project:** https://osvajavi.github.io/bioenanos/. It must open without a password or sign-in; check it in a private window. The repo is public.
- [ ] **Detailed description:** what it does, how it works (pipeline → `routes.json` → static web app), benefits, tools (Python, rasterio, SciPy, Leaflet, Playwright, GitHub Pages).
- [ ] **NASA data:** MOLA (MGS), CTX DTM and orthoimage (MRO), THEMIS day IR (Mars Odyssey), Viking MDIM 2.1, all via USGS Astrogeology. Say how each one is used (elevation and slope for routing, thermal and optical layers, CTX for detail).
- [ ] **Space agency partner and other data:** HRSC (ESA Mars Express / DLR / FU Berlin) in the blended DEM; Tesla Model S public specifications (tesla.com, EVKX) as the reference vehicle; Leaflet (BSD-2-Clause); the team's site study. Present the Tesla data only as a reference vehicle so it doesn't read as promoting a product.
- [ ] **Use of AI:** declare it. Code, data processing and docs were written with AI coding agents (Claude, via Claude Code / claude.ai) under the team's spec and review, and are validated by automated tests. If any image or video is AI-generated, it needs a visible watermark. Don't use NASA logos or mission insignia in generated material.
- [ ] **Verification checkboxes:** Terms and Conditions, original work.
- [ ] Images on the project page: JPG/PNG/GIF ≤ 10 MB (screenshots of the map, rover and on-foot panels).
- [ ] Click **Submit for Judging** before the deadline. The guide gives 11:59 p.m. local time; confirm with the Local Lead. The team's internal deadline is Sunday 20:00 America/Mexico_City. Submission is final.

Technical (before submitting):
- [ ] GitHub Pages enabled (Settings → Pages → Source: GitHub Actions) and the `pages` workflow green on `main`.
- [ ] `PAGES_URL=https://osvajavi.github.io/bioenanos/ npm run e2e -- -g "public site"` passes.
- [ ] CI green on `main` (pytest, Vitest, Playwright).
- [ ] No "MOCK DATA" banner on the live site.
