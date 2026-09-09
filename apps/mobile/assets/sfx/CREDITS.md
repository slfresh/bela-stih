# Sound effects

All sounds in this folder are **generated**, not sourced: `node scripts/make-sfx.mjs`
synthesises them from oscillators and filtered noise (the sounds themselves live in
`scripts/sfx-bank.mjs`; every file is levelled to the same loudness there, so retune the
trims in that table rather than the files). Never edit a `.wav` by hand — the next run
overwrites the folder.

That means there is no third-party audio to license, attribute or track, and the whole
kit is a few numbers away from being retuned. If we later swap in recorded foley, use
CC0 sources (Kenney's *Interface Sounds* / *UI Audio*, or Freesound filtered to CC0)
and keep the same filenames so nothing else has to change — then record each file's
origin and licence here.
