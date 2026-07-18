import React, { useDeferredValue, useEffect, useState } from "react";
import {
  getBrands,
  getRecommendations,
  type Recommendation,
  type RecommendationInputs,
} from "./lib/recommendation";
import { RecommendationCard } from "./components/RecommendationCard";

export default function App() {
  const [brands, setBrands] = useState<string[]>([]);
  const [top, setTop] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<RecommendationInputs>({
    purpose: "commute",
    budget: 15000,
    isFirstCar: false,
    powertrainPreference: "any",
    brandPreference: "any",
  });
  const deferredInputs = useDeferredValue(inputs);

  const brandOptions = ["any", ...brands];

  useEffect(() => {
    const controller = new AbortController();
    getBrands(controller.signal)
      .then(setBrands)
      .catch((error: unknown) => {
        if ((error as Error).name !== "AbortError") {
          setLoadError("Could not load available brands from the static catalog.");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    getRecommendations(deferredInputs, controller.signal)
      .then(setTop)
      .catch((error: unknown) => {
        if ((error as Error).name !== "AbortError") {
          setLoadError("Could not load recommendations from the static catalog.");
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [deferredInputs]);

  const hasFallback = top.some((car) => car.recommendation_mode === "fallback");

  return (
    <div className="app-shell">
      <div className="container">
        <header className="hero">
          <p className="eyebrow">NZ car picker</p>
          <h1>Find a car that fits how you actually drive.</h1>
          <p className="hero-copy">
            Use guided filters, not free-text guesswork. Pick the vibe, budget band, powertrain,
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
              Powertrain
              <select
                value={inputs.powertrainPreference}
                onChange={(e) => setInputs({ ...inputs, powertrainPreference: e.target.value })}
              >
                <option value="any">I don't know</option>
                <option value="ev">EV</option>
                <option value="non_ev">Non-EV (Petrol, Diesel, mild hybrid)</option>
                <option value="plug_in_hybrid">Plug-in hybrid</option>
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
              top.map((car, i) => (
                <RecommendationCard
                  key={`${car.make}-${car.model}-${i}`}
                  car={car}
                  rank={i + 1}
                  purpose={inputs.purpose}
                />
              ))
            )}
          </section>
        )}
      </div>
    </div>
  );
}
