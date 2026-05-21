# car_picker
Have no idea what car to buy? Here's the answer!

## Deterministic NZ car picker

This repo now includes a rule-based local recommendation flow (no external LLM calls):

- `data/cars_db.json` — NZ-focused sample vehicle dataset.
- `src/engine.py` — hard filters + purpose-driven scoring.
- `src/formatter.py` — markdown recommendation/maintenance breakdown generator.
- `src/web_app.py` — FastAPI backend + frontend entrypoint.
- `src/static/index.html` — simple web frontend for collecting user input.
- `tests/test_engine_formatter.py` — focused unit tests for filtering, scoring, and formatting.
- `tests/test_web_app.py` — integration tests for web endpoints.

## Run tests

```bash
python -m unittest tests/test_engine_formatter.py -v
python -m unittest tests/test_web_app.py -v
```

## Run web app

1. Install dependencies:

```bash
pip install -r requirements.txt
```

2. Start server:

```bash
uvicorn src.web_app:app --reload
```

3. Open `http://127.0.0.1:8000`
