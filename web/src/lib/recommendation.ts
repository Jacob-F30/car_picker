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

type StaticCar = {
  make: string | null;
  model: string | null;
  generation?: string | null;
  year_range?: [number | null, number | null] | null;
  avg_nz_price?: number | null;
  motto?: string | null;
  is_good_first_car?: boolean | null;
  engine_size?: number | null;
  fuel_type?: string | null;
  torque_nm?: number | null;
  doors?: number | null;
  seats?: number | null;
  fuel_consumption_l_100km?: number | null;
};

const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const fallbackDatasetPath = `${import.meta.env.BASE_URL}data/cars_db.json`;
let fallbackCatalogPromise: Promise<StaticCar[]> | null = null;

async function request<T>(path: string, query: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const url = new URL(`${apiBase}${path}`, window.location.origin);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Recommendation service returned ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

function normalizePowertrainCategory(fuelType: string | null | undefined): string | null {
  const value = (fuelType || "").toLowerCase();
  if (!value) return null;
  if (value.includes("plug") && value.includes("hybrid")) return "plug_in_hybrid";
  if (value.includes("ev") || value.includes("electric")) return "ev";
  return "non_ev";
}

function scoreFactor(factor: string, score: number, reason: string): ScoreFactor {
  return { factor, score, reason };
}

function purposeKeywords(purpose: string): string[] {
  switch (purpose) {
    case "family":
      return ["family", "comfort", "safe", "space", "practical"];
    case "sport":
      return ["sport", "performance", "agile", "driver", "quick"];
    case "leisure":
      return ["leisure", "touring", "comfort", "weekend"];
    case "commute":
    default:
      return ["eco", "daily", "city", "comfort", "economy"];
  }
}

function estimateMatchScore(car: StaticCar, inputs: RecommendationInputs): {
  score: number;
  factors: ScoreFactor[];
  penalties: string[];
} {
  let total = 35;
  const factors: ScoreFactor[] = [];
  const penalties: string[] = [];

  if (car.avg_nz_price != null) {
    const priceDelta = car.avg_nz_price - inputs.budget;
    if (priceDelta <= 0) {
      total += 18;
      factors.push(scoreFactor("budget_fit", 18, "Within budget"));
    } else if (priceDelta <= 2500) {
      total += 5;
      factors.push(scoreFactor("budget_fit", 5, "Slightly above budget"));
      penalties.push("Slightly above your budget");
    } else {
      total -= 12;
      penalties.push("Over your budget");
    }
  }

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

  if (inputs.isFirstCar && car.is_good_first_car === true) {
    total += 10;
    factors.push(scoreFactor("first_car_fit", 10, "Commonly suitable as a first car"));
  } else if (inputs.isFirstCar && car.is_good_first_car === false) {
    total -= 8;
    penalties.push("Not usually ideal as a first car");
  }

  const keywords = purposeKeywords(inputs.purpose);
  const motto = (car.motto || "").toLowerCase();
  const purposeHits = keywords.filter((word) => motto.includes(word)).length;
  if (purposeHits > 0) {
    const purposeScore = Math.min(12, purposeHits * 4);
    total += purposeScore;
    factors.push(scoreFactor(`${inputs.purpose}_fit`, purposeScore, `Matches ${inputs.purpose} priorities`));
  }

  const powertrain = normalizePowertrainCategory(car.fuel_type);
  if (inputs.powertrainPreference !== "any") {
    if (inputs.powertrainPreference === powertrain) {
      total += 8;
      factors.push(scoreFactor("powertrain_fit", 8, "Matches powertrain preference"));
    } else {
      total -= 8;
      penalties.push("Powertrain differs from your preference");
    }
  }

  if (car.seats != null && inputs.purpose === "family") {
    if (car.seats >= 5) {
      total += 6;
      factors.push(scoreFactor("space", 6, "Good seating for family use"));
    } else {
      penalties.push("Limited seating for family use");
    }
  }

  return {
    score: Math.max(0, Math.min(99, Math.round(total))),
    factors,
    penalties,
  };
}

function staticToRecommendation(car: StaticCar, inputs: RecommendationInputs): Recommendation {
  const scoring = estimateMatchScore(car, inputs);
  const powertrain = normalizePowertrainCategory(car.fuel_type);
  const startYear = car.year_range?.[0] ?? null;

  return {
    make: car.make,
    model: car.model,
    trim: car.generation ?? null,
    year: startYear,
    body_style: null,
    fuel_type: car.fuel_type ?? null,
    engine_type: null,
    powertrain_category: powertrain,
    engine_displacement_cc:
      car.engine_size != null ? Math.round(car.engine_size * 1000) : null,
    engine_displacement_l: car.engine_size ?? null,
    engine_power_kw: null,
    torque_nm: car.torque_nm ?? null,
    transmission: null,
    doors: car.doors ?? null,
    seats: car.seats ?? null,
    fuel_consumption_l_100km: car.fuel_consumption_l_100km ?? null,
    safety_stars: null,
    safety_rating: null,
    brand_region: null,
    data_quality: { eligible: true, confidence: 0.65 },
    match_score: scoring.score,
    purpose_strengths: {
      [inputs.purpose]: { score: scoring.score, factors: scoring.factors },
    },
    score_breakdown: scoring.factors,
    penalty_reasons: scoring.penalties,
    recommendation_mode: "fallback",
  };
}

async function loadFallbackCatalog(signal?: AbortSignal): Promise<StaticCar[]> {
  if (!fallbackCatalogPromise) {
    fallbackCatalogPromise = fetch(new URL(fallbackDatasetPath, window.location.origin), { signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Fallback catalog returned ${response.status}.`);
        }
        return response.json() as Promise<unknown>;
      })
      .then((rows) => {
        if (!Array.isArray(rows)) return [];
        return rows as StaticCar[];
      });
  }
  return fallbackCatalogPromise;
}

async function getBrandsFallback(signal?: AbortSignal): Promise<string[]> {
  const rows = await loadFallbackCatalog(signal);
  return [...new Set(rows.map((row) => (row.make || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

async function getRecommendationsFallback(
  inputs: RecommendationInputs,
  signal?: AbortSignal
): Promise<Recommendation[]> {
  const rows = await loadFallbackCatalog(signal);
  const filtered = rows.filter((row) => {
    const make = (row.make || "").trim();
    if (inputs.brandPreference !== "any" && make !== inputs.brandPreference) {
      return false;
    }

    const powertrain = normalizePowertrainCategory(row.fuel_type);
    if (inputs.powertrainPreference !== "any" && powertrain !== inputs.powertrainPreference) {
      return false;
    }

    if (row.avg_nz_price != null && row.avg_nz_price > inputs.budget * 1.35) {
      return false;
    }
    return true;
  });

  return filtered
    .map((row) => staticToRecommendation(row, inputs))
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 10);
}

export async function getBrands(signal?: AbortSignal): Promise<string[]> {
  try {
    const response = await request<{ brands: string[] }>("/brands", {}, signal);
    return response.brands;
  } catch {
    return getBrandsFallback(signal);
  }
}

export async function getRecommendations(
  inputs: RecommendationInputs,
  signal?: AbortSignal
): Promise<Recommendation[]> {
  try {
    const response = await request<{ results: Recommendation[] }>(
      "/recommendations",
      {
        purpose: inputs.purpose,
        budget: String(inputs.budget),
        is_first_car: String(inputs.isFirstCar),
        powertrain_preference: inputs.powertrainPreference,
        brand_preference: inputs.brandPreference,
        top_n: "10",
      },
      signal
    );
    return response.results;
  } catch {
    return getRecommendationsFallback(inputs, signal);
  }
}
