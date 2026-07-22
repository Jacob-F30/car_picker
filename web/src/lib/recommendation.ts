export type ScoreFactor = {
  factor: string;
  score: number;
  reason: string;
};

export type PurposeStrength = {
  score: number;
  factors: ScoreFactor[];
};

export type Recommendation = {
  make: string | null;
  model: string | null;
  trim: string | null;
  year: number | null;
  body_style: string | null;
  fuel_type: string | null;
  engine_type: string | null;
  powertrain_category: string | null;
  engine_displacement_cc: number | null;
  engine_displacement_l: number | null;
  engine_power_kw: number | null;
  torque_nm: number | null;
  transmission: string | null;
  doors: number | null;
  seats: number | null;
  fuel_consumption_l_100km: number | null;
  safety_stars: number | null;
  safety_rating: number | null;
  brand_region: string | null;
  data_quality: { eligible?: boolean; confidence?: number } | null;
  match_score: number;
  raw_match_score: number;
  purpose_strengths: Record<string, PurposeStrength>;
  score_breakdown: ScoreFactor[];
  penalty_reasons: string[];
  recommendation_mode: "strict" | "fallback";
};

export type RecommendationInputs = {
  purpose: string;
  budget: number;
  isFirstCar: boolean;
  powertrainPreference: string;
  brandPreference: string;
};

type CatalogCar = {
  make: string | null;
  model: string | null;
  trim: string | null;
  year: number | null;
  body_style: string | null;
  fuel_type: string | null;
  engine_type: string | null;
  powertrain_category: string | null;
  engine_displacement_cc: number | null;
  engine_displacement_l: number | null;
  engine_power_kw: number | null;
  torque_nm: number | null;
  transmission: string | null;
  doors: number | null;
  seats: number | null;
  fuel_consumption_l_100km: number | null;
  safety_stars: number | null;
  safety_rating: number | null;
  brand_region: string | null;
  data_quality?: { eligible?: boolean; confidence?: number } | null;
};

const catalogDatasetPath = `${import.meta.env.BASE_URL}data/cars_normalized.json`;
let catalogPromise: Promise<CatalogCar[]> | null = null;
const SCORE_NORMALIZATION_STEEPNESS = 18;
const EQUATION_EPSILON = 1e-6;

type PurposeKey = "commute" | "family" | "sport" | "leisure";
type PowertrainKey = "ev" | "non_ev" | "plug_in_hybrid";

type EquationTerm = {
  factor: string;
  weight: number;
  score01: number;
  reasonGood: string;
  reasonBad: string;
};

function normalizePowertrainPreference(value: string): string {
  const normalized = (value || "any").trim().toLowerCase();
  return normalized === "ev" || normalized === "plug_in_hybrid" || normalized === "non_ev"
    ? normalized
    : "any";
}

function loadCatalog(): Promise<CatalogCar[]> {
  if (!catalogPromise) {
    catalogPromise = fetch(new URL(catalogDatasetPath, window.location.origin))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Catalog returned ${response.status}.`);
        }
        return response.json() as Promise<unknown>;
      })
      .then((rows) => {
        if (!Array.isArray(rows)) {
          throw new Error("Catalog payload is not a JSON array.");
        }
        return rows as CatalogCar[];
      })
      .catch((error) => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}

function normalizePowertrainCategory(value: string | null | undefined): string | null {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "ev" || normalized === "plug_in_hybrid" || normalized === "non_ev") {
    return normalized;
  }
  if (normalized.includes("plug") && normalized.includes("hybrid")) return "plug_in_hybrid";
  if (normalized.includes("ev") || normalized.includes("electric")) return "ev";
  return "non_ev";
}

function scoreFactor(factor: string, score: number, reason: string): ScoreFactor {
  return { factor, score, reason };
}

function normalizeDisplayScore(raw: number): number {
  const logistic = 100 / (1 + Math.exp(-raw / SCORE_NORMALIZATION_STEEPNESS));
  return Math.max(0, Math.min(100, Math.round(logistic)));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lowBetter(
  value: number | null | undefined,
  best: number,
  worst: number,
  missing = 0.45
): number {
  if (value == null) return missing;
  if (value <= best) return 1;
  if (value >= worst) return 0;
  return clamp01(1 - (value - best) / (worst - best));
}

function highBetter(
  value: number | null | undefined,
  worst: number,
  best: number,
  missing = 0.45
): number {
  if (value == null) return missing;
  if (value <= worst) return 0;
  if (value >= best) return 1;
  return clamp01((value - worst) / (best - worst));
}

function toPurposeKey(value: string): PurposeKey {
  const normalized = (value || "commute").trim().toLowerCase();
  if (normalized === "family" || normalized === "sport" || normalized === "leisure") {
    return normalized;
  }
  return "commute";
}

function toPowertrainKey(value: string | null): PowertrainKey {
  return value === "ev" || value === "plug_in_hybrid" ? value : "non_ev";
}

function bodyStyleSportScore(bodyStyle: string): number {
  if (bodyStyle.includes("coupe") || bodyStyle.includes("roadster") || bodyStyle.includes("sport")) return 1;
  if (bodyStyle.includes("sedan") || bodyStyle.includes("hatch")) return 0.7;
  if (bodyStyle.includes("suv") || bodyStyle.includes("wagon")) return 0.45;
  if (bodyStyle.includes("van") || bodyStyle.includes("minivan")) return 0.2;
  return 0.55;
}

function bodyStyleFamilyScore(bodyStyle: string): number {
  if (bodyStyle.includes("suv") || bodyStyle.includes("wagon") || bodyStyle.includes("van") || bodyStyle.includes("minivan")) return 1;
  if (bodyStyle.includes("sedan") || bodyStyle.includes("hatch")) return 0.7;
  if (bodyStyle.includes("coupe") || bodyStyle.includes("roadster") || bodyStyle.includes("convertible")) return 0.2;
  return 0.55;
}

function bodyStyleLeisureScore(bodyStyle: string): number {
  if (bodyStyle.includes("suv") || bodyStyle.includes("ute") || bodyStyle.includes("pickup")) return 1;
  if (bodyStyle.includes("wagon") || bodyStyle.includes("van") || bodyStyle.includes("minivan")) return 0.82;
  if (bodyStyle.includes("coupe") || bodyStyle.includes("roadster") || bodyStyle.includes("convertible")) return 0.3;
  return 0.58;
}

function bodyStyleCommuteScore(bodyStyle: string): number {
  if (bodyStyle.includes("hatch") || bodyStyle.includes("sedan")) return 1;
  if (bodyStyle.includes("suv") || bodyStyle.includes("wagon")) return 0.75;
  if (bodyStyle.includes("coupe") || bodyStyle.includes("roadster")) return 0.45;
  if (bodyStyle.includes("van") || bodyStyle.includes("minivan")) return 0.55;
  return 0.62;
}

function transmissionSportScore(transmission: string): number {
  if (transmission.includes("manual") || transmission.includes("dual") || transmission.includes("dct") || transmission.includes("dsg")) return 1;
  if (transmission.includes("cvt")) return 0.25;
  return 0.62;
}

function applyDelta(
  factors: ScoreFactor[],
  penalties: string[],
  factor: string,
  score: number,
  reason: string
): number {
  if (!score) return 0;
  const adjustedScore = Math.round(score * 10) / 10;
  if (!adjustedScore) return 0;
  factors.push(scoreFactor(factor, adjustedScore, reason));
  if (adjustedScore < 0) penalties.push(reason);
  return adjustedScore;
}

function applyEquation(
  terms: EquationTerm[],
  factors: ScoreFactor[],
  penalties: string[]
): { equation01: number } {
  let weightTotal = 0;
  let weightedLogTotal = 0;

  for (const term of terms) {
    const score01 = clamp01(term.score01);
    weightTotal += term.weight;
    weightedLogTotal += term.weight * Math.log(Math.max(EQUATION_EPSILON, score01));

    const contribution = Math.round((((score01 - 0.5) * 2 * term.weight * 42) * 10)) / 10;
    if (Math.abs(contribution) >= 0.4) {
      const reason = contribution >= 0 ? term.reasonGood : term.reasonBad;
      factors.push(scoreFactor(term.factor, contribution, reason));
      if (contribution < 0) penalties.push(reason);
    }
  }

  if (!weightTotal) return { equation01: 0.5 };
  return { equation01: Math.exp(weightedLogTotal / weightTotal) };
}

function buildEquationTerms(
  purpose: PurposeKey,
  powertrain: PowertrainKey,
  car: CatalogCar
): EquationTerm[] {
  const consumption = car.fuel_consumption_l_100km;
  const enginePower = car.engine_power_kw;
  const engineSize = car.engine_displacement_l;
  const seats = car.seats;
  const doors = car.doors;
  const safety = car.safety_rating ?? car.safety_stars;
  const torque = car.torque_nm;
  const bodyStyle = (car.body_style || "").toLowerCase();
  const transmission = (car.transmission || "").toLowerCase();

  if (purpose === "commute" && powertrain === "non_ev") {
    return [
      {
        factor: "commute_non_ev_efficiency",
        weight: 0.52,
        score01: lowBetter(consumption, 4.5, 12.5, 0.4),
        reasonGood: "Low fuel use strongly fits commuting",
        reasonBad: "High fuel use hurts commuting suitability",
      },
      {
        factor: "commute_non_ev_engine_size",
        weight: 0.21,
        score01: lowBetter(engineSize, 1.2, 3.5, 0.45),
        reasonGood: "Smaller engine supports lower commute cost",
        reasonBad: "Larger engine raises commute cost",
      },
      {
        factor: "commute_non_ev_engine_power",
        weight: 0.15,
        score01: lowBetter(enginePower, 85, 250, 0.45),
        reasonGood: "Right-sized power for daily commuting",
        reasonBad: "Power is higher than typical commute needs",
      },
      {
        factor: "commute_non_ev_safety",
        weight: 0.12,
        score01: highBetter(safety, 2.0, 5.0, 0.5),
        reasonGood: "Safety rating supports daily commuting",
        reasonBad: "Safety rating is weak for daily commuting",
      },
    ];
  }

  if (purpose === "commute" && powertrain === "ev") {
    return [
      {
        factor: "commute_ev_efficiency",
        weight: 0.34,
        score01: lowBetter(consumption, 1.8, 5.5, 0.7),
        reasonGood: "Very efficient EV commute profile",
        reasonBad: "EV efficiency profile is weaker than expected",
      },
      {
        factor: "commute_ev_motor_power",
        weight: 0.24,
        score01: lowBetter(enginePower, 90, 260, 0.45),
        reasonGood: "Motor power fits commute priorities",
        reasonBad: "Power level is beyond commute-focused needs",
      },
      {
        factor: "commute_ev_safety",
        weight: 0.22,
        score01: highBetter(safety, 2.0, 5.0, 0.5),
        reasonGood: "Strong safety for daily EV commuting",
        reasonBad: "Safety rating is weak for daily EV commuting",
      },
      {
        factor: "commute_ev_space",
        weight: 0.10,
        score01: highBetter(seats, 4, 7, 0.5),
        reasonGood: "Practical seat capacity for daily trips",
        reasonBad: "Seat capacity is limited for daily flexibility",
      },
      {
        factor: "commute_ev_body",
        weight: 0.10,
        score01: bodyStyleCommuteScore(bodyStyle),
        reasonGood: "Body style supports daily city commuting",
        reasonBad: "Body style is less practical for commuting",
      },
    ];
  }

  if (purpose === "commute" && powertrain === "plug_in_hybrid") {
    return [
      {
        factor: "commute_plug_in_hybrid_efficiency",
        weight: 0.42,
        score01: lowBetter(consumption, 1.2, 8.5, 0.5),
        reasonGood: "Strong plug-in efficiency for commuting",
        reasonBad: "Plug-in efficiency is weak for commuting",
      },
      {
        factor: "commute_plug_in_hybrid_engine_size",
        weight: 0.20,
        score01: lowBetter(engineSize, 1.2, 3.0, 0.5),
        reasonGood: "Practical engine size for hybrid commuting",
        reasonBad: "Engine size is larger than commute-focused needs",
      },
      {
        factor: "commute_plug_in_hybrid_power",
        weight: 0.16,
        score01: lowBetter(enginePower, 90, 240, 0.45),
        reasonGood: "Power level suits efficient mixed commuting",
        reasonBad: "Power level is high for efficient commuting",
      },
      {
        factor: "commute_plug_in_hybrid_safety",
        weight: 0.12,
        score01: highBetter(safety, 2.0, 5.0, 0.5),
        reasonGood: "Safety supports daily commuting",
        reasonBad: "Safety rating is weak for daily commuting",
      },
      {
        factor: "commute_plug_in_hybrid_space",
        weight: 0.10,
        score01: highBetter(seats, 4, 7, 0.5),
        reasonGood: "Useful seat capacity for daily flexibility",
        reasonBad: "Seat capacity is limited for daily flexibility",
      },
    ];
  }

  if (purpose === "family" && powertrain === "non_ev") {
    return [
      {
        factor: "family_non_ev_safety",
        weight: 0.34,
        score01: highBetter(safety, 2.0, 5.0, 0.45),
        reasonGood: "Strong safety for family use",
        reasonBad: "Safety rating is weak for family use",
      },
      {
        factor: "family_non_ev_space",
        weight: 0.28,
        score01: highBetter(seats, 4, 7, 0.45),
        reasonGood: "Good seating capacity for family use",
        reasonBad: "Limited seating capacity for family use",
      },
      {
        factor: "family_non_ev_access",
        weight: 0.14,
        score01: highBetter(doors, 3, 5, 0.45),
        reasonGood: "Practical family access",
        reasonBad: "Rear-seat access is limited for family use",
      },
      {
        factor: "family_non_ev_efficiency",
        weight: 0.14,
        score01: lowBetter(consumption, 5.5, 11.5, 0.45),
        reasonGood: "Reasonable family running cost",
        reasonBad: "High running cost for family usage",
      },
      {
        factor: "family_non_ev_body",
        weight: 0.10,
        score01: bodyStyleFamilyScore(bodyStyle),
        reasonGood: "Practical family body style",
        reasonBad: "Body style is less practical for family tasks",
      },
    ];
  }

  if (purpose === "family" && powertrain === "ev") {
    return [
      {
        factor: "family_ev_safety",
        weight: 0.33,
        score01: highBetter(safety, 2.0, 5.0, 0.45),
        reasonGood: "Strong safety for family EV use",
        reasonBad: "Safety rating is weak for family EV use",
      },
      {
        factor: "family_ev_space",
        weight: 0.28,
        score01: highBetter(seats, 4, 7, 0.45),
        reasonGood: "Good family seating capacity",
        reasonBad: "Limited family seating capacity",
      },
      {
        factor: "family_ev_access",
        weight: 0.14,
        score01: highBetter(doors, 3, 5, 0.45),
        reasonGood: "Practical family access",
        reasonBad: "Rear-seat access is limited",
      },
      {
        factor: "family_ev_body",
        weight: 0.12,
        score01: bodyStyleFamilyScore(bodyStyle),
        reasonGood: "Practical family body style",
        reasonBad: "Body style is less practical for family tasks",
      },
      {
        factor: "family_ev_power",
        weight: 0.13,
        score01: lowBetter(enginePower, 110, 280, 0.45),
        reasonGood: "Power level is comfortable for family priorities",
        reasonBad: "Very high power is less aligned to family priorities",
      },
    ];
  }

  if (purpose === "family" && powertrain === "plug_in_hybrid") {
    return [
      {
        factor: "family_plug_in_hybrid_safety",
        weight: 0.33,
        score01: highBetter(safety, 2.0, 5.0, 0.45),
        reasonGood: "Strong safety for family use",
        reasonBad: "Safety rating is weak for family use",
      },
      {
        factor: "family_plug_in_hybrid_space",
        weight: 0.26,
        score01: highBetter(seats, 4, 7, 0.45),
        reasonGood: "Good family seating capacity",
        reasonBad: "Limited family seating capacity",
      },
      {
        factor: "family_plug_in_hybrid_access",
        weight: 0.14,
        score01: highBetter(doors, 3, 5, 0.45),
        reasonGood: "Practical family access",
        reasonBad: "Rear-seat access is limited",
      },
      {
        factor: "family_plug_in_hybrid_body",
        weight: 0.10,
        score01: bodyStyleFamilyScore(bodyStyle),
        reasonGood: "Practical family body style",
        reasonBad: "Body style is less practical for family tasks",
      },
      {
        factor: "family_plug_in_hybrid_efficiency",
        weight: 0.10,
        score01: lowBetter(consumption, 1.0, 9.0, 0.5),
        reasonGood: "Good plug-in running-cost profile",
        reasonBad: "Weak plug-in running-cost profile",
      },
      {
        factor: "family_plug_in_hybrid_power",
        weight: 0.07,
        score01: lowBetter(enginePower, 110, 260, 0.45),
        reasonGood: "Power stays family-friendly",
        reasonBad: "Power is higher than family-focused needs",
      },
    ];
  }

  if (purpose === "sport" && powertrain === "non_ev") {
    return [
      {
        factor: "sport_non_ev_performance",
        weight: 0.46,
        score01: Math.max(highBetter(torque, 140, 500, 0.35), highBetter(enginePower, 90, 320, 0.35)),
        reasonGood: "Strong torque or power for sport driving",
        reasonBad: "Limited torque and power for sport driving",
      },
      {
        factor: "sport_non_ev_engine_size",
        weight: 0.20,
        score01: highBetter(engineSize, 1.2, 3.6, 0.45),
        reasonGood: "Larger engine supports sport character",
        reasonBad: "Small engine limits sport headroom",
      },
      {
        factor: "sport_non_ev_seats",
        weight: 0.12,
        score01: lowBetter(seats, 2, 7, 0.5),
        reasonGood: "Lower seat count aligns with sport focus",
        reasonBad: "Higher seat count is less sport-focused",
      },
      {
        factor: "sport_non_ev_body",
        weight: 0.12,
        score01: bodyStyleSportScore(bodyStyle),
        reasonGood: "Sport-oriented body style",
        reasonBad: "Body style is less sport-focused",
      },
      {
        factor: "sport_non_ev_transmission",
        weight: 0.10,
        score01: transmissionSportScore(transmission),
        reasonGood: "Driver-focused transmission",
        reasonBad: "Transmission is less engaging for sport driving",
      },
    ];
  }

  if (purpose === "sport" && powertrain === "ev") {
    return [
      {
        factor: "sport_ev_power",
        weight: 0.40,
        score01: highBetter(enginePower, 120, 380, 0.35),
        reasonGood: "Strong EV power for sport driving",
        reasonBad: "EV power is limited for sport driving",
      },
      {
        factor: "sport_ev_torque",
        weight: 0.23,
        score01: highBetter(torque, 220, 700, 0.5),
        reasonGood: "Strong EV torque for rapid response",
        reasonBad: "Torque is weaker than typical sport EVs",
      },
      {
        factor: "sport_ev_seats",
        weight: 0.10,
        score01: lowBetter(seats, 2, 7, 0.5),
        reasonGood: "Lower seat count aligns with sport focus",
        reasonBad: "Higher seat count is less sport-focused",
      },
      {
        factor: "sport_ev_body",
        weight: 0.12,
        score01: bodyStyleSportScore(bodyStyle),
        reasonGood: "Sport-oriented body style",
        reasonBad: "Body style is less sport-focused",
      },
      {
        factor: "sport_ev_transmission",
        weight: 0.05,
        score01: transmissionSportScore(transmission),
        reasonGood: "Power delivery supports sporty intent",
        reasonBad: "Power delivery is less sport-oriented",
      },
      {
        factor: "sport_ev_safety",
        weight: 0.10,
        score01: highBetter(safety, 2.0, 5.0, 0.5),
        reasonGood: "Safety supports confident sport use",
        reasonBad: "Safety rating is weak for confident sport use",
      },
    ];
  }

  if (purpose === "sport" && powertrain === "plug_in_hybrid") {
    return [
      {
        factor: "sport_plug_in_hybrid_performance",
        weight: 0.43,
        score01: Math.max(highBetter(torque, 170, 560, 0.45), highBetter(enginePower, 110, 340, 0.45)),
        reasonGood: "Strong combined performance for sport driving",
        reasonBad: "Combined output is limited for sport driving",
      },
      {
        factor: "sport_plug_in_hybrid_engine_size",
        weight: 0.17,
        score01: highBetter(engineSize, 1.4, 3.2, 0.45),
        reasonGood: "Engine size supports sport intent",
        reasonBad: "Engine size limits sport intent",
      },
      {
        factor: "sport_plug_in_hybrid_seats",
        weight: 0.10,
        score01: lowBetter(seats, 2, 7, 0.5),
        reasonGood: "Lower seat count aligns with sport focus",
        reasonBad: "Higher seat count is less sport-focused",
      },
      {
        factor: "sport_plug_in_hybrid_body",
        weight: 0.12,
        score01: bodyStyleSportScore(bodyStyle),
        reasonGood: "Sport-oriented body style",
        reasonBad: "Body style is less sport-focused",
      },
      {
        factor: "sport_plug_in_hybrid_transmission",
        weight: 0.08,
        score01: transmissionSportScore(transmission),
        reasonGood: "Driver-focused transmission",
        reasonBad: "Transmission is less engaging for sport driving",
      },
      {
        factor: "sport_plug_in_hybrid_efficiency",
        weight: 0.10,
        score01: lowBetter(consumption, 1.2, 10.5, 0.5),
        reasonGood: "Usable efficiency for frequent spirited driving",
        reasonBad: "High consumption for frequent spirited driving",
      },
    ];
  }

  if (purpose === "leisure" && powertrain === "non_ev") {
    return [
      {
        factor: "leisure_non_ev_utility",
        weight: 0.30,
        score01: bodyStyleLeisureScore(bodyStyle),
        reasonGood: "Utility-focused body style for leisure use",
        reasonBad: "Body style offers limited leisure flexibility",
      },
      {
        factor: "leisure_non_ev_space",
        weight: 0.22,
        score01: highBetter(seats, 4, 7, 0.45),
        reasonGood: "Good passenger capacity for leisure travel",
        reasonBad: "Seat capacity is limited for leisure travel",
      },
      {
        factor: "leisure_non_ev_access",
        weight: 0.10,
        score01: highBetter(doors, 3, 5, 0.45),
        reasonGood: "Practical access for passengers and gear",
        reasonBad: "Passenger access is limited",
      },
      {
        factor: "leisure_non_ev_power",
        weight: 0.18,
        score01: highBetter(enginePower, 100, 240, 0.45),
        reasonGood: "Capable power for loaded leisure trips",
        reasonBad: "Power is limited for loaded leisure trips",
      },
      {
        factor: "leisure_non_ev_torque",
        weight: 0.10,
        score01: highBetter(torque, 170, 450, 0.45),
        reasonGood: "Useful torque for travel loads",
        reasonBad: "Torque is limited for travel loads",
      },
      {
        factor: "leisure_non_ev_efficiency",
        weight: 0.10,
        score01: lowBetter(consumption, 6.5, 12.5, 0.45),
        reasonGood: "Reasonable running cost for leisure travel",
        reasonBad: "Running cost is high for leisure travel",
      },
    ];
  }

  if (purpose === "leisure" && powertrain === "ev") {
    return [
      {
        factor: "leisure_ev_utility",
        weight: 0.32,
        score01: bodyStyleLeisureScore(bodyStyle),
        reasonGood: "Utility-focused EV body style",
        reasonBad: "Body style offers limited leisure flexibility",
      },
      {
        factor: "leisure_ev_space",
        weight: 0.24,
        score01: highBetter(seats, 4, 7, 0.45),
        reasonGood: "Good passenger capacity for leisure travel",
        reasonBad: "Seat capacity is limited for leisure travel",
      },
      {
        factor: "leisure_ev_access",
        weight: 0.10,
        score01: highBetter(doors, 3, 5, 0.45),
        reasonGood: "Practical access for passengers and gear",
        reasonBad: "Passenger access is limited",
      },
      {
        factor: "leisure_ev_power",
        weight: 0.20,
        score01: highBetter(enginePower, 120, 300, 0.45),
        reasonGood: "Strong EV power for travel and payload",
        reasonBad: "EV power is limited for travel and payload",
      },
      {
        factor: "leisure_ev_torque",
        weight: 0.08,
        score01: highBetter(torque, 220, 600, 0.55),
        reasonGood: "Strong EV torque for loaded travel",
        reasonBad: "Torque is weaker than expected for loaded travel",
      },
      {
        factor: "leisure_ev_safety",
        weight: 0.06,
        score01: highBetter(safety, 2.0, 5.0, 0.5),
        reasonGood: "Safety supports family and leisure travel",
        reasonBad: "Safety rating is weak for leisure travel",
      },
    ];
  }

  return [
    {
      factor: "leisure_plug_in_hybrid_utility",
      weight: 0.30,
      score01: bodyStyleLeisureScore(bodyStyle),
      reasonGood: "Utility-focused body style for leisure use",
      reasonBad: "Body style offers limited leisure flexibility",
    },
    {
      factor: "leisure_plug_in_hybrid_space",
      weight: 0.22,
      score01: highBetter(seats, 4, 7, 0.45),
      reasonGood: "Good passenger capacity for leisure travel",
      reasonBad: "Seat capacity is limited for leisure travel",
    },
    {
      factor: "leisure_plug_in_hybrid_access",
      weight: 0.10,
      score01: highBetter(doors, 3, 5, 0.45),
      reasonGood: "Practical access for passengers and gear",
      reasonBad: "Passenger access is limited",
    },
    {
      factor: "leisure_plug_in_hybrid_power",
      weight: 0.16,
      score01: highBetter(enginePower, 100, 260, 0.45),
      reasonGood: "Capable power for loaded leisure trips",
      reasonBad: "Power is limited for loaded leisure trips",
    },
    {
      factor: "leisure_plug_in_hybrid_torque",
      weight: 0.08,
      score01: highBetter(torque, 170, 500, 0.45),
      reasonGood: "Useful torque for travel loads",
      reasonBad: "Torque is limited for travel loads",
    },
    {
      factor: "leisure_plug_in_hybrid_efficiency",
      weight: 0.08,
      score01: lowBetter(consumption, 1.2, 10.0, 0.5),
      reasonGood: "Good plug-in running-cost profile for leisure",
      reasonBad: "Weak plug-in running-cost profile for leisure",
    },
    {
      factor: "leisure_plug_in_hybrid_safety",
      weight: 0.06,
      score01: highBetter(safety, 2.0, 5.0, 0.5),
      reasonGood: "Safety supports leisure travel",
      reasonBad: "Safety rating is weak for leisure travel",
    },
  ];
}

function buildYearTerm(car: CatalogCar): EquationTerm {
  const currentYear = new Date().getFullYear();
  return {
    factor: "vehicle_year",
    weight: 0.12,
    score01: highBetter(car.year, currentYear - 24, currentYear, 0.5),
    reasonGood: "Newer model year improves overall fit",
    reasonBad: "Older model year reduces overall fit",
  };
}

function estimateMatchScore(car: CatalogCar, inputs: RecommendationInputs): {
  score: number;
  rawScore: number;
  factors: ScoreFactor[];
  penalties: string[];
} {
  const factors: ScoreFactor[] = [];
  const penalties: string[] = [];

  const enginePower = car.engine_power_kw;
  const powertrain = normalizePowertrainCategory(car.powertrain_category ?? car.fuel_type);
  const purpose = toPurposeKey(inputs.purpose);
  const normalizedPowertrain = toPowertrainKey(powertrain);

  const terms = [...buildEquationTerms(purpose, normalizedPowertrain, car), buildYearTerm(car)];
  const equation = applyEquation(terms, factors, penalties);
  let rawScore = (equation.equation01 - 0.5) * 140;

  if (inputs.isFirstCar) {
    if ((car.year ?? 0) >= 2018) {
      rawScore += applyDelta(factors, penalties, "first_car_age", 5, "Modern safety-era model");
    }
    if (enginePower != null) {
      if (enginePower <= 130) {
        rawScore += applyDelta(factors, penalties, "first_car_power", 4, "Manageable power for new drivers");
      } else if (enginePower >= 220) {
        rawScore += applyDelta(factors, penalties, "first_car_power", -9, "Higher power may be less forgiving for a first car");
      }
    }
  }

  if (inputs.powertrainPreference !== "any") {
    if (inputs.powertrainPreference === powertrain) {
      rawScore += applyDelta(factors, penalties, "powertrain_fit", 8, "Matches powertrain preference");
    } else {
      rawScore += applyDelta(factors, penalties, "powertrain_fit", -10, "Powertrain differs from your preference");
    }
  }

  if (car.data_quality?.confidence != null) {
    const confidenceBoost = Math.round((car.data_quality.confidence - 0.7) * 8);
    if (confidenceBoost > 0) {
      rawScore += applyDelta(factors, penalties, "data_confidence", confidenceBoost, "High data confidence");
    }
  }
  rawScore = Math.round(rawScore * 10) / 10;

  return {
    score: normalizeDisplayScore(rawScore),
    rawScore,
    factors,
    penalties,
  };
}

function staticToRecommendation(car: CatalogCar, inputs: RecommendationInputs, mode: "strict" | "fallback"): Recommendation {
  const scoring = estimateMatchScore(car, inputs);
  const powertrain = normalizePowertrainCategory(car.powertrain_category ?? car.fuel_type);

  return {
    make: car.make,
    model: car.model,
    trim: car.trim,
    year: car.year,
    body_style: car.body_style,
    fuel_type: car.fuel_type ?? null,
    engine_type: car.engine_type,
    powertrain_category: powertrain,
    engine_displacement_cc: car.engine_displacement_cc,
    engine_displacement_l: car.engine_displacement_l,
    engine_power_kw: car.engine_power_kw,
    torque_nm: car.torque_nm ?? null,
    transmission: car.transmission,
    doors: car.doors ?? null,
    seats: car.seats ?? null,
    fuel_consumption_l_100km: car.fuel_consumption_l_100km ?? null,
    safety_stars: car.safety_stars,
    safety_rating: car.safety_rating,
    brand_region: car.brand_region,
    data_quality: car.data_quality ?? null,
    match_score: scoring.score,
    raw_match_score: scoring.rawScore,
    purpose_strengths: {
      [inputs.purpose]: { score: scoring.score, factors: scoring.factors },
    },
    score_breakdown: scoring.factors,
    penalty_reasons: scoring.penalties,
    recommendation_mode: mode,
  };
}

async function getBrandsFallback(): Promise<string[]> {
  const rows = await loadCatalog();
  return [...new Set(rows.map((row) => (row.make || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

async function getRecommendationsFallback(
  inputs: RecommendationInputs
): Promise<Recommendation[]> {
  const normalizedPowertrainPreference = normalizePowertrainPreference(inputs.powertrainPreference);
  const rows = await loadCatalog();
  const eligible = rows.filter((row) => row.data_quality?.eligible !== false);

  const strict = eligible.filter((row) => {
    const make = (row.make || "").trim();
    if (inputs.brandPreference !== "any" && make !== inputs.brandPreference) {
      return false;
    }

    const powertrain = normalizePowertrainCategory(row.powertrain_category ?? row.fuel_type);
    if (normalizedPowertrainPreference !== "any" && powertrain !== normalizedPowertrainPreference) {
      return false;
    }
    return true;
  });

  const pool = strict.length > 0 ? strict : eligible.filter((row) => {
    const powertrain = normalizePowertrainCategory(row.powertrain_category ?? row.fuel_type);
    return normalizedPowertrainPreference === "any" || powertrain === normalizedPowertrainPreference;
  });

  const mode: "strict" | "fallback" = strict.length > 0 ? "strict" : "fallback";

  return pool
    .map((row) => staticToRecommendation(row, inputs, mode))
    .sort(
      (a, b) =>
        b.raw_match_score - a.raw_match_score ||
        b.match_score - a.match_score ||
        (a.make || "").localeCompare(b.make || "")
    )
    .slice(0, 10);
}

export async function getBrands(): Promise<string[]> {
  return getBrandsFallback();
}

export async function getRecommendations(
  inputs: RecommendationInputs
): Promise<Recommendation[]> {
  return getRecommendationsFallback(inputs);
}
