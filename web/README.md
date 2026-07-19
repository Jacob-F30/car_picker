# Car Picker Frontend

This Vite + React + TypeScript frontend runs fully static scoring in the browser using the canonical normalized dataset.

Architecture status:
- This frontend static scorer is the current production path.
- The Python backend engine exists for future service integration and scoring parity.

Quick start:

```bash
cd web
npm install
npm run dev
# open http://localhost:5173
```

Build the frontend:

```bash
cd web
npm run build
```

Notes:
- `vite.config.ts` sets `base` to `/car_picker/`; change it if the deployment path differs.
- GitHub Pages deployment works without any backend host because recommendations are computed from `public/data/cars_normalized.json`.
