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

const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

async function request<T>(path: string, query: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const url = new URL(`${apiBase}${path}`, window.location.origin);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Recommendation service returned ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export async function getBrands(signal?: AbortSignal): Promise<string[]> {
  const response = await request<{ brands: string[] }>("/brands", {}, signal);
  return response.brands;
}

export async function getRecommendations(
  inputs: RecommendationInputs,
  signal?: AbortSignal
): Promise<Recommendation[]> {
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
}
