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

    def test_first_car_filter_removes_non_beginner_options(self):
        results = recommend_cars(
            {
                "country": "New Zealand",
                "purpose": "sport",
                "is_first_car": True,
                "is_personal_use": True,
                "years_to_keep": 3,
                "budget": 20000,
            },
            self.cars,
        )
        self.assertTrue(results)
        self.assertTrue(all(car["is_good_first_car"] for car in results))

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


if __name__ == "__main__":
    unittest.main()
