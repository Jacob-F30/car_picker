import React, { useEffect, useState } from "react";
import { recommendCars } from "./lib/recommendation";
import { RecommendationCard } from "./components/RecommendationCard";

type Inputs = {
  purpose: string;
  budget: number;
  isFirstCar: boolean;
  yearsToKeep: number;
  fuelType: string;
  brandPreference: string;
};

export default function App() {
  const [cars, setCars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Inputs>({
    purpose: "commute",
    budget: 15000,
    isFirstCar: false,
    yearsToKeep: 3,
    fuelType: "any",
    brandPreference: "any",
  });

  const fuelTypeOptions = ["any", ...new Set(cars.map((car) => String(car?.fuel_type ?? "").trim()).filter(Boolean))];
  const brandOptions = ["any", ...new Set(cars.map((car) => String(car?.make ?? "").trim()).filter(Boolean))];

  useEffect(() => {
    const dataUrl = `${import.meta.env.BASE_URL}data/cars_db.json`;

    fetch(dataUrl)
      .then((r) => r.json())
      .then((d) => setCars(d))
      .catch(() => setLoadError("Could not load the car database. Please refresh and try again."))
      .finally(() => setLoading(false));
  }, []);

  const top = recommendCars(inputs as any, cars, 3);
  const hasFallback = top.some((car: any) => car.recommendation_mode === "fallback");

  return (
    <div className="app-shell">
      <div className="container">
        <header className="hero">
          <p className="eyebrow">NZ car picker</p>
          <h1>Find a car that fits how you actually drive.</h1>
          <p className="hero-copy">
            Use guided filters, not free-text guesswork. Pick the vibe, budget band, fuel type,
            and brand preference, then let the ranking do the rest.
          </p>
        </header>

        <section className="panel form-panel">
          <div className="form-grid">
            <label>
              Purpose
              <select
                value={inputs.purpose}
                onChange={(e) => setInputs({ ...inputs, purpose: e.target.value })}
              >
                <option value="commute">Commute</option>
                <option value="family">Family</option>
                <option value="sport">Sport</option>
                <option value="leisure">Leisure</option>
              </select>
            </label>

            <label>
              Budget
              <div className="range-wrap">
                <input
                  type="range"
                  min={5000}
                  max={50000}
                  step={500}
                  value={inputs.budget}
                  onChange={(e) => setInputs({ ...inputs, budget: Number(e.target.value) })}
                />
                <span>NZ${inputs.budget.toLocaleString()}</span>
              </div>
            </label>

            <label>
              Fuel type
              <select
                value={inputs.fuelType}
                onChange={(e) => setInputs({ ...inputs, fuelType: e.target.value })}
              >
                {fuelTypeOptions.map((fuelType) => (
                  <option key={fuelType} value={fuelType}>
                    {fuelType === "any" ? "Any fuel type" : fuelType}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Brand preference
              <select
                value={inputs.brandPreference}
                onChange={(e) => setInputs({ ...inputs, brandPreference: e.target.value })}
              >
                {brandOptions.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand === "any" ? "Any brand" : brand}
                  </option>
                ))}
              </select>
            </label>

            <label className="switch-row">
              <span>First car</span>
              <input
                type="checkbox"
                checked={inputs.isFirstCar}
                onChange={(e) => setInputs({ ...inputs, isFirstCar: e.target.checked })}
              />
            </label>

            <label>
              Years to keep
              <div className="range-wrap">
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={inputs.yearsToKeep}
                  onChange={(e) => setInputs({ ...inputs, yearsToKeep: Number(e.target.value) })}
                />
                <span>{inputs.yearsToKeep} years</span>
              </div>
            </label>
          </div>
        </section>

        {loading ? (
          <section className="panel status-panel">Loading car database...</section>
        ) : loadError ? (
          <section className="panel status-panel">{loadError}</section>
        ) : (
          <section className="results">
            {hasFallback ? (
              <div className="panel status-panel">
                No exact match satisfied every filter, so these are the closest available options.
              </div>
            ) : null}
            {top.length === 0 ? (
              <div className="panel status-panel">
                No suitable cars found. Try widening the budget or relaxing a filter.
              </div>
            ) : (
              top.map((car: any, i: number) => (
                <RecommendationCard
                  key={`${car.make}-${car.model}-${i}`}
                  car={car}
                  rank={i + 1}
                  purpose={inputs.purpose}
                  budget={inputs.budget}
                />
              ))
            )}
          </section>
        )}
      </div>
    </div>
  );
}
