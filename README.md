# car_picker
Have no idea what car to buy? Here's the answer!

## Deterministic NZ car picker

This repo now includes a rule-based local recommendation flow (no external LLM calls):

- `data/cars_db.json` - NZ-focused sample vehicle dataset.
- `data/` - 2000 - 2026 spread sheet with models, submodels, fuel consumption, doors, engine, etc by makers
- `data/cars_normalized.json` - canonical normalized government-data catalog used for recommendations.
- `src/engine.py` - hard filters + purpose-driven scoring.
- `src/api.py` - local HTTP API exposing normalized brands and canonical top-10 results.
- `src/formatter.py` - markdown recommendation/maintenance breakdown generator.
- `tests/` - focused unit tests for preprocessing, scoring, and the API service.

Run the local API with:

```bash
python -m src.api
```
