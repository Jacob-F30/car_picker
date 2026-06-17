export function containsAny(value: string | undefined, options: string[]): boolean {
  const lower = (value ?? "").toLowerCase();
  return options.some((opt) => lower.includes(opt.toLowerCase()));
}

function matchesStrictFilters(
  car: any,
  purpose: string,
  budget: number,
  fuelType: string,
  brandPreference: string
): boolean {
  if (Number(car?.avg_nz_price ?? 0) > budget) return false;
  if (new Set(["family", "business"]).has(purpose)) {
    if (Number(car?.seats ?? 0) < 4 || Number(car?.doors ?? 0) < 4) return false;
  }
  if (fuelType !== "any" && !String(car?.fuel_type ?? "").toLowerCase().includes(fuelType)) {
    return false;
  }
  if (brandPreference !== "any" && String(car?.make ?? "").toLowerCase() !== brandPreference) {
    return false;
  }
  return true;
}

function scoreCar(
  car: any,
  purpose: string,
  yearsToKeep: number,
  budget: number,
  isFirstCar: boolean,
  fuelType: string,
  brandPreference: string,
  relaxed = false
): number {
  let score = 0;
  const fuel_consumption = Number(car?.fuel_consumption_l_100km ?? 0);
  const fuel_type = String(car?.fuel_type ?? "");
  const drivetrain = String(car?.drivetrain ?? "");
  const make = String(car?.make ?? "").toLowerCase();
  const hp = Number(car?.hp ?? 0);
  const engine_size = Number(car?.engine_size ?? 0);

  if (purpose === "commute") {
    if (fuel_consumption <= 6.5 || containsAny(fuel_type, ["Hybrid", "EV"])) score += 50;
    score -= fuel_consumption * 5;
  } else if (purpose === "sport") {
    if (hp > 180) score += 30;
    if (Number(car?.torque_nm ?? 0) > 250) score += 20;
    if (drivetrain === "RWD" || drivetrain === "AWD") score += 40;
  } else if (new Set(["family", "leisure", "business"]).has(purpose)) {
    if (Number(car?.boot_size_liters ?? 0) >= 400) score += 30;
    if (Number(car?.seats ?? 0) >= 5) score += 20;
    if (purpose === "leisure" && (drivetrain === "AWD" || drivetrain === "4WD")) score += 20;
  }

  if (isFirstCar) {
    if (hp >= 180) score -= 15;
    else if (hp > 0 && hp <= 130) score += 12;
    if (fuel_consumption >= 8.5) score -= 8;
    else if (fuel_consumption > 0 && fuel_consumption <= 6.5) score += 8;
    if (engine_size > 0 && engine_size <= 1.6) score += 6;
    if (drivetrain === "RWD") score -= 6;
  }

  if (yearsToKeep >= 5) {
    const parts = String(car?.parts_availability ?? "").toLowerCase();
    if (parts === "good" || parts === "excellent") score += 25;
    if (Number(car?.expected_lifespan_km ?? 0) < 180000) score -= 30;
  }

  if (fuelType !== "any") {
    if (fuel_type.toLowerCase().includes(fuelType)) score += 18;
    else if (relaxed) score -= 12;
  }
  if (brandPreference !== "any") {
    if (make === brandPreference) score += 14;
    else if (relaxed) score -= 10;
  }

  if (relaxed) {
    const price = Number(car?.avg_nz_price ?? 0);
    if (price > budget) score -= Math.min(((price - budget) / 1000) * 8, 40);
    if (new Set(["family", "business"]).has(purpose)) {
      const seats = Number(car?.seats ?? 0);
      const doors = Number(car?.doors ?? 0);
      if (seats < 4) score -= (4 - seats) * 10;
      if (doors < 4) score -= (4 - doors) * 10;
    }
  }

  return Math.round(score * 100) / 100;
}

function purposeAlignmentScore(car: any, purpose: string): number {
  const fuel_consumption = Number(car?.fuel_consumption_l_100km ?? 0);
  const fuel_type = String(car?.fuel_type ?? "");
  const drivetrain = String(car?.drivetrain ?? "");

  if (purpose === "commute") {
    let score = 0;
    if (fuel_consumption <= 6.5 || containsAny(fuel_type, ["Hybrid", "EV"])) score += 50;
    score -= fuel_consumption * 5;
    return score;
  }
  if (purpose === "sport") {
    let score = 0;
    if (Number(car?.hp ?? 0) > 180) score += 30;
    if (Number(car?.torque_nm ?? 0) > 250) score += 20;
    if (drivetrain === "RWD" || drivetrain === "AWD") score += 40;
    return score;
  }
  if (new Set(["family", "leisure", "business"]).has(purpose)) {
    let score = 0;
    if (Number(car?.boot_size_liters ?? 0) >= 400) score += 30;
    if (Number(car?.seats ?? 0) >= 5) score += 20;
    if (purpose === "leisure" && (drivetrain === "AWD" || drivetrain === "4WD")) score += 20;
    return score;
  }
  return 0;
}

export function fitYearBracket(car: any, budget: number): string {
  const [startYear, endYear] = car.year_range ?? [null, null];
  const avg = Number(car.avg_nz_price ?? 0);
  if (budget >= avg) return `${startYear}-${endYear}`;
  if (startYear == null || endYear == null) return "Unknown";
  const midpoint = Math.floor((Number(startYear) + Number(endYear)) / 2);
  return `${startYear}-${midpoint}`;
}

export function recommendCars(userInputs: any, carDatabase: any[], topN = 3) {
  const purpose = String(userInputs?.purpose ?? "").toLowerCase();
  const budget = Number(userInputs?.budget ?? 0);
  const isFirstCar = Boolean(userInputs?.isFirstCar ?? userInputs?.is_first_car ?? false);
  const yearsToKeep = Number(userInputs?.yearsToKeep ?? userInputs?.years_to_keep ?? 0);
  const fuelType = String(userInputs?.fuelType ?? userInputs?.fuel_type ?? "any").toLowerCase();
  const brandPreference = String(
    userInputs?.brandPreference ?? userInputs?.brand_preference ?? "any"
  ).toLowerCase();

  const strictFiltered = (carDatabase ?? []).filter((car) =>
    matchesStrictFilters(car, purpose, budget, fuelType, brandPreference)
  );

  let scoredSource = strictFiltered.length ? strictFiltered : (carDatabase ?? []);
  let relaxed = strictFiltered.length === 0;

  if (!relaxed) {
    const bestAlignment = Math.max(
      ...strictFiltered.map((car) => purposeAlignmentScore(car, purpose))
    );
    if (bestAlignment < 20) {
      scoredSource = carDatabase ?? [];
      relaxed = true;
    }
  }

  const scored = scoredSource.map((car) => {
    const matchScore = scoreCar(
      car,
      purpose,
      yearsToKeep,
      budget,
      isFirstCar,
      fuelType,
      brandPreference,
      relaxed
    );

    return {
      ...car,
      match_score: matchScore,
      recommendation_mode: relaxed ? "fallback" : "strict",
    };
  });

  return scored.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0)).slice(0, topN);
}
