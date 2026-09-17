# Growth audio sources

Source: https://github.com/pagefaultgames/pokerogue-assets
Pinned revision: `72c9fc10de396405083622f29d89b875b3d8d137`

- `level-up.wav`: `audio/se/level_up.wav` (unchanged)
- `level-up-fanfare.mp3`: user-selected https://www.youtube.com/watch?v=3hHeGkCazTY — “Pokemon Level Up - Sound Effect (HD)”, SFX Central. Retained 0.198–1.440s, removing ~2.9s trailing silence.
- `evolution.mp3`: user-selected https://www.youtube.com/watch?v=KF0gxUd9CZA — “Pokemon Evolution Template (Open to Download and Public Use)”, KazeofHope. Retained 3.041–11.078s and 15.021–20.460s, with a 32ms equal-gain crossfade at a low-energy splice. Duration: 13.444s.
- `evolution-success.mp3`: same evolution reference, retained 21.411–24.840s (actual success-music onset through its natural decay). Duration: 3.429s.

The recorded cry and interruption at 20.460–21.411s are excluded completely. The app plays its own full current/evolved species cries, waiting for each clip's end rather than fixed timestamps. Four-millisecond outer fades suppress cut-edge clicks. No speed changes are applied.

Music loudness is normalized using FFmpeg loudnorm against the average measured integrated loudness of Pikachu and Raichu on a consistent stereo output path (-12.46 LUFS). Measured encoded results: evolution -12.28 LUFS / -1.44 dBTP; success -12.56 LUFS / -1.50 dBTP. Both use the same 0.45 playback volume as evolution cries. Fanfare: -13.46 LUFS / -1.38 dBTP.

Rebuild: `python scripts/edit-growth-audio.py` with the source downloads in `.local/reference-*.webm`, NumPy, Matplotlib, and FFmpeg. Waveform plots and measured values are saved to `.local/audio-edit/`. The former PokéRogue Black/White evolution track has been replaced.

These Pokémon audio assets are not claimed as original Tokemon audio or as freely licensed music. Rights remain with their respective owners. The upstream repository describes its use of Pokémon assets in `LICENSES/LicenseRef-FAIR-USE.txt`; this is the upstream project's position, not a grant of rights or a legal determination for Tokemon.

Upstream notice:
https://github.com/pagefaultgames/pokerogue-assets/blob/72c9fc10de396405083622f29d89b875b3d8d137/LICENSES/LicenseRef-FAIR-USE.txt
