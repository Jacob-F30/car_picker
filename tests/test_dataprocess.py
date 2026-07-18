import unittest

from src.dataprocess import (
    normalize_powertrain_preference,
    parse_engine_spec,
    preprocess_records,
    ranking_eligibility,
    validate_source_columns,
)


class DataProcessTests(unittest.TestCase):
    def test_validates_required_source_columns(self):
        report = validate_source_columns(["Make and model", "Vehicle year"])

        self.assertIn("engine size", report["missing_required_columns"])
        self.assertNotIn("make and model", report["missing_required_columns"])

    def test_normalizes_combustion_and_electric_powertrains(self):
        records, report = preprocess_records(
            [
                {
                    "Make and model": "BMW 340i",
                    "Fuel type": "Petrol",
                    "engine size": "2998cc turbo 285kW",
                    "torque": "500 Nm",
                    "transmission": "8-speed automatic",
                    "doors": "4",
                    "seats": "5",
                    "fuel consumption (litres per 100km)": "7.7",
                    "safety stars": "5",
                    "safety rating": "5",
                },
                {
                    "Make and model": "Tesla Model 3",
                    "Fuel type": "Electric",
                    "engine size": "208kW",
                    "torque": "493 Nm",
                    "transmission": "Single-speed automatic",
                    "doors": "4",
                    "seats": "5",
                    "fuel consumption (litres per 100km)": "1.5",
                    "safety stars": "5",
                    "safety rating": "5",
                },
            ]
        )

        bmw, tesla = records
        self.assertEqual(bmw["engine_displacement_cc"], 2998.0)
        self.assertEqual(bmw["engine_displacement_l"], 2.998)
        self.assertEqual(bmw["engine_power_kw"], 285.0)
        self.assertEqual(bmw["brand_region"], "European")
        self.assertEqual(tesla["engine_type"], "electric")
        self.assertIsNone(tesla["engine_displacement_l"])
        self.assertIsNone(tesla["engine_displacement_cc"])
        self.assertEqual(tesla["engine_power_kw"], 208.0)
        self.assertEqual(bmw["powertrain_category"], "non_ev")
        self.assertEqual(tesla["powertrain_category"], "ev")
        self.assertEqual(tesla["brand_region"], "American")
        self.assertEqual(report["powertrain_category_counts"], {"non_ev": 1, "ev": 1})

    def test_normalizes_the_four_powertrain_preferences(self):
        self.assertEqual(normalize_powertrain_preference("I don't know"), "any")
        self.assertEqual(normalize_powertrain_preference("EV"), "ev")
        self.assertEqual(normalize_powertrain_preference("Non-EV"), "non_ev")
        self.assertEqual(
            normalize_powertrain_preference("Plug in hybrid"), "plug_in_hybrid"
        )

    def test_parses_the_government_engine_size_tokens(self):
        combustion = parse_engine_spec("1998cc turbo 135kW", "Petrol")
        electric = parse_engine_spec("315kW", "Electric")

        self.assertEqual(combustion, {"engine_displacement_cc": 1998.0, "engine_power_kw": 135.0})
        self.assertEqual(electric, {"engine_displacement_cc": None, "engine_power_kw": 315.0})

    def test_imputation_records_its_cohort_level(self):
        records, report = preprocess_records(
            [
                {
                    "Make and model": "Toyota Corolla",
                    "Fuel type": "Petrol",
                    "engine size": "1798cc 103kW",
                    "torque": "170 Nm",
                    "transmission": "Automatic",
                    "doors": 4,
                    "seats": 5,
                    "fuel consumption (litres per 100km)": 6.5,
                    "safety stars": 5,
                    "safety rating": 5,
                },
                {
                    "Make and model": "Toyota Corolla",
                    "Fuel type": "Petrol",
                    "engine size": "1798cc 103kW",
                    "torque": "170 Nm",
                    "transmission": "Automatic",
                    "doors": 4,
                    "seats": 5,
                    "safety stars": 5,
                    "safety rating": 5,
                },
            ]
        )

        imputed = records[1]
        self.assertEqual(imputed["fuel_consumption_l_100km"], 6.5)
        self.assertTrue(imputed["fuel_consumption_l_100km_imputed"])
        self.assertEqual(imputed["fuel_consumption_l_100km_imputation_level"], "model")
        self.assertEqual(report["eligible_record_count"], 2)

    def test_missing_primary_features_are_not_ranking_eligible(self):
        quality = ranking_eligibility(
            {
                "engine_type": "combustion",
                "engine_power_kw": None,
                "torque_nm": None,
                "transmission": "Automatic",
                "seats": 5,
                "fuel_consumption_l_100km": 6.2,
                "safety_rating": 5,
            }
        )

        self.assertFalse(quality["eligible"])
        self.assertEqual(quality["missing_critical_fields"], ["engine_power_kw"])


if __name__ == "__main__":
    unittest.main()