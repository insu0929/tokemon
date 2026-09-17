"""Rebuild edits from the user-provided references cached in .local.
Requires numpy, matplotlib and ffmpeg (FFMPEG env or cached imageio-ffmpeg).
Writes a waveform report and measured loudness data into .local/audio-edit/.
"""
from pathlib import Path
import json, os, subprocess, wave
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
FFMPEG = os.environ.get('FFMPEG') or str(next((ROOT / '.local/media-tools/imageio_ffmpeg/binaries').glob('*.exe')))
OUT = ROOT / '.local/audio-edit'
OUT.mkdir(parents=True, exist_ok=True)
RATE = 48000

def decode(file):
    data = subprocess.check_output([FFMPEG, '-v', 'error', '-i', str(file), '-f', 'f32le', '-ar', str(RATE), '-ac', '2', '-'])
    return np.frombuffer(data, dtype=np.float32).reshape(-1, 2).copy()

def write(file, data):
    with wave.open(str(file), 'wb') as wav:
        wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(RATE)
        wav.writeframes((np.clip(data, -1, 1) * 32767).astype('<i2').tobytes())

def measure(file, target=-14):
    result = subprocess.run([FFMPEG, '-hide_banner', '-i', str(file), '-af', f'loudnorm=I={target}:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True, check=True)
    return json.JSONDecoder().raw_decode(result.stderr[result.stderr.rfind('{'):])[0]

def fades(data, ms=4):
    data = data.copy(); n = int(RATE * ms / 1000)
    data[:n] *= np.linspace(0, 1, n)[:, None]
    data[-n:] *= np.linspace(1, 0, n)[:, None]
    return data

evo = decode(ROOT / '.local/reference-KF0gxUd9CZA.webm')
fanfare = decode(ROOT / '.local/reference-3hHeGkCazTY.webm')
# Choose a quiet splice within 80ms of the user's 11s -> 15s cut.
def quiet_center(seconds):
    size = int(.008 * RATE)
    candidates = range(int((seconds - .08) * RATE), int((seconds + .08) * RATE), 48)
    return min(candidates, key=lambda i: float(np.mean(evo[i-size:i+size] ** 2)))
end = quiet_center(11)
start = quiet_center(15)
overlap = int(.032 * RATE)
first = evo[int(3.041 * RATE):end]
second = evo[start:int(20.46 * RATE)]
# Equal-gain crossfade avoids a discontinuity without an equal-power gain bump.
weight = np.linspace(0, 1, overlap)[:, None]
blend = first[-overlap:] * (1 - weight) + second[:overlap] * weight
music = fades(np.concatenate([first[:-overlap], blend, second[overlap:]]))
success = fades(evo[int(21.411 * RATE):int(24.84 * RATE)])
fanfare = fades(fanfare[int(.198 * RATE):int(1.44 * RATE)])

# Measure the mono cries on the same stereo output path as the BGM.
cry_levels = {}
for species in ['pikachu', 'raichu']:
    file = OUT / f'{species}-stereo.wav'
    write(file, decode(ROOT / f'assets/{species}.ogg'))
    cry_levels[species] = float(measure(file)['input_i'])
target = round(sum(cry_levels.values()) / len(cry_levels), 2)
report = {'cry_lufs_stereo': cry_levels, 'target_lufs': target,
          'source_music_segments': [[3.041, end / RATE], [start / RATE, 20.46]],
          'crossfade_ms': 32, 'recorded_cry_excluded': [20.46, 21.411],
          'success_source': [21.411, 24.84], 'tracks': {}}
for name, data in [('evolution', music), ('evolution-success', success), ('level-up-fanfare', fanfare)]:
    raw = OUT / f'{name}-edit.wav'; write(raw, data)
    measured = measure(raw, target)
    af = (f'loudnorm=I={target}:TP=-1.5:LRA=11:measured_I={measured["input_i"]}'
          f':measured_TP={measured["input_tp"]}:measured_LRA={measured["input_lra"]}'
          f':measured_thresh={measured["input_thresh"]}:offset={measured["target_offset"]}:linear=true')
    output = ROOT / f'assets/audio/{name}.mp3'
    subprocess.run([FFMPEG, '-y', '-v', 'error', '-i', str(raw), '-af', af, '-ar', str(RATE), '-c:a', 'libmp3lame', '-q:a', '2', str(output)], check=True)
    final = decode(output); levels = measure(output, target)
    report['tracks'][name] = {'duration': len(final) / RATE, 'lufs': float(levels['input_i']), 'true_peak_db': float(levels['input_tp'])}
    assert abs(float(levels['input_i']) - target) < 1.5, name
    assert float(levels['input_tp']) < 0, name

fig, axes = plt.subplots(3, 1, figsize=(12, 8))
for ax, data, title in [(axes[0], evo, 'Original: removed loop (orange) and recorded cry (red)'),
                       (axes[1], music, 'Shortened evolution music: 32ms crossfade at splice'),
                       (axes[2], success, 'Success music: starts at source 21.411s; no recorded cry')]:
    ax.plot(np.arange(len(data))[::24]/RATE, data[::24, 0], linewidth=.4)
    ax.set_title(title); ax.set_xlabel('Seconds'); ax.grid(alpha=.2)
axes[0].axvspan(end/RATE, start/RATE, color='orange', alpha=.2)
axes[0].axvspan(20.46, 21.411, color='red', alpha=.2)
axes[1].axvline((len(first)-overlap)/RATE, color='orange')
fig.tight_layout(); fig.savefig(OUT / 'waveforms.png', dpi=140)
(OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
print(json.dumps(report, indent=2))
