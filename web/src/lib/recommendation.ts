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

function applyScore(
  factors: ScoreFactor[],
  penalties: string[],
  factor: string,
  score: number,
  reason: string
): number {
  if (!score) return 0;
  factors.push(scoreFactor(factor, score, reason));
  if (score < 0) penalties.push(reason);
  return score;
}

function estimateMatchScore(car: CatalogCar, inputs: RecommendationInputs): {
  score: number;
  factors: ScoreFactor[];
  penalties: string[];
} {
  let total = 45;
  const factors: ScoreFactor[] = [];
  const penalties: string[] = [];

  const consumption = car.fuel_consumption_l_100km;
  const enginePower = car.engine_power_kw;
  const engineSize = car.engine_displacement_l;
  const seats = car.seats;
  const doors = car.doors;
  const safety = car.safety_rating ?? car.safety_stars;
  const torque = car.torque_nm;
  const powertrain = normalizePowertrainCategory(car.powertrain_category ?? car.fuel_type);

  if (inputs.isFirstCar) {
    if ((car.year ?? 0) >= 2018) {
      total += applyScore(factors, penalties, "first_car_age", 6, "Modern safety-era model");
    }
    if (enginePower != null) {
      if (enginePower <= 130) {
        total += applyScore(factors, penalties, "first_car_power", 6, "Manageable power for new drivers");
      } else if (enginePower >= 220) {
        total += applyScore(factors, penalties, "first_car_power", -10, "Higher power may be less forgiving for a first car");
      }
    }
    if (consumption != null && consumption >= 8.5) {
      total += applyScore(factors, penalties, "first_car_efficiency", -10, "High running cost for a first car");
    }
  }

  const bodyStyle = (car.body_style || "").toLowerCase();
  if (inputs.purpose === "family") {
    if ((seats ?? 0) >= 7) {
      total += applyScore(factors, penalties, "family_space", 24, "Strong family seating capacity");
    } else if ((seats ?? 0) >= 5) {
      total += applyScore(factors, penalties, "family_space", 14, "Suitable seating for family use");
    } else if ((seats ?? 0) === 4) {
      total += applyScore(factors, penalties, "family_space", 2, "Minimum practical family seating");
    } else {
      total += applyScore(factors, penalties, "family_space", -35, "Limited seating for family use");
    }
    if ((doors ?? 0) >= 5) {
      total += applyScore(factors, penalties, "family_access", 12, "Excellent access with 5 doors");
    } else if ((doors ?? 0) >= 4) {
      total += applyScore(factors, penalties, "family_access", 6, "Practical family access");
    } else {
      total += applyScore(factors, penalties, "family_access", -24, "Limited rear-seat access for family use");
    }
    if ((safety ?? 0) >= 5) {
      total += applyScore(factors, penalties, "family_safety", 20, "Top-tier safety rating");
    } else if ((safety ?? 0) >= 4) {
      total += applyScore(factors, penalties, "family_safety", 12, "Strong safety rating");
    } else if ((safety ?? 0) < 3) {
      total += applyScore(factors, penalties, "family_safety", -42, "Safety rating below family threshold");
    }
    if (consumption != null) {
      if (consumption <= 7.5) {
        total += applyScore(factors, penalties, "family_efficiency", 8, "Reasonable family running cost");
      } else if (consumption >= 10.0) {
        total += applyScore(factors, penalties, "family_efficiency", -22, "Very high family running cost");
      } else if (consumption >= 9.0) {
        total += applyScore(factors, penalties, "family_efficiency", -14, "High family running cost");
      }
    }
    if (bodyStyle.includes("suv") || bodyStyle.includes("wagon") || bodyStyle.includes("van") || bodyStyle.includes("minivan")) {
      total += applyScore(factors, penalties, "family_body", 10, "Practical family body style");
    } else if (bodyStyle.includes("coupe") || bodyStyle.includes("roadster") || bodyStyle.includes("convertible")) {
      total += applyScore(factors, penalties, "family_body", -18, "Body style is less practical for family tasks");
    }
    if ((enginePower ?? 0) >= 260) {
      total += applyScore(factors, penalties, "family_power", -10, "Very high power is not essential for family use");
    }
  } else if (inputs.purpose === "sport") {
    if ((torque ?? 0) >= 450) {
      total += applyScore(factors, penalties, "sport_torque", 32, "Very strong torque output");
    } else if ((torque ?? 0) >= 320) {
      total += applyScore(factors, penalties, "sport_torque", 22, "Strong torque output");
    } else if ((torque ?? 0) >= 220) {
      total += applyScore(factors, penalties, "sport_torque", 12, "Responsive torque output");
    } else if (torque != null && torque < 160) {
      total += applyScore(factors, penalties, "sport_torque", -18, "Limited torque for sport use");
    }
    if ((enginePower ?? 0) >= 280) {
      total += applyScore(factors, penalties, "sport_power", 28, "Very strong power output");
    } else if ((enginePower ?? 0) >= 220) {
      total += applyScore(factors, penalties, "sport_power", 20, "High power output");
    } else if ((enginePower ?? 0) >= 160) {
      total += applyScore(factors, penalties, "sport_power", 10, "Strong power output");
    } else if (enginePower != null && enginePower < 120) {
      total += applyScore(factors, penalties, "sport_power", -15, "Limited power for sport driving");
    }
    if (bodyStyle.includes("coupe") || bodyStyle.includes("sport") || bodyStyle.includes("roadster")) {
      total += applyScore(factors, penalties, "sport_body", 10, "Sport-oriented body style");
    } else if (bodyStyle.includes("van") || bodyStyle.includes("minivan")) {
      total += applyScore(factors, penalties, "sport_body", -20, "Body style is not sport focused");
    }
    if ((car.transmission || "").toLowerCase().includes("manual") || (car.transmission || "").toLowerCase().includes("dual")) {
      total += applyScore(factors, penalties, "sport_transmission", 12, "Driver-focused transmission");
    } else if ((car.transmission || "").toLowerCase().includes("cvt")) {
      total += applyScore(factors, penalties, "sport_transmission", -10, "CVT is less engaging for sport driving");
    }
    if (consumption != null && consumption >= 13.0) {
      total += applyScore(factors, penalties, "sport_efficiency", -8, "Very high fuel use for frequent spirited driving");
    }
  } else if (inputs.purpose === "leisure") {
    const utilityBody = bodyStyle.includes("suv") || bodyStyle.includes("wagon") || bodyStyle.includes("ute") || bodyStyle.includes("pickup") || bodyStyle.includes("van");
    if (
      bodyStyle.includes("suv") ||
      bodyStyle.includes("ute") ||
      bodyStyle.includes("pickup")
    ) {
      total += applyScore(factors, penalties, "leisure_utility", 20, "Utility-focused body style");
    } else if (bodyStyle.includes("wagon") || bodyStyle.includes("van") || bodyStyle.includes("minivan")) {
      total += applyScore(factors, penalties, "leisure_utility", 14, "Practical travel body style");
    } else if (bodyStyle.includes("coupe") || bodyStyle.includes("roadster") || bodyStyle.includes("convertible")) {
      total += applyScore(factors, penalties, "leisure_utility", -14, "Limited cargo or passenger flexibility");
    }
    if ((seats ?? 0) >= 7) {
      total += applyScore(factors, penalties, "leisure_space", 18, "Seven or more seats");
    } else if ((seats ?? 0) >= 5) {
      total += applyScore(factors, penalties, "leisure_space", 10, "Comfortable passenger capacity");
    } else if ((seats ?? 0) < 4) {
      total += applyScore(factors, penalties, "leisure_space", -24, "Too few seats for leisure travel");
    }
    if ((doors ?? 0) >= 4) {
      total += applyScore(factors, penalties, "leisure_access", 8, "Practical door count");
    } else {
      total += applyScore(factors, penalties, "leisure_access", -14, "Limited passenger access");
    }
    if ((enginePower ?? 0) >= 220) {
      total += applyScore(factors, penalties, "leisure_power", 12, "Strong engine or motor power");
    } else if ((enginePower ?? 0) >= 170) {
      total += applyScore(factors, penalties, "leisure_power", 8, "Capable engine or motor power");
    } else if (utilityBody && enginePower != null && enginePower < 100) {
      total += applyScore(factors, penalties, "leisure_power", -12, "Limited power for a utility body style");
    }
    if ((torque ?? 0) >= 280) {
      total += applyScore(factors, penalties, "leisure_torque", 10, "Useful torque for loaded travel");
    } else if (utilityBody && torque != null && torque < 170) {
      total += applyScore(factors, penalties, "leisure_torque", -8, "Limited torque for loaded leisure trips");
    }
    if ((safety ?? 0) >= 5) {
      total += applyScore(factors, penalties, "leisure_safety", 10, "Top-tier safety rating");
    } else if ((safety ?? 0) >= 4) {
      total += applyScore(factors, penalties, "leisure_safety", 6, "Strong safety rating");
    } else if ((safety ?? 0) < 3) {
      total += applyScore(factors, penalties, "leisure_safety", -16, "Low safety rating for travel use");
    }
    if (powertrain !== "ev" && consumption != null) {
      if (consumption <= 8.5) {
        total += applyScore(factors, penalties, "leisure_efficiency", 6, "Reasonable travel running cost");
      } else if (consumption >= 11.5) {
        total += applyScore(factors, penalties, "leisure_efficiency", -20, "Very high fuel use for leisure travel");
      } else if (consumption >= 10.0) {
        total += applyScore(factors, penalties, "leisure_efficiency", -12, "High fuel use for leisure travel");
      }
    }
  } else {
    if (powertrain === "ev") {
      total += applyScore(factors, penalties, "commute_powertrain", 16, "Electric powertrain reduces commute running cost");
    } else if (powertrain === "plug_in_hybrid") {
      total += applyScore(factors, penalties, "commute_powertrain", 10, "Plug-in hybrid supports efficient city commuting");
    } else if ((car.fuel_type || "").toLowerCase().includes("hybrid")) {
      total += applyScore(factors, penalties, "commute_powertrain", 6, "Hybrid powertrain supports efficient commuting");
    }
    if (consumption != null) {
      if (consumption <= 4.5) {
        total += applyScore(factors, penalties, "commute_efficiency", 28, "Excellent commute efficiency");
      } else if (consumption <= 5.5) {
        total += applyScore(factors, penalties, "commute_efficiency", 22, "Very low fuel use");
      } else if (consumption <= 6.5) {
        total += applyScore(factors, penalties, "commute_efficiency", 14, "Efficient fuel use");
      } else if (consumption <= 7.5) {
        total += applyScore(factors, penalties, "commute_efficiency", 4, "Acceptable commute fuel use");
      } else if (consumption >= 10.0) {
        total += applyScore(factors, penalties, "commute_efficiency", -32, "Very high fuel use for commuting");
      } else if (consumption >= 9.0) {
        total += applyScore(factors, penalties, "commute_efficiency", -22, "High fuel use for commuting");
      } else if (consumption >= 8.3) {
        total += applyScore(factors, penalties, "commute_efficiency", -12, "Elevated commute fuel cost");
      }
    } else {
      total += applyScore(factors, penalties, "commute_efficiency", -8, "Missing fuel-use data increases commute uncertainty");
    }
    if (engineSize != null) {
      if (engineSize <= 1.6) {
        total += applyScore(factors, penalties, "commute_engine_size", 10, "Small displacement suits commuting");
      } else if (engineSize <= 2.0) {
        total += applyScore(factors, penalties, "commute_engine_size", 6, "Practical engine displacement");
      } else if (engineSize >= 3.0) {
        total += applyScore(factors, penalties, "commute_engine_size", -20, "Large displacement raises commute cost");
      } else if (engineSize >= 2.5) {
        total += applyScore(factors, penalties, "commute_engine_size", -12, "Bigger engine than typical commute needs");
      }
    }
    if (enginePower != null) {
      if (enginePower <= 110) {
        total += applyScore(factors, penalties, "commute_engine_power", 8, "Right-sized power for daily driving");
      } else if (enginePower <= 150) {
        total += applyScore(factors, penalties, "commute_engine_power", 4, "Practical engine power");
      } else if (enginePower >= 230) {
        total += applyScore(factors, penalties, "commute_engine_power", -18, "Excessive power for commute priorities");
      } else if (enginePower >= 180) {
        total += applyScore(factors, penalties, "commute_engine_power", -10, "Higher power than needed for commuting");
      }
    }
  }

  if (inputs.powertrainPreference !== "any") {
    if (inputs.powertrainPreference === powertrain) {
      total += applyScore(factors, penalties, "powertrain_fit", 14, "Matches powertrain preference");
    } else {
      total += applyScore(factors, penalties, "powertrain_fit", -16, "Powertrain differs from your preference");
    }
  }

  if (car.data_quality?.confidence != null) {
    const confidenceBoost = Math.round((car.data_quality.confidence - 0.7) * 10);
    if (confidenceBoost > 0) {
      total += applyScore(factors, penalties, "data_confidence", confidenceBoost, "High data confidence");
    }
  }

  return {
    score: Math.max(0, Math.min(99, Math.round(total))),
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
    purpose_strengths: {
      [inputs.purpose]: { score: scoring.score, factors: scoring.factors },
    },
    score_breakdown: scoring.factors,
    penalty_reasons: scoring.penalties,
    recommendation_mode: mode,
  };
}

async function getBrandsFallback(signal?: AbortSignal): Promise<string[]> {
  const rows = await loadCatalog();
  return [...new Set(rows.map((row) => (row.make || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

async function getRecommendationsFallback(
  inputs: RecommendationInputs,
  signal?: AbortSignal
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
    .sort((a, b) => b.match_score - a.match_score || (a.make || "").localeCompare(b.make || ""))
    .slice(0, 10);
}

export async function getBrands(signal?: AbortSignal): Promise<string[]> {
  return getBrandsFallback(signal);
}

export async function getRecommendations(
  inputs: RecommendationInputs,
  signal?: AbortSignal
): Promise<Recommendation[]> {
  return getRecommendationsFallback(inputs, signal);
}
