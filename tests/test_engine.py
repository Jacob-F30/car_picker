import unittest

from src.engine import derive_purpose_strengths, recommend_cars


def car(**overrides):
    base = {
        "make": "Toyota",
        "model": "Corolla",
        "avg_nz_price": 18000,
        "brand_region": "Japanese",
        "engine_displacement_l": 1.8,
        "engine_power_kw": 103,
        "engine_type": "combustion",
        "fuel_type": "Petrol",
        "torque_nm": 170,
        "transmission": "Automatic",
        "drivetrain": "FWD",
        "doors": 4,
        "seats": 5,
        "fuel_consumption_l_100km": 6.5,
        "safety_rating": 5,
        "parts_availability": "Excellent",
        "expected_lifespan_km": 240000,
        "data_quality": {"eligible": True},
    }
    base.update(overrides)
    return base


class RecommendationEngineTests(unittest.TestCase):
    def test_purpose_strengths_are_multilabel_and_explainable(self):
        strengths = derive_purpose_strengths(
            car(
                fuel_type="Hybrid",
                fuel_consumption_l_100km=4.4,
                torque_nm=420,
                engine_displacement_l=3.0,
                engine_power_kw=300,
                transmission="Dual-clutch",
                drivetrain="AWD",
            )
        )

        self.assertGreater(strengths["commute"]["score"], 0)
        self.assertGreater(strengths["sport"]["score"], 0)
        self.assertTrue(strengths["sport"]["factors"])

    def test_family_mode_excludes_low_safety_candidate_when_safe_options_exist(self):
        safe = car(model="Safe family")
        unsafe = car(
            make="BMW",
            model="Unsafe coupe",
            brand_region="European",
            engine_displacement_l=3.0,
            engine_power_kw=300,
            torque_nm=450,
            seats=5,
            safety_rating=2,
        )

        results = recommend_cars({"purpose": "family", "budget": 30000}, [unsafe, safe])

        self.assertEqual([result["model"] for result in results], ["Safe family"])
        self.assertEqual(results[0]["recommendation_mode"], "strict")

    def test_first_car_penalizes_high_torque_large_engine(self):
        practical = car(model="Practical")
        powerful = car(
            make="BMW",
            model="Powerful",
            brand_region="European",
            engine_displacement_l=3.0,
            torque_nm=450,
            drivetrain="RWD",
        )

        results = recommend_cars(
            {"purpose": "commute", "budget": 30000, "is_first_car": True},
            [powerful, practical],
        )

        self.assertEqual(results[0]["model"], "Practical")
        self.assertIn("very high torque for a first car", results[1]["penalty_reasons"])

    def test_engine_power_is_used_when_government_data_has_no_torque(self):
        regular = car(model="Regular", torque_nm=None, engine_power_kw=110)
        powerful = car(
            make="BMW",
            model="Powerful EV",
            brand_region="European",
            engine_type="electric",
            fuel_type="Electric",
            engine_displacement_l=None,
            engine_power_kw=320,
            torque_nm=None,
        )

        results = recommend_cars(
            {"purpose": "commute", "budget": 30000, "is_first_car": True},
            [powerful, regular],
        )

        self.assertEqual(results[0]["model"], "Regular")
        self.assertIn(
            "very high engine or motor power for a first car",
            results[1]["penalty_reasons"],
        )

    def test_leisure_rewards_a_practical_high_capacity_suv(self):
        suv = car(
            model="Adventure SUV",
            body_style="Medium SUV",
            seats=7,
            doors=5,
            drivetrain="AWD",
            engine_displacement_l=2.5,
            engine_power_kw=170,
            fuel_consumption_l_100km=7.8,
        )
        sedan = car(
            model="Capable Sedan",
            body_style="Sedan",
            seats=5,
            doors=4,
            drivetrain="FWD",
            engine_displacement_l=2.5,
            engine_power_kw=170,
            fuel_consumption_l_100km=7.8,
        )

        results = recommend_cars({"purpose": "leisure", "budget": 30000}, [sedan, suv])

        self.assertEqual(results[0]["model"], "Adventure SUV")
        self.assertIn(
            "utility-focused body style",
            [factor["reason"] for factor in results[0]["purpose_strengths"]["leisure"]["factors"]],
        )

    def test_leisure_ev_uses_power_without_displacement_or_torque(self):
        strengths = derive_purpose_strengths(
            car(
                body_style="Large SUV",
                engine_type="electric",
                fuel_type="EV",
                engine_displacement_l=None,
                engine_power_kw=220,
                torque_nm=None,
                seats=5,
                doors=5,
            )
        )

        reasons = [factor["reason"] for factor in strengths["leisure"]["factors"]]
        self.assertGreater(strengths["leisure"]["score"], 0)
        self.assertIn("strong engine or motor power", reasons)
        self.assertNotIn("capable engine displacement", reasons)

    def test_powertrain_preference_separates_charging_requirements(self):
        electric = car(
            model="EV",
            fuel_type="Electric",
            engine_type="electric",
            engine_displacement_l=None,
        )
        non_ev = car(model="Non-EV", fuel_type="Petrol Hybrid", engine_type="hybrid")
        plug_in = car(
            model="PHEV",
            fuel_type="Plugin Petrol Hybrid",
            engine_type="plug_in_hybrid",
        )
        cars = [electric, non_ev, plug_in]
        query = {"purpose": "commute", "budget": 30000}

        self.assertEqual(
            [car["model"] for car in recommend_cars({**query, "powertrain_preference": "ev"}, cars)],
            ["EV"],
        )
        self.assertEqual(
            [car["model"] for car in recommend_cars({**query, "powertrain_preference": "non_ev"}, cars)],
            ["Non-EV"],
        )
        self.assertEqual(
            [car["model"] for car in recommend_cars({**query, "powertrain_preference": "plug_in_hybrid"}, cars)],
            ["PHEV"],
        )
        self.assertEqual(
            len(recommend_cars({**query, "powertrain_preference": "I don't know"}, cars)),
            3,
        )

    def test_default_returns_up_to_ten_explained_results(self):
        cars = [car(model=f"Car {index}") for index in range(12)]

        results = recommend_cars({"purpose": "commute", "budget": 30000}, cars)

        self.assertEqual(len(results), 10)
        self.assertTrue(all(result["score_breakdown"] for result in results))
        self.assertTrue(all("purpose_strengths" in result for result in results))


if __name__ == "__main__":
    unittest.main()