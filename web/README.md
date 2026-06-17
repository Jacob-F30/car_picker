# Car Picker Frontend

This is a minimal Vite + React + TypeScript frontend port of the Python rule-based car picker. It loads `public/data/cars_db.json`, runs the recommendation logic client-side, and renders results.

Quick start:

```bash
cd web
npm install
npm run dev
# open http://localhost:5173
```

Build & deploy to GitHub Pages (simple):

```bash
cd web
npm run build
npm run deploy
```

Notes:
- `vite.config.ts` sets `base` to `/car_picker/` for GitHub Pages; change if your repo name differs.
- For CI deploy use a GitHub Actions workflow to build and publish `dist/`.
