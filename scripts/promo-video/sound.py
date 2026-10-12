#!/usr/bin/env python3
"""
Sound for the promo videos: an original music bed and sound effects, all
synthesized here (no samples, nothing to license), mixed under the voiceover.

    python3 scripts/promo-video/sound.py en path/to/voiceover.mp3

Reads scripts/promo-video/.work/<lang>/cues.json (written by render.mjs) and
writes mix.wav next to it. Needs numpy, scipy and ffmpeg.
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
LANG = sys.argv[1] if len(sys.argv) > 1 else 'en'
VOICE = sys.argv[2] if len(sys.argv) > 2 else None
WORK = Path(__file__).resolve().parent / '.work' / LANG
data = json.loads((WORK / 'cues.json').read_text())
DUR = float(data['duration']) + 0.5
B = data['beats']
CUES = data['cues']
N = int(DUR * SR)
rng = np.random.default_rng(2026)


# ---------------------------------------------------------------------------
# Building blocks


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def env_ad(n, attack, decay, curve=4.0):
    """Attack then exponential-ish decay envelope over n samples."""
    a = max(1, int(attack * SR))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a) if a < n else np.linspace(0, 1, n)
    if n > a:
        k = np.arange(n - a) / max(1, int(decay * SR))
        e[a:] = np.exp(-curve * k)
    return e


def lp(x, f, order=2):
    return sosfilt(butter(order, min(f, SR / 2 - 100), 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, min(hi, SR / 2 - 100)], 'band', fs=SR, output='sos'), x)


def noise(n):
    return rng.standard_normal(n)


def sweep_filter(x, f0, f1, q=4.0, block=256, kind='band'):
    """A filter whose center glides exponentially from f0 to f1 (block-wise)."""
    out = np.zeros_like(x)
    nblocks = int(np.ceil(len(x) / block))
    zi = None
    for i in range(nblocks):
        k = i / max(1, nblocks - 1)
        f = f0 * (f1 / f0) ** k
        if kind == 'band':
            lo, hi = f / (1 + 1 / q), f * (1 + 1 / q)
            sos = butter(2, [max(20, lo), min(hi, SR / 2 - 200)], 'band', fs=SR, output='sos')
        else:
            sos = butter(2, min(f, SR / 2 - 200), 'low', fs=SR, output='sos')
        if zi is None or zi.shape[0] != sos.shape[0]:
            zi = np.zeros((sos.shape[0], 2))
        seg = x[i * block:(i + 1) * block]
        y, zi = sosfilt(sos, seg, zi=zi)
        out[i * block:(i + 1) * block] = y
    return out


def norm(x, peak=1.0):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def reverb_ir(seconds=2.2, damp=6000, seed=1):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir_l = r.standard_normal(n) * np.exp(-t * 6.9 / seconds)
    ir_r = r.standard_normal(n) * np.exp(-t * 6.9 / seconds)
    ir_l, ir_r = lp(ir_l, damp), lp(ir_r, damp)
    ir_l[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    ir_r[: int(0.017 * SR)] *= np.linspace(0, 1, int(0.017 * SR))
    return norm(ir_l, 0.25), norm(ir_r, 0.25)


IR = reverb_ir()


def reverb(mono, wet=0.3):
    l = fftconvolve(mono, IR[0])[: len(mono)]
    r = fftconvolve(mono, IR[1])[: len(mono)]
    return np.stack([mono * (1 - wet) + l * wet, mono * (1 - wet) + r * wet])


def stereo(mono, pan=0.0):
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    return np.stack([mono * l, mono * r])


def place(bus, sig, t, gain=1.0):
    """Adds a (2, n) or mono signal into a (2, N) bus at time t."""
    if sig.ndim == 1:
        sig = stereo(sig)
    i = int(t * SR)
    if i >= bus.shape[1]:
        return
    if i < 0:
        sig = sig[:, -i:]
        i = 0
    n = min(sig.shape[1], bus.shape[1] - i)
    bus[:, i:i + n] += sig[:, :n] * gain


def note(name):
    names = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
    n, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[n] + 12 * (o + 1) - 69) / 12)


def saw(freq, dur, detune=0.0):
    t = t_axis(dur)
    f = freq * 2 ** (detune / 1200)
    ph = (t * f + rng.random()) % 1.0
    return 2 * ph - 1


# ---------------------------------------------------------------------------
# Sound effects


def sfx_whoosh(dur=0.5, pitch=1.0, up=False):
    n = int(dur * SR)
    x = noise(n)
    f0, f1 = (250 * pitch, 4200 * pitch) if up else (2800 * pitch, 380 * pitch)
    y = sweep_filter(x, f0, f1, q=2.2)
    e = np.sin(np.linspace(0, np.pi, n)) ** 1.6
    if up:
        e = np.linspace(0, 1, n) ** 2.2 * env_ad(n, 0.001, dur * 4, 1)[::-1] ** 0.1
    y = norm(y * e, 0.9)
    l, r = y * np.linspace(1.0, 0.45, n), y * np.linspace(0.45, 1.0, n)
    return np.stack([l, r])


def sfx_whoosh_big(dur=0.9):
    w = sfx_whoosh(dur, 0.8)
    n = w.shape[1]
    rumble = lp(noise(n), 160) * np.sin(np.linspace(0, np.pi, n)) ** 2
    return w + stereo(norm(rumble, 0.6))


def sfx_pop(pitch=1.0):
    dur = 0.16
    t = t_axis(dur)
    f = (1100 * np.exp(-t * 38) + 330) * pitch
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * env_ad(len(t), 0.002, 0.05, 3)
    click = hp(noise(len(t)), 3000) * env_ad(len(t), 0.0005, 0.004, 5) * 0.25
    return reverb(norm(y + click, 0.8), 0.18)


def sfx_strike():
    n = int(0.16 * SR)
    y = bp(noise(n), 3500, 9000) * np.sin(np.linspace(0, np.pi, n)) ** 2
    return stereo(norm(y, 0.5), 0.2)


def sfx_thud():
    t = t_axis(0.3)
    f = 140 * np.exp(-t * 16) + 55
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(len(t), 0.002, 0.12, 3)
    return stereo(norm(y + lp(noise(len(t)), 500) * env_ad(len(t), 0.001, 0.03) * 0.3, 0.9))


def sfx_riser(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    k = t / dur
    f = 180 * (12 ** k)
    ph = np.cumsum(f) / SR
    tone = (2 * (ph % 1) - 1) * 0.35 + np.sin(2 * np.pi * ph * 2) * 0.2
    tone = sweep_filter(tone, 300, 6000, kind='low')
    nz = sweep_filter(noise(n), 400, 9000, q=1.5) * 0.8
    e = k ** 2.4
    y = norm((tone + nz) * e, 0.85)
    return reverb(y, 0.25)


def sfx_impact(big=True):
    dur = 2.2 if big else 1.2
    t = t_axis(dur)
    n = len(t)
    f = 95 * np.exp(-t * 9) + 38
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(n, 0.002, 0.7 if big else 0.4, 3)
    burst = lp(noise(n), 2500) * env_ad(n, 0.001, 0.08, 4) * 0.6
    crash = lp(hp(noise(n), 4500), 12000) * env_ad(n, 0.002, 1.2 if big else 0.5, 3) * (0.18 if big else 0.1)
    y = norm(sub * 1.0 + burst, 0.95)
    return reverb(y, 0.22) + stereo(crash) * 0.8


def sfx_slam():
    t = t_axis(1.0)
    n = len(t)
    f = 160 * np.exp(-t * 22) + 48
    kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(n, 0.001, 0.25, 3)
    snap = bp(noise(n), 900, 5000) * env_ad(n, 0.001, 0.07, 4) * 0.7
    tail = hp(noise(n), 6000) * env_ad(n, 0.002, 0.5, 4) * 0.15
    return reverb(norm(kick + snap + tail, 0.95), 0.25)


def sfx_shimmer():
    dur = 1.6
    t = t_axis(dur)
    y = np.zeros(len(t))
    scale = [note(n) for n in ['C6', 'D6', 'F6', 'G6', 'A6', 'C7', 'D7', 'F7', 'A7']]
    for i in range(12):
        f = scale[int(rng.integers(len(scale)))]
        start = int(i * 0.045 * SR)
        seg = np.sin(2 * np.pi * f * t[: len(t) - start]) * np.exp(-t[: len(t) - start] * 4.5)
        y[start:] += seg * (0.5 + rng.random() * 0.5)
    return reverb(norm(y, 0.5), 0.45)


def sfx_unlock():
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    c1 = bp(noise(n), 2500, 6000) * env_ad(n, 0.0005, 0.012, 5)
    c2 = np.zeros(n)
    s = int(0.09 * SR)
    c2[s:] = (bp(noise(n - s), 1500, 4500) * env_ad(n - s, 0.0005, 0.02, 5))
    ring = (np.sin(2 * np.pi * 2093 * t) + 0.5 * np.sin(2 * np.pi * 3136 * t)) * np.exp(-t * 7) * 0.25
    ring[:s] = 0
    return reverb(norm(c1 + c2 * 1.2 + ring, 0.9), 0.2)


def sfx_tick(pitch=1.0):
    t = t_axis(0.03)
    y = np.sin(2 * np.pi * 3200 * pitch * t) * env_ad(len(t), 0.0003, 0.006, 5)
    return stereo(y * 0.6)


def sfx_click(pitch=1.0):
    t = t_axis(0.06)
    n = len(t)
    y = hp(noise(n), 2000) * env_ad(n, 0.0003, 0.003, 5) * 0.8
    y += np.sin(2 * np.pi * 1800 * pitch * t) * env_ad(n, 0.0005, 0.012, 5) * 0.5
    return stereo(norm(y, 0.8))


def sfx_key(pitch=1.0):
    t = t_axis(0.07)
    n = len(t)
    y = bp(noise(n), 1500 * pitch, 6000) * env_ad(n, 0.0003, 0.008, 5)
    thock = np.sin(2 * np.pi * 220 * pitch * t) * env_ad(n, 0.0005, 0.02, 5) * 0.4
    return stereo(norm(y + thock, 0.7), (rng.random() - 0.5) * 0.4)


def sfx_counter(dur=1.2):
    """Ticks that follow an ease-out count (fast, then slowing down)."""
    out = np.zeros((2, int((dur + 0.1) * SR)))
    steps = 26
    for i in range(steps):
        p = i / steps
        # Inverse of outExpo: time at which the count reaches p.
        tt = -np.log2(max(1e-4, 1 - p)) / 10 * dur
        place(out, sfx_tick(0.9 + p * 0.5), tt, 0.5 + p * 0.3)
    return out


def sfx_suck():
    w = sfx_whoosh(0.35, 1.3, up=True)
    return w * 0.7


def sfx_blip(freqs, step=0.08):
    out = np.zeros(int((len(freqs) * step + 0.25) * SR))
    for i, f in enumerate(freqs):
        t = t_axis(0.2)
        y = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * env_ad(len(t), 0.003, 0.06, 4)
        s = int(i * step * SR)
        out[s:s + len(y)] += y[: len(out) - s]
    return reverb(norm(out, 0.6), 0.2)


def sfx_ding():
    dur = 1.8
    t = t_axis(dur)
    f = 1318.5
    y = (np.sin(2 * np.pi * f * t) * np.exp(-t * 3)
         + 0.5 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t * 5)
         + 0.25 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t * 8))
    f2 = 1760.0
    s = int(0.11 * SR)
    y2 = np.zeros_like(y)
    y2[s:] = np.sin(2 * np.pi * f2 * t[: len(t) - s]) * np.exp(-t[: len(t) - s] * 3)
    return reverb(norm(y + y2 * 0.8, 0.6), 0.35)


def sfx_swell(dur=1.5):
    n = int(dur * SR)
    y = lp(hp(noise(n), 3000), 11000) * (np.linspace(0, 1, n) ** 3)
    y += sweep_filter(noise(n), 200, 3000, kind='low') * (np.linspace(0, 1, n) ** 2) * 0.6
    return reverb(norm(y, 0.6), 0.3)


def sfx_flip():
    a = sfx_whoosh(0.45, 1.2)
    b = sfx_whoosh(0.45, 0.8)
    out = np.zeros((2, int(0.8 * SR)))
    place(out, a, 0)
    place(out, b, 0.3)
    return out * 0.9


def make_sfx(cue):
    kind = cue['type']
    pitch = cue.get('pitch', 1.0)
    dur = cue.get('dur')
    if kind == 'whoosh':
        return sfx_whoosh(dur or 0.5, pitch)
    if kind == 'whooshBig':
        return sfx_whoosh_big()
    if kind == 'whooshUp':
        return sfx_whoosh(0.6, pitch, up=True)
    if kind == 'pop':
        return sfx_pop(pitch)
    if kind == 'strike':
        return sfx_strike()
    if kind == 'thud':
        return sfx_thud()
    if kind == 'riser':
        return sfx_riser(dur or 1.0)
    if kind == 'impact':
        return sfx_impact(True)
    if kind == 'slam':
        return sfx_slam()
    if kind == 'shimmer':
        return sfx_shimmer()
    if kind == 'unlock':
        return sfx_unlock()
    if kind == 'tick':
        return sfx_tick(pitch)
    if kind == 'click':
        return sfx_click(pitch)
    if kind == 'key':
        return sfx_key(pitch)
    if kind == 'counter':
        return sfx_counter(dur or 1.2)
    if kind == 'suck':
        return sfx_suck()
    if kind == 'disconnect':
        return sfx_blip([880, 587, 392])
    if kind == 'connect':
        return sfx_blip([523, 784, 1047])
    if kind == 'data':
        return sfx_blip([1200 * pitch], 0.05) * 0.6
    if kind == 'ding':
        return sfx_ding()
    if kind == 'swell':
        return sfx_swell(dur or 1.5)
    if kind == 'flip':
        return sfx_flip()
    raise ValueError(kind)


# Pre-roll: where a cue's sound should start relative to its visual moment.
LEAD = {'whoosh': 0.12, 'whooshBig': 0.2, 'whooshUp': 0.15, 'suck': 0.3, 'flip': 0.1}

# Per-kind loudness of the effects bus.
LEVEL = {
    'whoosh': 0.32, 'whooshBig': 0.42, 'whooshUp': 0.32, 'pop': 0.42, 'strike': 0.25, 'thud': 0.5,
    'riser': 0.5, 'impact': 0.75, 'slam': 0.62, 'shimmer': 0.35, 'unlock': 0.55, 'tick': 0.35,
    'click': 0.45, 'key': 0.4, 'counter': 0.5, 'suck': 0.3, 'disconnect': 0.38, 'connect': 0.38,
    'data': 0.3, 'ding': 0.45, 'swell': 0.4, 'flip': 0.42,
}

sfx_bus = np.zeros((2, N))
for c in CUES:
    sig = make_sfx(c)
    start = c['t'] - LEAD.get(c['type'], 0.0)
    place(sfx_bus, sig, start, c.get('gain', 1.0) * LEVEL[c['type']])


# ---------------------------------------------------------------------------
# Music: vi–IV–I–V in F major at 120 BPM, arranged around the narration.

BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
# A downbeat on "Meet OpenCanvas".
ORIGIN = B['meet'] - 4 * BAR
CHORDS = [
    ('D2', ['D3', 'F3', 'A3', 'D4'], ['D5', 'F5', 'A5', 'D6']),
    ('Bb1', ['Bb2', 'D3', 'F3', 'Bb3'], ['Bb4', 'D5', 'F5', 'Bb5']),
    ('F2', ['F3', 'A3', 'C4', 'F4'], ['F5', 'A5', 'C6', 'F6']),
    ('C2', ['C3', 'E3', 'G3', 'C4'], ['C5', 'E5', 'G5', 'C6']),
]

# Sections: (start, end, layers)
pause1, meet, pause2, yours = B['pause1'], B['meet'], B['pause2'], B['yours']
no_locked, try_, end_card = B['noLocked'], B['try'], B['endCard']
SECTIONS = [
    (0.0, pause1, {'pad': 0.9, 'pluck': 0.7, 'hats': 0.0, 'kick': 0.0, 'bass': 0.0, 'clap': 0.0, 'cut': 2800}),
    (meet, pause2, {'pad': 0.7, 'pluck': 0.65, 'hats': 1, 'kick': 1, 'bass': 1, 'clap': 1, 'cut': 5000}),
    (pause2, yours, {'pad': 1.0, 'pluck': 0.0, 'hats': 0, 'kick': 0, 'bass': 0, 'clap': 0, 'cut': 2000}),
    (yours, no_locked, {'pad': 0.7, 'pluck': 0.55, 'hats': 1, 'kick': 1, 'bass': 1, 'clap': 0.0, 'cut': 4200}),
    (no_locked, try_, {'pad': 0.75, 'pluck': 0.6, 'hats': 1, 'kick': 1, 'bass': 1, 'clap': 1, 'cut': 6000}),
    (try_, end_card, {'pad': 0.7, 'pluck': 0.6, 'hats': 1, 'kick': 1, 'bass': 1, 'clap': 0.6, 'cut': 5000}),
]


def section_at(t):
    for s, e, layers in SECTIONS:
        if s <= t < e:
            return layers
    return None


music = np.zeros((2, N))
kick_env = np.zeros(N)
total_bars = int((DUR - ORIGIN) / BAR) + 2
first_bar = int(np.floor((0 - ORIGIN) / BAR))

for bar in range(first_bar, total_bars):
    bar_t = ORIGIN + bar * BAR
    root, pad_notes, arp_notes = CHORDS[bar % 4]
    for beat in range(4):
        bt = bar_t + beat * BEAT
        layers = section_at(bt + 0.01)
        if bt < 0 or bt >= end_card or not layers:
            continue
        # Kick on every beat.
        if layers['kick']:
            t = t_axis(0.45)
            f = 120 * np.exp(-t * 30) + 47
            k = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(len(t), 0.001, 0.22, 3)
            place(music, k, bt, 0.55 * layers['kick'])
            i = int(bt * SR)
            m = min(int(0.3 * SR), N - i)
            if m > 0:
                kick_env[i:i + m] = np.maximum(kick_env[i:i + m], np.exp(-np.arange(m) / (0.09 * SR)))
        # Clap on 2 and 4.
        if layers['clap'] and beat in (1, 3):
            n = int(0.35 * SR)
            c = bp(noise(n), 900, 6000) * env_ad(n, 0.001, 0.09, 4)
            place(music, reverb(c, 0.35), bt, 0.22 * layers['clap'])
        # Hats: 8ths, open on the off-beat.
        if layers['hats']:
            for half in (0, 1):
                n = int((0.18 if half else 0.04) * SR)
                hh = lp(hp(noise(n), 7000), 11000) * env_ad(n, 0.0005, 0.05 if half else 0.012, 4)
                place(music, stereo(hh, 0.25 if half else -0.2), bt + half * BEAT / 2, 0.05 if half else 0.035)
        # Bass: 8th notes on the root (pumping).
        if layers['bass']:
            f = note(root)
            for half in (0, 1):
                t = t_axis(BEAT / 2)
                b = np.sin(2 * np.pi * f * t) + 0.35 * lp(saw(f, BEAT / 2), 600)
                b *= env_ad(len(t), 0.005, 0.2, 2)
                place(music, b, bt + half * BEAT / 2, 0.32 * layers['bass'])
        # Pluck arpeggio: 16ths over the chord.
        if layers['pluck']:
            for q in range(4):
                idx = (beat * 4 + q) % 8
                order = [0, 1, 2, 3, 2, 1, 2, 3]
                f = note(arp_notes[order[idx]])
                t = t_axis(0.3)
                p = (saw(f, 0.3) * 0.6 + saw(f, 0.3, 7) * 0.4)
                p = lp(p, min(layers['cut'], 3800))
                p *= env_ad(len(t), 0.002, 0.08, 4)
                pan = 0.35 if q % 2 else -0.35
                sig = stereo(p, pan)
                # Dotted-eighth echo.
                place(music, sig, bt + q * BEAT / 4, 0.07 * layers['pluck'])
                place(music, sig[::-1], bt + q * BEAT / 4 + BEAT * 0.75, 0.03 * layers['pluck'])
    # Pad: one chord per bar.
    layers = section_at(bar_t + 0.01) or section_at(max(0.0, bar_t) + 0.01)
    if layers and layers['pad'] and bar_t + BAR > 0 and bar_t < end_card:
        dur = BAR + 0.6
        voices = []
        for n_ in pad_notes:
            f = note(n_)
            for det, pan in ((-9, -0.6), (0, 0.0), (9, 0.6)):
                voices.append(stereo(saw(f, dur, det), pan))
        pad = sum(voices) / len(voices)
        n = pad.shape[1]
        e = np.minimum(1, np.arange(n) / (0.35 * SR)) * np.minimum(1, (n - np.arange(n)) / (0.5 * SR))
        pad = np.stack([lp(pad[0], layers['cut'] * 0.6), lp(pad[1], layers['cut'] * 0.6)]) * e
        place(music, pad, bar_t, 0.22 * layers['pad'])

# Final chord on the end card: big, then ringing out.
final_dur = DUR - end_card
voices = []
for n_ in ['F2', 'C3', 'F3', 'A3', 'C4', 'F4', 'A4']:
    for det, pan in ((-8, -0.7), (0, 0), (8, 0.7)):
        voices.append(stereo(saw(note(n_), final_dur, det), pan))
chord = sum(voices) / len(voices)
n = chord.shape[1]
ce = np.minimum(1, np.arange(n) / (0.02 * SR)) * np.exp(-np.arange(n) / (2.6 * SR))
chord = np.stack([lp(chord[0], 3500), lp(chord[1], 3500)]) * ce
place(music, chord, end_card, 0.42)
sub = np.sin(2 * np.pi * note('F1') * t_axis(final_dur)) * np.exp(-t_axis(final_dur) * 1.2)
place(music, sub, end_card, 0.35)

# Pump the pad and bass with the kick (sidechain).
pump = 1 - 0.45 * lp(kick_env, 40)
music *= pump
# Sections with fewer layers are lifted so the bed stays even.
lift = np.ones(N)
for a_, b2, g in ((0.0, pause1, 3.0), (pause2, yours, 2.2), (end_card, DUR, 1.4)):
    lift[int(a_ * SR):int(b2 * SR)] = g
music *= lp(lift, 4)
# Space for the pause before the logo: let the riser speak.
gap = np.ones(N)
a, b_ = int(pause1 * SR), int(meet * SR)
gap[a:b_] = np.linspace(0.6, 0.0, b_ - a)
music *= gap
music = np.stack([reverb(music[0], 0.12)[0], reverb(music[1], 0.12)[1]])


# ---------------------------------------------------------------------------
# Voice, ducking and the mix

def load_voice(path):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


voice = np.zeros(N)
if VOICE:
    v = load_voice(VOICE)
    voice[: min(N, len(v))] = v[:N]

# Duck the music while someone speaks (smoothed voice envelope).
win = int(0.05 * SR)
rms = np.sqrt(np.convolve(voice ** 2, np.ones(win) / win, mode='same'))
envv = lp(rms, 3)
envv = np.clip(envv / (np.percentile(envv[envv > 1e-4], 60) if np.any(envv > 1e-4) else 1), 0, 1)
duck = 1 - 0.55 * envv
music *= duck

import pyloudnorm  # noqa: E402

meter = pyloudnorm.Meter(SR)


def loudness_to(sig, target):
    """Scales a (2, n) signal to an integrated loudness (LUFS)."""
    level = meter.integrated_loudness(sig.T)
    return sig * 10 ** ((target - level) / 20) if np.isfinite(level) else sig


# Voice in front, the music bed well under it, effects in between.
voice_st = loudness_to(stereo(voice) * np.sqrt(2), -18.0) if VOICE else stereo(voice)
music = loudness_to(music, -30.5)
sfx_bus = loudness_to(sfx_bus, -27.5)
mix = loudness_to(voice_st + music + sfx_bus, -15.0)
mix = mix.T.astype(np.float32)
out = WORK / 'mix-raw.wav'
from scipy.io import wavfile  # noqa: E402

wavfile.write(out, SR, mix)
if '--stems' in sys.argv:
    for name, sig in (('stem-music', music), ('stem-sfx', sfx_bus), ('stem-voice', voice_st)):
        wavfile.write(WORK / f'{name}.wav', SR, sig.T.astype(np.float32))
print(out)
