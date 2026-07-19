from __future__ import annotations

import re
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from src.dataprocess import normalize_powertrain_preference, powertrain_category


REGION_PRIORS = {
    "Japanese": 5.0,
    "Korean": 4.0,
    "European": 3.0,
    "American": 2.0,
    "Chinese": 1.0,
    "Indian": 1.0,
    "Other": 0.0,
}


def _text(source: Mapping[str, Any], field: str) -> str:
    return str(source.get(field) or "").strip()


def _number(source: Mapping[str, Any], *fields: str) -> Optional[float]:
    for field in fields:
        value = source.get(field)
        if value is None or value == "":
            continue
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        match = re.search(r"-?\d+(?:[.,]\d+)?", str(value))
        if match:
            return float(match.group(0).replace(",", "."))
    return None


def _contains_any(value: str, options: Sequence[str]) -> bool:
    lower_value = value.lower()
    return any(option.lower() in lower_value for option in options)


def _engine_displacement(car: Mapping[str, Any]) -> Optional[float]:
    if _text(car, "engine_type").lower() == "electric" or _contains_any(
        _text(car, "fuel_type"), ["electric", "bev"]
    ):
        return None
    value = _number(car, "engine_displacement_l", "engine_size")
    if value is not None and value >= 20:
        value /= 1000
    return value


def _engine_power_kw(car: Mapping[str, Any]) -> Optional[float]:
    return _number(car, "engine_power_kw")


def _safety_rating(car: Mapping[str, Any]) -> Optional[float]:
    return _number(car, "safety_rating", "safety_stars")


def _powertrain_category(car: Mapping[str, Any]) -> Optional[str]:
    category = _text(car, "powertrain_category")
    if category in {"ev", "non_ev", "plug_in_hybrid"}:
        return category
    return powertrain_category(_text(car, "fuel_type"), _text(car, "engine_type"))


def _add_factor(
    factors: List[Dict[str, Any]], name: str, score: float, reason: str
) -> float:
    if score:
        factors.append({"factor": name, "score": round(score, 2), "reason": reason})
    return score


def derive_purpose_strengths(car: Mapping[str, Any]) -> Dict[str, Dict[str, Any]]:
    """Return rule-derived multi-label purpose strengths with supporting evidence."""
    consumption = _number(car, "fuel_consumption_l_100km")
    torque = _number(car, "torque_nm")
    seats = _number(car, "seats")
    doors = _number(car, "doors")
    safety = _safety_rating(car)
    engine_size = _engine_displacement(car)
    engine_power_kw = _engine_power_kw(car)
    fuel_type = _text(car, "fuel_type")
    drivetrain = _text(car, "drivetrain").upper()
    transmission = _text(car, "transmission").lower()
    body_style = _text(car, "body_style").lower()

    commute_factors: List[Dict[str, Any]] = []
    commute = 0.0
    powertrain = _powertrain_category(car)
    if powertrain == "ev":
        commute += _add_factor(commute_factors, "powertrain", 16, "electric powertrain reduces commute running cost")
    elif powertrain == "plug_in_hybrid":
        commute += _add_factor(commute_factors, "powertrain", 10, "plug-in hybrid supports efficient city commuting")
    elif _contains_any(fuel_type, ["hybrid"]):
        commute += _add_factor(commute_factors, "powertrain", 6, "hybrid powertrain supports efficient commuting")
    if consumption is not None:
        if consumption <= 4.5:
            commute += _add_factor(commute_factors, "fuel_consumption", 28, "excellent commute efficiency")
        elif consumption <= 5.5:
            commute += _add_factor(commute_factors, "fuel_consumption", 22, "very low fuel use")
        elif consumption <= 6.5:
            commute += _add_factor(commute_factors, "fuel_consumption", 14, "efficient fuel use")
        elif consumption <= 7.5:
            commute += _add_factor(commute_factors, "fuel_consumption", 4, "acceptable commute fuel use")
        elif consumption >= 10.0:
            commute += _add_factor(commute_factors, "fuel_consumption", -32, "very high fuel use for commuting")
        elif consumption >= 9.0:
            commute += _add_factor(commute_factors, "fuel_consumption", -22, "high fuel use for commuting")
        elif consumption >= 8.3:
            commute += _add_factor(commute_factors, "fuel_consumption", -12, "elevated commute fuel cost")
    else:
        commute += _add_factor(commute_factors, "fuel_consumption", -8, "missing fuel-use data increases commute uncertainty")
    if engine_size is not None:
        if engine_size <= 1.6:
            commute += _add_factor(commute_factors, "engine_size", 10, "small displacement suits commuting")
        elif engine_size <= 2.0:
            commute += _add_factor(commute_factors, "engine_size", 6, "practical engine displacement")
        elif engine_size >= 3.0:
            commute += _add_factor(commute_factors, "engine_size", -20, "large displacement raises commute cost")
        elif engine_size >= 2.5:
            commute += _add_factor(commute_factors, "engine_size", -12, "bigger engine than typical commute needs")
    if engine_power_kw is not None:
        if engine_power_kw <= 110:
            commute += _add_factor(commute_factors, "engine_power", 8, "right-sized power for daily driving")
        elif engine_power_kw <= 150:
            commute += _add_factor(commute_factors, "engine_power", 4, "practical engine power")
        elif engine_power_kw >= 230:
            commute += _add_factor(commute_factors, "engine_power", -18, "excessive power for commute priorities")
        elif engine_power_kw >= 180:
            commute += _add_factor(commute_factors, "engine_power", -10, "higher power than needed for commuting")
    if drivetrain == "FWD":
        commute += _add_factor(commute_factors, "drivetrain", 5, "front-wheel drive suits daily use")
    elif drivetrain in {"AWD", "4WD"}:
        commute += _add_factor(commute_factors, "drivetrain", -4, "all-wheel-drive usually adds commute running cost")

    family_factors: List[Dict[str, Any]] = []
    family = 0.0
    if seats is not None:
        if seats >= 7:
            family += _add_factor(family_factors, "seats", 24, "seven or more seats")
        elif seats >= 5:
            family += _add_factor(family_factors, "seats", 14, "five or more seats")
        elif seats == 4:
            family += _add_factor(family_factors, "seats", 2, "minimum practical family seating")
        elif seats < 4:
            family += _add_factor(family_factors, "seats", -35, "too few seats for family use")
    if doors is not None:
        family += _add_factor(
            family_factors,
            "doors",
            12 if doors >= 5 else (6 if doors >= 4 else -24),
            "excellent family access" if doors >= 5 else ("practical door count" if doors >= 4 else "limited rear-seat access"),
        )
    if safety is not None:
        if safety >= 5:
            family += _add_factor(family_factors, "safety", 20, "top-tier safety rating")
        elif safety >= 4:
            family += _add_factor(family_factors, "safety", 12, "strong safety rating")
        elif safety >= 3:
            family += _add_factor(family_factors, "safety", 2, "meets baseline safety threshold")
        elif safety < 3:
            family += _add_factor(family_factors, "safety", -42, "safety rating below family threshold")
    if consumption is not None:
        if consumption <= 7.5:
            family += _add_factor(family_factors, "fuel_consumption", 8, "reasonable family running cost")
        elif consumption >= 10.0:
            family += _add_factor(family_factors, "fuel_consumption", -22, "very high family running cost")
        elif consumption >= 9.0:
            family += _add_factor(family_factors, "fuel_consumption", -14, "high family running cost")
    if _contains_any(body_style, ["suv", "wagon", "minivan", "van"]):
        family += _add_factor(family_factors, "body_style", 10, "practical family body style")
    elif _contains_any(body_style, ["coupe", "roadster", "convertible"]):
        family += _add_factor(family_factors, "body_style", -18, "body style is less practical for family tasks")
    if engine_power_kw is not None and engine_power_kw >= 260:
        family += _add_factor(family_factors, "engine_power", -10, "very high power is not essential for family use")

    sport_factors: List[Dict[str, Any]] = []
    sport = 0.0
    if torque is not None:
        if torque >= 450:
            sport += _add_factor(sport_factors, "torque", 32, "very strong torque output")
        elif torque >= 320:
            sport += _add_factor(sport_factors, "torque", 22, "strong torque output")
        elif torque >= 220:
            sport += _add_factor(sport_factors, "torque", 12, "responsive torque output")
        elif torque < 160:
            sport += _add_factor(sport_factors, "torque", -18, "limited torque for sport use")
    if engine_size is not None:
        if engine_size >= 3.0:
            sport += _add_factor(sport_factors, "engine_size", 22, "large performance-oriented displacement")
        elif engine_size >= 2.0:
            sport += _add_factor(sport_factors, "engine_size", 12, "capable engine displacement")
        elif engine_size < 1.6:
            sport += _add_factor(sport_factors, "engine_size", -10, "small displacement limits sport headroom")
    if engine_power_kw is not None:
        if engine_power_kw >= 280:
            sport += _add_factor(sport_factors, "engine_power", 28, "very strong engine or motor power")
        elif engine_power_kw >= 220:
            sport += _add_factor(sport_factors, "engine_power", 20, "strong engine or motor power")
        elif engine_power_kw >= 160:
            sport += _add_factor(sport_factors, "engine_power", 10, "capable engine or motor power")
        elif engine_power_kw < 120:
            sport += _add_factor(sport_factors, "engine_power", -15, "limited power for sport use")
    if drivetrain in {"RWD", "AWD", "4WD"}:
        sport += _add_factor(sport_factors, "drivetrain", 14, "performance-capable drivetrain")
    elif drivetrain == "FWD":
        sport += _add_factor(sport_factors, "drivetrain", -6, "front-wheel drive limits sport balance")
    if any(token in transmission for token in ("manual", "dual", "dct", "dsg")):
        sport += _add_factor(sport_factors, "transmission", 12, "driver-focused transmission")
    elif "cvt" in transmission:
        sport += _add_factor(sport_factors, "transmission", -10, "CVT is less engaging for sport driving")
    if _contains_any(body_style, ["coupe", "sport", "roadster"]):
        sport += _add_factor(sport_factors, "body_style", 10, "sport-oriented body style")
    elif _contains_any(body_style, ["minivan", "van"]):
        sport += _add_factor(sport_factors, "body_style", -20, "body style is not sport focused")
    if consumption is not None and consumption >= 13.0:
        sport += _add_factor(sport_factors, "fuel_consumption", -8, "very high fuel use for frequent spirited driving")

    leisure_factors: List[Dict[str, Any]] = []
    leisure = 0.0
    utility_body = _contains_any(body_style, ["suv", "ute", "pickup", "light truck"])
    if _contains_any(body_style, ["suv", "ute", "pickup", "light truck"]):
        leisure += _add_factor(leisure_factors, "body_style", 20, "utility-focused body style")
    elif _contains_any(body_style, ["wagon", "van", "minivan"]):
        leisure += _add_factor(leisure_factors, "body_style", 14, "practical travel body style")
    elif _contains_any(body_style, ["coupe", "roadster", "convertible"]):
        leisure += _add_factor(leisure_factors, "body_style", -14, "limited cargo or passenger flexibility")
    if seats is not None:
        if seats >= 7:
            leisure += _add_factor(leisure_factors, "seats", 18, "seven or more seats")
        elif seats >= 5:
            leisure += _add_factor(leisure_factors, "seats", 10, "five or more seats")
        elif seats < 4:
            leisure += _add_factor(leisure_factors, "seats", -24, "too few seats for leisure travel")
    if doors is not None:
        leisure += _add_factor(
            leisure_factors,
            "doors",
            8 if doors >= 4 else -14,
            "practical door count" if doors >= 4 else "limited passenger access",
        )
    if drivetrain in {"AWD", "4WD"}:
        leisure += _add_factor(leisure_factors, "drivetrain", 14, "all-wheel-drive capability")
    elif utility_body and drivetrain == "FWD":
        leisure += _add_factor(leisure_factors, "drivetrain", -6, "front-wheel drive limits utility traction")
    if engine_size is not None and engine_size >= 2.0:
        leisure += _add_factor(leisure_factors, "engine_size", 7, "capable engine displacement")
    if engine_power_kw is not None:
        if engine_power_kw >= 220:
            leisure += _add_factor(leisure_factors, "engine_power", 12, "strong engine or motor power")
        elif engine_power_kw >= 170:
            leisure += _add_factor(leisure_factors, "engine_power", 8, "capable engine or motor power")
        elif engine_power_kw >= 150:
            leisure += _add_factor(leisure_factors, "engine_power", 6, "capable engine or motor power")
        elif utility_body and engine_power_kw < 100:
            leisure += _add_factor(leisure_factors, "engine_power", -12, "limited power for a utility body style")
    if torque is not None:
        if torque >= 280:
            leisure += _add_factor(leisure_factors, "torque", 10, "useful torque for loaded travel")
        elif utility_body and torque < 170:
            leisure += _add_factor(leisure_factors, "torque", -8, "limited torque for loaded leisure trips")
    if safety is not None:
        if safety >= 5:
            leisure += _add_factor(leisure_factors, "safety", 10, "top-tier safety rating")
        elif safety >= 4:
            leisure += _add_factor(leisure_factors, "safety", 6, "strong safety rating")
        elif safety < 3:
            leisure += _add_factor(leisure_factors, "safety", -16, "low safety rating for travel use")
    if powertrain != "ev" and consumption is not None:
        if consumption <= 8.5:
            leisure += _add_factor(leisure_factors, "fuel_consumption", 6, "reasonable travel running cost")
        elif consumption >= 11.5:
            leisure += _add_factor(leisure_factors, "fuel_consumption", -20, "very high fuel use for leisure travel")
        elif consumption >= 10.0:
            leisure += _add_factor(leisure_factors, "fuel_consumption", -12, "high fuel use for leisure travel")

    return {
        "commute": {"score": round(commute, 2), "factors": commute_factors},
        "family": {"score": round(family, 2), "factors": family_factors},
        "sport": {"score": round(sport, 2), "factors": sport_factors},
        "leisure": {"score": round(leisure, 2), "factors": leisure_factors},
    }


def _is_quality_controlled(car: Mapping[str, Any]) -> bool:
    return "data_quality" in car or "engine_displacement_l" in car


def _matches_strict_filters(
    car: Mapping[str, Any],
    purpose: str,
    budget: float,
    fuel_type: str,
    powertrain_preference: str,
    brand_preference: str,
    is_first_car: bool,
) -> bool:
    price = _number(car, "avg_nz_price")
    if budget > 0 and price is not None and price > budget:
        return False
    seats = _number(car, "seats")
    doors = _number(car, "doors")
    safety = _safety_rating(car)
    if purpose in {"family", "business"} and (
        (seats is not None and seats < 4) or (doors is not None and doors < 4)
    ):
        return False
    if (purpose == "family" or is_first_car) and safety is not None and safety < 3:
        return False
    quality = car.get("data_quality", {})
    if _is_quality_controlled(car) and isinstance(quality, Mapping) and not quality.get("eligible", True):
        return False
    if fuel_type != "any" and fuel_type not in _text(car, "fuel_type").lower():
        return False
    if (
        powertrain_preference != "any"
        and _powertrain_category(car) != powertrain_preference
    ):
        return False
    if brand_preference != "any" and _text(car, "make").lower() != brand_preference:
        return False
    return True


def _score_car(
    car: Mapping[str, Any],
    purpose: str,
    budget: float,
    is_first_car: bool,
    fuel_type: str,
    powertrain_preference: str,
    brand_preference: str,
    relaxed: bool,
) -> Tuple[float, List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    factors: List[Dict[str, Any]] = []
    strengths = derive_purpose_strengths(car)
    purpose_key = purpose if purpose in strengths else "commute"
    score = _add_factor(
        factors,
        f"{purpose_key}_fit",
        strengths[purpose_key]["score"],
        f"rule-derived {purpose_key} suitability",
    )

    make = _text(car, "make").lower()
    if brand_preference != "any":
        score += _add_factor(
            factors,
            "brand_preference",
            45 if make == brand_preference else -20,
            "matches selected make" if make == brand_preference else "does not match selected make",
        )
    region = _text(car, "brand_region") or "Other"
    score += _add_factor(
        factors,
        "brand_region",
        REGION_PRIORS.get(region, 0.0),
        f"configured {region} brand-region prior",
    )

    consumption = _number(car, "fuel_consumption_l_100km")
    torque = _number(car, "torque_nm")
    engine_size = _engine_displacement(car)
    engine_power_kw = _engine_power_kw(car)
    drivetrain = _text(car, "drivetrain").upper()
    if is_first_car:
        if torque is not None and torque >= 350:
            score += _add_factor(factors, "first_car_torque", -18, "very high torque for a first car")
        elif torque is not None and torque <= 220:
            score += _add_factor(factors, "first_car_torque", 8, "manageable torque for a first car")
        if engine_size is not None and engine_size > 2.5:
            score += _add_factor(factors, "first_car_engine", -14, "large displacement for a first car")
        elif engine_size is not None and engine_size <= 2.0:
            score += _add_factor(factors, "first_car_engine", 8, "practical displacement for a first car")
        if engine_power_kw is not None and engine_power_kw >= 250:
            score += _add_factor(factors, "first_car_power", -14, "very high engine or motor power for a first car")
        elif engine_power_kw is not None and engine_power_kw <= 150:
            score += _add_factor(factors, "first_car_power", 6, "manageable engine or motor power for a first car")
        if consumption is not None and consumption >= 8.5:
            score += _add_factor(factors, "first_car_consumption", -10, "high first-car fuel cost")
        if drivetrain == "RWD":
            score += _add_factor(factors, "first_car_drivetrain", -6, "rear-wheel drive novice penalty")

    fuel_value = _text(car, "fuel_type").lower()
    if fuel_type != "any":
        score += _add_factor(
            factors,
            "fuel_preference",
            15 if fuel_type in fuel_value else (-12 if relaxed else 0),
            "matches selected fuel" if fuel_type in fuel_value else "does not match selected fuel",
        )
    if powertrain_preference != "any":
        powertrain_match = _powertrain_category(car) == powertrain_preference
        score += _add_factor(
            factors,
            "powertrain_preference",
            14 if powertrain_match else (-16 if relaxed else 0),
            (
                f"matches selected {powertrain_preference.replace('_', ' ')} powertrain"
                if powertrain_match
                else f"does not match selected {powertrain_preference.replace('_', ' ')} powertrain"
            ),
        )

    if relaxed:
        price = _number(car, "avg_nz_price")
        if price is not None and budget > 0 and price > budget:
            score += _add_factor(
                factors,
                "budget",
                -min(((price - budget) / 1000.0) * 8.0, 50.0),
                "above requested budget",
            )
        if purpose in {"family", "business"}:
            seats = _number(car, "seats")
            doors = _number(car, "doors")
            if seats is not None and seats < 4:
                score += _add_factor(factors, "family_seats", (4 - seats) * -12, "below family seat minimum")
            if doors is not None and doors < 4:
                score += _add_factor(factors, "family_doors", (4 - doors) * -12, "below family door minimum")
    return score, factors, strengths


def recommend_cars(
    user_inputs: Mapping[str, Any], car_database: Sequence[Mapping[str, Any]], top_n: int = 10
) -> List[Dict[str, Any]]:
    """Return top matches with transparent reward/penalty breakdowns."""
    purpose = _text(user_inputs, "purpose").lower() or "commute"
    budget = _number(user_inputs, "budget") or 0.0
    is_first_car = bool(user_inputs.get("is_first_car", user_inputs.get("isFirstCar", False)))
    fuel_type = _text(user_inputs, "fuel_type") or _text(user_inputs, "fuelType") or "any"
    powertrain_preference = normalize_powertrain_preference(
        user_inputs.get(
            "powertrain_preference", user_inputs.get("powertrainPreference", "any")
        )
    )
    brand_preference = _text(user_inputs, "brand_preference") or _text(user_inputs, "brandPreference") or "any"
    fuel_type = fuel_type.lower()
    brand_preference = brand_preference.lower()

    strict = [
        car
        for car in car_database
        if _matches_strict_filters(
            car=car,
            purpose=purpose,
            budget=budget,
            fuel_type=fuel_type,
            powertrain_preference=powertrain_preference,
            brand_preference=brand_preference,
            is_first_car=is_first_car,
        )
    ]
    fallback_source = [
        car
        for car in car_database
        if not (
            _is_quality_controlled(car)
            and isinstance(car.get("data_quality"), Mapping)
            and not car["data_quality"].get("eligible", True)
        )
        and (
            powertrain_preference == "any"
            or _powertrain_category(car) == powertrain_preference
        )
    ]
    scored_source = strict or fallback_source
    relaxed = not bool(strict)

    scored: List[Dict[str, Any]] = []
    for car in scored_source:
        score, breakdown, strengths = _score_car(
            car,
            purpose,
            budget,
            is_first_car,
            fuel_type,
            powertrain_preference,
            brand_preference,
            relaxed,
        )
        scored_car = dict(car)
        scored_car["match_score"] = round(score, 2)
        scored_car["purpose_strengths"] = strengths
        scored_car["score_breakdown"] = breakdown
        scored_car["penalty_reasons"] = [item["reason"] for item in breakdown if item["score"] < 0]
        scored_car["recommendation_mode"] = "fallback" if relaxed else "strict"
        scored.append(scored_car)

    return sorted(scored, key=lambda car: car["match_score"], reverse=True)[:top_n]