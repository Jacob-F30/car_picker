from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from src.engine import recommend_cars
from src.formatter import format_recommendations


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "cars_db.json"
FRONTEND_PATH = ROOT / "src" / "static" / "index.html"


def _load_car_database() -> List[Dict[str, Any]]:
    return json.loads(DB_PATH.read_text(encoding="utf-8"))


CAR_DATABASE = _load_car_database()

app = FastAPI(title="Car Picker Web API")


class RecommendationRequest(BaseModel):
    purpose: str
    budget: float = Field(ge=0)
    is_first_car: bool = False
    years_to_keep: int = Field(default=3, ge=0)
    top_n: int = Field(default=3, ge=1, le=10)


@app.get("/")
def frontend() -> FileResponse:
    return FileResponse(FRONTEND_PATH)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/recommendations")
def recommendations(payload: RecommendationRequest) -> Dict[str, Any]:
    user_inputs = {
        "country": "New Zealand",
        "purpose": payload.purpose,
        "is_first_car": payload.is_first_car,
        "is_personal_use": True,
        "years_to_keep": payload.years_to_keep,
        "budget": payload.budget,
    }
    top_cars = recommend_cars(user_inputs, CAR_DATABASE, top_n=payload.top_n)
    markdown = format_recommendations(top_cars, user_inputs)

    return {
        "inputs": user_inputs,
        "top_cars": top_cars,
        "markdown": markdown,
    }
