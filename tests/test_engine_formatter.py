import json
import unittest
from pathlib import Path

from src.engine import recommend_cars
from src.formatter import format_recommendations


ROOT = Path(__file__).resolve().parents[1]


class EngineFormatterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        data_path = ROOT / "data" / "cars_db.json"
        cls.cars = json.loads(data_path.read_text(encoding="utf-8"))

    def test_first_car_penalizes_high_power_cars(self):
        base_inputs = {
            "country": "New Zealand",
            "purpose": "sport",
            "is_personal_use": True,
            "years_to_keep": 3,
            "budget": 30000,
        }

        results_regular = recommend_cars(
            {**base_inputs, "is_first_car": False},
            self.cars,
            top_n=5,
        )
        results_first = recommend_cars(
            {**base_inputs, "is_first_car": True},
            self.cars,
            top_n=5,
        )

        bmw_regular = next(car for car in results_regular if car["make"] == "BMW")
        bmw_first = next(car for car in results_first if car["make"] == "BMW")

        self.assertLess(bmw_first["match_score"], bmw_regular["match_score"])

    def test_commute_prefers_hybrid_efficiency(self):
        results = recommend_cars(
            {
                "country": "New Zealand",
                "purpose": "commute",
                "is_first_car": False,
                "is_personal_use": True,
                "years_to_keep": 5,
                "budget": 15000,
            },
            self.cars,
        )
        self.assertEqual(results[0]["model"], "Aqua")

    def test_brand_and_fuel_filters_limit_results(self):
        results = recommend_cars(
            {
                "country": "New Zealand",
                "purpose": "commute",
                "is_first_car": False,
                "is_personal_use": True,
                "years_to_keep": 3,
                "budget": 30000,
                "fuel_type": "Hybrid",
                "brand_preference": "Toyota",
            },
            self.cars,
        )
        self.assertTrue(results)
        self.assertTrue(all(car["make"] == "Toyota" for car in results))
        self.assertTrue(all("hybrid" in str(car["fuel_type"]).lower() for car in results))

    def test_formatter_includes_required_sections(self):
        top = recommend_cars(
            {
                "country": "New Zealand",
                "purpose": "family",
                "is_first_car": False,
                "is_personal_use": True,
                "years_to_keep": 6,
                "budget": 22000,
            },
            self.cars,
        )
        output = format_recommendations(top, {"purpose": "family", "budget": 22000})
        self.assertIn("Warnings (common issues)", output)
        self.assertIn("Maintenance planning", output)
        self.assertIn("WoF", output)

    def test_relaxed_fallback_returns_recommendations_when_strict_filters_empty(self):
        results = recommend_cars(
            {
                "country": "New Zealand",
                "purpose": "family",
                "is_first_car": True,
                "is_personal_use": True,
                "years_to_keep": 6,
                "budget": 1,
                "fuel_type": "diesel",
                "brand_preference": "BMW",
            },
            self.cars,
        )
        self.assertTrue(results)
        self.assertTrue(all(car["recommendation_mode"] == "fallback" for car in results))

        output = format_recommendations(results, {"purpose": "family", "budget": 1})
        self.assertNotIn("No suitable cars found", output)
        self.assertIn("Best available car matches", output)

    def test_sport_query_prefers_sport_cars_over_cheaper_non_sport_options(self):
        results = recommend_cars(
            {
                "country": "New Zealand",
                "purpose": "sport",
                "is_first_car": False,
                "is_personal_use": True,
                "years_to_keep": 3,
                "budget": 12000,
            },
            self.cars,
        )
        self.assertTrue(results)
        self.assertEqual(results[0]["make"], "BMW")
        self.assertEqual(results[0]["recommendation_mode"], "fallback")

    def test_formatter_still_handles_a_true_empty_result_set(self):
        output = format_recommendations([], {"purpose": "commute", "budget": 5000})
        self.assertIn("No suitable cars found", output)


if __name__ == "__main__":
    unittest.main()
