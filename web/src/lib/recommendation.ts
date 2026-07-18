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

function estimateMatchScore(car: CatalogCar, inputs: RecommendationInputs): {
  score: number;
  factors: ScoreFactor[];
  penalties: string[];
} {
  let total = 45;
  const factors: ScoreFactor[] = [];
  const penalties: string[] = [];

  if (car.fuel_consumption_l_100km != null) {
    if (car.fuel_consumption_l_100km <= 5.5) {
      total += 12;
      factors.push(scoreFactor("efficiency", 12, "Efficient fuel use"));
    } else if (car.fuel_consumption_l_100km <= 7.0) {
      total += 5;
      factors.push(scoreFactor("efficiency", 5, "Reasonable fuel use"));
    } else {
      penalties.push("Higher fuel consumption");
    }
  }

  if (inputs.isFirstCar) {
    if ((car.year ?? 0) >= 2018) {
      total += 6;
      factors.push(scoreFactor("first_car_age", 6, "Modern safety-era model"));
    }
    if (car.engine_power_kw != null) {
      if (car.engine_power_kw <= 130) {
        total += 5;
        factors.push(scoreFactor("first_car_power", 5, "Manageable power for new drivers"));
      } else if (car.engine_power_kw >= 220) {
        total -= 6;
        penalties.push("Higher power may be less forgiving for a first car");
      }
    }
  }

  const bodyStyle = (car.body_style || "").toLowerCase();
  if (inputs.purpose === "family") {
    if ((car.seats ?? 0) >= 7) {
      total += 16;
      factors.push(scoreFactor("family_space", 16, "Strong family seating capacity"));
    } else if ((car.seats ?? 0) >= 5) {
      total += 10;
      factors.push(scoreFactor("family_space", 10, "Suitable seating for family use"));
    } else {
      total -= 12;
      penalties.push("Limited seating for family use");
    }
    if ((car.doors ?? 0) >= 5) {
      total += 7;
      factors.push(scoreFactor("family_access", 7, "Easy access with 5 doors"));
    }
    if ((car.safety_rating ?? 0) >= 5) {
      total += 10;
      factors.push(scoreFactor("family_safety", 10, "Top-tier safety rating"));
    }
  } else if (inputs.purpose === "sport") {
    if ((car.engine_power_kw ?? 0) >= 220) {
      total += 16;
      factors.push(scoreFactor("sport_power", 16, "High power output"));
    } else if ((car.engine_power_kw ?? 0) >= 170) {
      total += 10;
      factors.push(scoreFactor("sport_power", 10, "Strong power output"));
    }
    if (bodyStyle.includes("coupe") || bodyStyle.includes("sport")) {
      total += 6;
      factors.push(scoreFactor("sport_body", 6, "Sport-oriented body style"));
    }
  } else if (inputs.purpose === "leisure") {
    if (
      bodyStyle.includes("suv") ||
      bodyStyle.includes("wagon") ||
      bodyStyle.includes("ute") ||
      bodyStyle.includes("pickup")
    ) {
      total += 10;
      factors.push(scoreFactor("leisure_utility", 10, "Practical body style for leisure trips"));
    }
    if ((car.seats ?? 0) >= 5) {
      total += 6;
      factors.push(scoreFactor("leisure_space", 6, "Comfortable passenger capacity"));
    }
  } else {
    if (car.fuel_consumption_l_100km != null && car.fuel_consumption_l_100km <= 6.5) {
      total += 10;
      factors.push(scoreFactor("commute_efficiency", 10, "Efficient for daily commuting"));
    }
    if (car.powertrain_category === "ev" || car.powertrain_category === "plug_in_hybrid") {
      total += 6;
      factors.push(scoreFactor("commute_powertrain", 6, "Electrified powertrain suits city driving"));
    }
  }

  const powertrain = normalizePowertrainCategory(car.powertrain_category ?? car.fuel_type);
  if (inputs.powertrainPreference !== "any") {
    if (inputs.powertrainPreference === powertrain) {
      total += 8;
      factors.push(scoreFactor("powertrain_fit", 8, "Matches powertrain preference"));
    } else {
      total -= 8;
      penalties.push("Powertrain differs from your preference");
    }
  }

  if (car.data_quality?.confidence != null) {
    const confidenceBoost = Math.round((car.data_quality.confidence - 0.7) * 10);
    if (confidenceBoost > 0) {
      total += confidenceBoost;
      factors.push(scoreFactor("data_confidence", confidenceBoost, "High data confidence"));
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
