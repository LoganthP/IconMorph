# IconMorph Landing Page

Static marketing website for **iconmorph.** (`v0.2.1`), built as a standalone Vite + React + TypeScript + Tailwind CSS v4 site using the desktop app's exact OKLCH design tokens, themes, and bundled fonts.

## Develop

```bash
cd landing
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build & Preview

```bash
npm run build
npm run preview
```

Output is written to `landing/dist/`.

## Configuration

Update external URLs and version metadata in one place: [`src/config.ts`](src/config.ts) (`SITE_CONFIG.releasesUrl`, `repoUrl`, `version`).

## Deploy

### Vercel
1. Import the repository in Vercel.
2. Set **Root Directory** to `landing`.
3. Build command: `npm run build` · Output directory: `dist`.

### GitHub Pages
1. Build with `cd landing && npm ci && npm run build`.
2. Deploy `landing/dist` to the `gh-pages` branch (or configure a GitHub Actions workflow using `actions/upload-pages-artifact` with `path: landing/dist`).
`vite.config.ts` uses `base: "./"` so assets resolve cleanly on both root domains and `/IconMorph/` subpaths.
