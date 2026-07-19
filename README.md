# car_picker
Have no idea what car to buy? Here's the answer!

## Deterministic NZ car picker

Current architecture priority:
- Primary runtime: static frontend scoring in the browser.
- Backend Python engine: maintained for future API/service rollout and parity testing.

This repo now includes a rule-based local recommendation flow (no external LLM calls):

- `data/` - 2000 - 2026 spread sheet with models, submodels, fuel consumption, doors, engine, etc by makers
- `data/cars_normalized.json` - canonical normalized government-data catalog used for recommendations.
- `src/engine.py` - hard filters + purpose-driven scoring.
- `src/api.py` - optional local HTTP API for development/testing.
- `src/formatter.py` - markdown recommendation/maintenance breakdown generator.
- `tests/` - focused unit tests for preprocessing, scoring, and the API service.

Run the primary frontend in static mode (GitHub Pages compatible):

```bash
cd web
npm install
npm run dev
```

Optional (future backend path): run the local API for parity testing with:

```bash
python -m src.api
```
