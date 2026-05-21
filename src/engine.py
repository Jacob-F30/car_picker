from __future__ import annotations

from typing import Any, Dict, List


def _contains_any(value: str, options: List[str]) -> bool:
    lower_value = value.lower()
    return any(option.lower() in lower_value for option in options)


def recommend_cars(
    user_inputs: Dict[str, Any], car_database: List[Dict[str, Any]], top_n: int = 3
) -> List[Dict[str, Any]]:
    purpose = str(user_inputs.get("purpose", "")).lower()
    budget = float(user_inputs.get("budget", 0))
    is_first_car = bool(user_inputs.get("is_first_car", False))
    years_to_keep = int(user_inputs.get("years_to_keep", 0))

    filtered_cars: List[Dict[str, Any]] = []

    for car in car_database:
        if float(car.get("avg_nz_price", 0)) > budget:
            continue
        if is_first_car and not bool(car.get("is_good_first_car", False)):
            continue
        if purpose in {"family", "business"} and (
            int(car.get("seats", 0)) < 4 or int(car.get("doors", 0)) < 4
        ):
            continue
        filtered_cars.append(car)

    scored: List[Dict[str, Any]] = []
    for car in filtered_cars:
        score = 0.0
        fuel_consumption = float(car.get("fuel_consumption_l_100km", 0))
        fuel_type = str(car.get("fuel_type", ""))
        motto = str(car.get("motto", ""))
        drivetrain = str(car.get("drivetrain", ""))

        if purpose == "commute":
            if fuel_consumption <= 6.5 or _contains_any(fuel_type, ["Hybrid", "EV"]):
                score += 50
            if _contains_any(motto, ["Comfort", "Eco"]):
                score += 20
            score -= fuel_consumption * 5
        elif purpose == "sport":
            if float(car.get("hp", 0)) > 180:
                score += 30
            if float(car.get("torque_nm", 0)) > 250:
                score += 20
            if drivetrain in {"RWD", "AWD"}:
                score += 40
            if motto.lower() == "sport":
                score += 30
        elif purpose in {"family", "leisure"}:
            if float(car.get("boot_size_liters", 0)) >= 400:
                score += 30
            if int(car.get("seats", 0)) >= 5:
                score += 20
            if _contains_any(motto, ["Comfort", "Leisure"]):
                score += 20
            if purpose == "leisure" and drivetrain in {"AWD", "4WD"}:
                score += 20

        if years_to_keep >= 5:
            parts_availability = str(car.get("parts_availability", ""))
            if parts_availability.lower() in {"good", "excellent"}:
                score += 25
            if float(car.get("expected_lifespan_km", 0)) < 180000:
                score -= 30

        scored_car = dict(car)
        scored_car["match_score"] = round(score, 2)
        scored.append(scored_car)

    return sorted(scored, key=lambda car: car["match_score"], reverse=True)[:top_n]
