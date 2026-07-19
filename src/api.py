"""Local HTTP API for canonical car recommendations."""

from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from typing import Any, Dict, Mapping, Optional, Sequence
from urllib.parse import parse_qs, urlparse

from src.engine import recommend_cars


DEFAULT_CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "cars_normalized.json"
_PUBLIC_RESULT_FIELDS = (
    "make",
    "model",
    "trim",
    "year",
    "body_style",
    "fuel_type",
    "engine_type",
    "powertrain_category",
    "engine_displacement_cc",
    "engine_displacement_l",
    "engine_power_kw",
    "torque_nm",
    "transmission",
    "doors",
    "seats",
    "fuel_consumption_l_100km",
    "safety_stars",
    "safety_rating",
    "brand_region",
    "data_quality",
    "match_score",
    "purpose_strengths",
    "score_breakdown",
    "penalty_reasons",
    "recommendation_mode",
)


def _truthy(value: Any) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _top_n(value: Any) -> int:
    try:
        return min(max(int(value), 1), 10)
    except (TypeError, ValueError):
        return 10


def _load_catalog(catalog_path: Path) -> list[Dict[str, Any]]:
    with catalog_path.open(encoding="utf-8") as catalog_file:
        data = json.load(catalog_file)
    if not isinstance(data, list):
        raise ValueError("The normalized catalog must be a JSON array.")
    return [dict(car) for car in data if isinstance(car, Mapping)]


def _public_result(car: Mapping[str, Any]) -> Dict[str, Any]:
    return {field: car.get(field) for field in _PUBLIC_RESULT_FIELDS}


class RecommendationService:
    """Load the normalized catalog once and expose canonical engine responses."""

    def __init__(
        self,
        catalog_path: Path = DEFAULT_CATALOG_PATH,
        cars: Optional[Sequence[Mapping[str, Any]]] = None,
    ) -> None:
        self.cars = [dict(car) for car in cars] if cars is not None else _load_catalog(catalog_path)
        self.brands = sorted(
            {
                str(car.get("make")).strip()
                for car in self.cars
                if str(car.get("make") or "").strip()
            },
            key=str.casefold,
        )

    def brand_catalog(self) -> Dict[str, Any]:
        return {"brands": self.brands, "count": len(self.brands)}

    def recommendations(self, query: Mapping[str, Any]) -> Dict[str, Any]:
        inputs = {
            "purpose": query.get("purpose", "commute"),
            "budget": query.get("budget", 0),
            "is_first_car": _truthy(query.get("is_first_car", query.get("isFirstCar"))),
            "fuel_type": query.get("fuel_type", query.get("fuelType", "any")),
            "powertrain_preference": query.get(
                "powertrain_preference", query.get("powertrainPreference", "any")
            ),
            "brand_preference": query.get(
                "brand_preference", query.get("brandPreference", "any")
            ),
        }
        results = recommend_cars(inputs, self.cars, top_n=_top_n(query.get("top_n", 10)))
        return {
            "results": [_public_result(result) for result in results],
            "count": len(results),
            "top_n": _top_n(query.get("top_n", 10)),
        }


class RecommendationRequestHandler(BaseHTTPRequestHandler):
    service: RecommendationService

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        query = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
        if parsed.path == "/api/brands":
            self._write_json(HTTPStatus.OK, self.service.brand_catalog())
            return
        if parsed.path == "/api/recommendations":
            self._write_json(HTTPStatus.OK, self.service.recommendations(query))
            return
        self._write_json(HTTPStatus.NOT_FOUND, {"error": "Route not found."})

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _write_json(self, status: HTTPStatus, payload: Mapping[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run_server(host: str = "127.0.0.1", port: int = 8000, catalog_path: Path = DEFAULT_CATALOG_PATH) -> None:
    service = RecommendationService(catalog_path=catalog_path)

    class Handler(RecommendationRequestHandler):
        pass

    Handler.service = service
    with ThreadingHTTPServer((host, port), Handler) as server:
        print(f"Car Picker API listening at http://{host}:{port}")
        server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Car Picker local API.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8000, type=int)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG_PATH)
    args = parser.parse_args()
    run_server(host=args.host, port=args.port, catalog_path=args.catalog)


if __name__ == "__main__":
    main()
