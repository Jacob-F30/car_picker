import unittest

from src.api import RecommendationService


def car(**overrides):
    base = {
        "make": "Toyota",
        "model": "RAV4",
        "trim": "GX",
        "year": 2024,
        "body_style": "Medium SUV",
        "fuel_type": "Petrol",
        "engine_type": "combustion",
        "powertrain_category": "non_ev",
        "engine_displacement_l": 2.5,
        "engine_power_kw": 150,
        "doors": 5,
        "seats": 5,
        "safety_rating": 5,
        "fuel_consumption_l_100km": 7.5,
        "brand_region": "Japanese",
        "data_quality": {"eligible": True},
        "raw_values": {"private": "source-only"},
    }
    base.update(overrides)
    return base


class RecommendationServiceTests(unittest.TestCase):
    def setUp(self):
        self.service = RecommendationService(
            cars=[
                car(make="Toyota", model="RAV4"),
                car(make="Audi", model="Q5", powertrain_category="ev", fuel_type="EV"),
            ]
        )

    def test_brand_catalog_uses_normalized_makes(self):
        self.assertEqual(self.service.brand_catalog(), {"brands": ["Audi", "Toyota"], "count": 2})

    def test_recommendations_are_canonical_and_browser_safe(self):
        response = self.service.recommendations(
            {
                "purpose": "leisure",
                "budget": "30000",
                "powertrain_preference": "any",
                "brand_preference": "any",
                "is_first_car": "false",
                "top_n": "10",
            }
        )

        self.assertEqual(response["count"], 2)
        self.assertEqual(response["top_n"], 10)
        self.assertIn("purpose_strengths", response["results"][0])
        self.assertNotIn("raw_values", response["results"][0])
        self.assertNotIn("years_to_keep", response["results"][0])


if __name__ == "__main__":
    unittest.main()
