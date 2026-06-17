import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const DEFAULT_INPUT = path.join(repoRoot, "data", "cars_db.json");
const DEFAULT_FALLBACK_INPUT = path.join(
  repoRoot,
  "web",
  "public",
  "data",
  "cars_db.json"
);
const DEFAULT_OUTPUT = path.join(repoRoot, "data", "recommendation_training.jsonl");
const DEFAULT_META = path.join(repoRoot, "data", "recommendation_training.meta.json");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[i + 1];
      i += 1;
    } else if (arg === "--output") {
      args.output = argv[i + 1];
      i += 1;
    } else if (arg === "--users") {
      args.users = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--max-rows") {
      args.maxRows = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--seed") {
      args.seed = Number(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

function resolvePath(inputPath, fallbackPath) {
  const selected = inputPath ?? fallbackPath;
  return path.isAbsolute(selected) ? selected : path.join(repoRoot, selected);
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeFuelToken(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (text.includes("hybrid")) return "hybrid";
  if (text.includes("ev") || text.includes("electric")) return "ev";
  if (text.includes("diesel")) return "diesel";
  if (text.includes("petrol") || text.includes("gasoline")) return "petrol";
  return text;
}

function containsAny(value, options) {
  const lower = normalizeText(value);
  return options.some((opt) => lower.includes(opt.toLowerCase()));
}

function matchesStrictFilters(car, purpose, budget, fuelType, brandPreference) {
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
  car,
  purpose,
  yearsToKeep,
  budget,
  isFirstCar,
  fuelType,
  brandPreference,
  relaxed = false
) {
  let score = 0;
  const fuelConsumption = Number(car?.fuel_consumption_l_100km ?? 0);
  const carFuelType = String(car?.fuel_type ?? "");
  const drivetrain = String(car?.drivetrain ?? "");
  const make = String(car?.make ?? "").toLowerCase();
  const hp = Number(car?.hp ?? 0);
  const engineSize = Number(car?.engine_size ?? 0);

  if (purpose === "commute") {
    if (fuelConsumption <= 6.5 || containsAny(carFuelType, ["Hybrid", "EV"])) score += 50;
    score -= fuelConsumption * 5;
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
    if (fuelConsumption >= 8.5) score -= 8;
    else if (fuelConsumption > 0 && fuelConsumption <= 6.5) score += 8;
    if (engineSize > 0 && engineSize <= 1.6) score += 6;
    if (drivetrain === "RWD") score -= 6;
  }

  if (yearsToKeep >= 5) {
    const parts = String(car?.parts_availability ?? "").toLowerCase();
    if (parts === "good" || parts === "excellent") score += 25;
    if (Number(car?.expected_lifespan_km ?? 0) < 180000) score -= 30;
  }

  if (fuelType !== "any") {
    if (carFuelType.toLowerCase().includes(fuelType)) score += 18;
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

function purposeAlignmentScore(car, purpose) {
  const fuelConsumption = Number(car?.fuel_consumption_l_100km ?? 0);
  const carFuelType = String(car?.fuel_type ?? "");
  const drivetrain = String(car?.drivetrain ?? "");

  if (purpose === "commute") {
    let score = 0;
    if (fuelConsumption <= 6.5 || containsAny(carFuelType, ["Hybrid", "EV"])) score += 50;
    score -= fuelConsumption * 5;
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

function mulberry32(seed) {
  return function rng() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomChoice(rng, list) {
  if (!list.length) return null;
  return list[Math.floor(rng() * list.length)];
}

function sampleUser(rng, makes, fuelTokens) {
  const purposes = ["commute", "family", "sport", "leisure"];
  const minBudget = 5000;
  const maxBudget = 50000;
  const budget = Math.round(
    (minBudget + (maxBudget - minBudget) * Math.pow(rng(), 0.6)) / 500
  ) * 500;

  const fuelChoice = rng() < 0.4 ? "any" : randomChoice(rng, fuelTokens);
  const brandChoice = rng() < 0.5 ? "any" : randomChoice(rng, makes);

  return {
    purpose: randomChoice(rng, purposes),
    budget,
    yearsToKeep: Math.max(1, Math.round(rng() * 9) + 1),
    fuelType: fuelChoice ?? "any",
    brandPreference: brandChoice ?? "any",
    isFirstCar: rng() < 0.4,
  };
}

function buildRow(user, car, score, mode, isStrictMatch) {
  const yearRange = Array.isArray(car?.year_range) ? car.year_range : [null, null];
  return {
    user_purpose: user.purpose,
    user_budget: user.budget,
    user_years_to_keep: user.yearsToKeep,
    user_fuel_type: user.fuelType,
    user_brand_preference: user.brandPreference,
    user_is_first_car: user.isFirstCar,
    car_make: car?.make ?? null,
    car_model: car?.model ?? null,
    car_generation: car?.generation ?? null,
    car_year_start: yearRange[0] ?? null,
    car_year_end: yearRange[1] ?? null,
    car_engine_size: car?.engine_size ?? null,
    car_cylinders: car?.cylinders ?? null,
    car_fuel_type: car?.fuel_type ?? null,
    car_drivetrain: car?.drivetrain ?? null,
    car_hp: car?.hp ?? null,
    car_torque_nm: car?.torque_nm ?? null,
    car_doors: car?.doors ?? null,
    car_seats: car?.seats ?? null,
    car_boot_size_liters: car?.boot_size_liters ?? null,
    car_fuel_consumption_l_100km: car?.fuel_consumption_l_100km ?? null,
    car_avg_nz_price: car?.avg_nz_price ?? null,
    car_parts_availability: car?.parts_availability ?? null,
    car_expected_lifespan_km: car?.expected_lifespan_km ?? null,
    recommendation_score: score,
    recommendation_mode: mode,
    is_strict_match: isStrictMatch,
  };
}

async function loadCars(inputPath) {
  try {
    return JSON.parse(await fsPromises.readFile(inputPath, "utf-8"));
  } catch (error) {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolvePath(args.input, DEFAULT_INPUT);
  const outputPath = resolvePath(args.output, DEFAULT_OUTPUT);
  const metaPath = DEFAULT_META;
  const userCount = Number.isFinite(args.users) ? args.users : 200;
  const maxRows = Number.isFinite(args.maxRows) ? args.maxRows : null;
  const seed = Number.isFinite(args.seed) ? args.seed : Date.now();

  let cars = await loadCars(inputPath);
  if (!cars) {
    cars = await loadCars(DEFAULT_FALLBACK_INPUT);
  }
  if (!cars?.length) {
    throw new Error("No cars database found. Provide --input or add data/cars_db.json.");
  }

  const makes = [...new Set(cars.map((car) => normalizeText(car?.make)).filter(Boolean))];
  const fuelTokens = [
    ...new Set(cars.map((car) => normalizeFuelToken(car?.fuel_type)).filter(Boolean)),
  ];

  const rng = mulberry32(seed);

  const outputStream = fs.createWriteStream(outputPath, { encoding: "utf-8" });
  let rowCount = 0;

  for (let i = 0; i < userCount; i += 1) {
    const user = sampleUser(rng, makes, fuelTokens);
    const strictFiltered = cars.filter((car) =>
      matchesStrictFilters(
        car,
        user.purpose,
        user.budget,
        user.fuelType,
        user.brandPreference
      )
    );

    let relaxed = strictFiltered.length === 0;
    if (!relaxed) {
      const bestAlignment = Math.max(
        ...strictFiltered.map((car) => purposeAlignmentScore(car, user.purpose))
      );
      if (bestAlignment < 20) relaxed = true;
    }

    const mode = relaxed ? "fallback" : "strict";
    for (const car of cars) {
      const isStrictMatch = matchesStrictFilters(
        car,
        user.purpose,
        user.budget,
        user.fuelType,
        user.brandPreference
      );
      const score = scoreCar(
        car,
        user.purpose,
        user.yearsToKeep,
        user.budget,
        user.isFirstCar,
        user.fuelType,
        user.brandPreference,
        relaxed
      );

      const row = buildRow(user, car, score, mode, isStrictMatch);
      outputStream.write(`${JSON.stringify(row)}\n`);
      rowCount += 1;
      if (maxRows && rowCount >= maxRows) break;
    }

    if (maxRows && rowCount >= maxRows) break;
  }

  await new Promise((resolve, reject) => {
    outputStream.on("error", reject);
    outputStream.end(resolve);
  });

  const meta = {
    generated_at: new Date().toISOString(),
    users: userCount,
    rows: rowCount,
    seed,
    source: inputPath,
  };

  await fsPromises.writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf-8");

  console.log(`Wrote ${rowCount} rows -> ${outputPath}`);
  console.log(`Meta written -> ${metaPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
