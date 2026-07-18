# Car Picker Frontend

This Vite + React + TypeScript frontend renders recommendations from the canonical Python engine. It does not score cars in the browser or load the legacy five-car fixture.

Quick start:

```bash
cd ..
python -m src.api
```

In a second terminal:

```bash
cd web
npm install
npm run dev
# open http://localhost:5173
```

The Vite development server proxies `/api` to `http://127.0.0.1:8000`. For a separately hosted API, set `VITE_API_BASE_URL` to that API's `/api` base URL before building.

Build the frontend:

```bash
cd web
npm run build
```

Notes:
- `vite.config.ts` sets `base` to `/car_picker/`; change it if the deployment path differs.
- A static GitHub Pages deployment needs an independently hosted Python API configured through `VITE_API_BASE_URL`.
