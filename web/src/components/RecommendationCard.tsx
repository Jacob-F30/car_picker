import React from "react";
import type { Recommendation } from "../lib/recommendation";

type RecommendationCardProps = {
  car: Recommendation;
  rank: number;
  purpose: string;
};

function formatPowertrain(value: string | null): string | null {
  return value ? value.replaceAll("_", " ") : null;
}

function formatEngine(car: Recommendation): string | null {
  const parts: string[] = [];
  if (car.engine_displacement_l != null) parts.push(`${car.engine_displacement_l.toFixed(1)}L`);
  if (car.engine_power_kw != null) parts.push(`${car.engine_power_kw}kW`);
  return parts.length ? parts.join(" / ") : null;
}

export function RecommendationCard({ car, rank, purpose }: RecommendationCardProps) {
  const subtitle = [car.year, car.trim, car.body_style].filter(Boolean).join(" · ");
  const specs = [
    formatPowertrain(car.powertrain_category),
    formatEngine(car),
    car.seats != null ? `${car.seats} seats` : null,
    car.safety_rating != null ? `${car.safety_rating}-star safety` : null,
  ].filter(Boolean);
  const purposeFactors = car.purpose_strengths[purpose]?.factors ?? [];
  const rewards = [
    ...purposeFactors.filter((factor) => factor.score > 0),
    ...car.score_breakdown.filter(
      (factor) => factor.score > 0 && factor.factor !== `${purpose}_fit`
    ),
  ].slice(0, 3);
  const penalties = car.penalty_reasons.slice(0, 2);

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <p className="card-rank">#{rank}</p>
          <h3>
            {car.make} {car.model}
          </h3>
        </div>
        <span className="score-pill">{car.match_score}</span>
      </div>
      {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
      <div className="chip-row">
        <span>{purpose}</span>
        {specs.map((spec) => <span key={spec}>{spec}</span>)}
      </div>
      {rewards.length ? (
        <div className="card-section">
          <p><strong>Best fit signals</strong></p>
          <ul>{rewards.map((factor) => <li key={`${factor.factor}-${factor.reason}`}>{factor.reason}</li>)}</ul>
        </div>
      ) : null}
      {penalties.length ? (
        <div className="card-section card-penalties">
          <p><strong>Trade-offs</strong></p>
          <ul>{penalties.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </div>
      ) : null}
    </article>
  );
}
