# Cat Cascade

A responsive, physics-based meme cat merge game inspired by the supplied video. Drop matching cats into the neon bowl to merge them through seven evolutions. Includes the video’s cat cutouts and soundtrack, touch and keyboard controls, press-and-hold cat rain, pause/resume, restart, and a locally saved best score.

## Run

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For production, run `npm run build` and serve the `dist` directory. `npm run preview` previews that build. `npm test` runs the game-rule checks.

## Controls

- Move the pointer or drag on touch to aim; click or tap to drop.
- Hold to keep dropping cats.
- Left/right arrows aim; Space drops; P or Escape pauses; M toggles audio.
- Music begins after starting. The speaker button controls music and merge sounds.
- Keep the neck clear. A settled cat above the line for 2.4 seconds ends the round.

## Implementation

Vite, vanilla JavaScript, and Matter.js. Fixed-step physics, sleeping bodies, bounded particles and cat counts, capped device pixel ratio, compressed WebP sprites, deferred MP3 loading, and automatic pause in hidden tabs. No backend or account needed. High score and sound preference are stored on this device when browser storage is available.

The supplied reference video is the source of the seven cat sprites and compressed audio in `public/assets`. Fonts are served locally, with their Open Font License texts in `public/assets/fonts`.
