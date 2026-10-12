#!/usr/bin/env bash
# Builds a promo video end to end: frames, sound, then the final files.
#
#   scripts/promo-video/make.sh en [voiceover.mp3] [fps]
#
# The voiceover defaults to voice/<lang>.mp3. The app must be running for
# footage.mjs (see its header); footage is reused when it is already in
# scripts/promo-video/.work/footage/<lang>.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
lang="${1:?language: en or ar}"
voice="${2:-$here/voice/$lang.mp3}"
fps="${3:-60}"
work="$here/.work/$lang"

if [ ! -f "$here/.work/footage/$lang/editor.jpg" ]; then
  node "$here/footage.mjs" "$lang"
fi
node "$here/render.mjs" "$lang" --fps "$fps"
python3 "$here/sound.py" "$lang" "$voice"

# Master: high quality, for uploading anywhere.
ffmpeg -v error -y -i "$work/video.mp4" -i "$work/mix-raw.wav" \
  -af "alimiter=limit=0.89:attack=3:release=60:level=false" \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 256k -shortest -movflags +faststart "$work/opencanvas-$lang.mp4"

# Web: smaller, for the landing page.
ffmpeg -v error -y -i "$work/opencanvas-$lang.mp4" \
  -c:v libx264 -preset slow -crf 25 -r 30 -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 128k -movflags +faststart "$work/opencanvas-$lang-web.mp4"

# Poster: social, presentation and print designs side by side.
ffmpeg -v error -y -ss "$(python3 -c "import json;print(json.load(open('$work/cues.json'))['beats']['print']+0.9)")" \
  -i "$work/opencanvas-$lang.mp4" -frames:v 1 -vf scale=1600:-2 -q:v 4 "$work/poster-$lang.jpg"

ls -la "$work"/opencanvas-"$lang"*.mp4 "$work/poster-$lang.jpg"
