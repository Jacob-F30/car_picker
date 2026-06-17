from __future__ import annotations

from typing import Any, Dict, List


def _contains_any(value: str, options: List[str]) -> bool:
    lower_value = value.lower()
    return any(option.lower() in lower_value for option in options)


def _matches_strict_filters(
    car: Dict[str, Any],
    purpose: str,
    budget: float,
    fuel_type: str,
    brand_preference: str,
) -> bool:
    if float(car.get("avg_nz_price", 0)) > budget:
        return False
    if purpose in {"family", "business"} and (
        int(car.get("seats", 0)) < 4 or int(car.get("doors", 0)) < 4
    ):
        return False
    if fuel_type != "any" and fuel_type not in str(car.get("fuel_type", "")).lower():
        return False
    if brand_preference != "any" and str(car.get("make", "")).lower() != brand_preference:
        return False
    return True


def _score_car(
    car: Dict[str, Any],
    purpose: str,
    years_to_keep: int,
    budget: float,
    is_first_car: bool,
    fuel_type: str,
    brand_preference: str,
    relaxed: bool = False,
) -> float:
    score = 0.0
    fuel_consumption = float(car.get("fuel_consumption_l_100km", 0))
    car_fuel_type = str(car.get("fuel_type", ""))
    drivetrain = str(car.get("drivetrain", ""))
    make = str(car.get("make", "")).lower()
    hp = float(car.get("hp", 0))
    engine_size = float(car.get("engine_size", 0))

    if purpose == "commute":
        if fuel_consumption <= 6.5 or _contains_any(car_fuel_type, ["Hybrid", "EV"]):
            score += 50
        score -= fuel_consumption * 5
    elif purpose == "sport":
        if hp > 180:
            score += 30
        if float(car.get("torque_nm", 0)) > 250:
            score += 20
        if drivetrain in {"RWD", "AWD"}:
            score += 40
    elif purpose in {"family", "leisure", "business"}:
        if float(car.get("boot_size_liters", 0)) >= 400:
            score += 30
        if int(car.get("seats", 0)) >= 5:
            score += 20
        if purpose == "leisure" and drivetrain in {"AWD", "4WD"}:
            score += 20

    if is_first_car:
        if hp >= 180:
            score -= 15
        elif hp > 0 and hp <= 130:
            score += 12
        if fuel_consumption >= 8.5:
            score -= 8
        elif fuel_consumption > 0 and fuel_consumption <= 6.5:
            score += 8
        if engine_size > 0 and engine_size <= 1.6:
            score += 6
        if drivetrain == "RWD":
            score -= 6

    if years_to_keep >= 5:
        parts_availability = str(car.get("parts_availability", ""))
        if parts_availability.lower() in {"good", "excellent"}:
            score += 25
        if float(car.get("expected_lifespan_km", 0)) < 180000:
            score -= 30

    if fuel_type != "any":
        if fuel_type in car_fuel_type.lower():
            score += 18
        elif relaxed:
            score -= 12
    if brand_preference != "any":
        if make == brand_preference:
            score += 14
        elif relaxed:
            score -= 10

    if relaxed:
        price = float(car.get("avg_nz_price", 0))
        if price > budget:
            score -= min(((price - budget) / 1000.0) * 8.0, 40.0)
        if purpose in {"family", "business"}:
            seats = int(car.get("seats", 0))
            doors = int(car.get("doors", 0))
            if seats < 4:
                score -= (4 - seats) * 10
            if doors < 4:
                score -= (4 - doors) * 10

    return score


def _purpose_alignment_score(car: Dict[str, Any], purpose: str) -> float:
    fuel_consumption = float(car.get("fuel_consumption_l_100km", 0))
    car_fuel_type = str(car.get("fuel_type", ""))
    drivetrain = str(car.get("drivetrain", ""))

    if purpose == "commute":
        score = 0.0
        if fuel_consumption <= 6.5 or _contains_any(car_fuel_type, ["Hybrid", "EV"]):
            score += 50
        score -= fuel_consumption * 5
        return score
    if purpose == "sport":
        score = 0.0
        if float(car.get("hp", 0)) > 180:
            score += 30
        if float(car.get("torque_nm", 0)) > 250:
            score += 20
        if drivetrain in {"RWD", "AWD"}:
            score += 40
        return score
    if purpose in {"family", "leisure", "business"}:
        score = 0.0
        if float(car.get("boot_size_liters", 0)) >= 400:
            score += 30
        if int(car.get("seats", 0)) >= 5:
            score += 20
        if purpose == "leisure" and drivetrain in {"AWD", "4WD"}:
            score += 20
        return score
    return 0.0


def recommend_cars(
    user_inputs: Dict[str, Any], car_database: List[Dict[str, Any]], top_n: int = 3
) -> List[Dict[str, Any]]:
    purpose = str(user_inputs.get("purpose", "")).lower()
    budget = float(user_inputs.get("budget", 0))
    is_first_car = bool(user_inputs.get("is_first_car", False))
    years_to_keep = int(user_inputs.get("years_to_keep", 0))
    fuel_type = str(user_inputs.get("fuel_type", user_inputs.get("fuelType", "any"))).lower()
    brand_preference = str(
        user_inputs.get("brand_preference", user_inputs.get("brandPreference", "any"))
    ).lower()

    filtered_cars = [
        car
        for car in car_database
        if _matches_strict_filters(
            car, purpose, budget, fuel_type, brand_preference
        )
    ]

    scored_source = filtered_cars
    relaxed = False
    if scored_source:
        best_alignment = max(
            _purpose_alignment_score(car, purpose) for car in scored_source
        )
        if best_alignment < 20:
            scored_source = list(car_database)
            relaxed = True
    else:
        scored_source = list(car_database)
        relaxed = True

    scored: List[Dict[str, Any]] = []
    for car in scored_source:
        score = _score_car(
            car,
            purpose,
            years_to_keep,
            budget,
            is_first_car,
            fuel_type,
            brand_preference,
            relaxed=relaxed,
        )

        scored_car = dict(car)
        scored_car["match_score"] = round(score, 2)
        scored_car["recommendation_mode"] = "fallback" if relaxed else "strict"
        scored.append(scored_car)

    return sorted(scored, key=lambda car: car["match_score"], reverse=True)[:top_n]
