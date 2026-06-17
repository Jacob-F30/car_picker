import React from "react";
import { fitYearBracket } from "../lib/recommendation";

export function RecommendationCard({ car, rank, purpose, budget }: any) {
  const yearBracket = fitYearBracket(car, Number(budget ?? 0));
  const issues: string[] = car?.critical_issues ?? [];

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
      <p className="card-subtitle">{car.generation}</p>
      <div className="chip-row">
        <span>{purpose}</span>
        <span>{yearBracket}</span>
        <span>{car.fuel_type}</span>
      </div>
      <p><strong>Warnings:</strong></p>
      <ul>
        {issues.length ? issues.map((i: string, idx: number) => <li key={idx}>{i}</li>) : <li>None listed</li>}
      </ul>
      <p>
        <strong>Maintenance planning:</strong> Budget about NZ${car.initial_service_est_nzd} up front, plus NZ${car.annual_service_est_nzd} per year.
      </p>
    </article>
  );
}
