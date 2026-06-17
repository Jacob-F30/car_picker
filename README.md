# car_picker
Have no idea what car to buy? Here's the answer!

## Deterministic NZ car picker

This repo now includes a rule-based local recommendation flow (no external LLM calls):

- `data/cars_db.json` - NZ-focused sample vehicle dataset.
- `data/` - 2000 - 2026 spread sheet with models, submodels, fuel consumption, doors, engine, etc by makers
- `src/engine.py` - hard filters + purpose-driven scoring.
- `src/formatter.py` - markdown recommendation/maintenance breakdown generator.
- `tests/test_engine_formatter.py` - focused unit tests for filtering, scoring, and formatting.
