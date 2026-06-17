from __future__ import annotations

from typing import Any, Dict, List


def _fit_year_bracket(car: Dict[str, Any], budget: float) -> str:
    start_year, end_year = car.get("year_range", [None, None])
    avg_price = float(car.get("avg_nz_price", 0))
    if budget >= avg_price:
        return f"{start_year}-{end_year}"
    if start_year is None or end_year is None:
        return "Unknown"
    midpoint = int((int(start_year) + int(end_year)) / 2)
    return f"{start_year}-{midpoint}"


def _purpose_fit_text(car: Dict[str, Any], purpose: str) -> str:
    drivetrain = car.get("drivetrain", "Unknown")
    engine_size = car.get("engine_size", "Unknown")
    hp = car.get("hp", "Unknown")
    torque = car.get("torque_nm", "Unknown")
    boot = car.get("boot_size_liters", "Unknown")

    if purpose == "sport":
        return (
            f"The {drivetrain} layout with a {engine_size}L engine, {hp} hp, and "
            f"{torque} Nm supports sharper performance-focused driving."
        )
    if purpose in {"family", "business", "leisure"}:
        return (
            f"The {drivetrain} setup and {boot}L boot capacity support practical "
            f"space and stability expectations for {purpose} use."
        )
    return (
        f"The {engine_size}L powertrain and {drivetrain} drivetrain align with "
        f"daily efficiency and usability needs."
    )


def format_recommendations(
    top_cars: List[Dict[str, Any]], user_inputs: Dict[str, Any]
) -> str:
    if not top_cars:
        return "## No suitable cars found\n\nTry increasing your budget or relaxing one filter."

    purpose = str(user_inputs.get("purpose", "")).lower()
    budget = float(user_inputs.get("budget", 0))
    fallback_mode = any(car.get("recommendation_mode") == "fallback" for car in top_cars)

    lines = [
        "## Best available car matches" if fallback_mode else "## Top Car Recommendations (NZ Market)"
    ]
    if fallback_mode:
        lines.append(
            "These options relax one or more filters so you still get a useful shortlist."
        )
    for idx, car in enumerate(top_cars[:3], start=1):
        year_bracket = _fit_year_bracket(car, budget)
        issues = car.get("critical_issues", [])
        issues_text = "\n".join(f"- {issue}" for issue in issues) or "- None listed"

        lines.extend(
            [
                f"\n### {idx}. {car['make']} {car['model']} ({car['generation']})",
                f"- **Year bracket in budget**: {year_bracket}",
                f"- **Purpose fit**: {_purpose_fit_text(car, purpose)}",
                "- **Warnings (common issues)**:",
                issues_text,
                (
                    f"- **Maintenance planning**: Budget about NZ${car['initial_service_est_nzd']} "
                    "up front for baseline fluids/safety items, plus "
                    f"NZ${car['annual_service_est_nzd']} per year for WoF and routine compliance."
                ),
            ]
        )

    return "\n".join(lines)
