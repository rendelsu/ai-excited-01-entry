# ai-excited-01-entry

[![make.fun · ai-excited-01](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/rendelsu/ai-excited-01-entry/rank.svg)](https://make.fun/bounty/ai-excited-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/rendelsu/ai-excited-01-entry/reward.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)

**THE FRAME BREAKS FIRST** — a classical portrait steps halfway out of its
gilded museum frame, one hand reaching toward the viewer while a neon city
pours through the broken corner. The painting refused to stay a painting.

The image is drawn entirely by code: `main.ts` (Node standard library only)
runs a small software rasterizer and a hand-rolled PNG encoder, and writes
one 1024×1024 PNG. No assets, no network, fully deterministic — two runs
produce byte-identical output.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

The image lands at `out/entry.png`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=rkkz4bh8&utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01) · referral: https://make.fun/r/rkkz4bh8</sub>
