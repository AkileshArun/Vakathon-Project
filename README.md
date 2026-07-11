# Fish AI — Web Edition 🐟

A browser fishing companion: **plan, identify, log — and fish safely.** No app store, no build step. Open the HTML file.

Six tabs: **Home**, **Map**, **Scan**, **Safety**, **Coach**, **Log**.
Everything is stored only in your browser (localStorage).

---

## Fastest start (1 key)

1. Free Gemini key: https://aistudio.google.com/app/apikey (starts with `AIza`).
2. Double-click **`fishai-web.html`**.
3. Create your angler profile (name + who's fishing + accent color).
4. Open **API keys** (top-right menu), paste the Gemini key, **Save**.

That unlocks Coach chat + photo fish-ID (Gemini Vision). Map, Safety, and Log need no keys.

## Optional: Fishial.ai for best fish ID
Run `node fishial-proxy.js`, paste your Fishial keys when prompted, then paste the
`http://localhost:8787` URL into API keys -> Proxy URL. Scan then uses Fishial and falls back to
Gemini automatically. (Browsers can't call Fishial directly - that's why the proxy exists.)

---

## What's new in this version

**Accounts.** A local sign-up card on first launch. Multiple profiles live on one device - switch
between them instantly from the avatar menu (top-right), or log out. Each profile keeps its own
chat history and catch log. Your "who's fishing" choice (general adult / pregnant-nursing / child /
senior) tightens the safety thresholds automatically. API keys are shared across profiles.

**Light / dark theme.** Toggle in the top bar. The map, charts, and whole UI follow it.

**Richer map.** 15 lakes, ponds, bays, and reservoirs. Four base styles (Dark, Light, Terrain,
Satellite). Pins are colored by *safety*, not just fishing quality - green safe, amber limit, red advisory.

**Safety tab (the point of the app).** Pick a species + water and get:
- a plain-language verdict (Safe / Eat in moderation / Best avoided) with a servings-per-week guide,
- a mercury bar chart for that water vs. the FDA 1.0 ppm action line, with your species highlighted,
- a 14-reading pH line chart with the healthy 6.5-8.5 band shaded,
- and a one-tap "ask the coach about this fish" hand-off.

Scanned fish get a "Check safety" button that jumps straight to this tab.

---

## Notes & honesty

- Mercury/pH numbers are realistic demo values, not live sensor feeds - species means are
  approximated from FDA monitoring tiers (action level 1.0 ppm; best <0.15, avoid >0.46 ppm) and
  scaled by a per-water contamination factor so the story is visible. For a real deployment you'd
  swap in EPA/state advisory data or actual probe readings. The verdict logic and thresholds are
  real; the per-water factors are illustrative.
- Guidance is informational, not medical advice - the app says so on-screen.
- Model name is gemini-flash-latest (an always-current alias); if you ever get a 404, pin a specific model like gemini-3.5-flash in the MODEL
  lines in the script.
- I couldn't make live API calls in the build environment, so test one Gemini chat + one scan on
  your machine first. Most common snag: a 403 from an unrestricted Gemini key - make a fresh key
  in AI Studio (auto-restricted) and it works.

---

Original concept from the FishAI-Technical repo (React Native/Expo); this web edition is a
rewrite. Credit the original in your submission and check its license + your hackathon's rules.

## Underwater theme, custom fish & tutorial (v3.1)
- The app now has an animated underwater look (light rays, rising bubbles, fish swimming behind the UI).
- A gamey first-launch tutorial explains what the app does plus the mercury / gold-rush safety story. Replay it anytime with the "?" button in the header.
- Make the swimming fish YOUR fish: open API Keys -> "Your Aquarium" and upload images (auto-resized, up to 12). They persist in this browser. Or drop files named fish1.png ... fish8.png in an "assets" folder next to the HTML file and they load automatically.
