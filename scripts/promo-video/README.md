# Promo videos and landing page media

Everything here is made from the real app: no stock footage, no samples. The
one-minute videos (English and Arabic) and the feature clips on the landing page
are rebuilt with these scripts.

| Step | Script | What it does |
| --- | --- | --- |
| 1 | `footage.mjs` | Drives the running app with Playwright and records high-resolution screenshots and step-by-step interaction sequences (a screenshot after every mouse step), in English and Arabic. |
| 2 | `render.mjs` | Renders the motion-graphics composition (`composition/`) frame by frame and encodes it with ffmpeg. Scenes follow the narration; each one lists the sound effects it needs. |
| 3 | `sound.py` | Synthesizes an original music bed and the sound effects in Python (numpy, scipy), ducks the music under the voice and balances the loudness. |
| 4 | `make.sh` | Runs steps 1–3 for one language and writes the final files: a master, a smaller web version and a poster. |
| — | `site-media.mjs` | Turns the recorded sequences into the landing page clips (MP4) and screenshots (WebP). |

```bash
pnpm build && pnpm start -- --port 3200          # the app, for the footage
pip install numpy scipy pyloudnorm               # for the sound
BASE_URL=http://localhost:3200 node scripts/promo-video/footage.mjs
scripts/promo-video/make.sh en                   # → .work/en/opencanvas-en.mp4
scripts/promo-video/make.sh ar                   # → .work/ar/opencanvas-ar.mp4
node scripts/promo-video/site-media.mjs          # → site/assets/media/
```

Useful while editing the composition:

```bash
node scripts/promo-video/render.mjs en --stills 3.2,9,14.5   # PNG frames to review
node scripts/promo-video/render.mjs ar --serve               # open it in a browser
```

## Narration

The voiceovers are in `voice/`. The scene timings (`BEATS` in
`composition/video.js`) were measured on them, phrase by phrase; a new
recording needs new beats. The captions on the landing page
(`site/assets/media/opencanvas-*.vtt`) follow the same timings.

## Licenses

The music and sound effects are synthesized by `sound.py`, the app footage and
design renders come from OpenCanvas itself, the sample photos are drawn by
`scripts/site-media/photos.mjs`, icons come from the bundled Lucide (ISC) and
Tabler (MIT) sets, and fonts from Fontsource (SIL OFL 1.1 and Apache 2.0).
