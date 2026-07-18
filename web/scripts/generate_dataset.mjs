import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const WIKIDATA_SEARCH = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "car-picker-dataset-generator/0.1";

const DEFAULT_MODEL_MAP = path.join(__dirname, "model_map.json");
const DEFAULT_SEED = path.join(repoRoot, "data", "cars_normalized.json");
const DEFAULT_OUTPUT = path.join(repoRoot, "data", "cars_db_generated.json");
const DEFAULT_META = path.join(repoRoot, "data", "cars_db_generated.meta.json");
const DEFAULT_MIRROR = path.join(
  repoRoot,
  "web",
  "public",
  "data",
  "cars_db_generated.json"
);

const REQUIRED_FIELDS = {
  avg_nz_price: null,
  motto: null,
  is_good_first_car: null,
  engine_size: null,
  cylinders: null,
  fuel_type: null,
  fuel_consumption_l_100km: null,
  drivetrain: null,
  hp: null,
  torque_nm: null,
  doors: null,
  seats: null,
  boot_size_liters: null,
  trademe_abundance: null,
  parts_availability: null,
  expected_lifespan_km: null,
  critical_issues: [],
  initial_service_est_nzd: null,
  annual_service_est_nzd: null,
};

const FIELD_DEFS = {
  engine_size: {
    labels: ["engine displacement"],
    type: "quantity",
    unitType: "volume",
  },
  cylinders: {
    labels: ["number of cylinders", "cylinders"],
    type: "number",
  },
  fuel_type: {
    labels: ["fuel type"],
    type: "entity",
  },
  drivetrain: {
    labels: ["drive wheel configuration", "drivetrain"],
    type: "entity",
  },
  hp: {
    labels: ["power", "power output", "engine power"],
    type: "quantity",
    unitType: "power",
  },
  torque_nm: {
    labels: ["torque"],
    type: "quantity",
    unitType: "torque",
  },
  doors: {
    labels: ["number of doors", "doors"],
    type: "number",
  },
  seats: {
    labels: ["number of seats", "seating capacity", "seats"],
    type: "number",
  },
  boot_size_liters: {
    labels: ["cargo volume", "luggage capacity", "trunk volume", "boot space"],
    type: "quantity",
    unitType: "volume",
  },
};

function parseArgs(argv) {
  const args = { mirror: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--limit") {
      args.limit = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--models") {
      args.models = argv[i + 1];
      i += 1;
    } else if (arg === "--output") {
      args.output = argv[i + 1];
      i += 1;
    } else if (arg === "--mirror") {
      args.mirror = true;
    }
  }
  return args;
}

function resolvePath(inputPath, fallbackPath) {
  const selected = inputPath ?? fallbackPath;
  return path.isAbsolute(selected) ? selected : path.join(repoRoot, selected);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${url}`);
  }
  return response.json();
}

async function sparqlQuery(query) {
  const url = `${WIKIDATA_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/sparql-results+json",
    },
  });
  if (!response.ok) {
    throw new Error(`SPARQL failed (${response.status})`);
  }
  return response.json();
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function extractYear(value) {
  if (!value) return null;
  const match = String(value).match(/\d{4}/);
  if (!match) return null;
  return Number(match[0]);
}

function extractGenerationCode(label, overrides = []) {
  const safeLabel = String(label ?? "");
  for (const override of overrides) {
    if (!override || !override.label_contains || !override.code) continue;
    if (safeLabel.toLowerCase().includes(String(override.label_contains).toLowerCase())) {
      return String(override.code);
    }
  }

  const parenMatch = safeLabel.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inside = parenMatch[1].trim();
    if (inside.length > 0 && inside.length <= 10) {
      return inside;
    }
  }

  const mkMatch = safeLabel.match(/\bMk\s?\d+[A-Za-z]?\b/);
  if (mkMatch) {
    return mkMatch[0].replace(/\s+/g, "");
  }

  const codeMatch = safeLabel.match(/\b[A-Z]{1,3}\d{1,3}[A-Z]?\b/);
  if (codeMatch) {
    return codeMatch[0];
  }

  return safeLabel.trim() || null;
}

function normalizeDrivetrain(label) {
  const value = normalizeText(label);
  if (!value) return null;
  if (value.includes("front-wheel")) return "FWD";
  if (value.includes("rear-wheel")) return "RWD";
  if (value.includes("all-wheel")) return "AWD";
  if (value.includes("four-wheel")) return "4WD";
  return label;
}

function normalizeVolume(amount, unitLabel) {
  if (amount == null) return null;
  const unit = normalizeText(unitLabel);
  if (!unit) {
    return amount > 20 ? amount / 1000 : amount;
  }
  if (unit.includes("litre") || unit.includes("liter")) return amount;
  if (unit.includes("cubic centimetre") || unit.includes("cubic centimeter")) {
    return amount / 1000;
  }
  if (unit.includes("cubic inch")) return amount * 0.0163871;
  if (unit.includes("cubic decimetre") || unit.includes("cubic decimeter")) return amount;
  return amount;
}

function normalizePower(amount, unitLabel) {
  if (amount == null) return null;
  const unit = normalizeText(unitLabel);
  if (!unit) return amount;
  if (unit.includes("horsepower")) return amount;
  if (unit.includes("kilowatt")) return amount * 1.34102;
  if (unit.includes("watt")) return amount * 0.00134102;
  return amount;
}

function normalizeTorque(amount, unitLabel) {
  if (amount == null) return null;
  const unit = normalizeText(unitLabel);
  if (!unit) return amount;
  if (unit.includes("newton metre") || unit.includes("newton-meter")) return amount;
  if (unit.includes("pound-force foot") || unit.includes("lb\u22c5ft") || unit.includes("lb-ft")) {
    return amount * 1.35582;
  }
  return amount;
}

function parseNumber(value) {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

const propertyIdCache = new Map();

async function resolvePropertyId(label) {
  if (propertyIdCache.has(label)) return propertyIdCache.get(label);
  const query = `SELECT ?prop WHERE { ?prop a wikibase:Property ; rdfs:label "${label.replace(
    /"/g,
    "\\\""
  )}"@en . } LIMIT 1`;
  try {
    const data = await sparqlQuery(query);
    const binding = data.results.bindings[0];
    const value = binding?.prop?.value;
    const id = value ? value.split("/").pop() : null;
    propertyIdCache.set(label, id ?? null);
    return id ?? null;
  } catch (error) {
    propertyIdCache.set(label, null);
    return null;
  }
}

async function resolveFieldProperties() {
  const resolved = {};
  for (const [field, def] of Object.entries(FIELD_DEFS)) {
    let propertyId = null;
    for (const label of def.labels) {
      propertyId = await resolvePropertyId(label);
      if (propertyId) break;
    }
    resolved[field] = propertyId;
  }
  return resolved;
}

async function resolveModelQid(search) {
  const url = `${WIKIDATA_SEARCH}?action=wbsearchentities&language=en&format=json&limit=10&search=${encodeURIComponent(
    search
  )}`;
  const data = await fetchJson(url, { headers: { "Api-User-Agent": USER_AGENT } });
  if (!data?.search?.length) return null;
  const candidates = data.search;
  const preferred = candidates.find((item) => {
    const description = normalizeText(item?.description);
    return (
      description.includes("car") ||
      description.includes("automobile") ||
      description.includes("vehicle") ||
      description.includes("hatchback") ||
      description.includes("sedan") ||
      description.includes("suv")
    );
  });
  return (preferred ?? candidates[0]).id ?? null;
}

function buildGenerationQuery(modelQid, fieldProperties) {
  const selectParts = [
    "?generation",
    "?generationLabel",
    "(SAMPLE(?startRaw) AS ?startRaw)",
    "(SAMPLE(?endRaw) AS ?endRaw)",
  ];
  const optionalParts = [
    "OPTIONAL { ?generation wdt:P571 ?start1. }",
    "OPTIONAL { ?generation wdt:P580 ?start2. }",
    "OPTIONAL { ?generation wdt:P576 ?end1. }",
    "OPTIONAL { ?generation wdt:P582 ?end2. }",
    "BIND(COALESCE(?start1, ?start2) AS ?startRaw)",
    "BIND(COALESCE(?end1, ?end2) AS ?endRaw)",
  ];

  for (const [field, propertyId] of Object.entries(fieldProperties)) {
    if (!propertyId) continue;
    const varName = field.replace(/[^a-zA-Z0-9]/g, "_");
    const def = FIELD_DEFS[field];
    if (def.type === "quantity") {
      optionalParts.push(
        `OPTIONAL { ?generation p:${propertyId} ?${varName}_statement .` +
          ` ?${varName}_statement psv:${propertyId} ?${varName}_node .` +
          ` ?${varName}_node wikibase:quantityAmount ?${varName}_amount .` +
          ` ?${varName}_node wikibase:quantityUnit ?${varName}_unit . }`
      );
      selectParts.push(
        `(SAMPLE(?${varName}_amount) AS ?${varName}_amount)`,
        `(SAMPLE(?${varName}_unit) AS ?${varName}_unit)`
      );
    } else {
      optionalParts.push(`OPTIONAL { ?generation wdt:${propertyId} ?${varName}. }`);
      selectParts.push(`(SAMPLE(?${varName}) AS ?${varName})`);
    }
  }

  return `SELECT ${selectParts.join(" ")}
WHERE {
  VALUES ?model { wd:${modelQid} }
  { ?generation wdt:P179 ?model . }
  UNION
  { ?generation wdt:P361 ?model . }
  ${optionalParts.join("\n  ")}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?generation ?generationLabel
ORDER BY ?startRaw`;
}

function extractSpecs(binding, fieldProperties) {
  const specs = {};
  for (const [field, propertyId] of Object.entries(fieldProperties)) {
    if (!propertyId) continue;
    const def = FIELD_DEFS[field];
    const varName = field.replace(/[^a-zA-Z0-9]/g, "_");
    if (def.type === "quantity") {
      const amount = parseNumber(binding[`${varName}_amount`]?.value);
      const unitLabel = binding[`${varName}_unitLabel`]?.value ?? null;
      if (def.unitType === "volume") {
        specs[field] = normalizeVolume(amount, unitLabel);
      } else if (def.unitType === "power") {
        specs[field] = normalizePower(amount, unitLabel);
      } else if (def.unitType === "torque") {
        specs[field] = normalizeTorque(amount, unitLabel);
      } else {
        specs[field] = amount;
      }
    } else if (def.type === "entity") {
      const label = binding[`${varName}Label`]?.value ?? null;
      specs[field] = field === "drivetrain" ? normalizeDrivetrain(label) : label;
    } else {
      specs[field] = parseNumber(binding[varName]?.value);
    }
  }
  return specs;
}

function matchSeedByGeneration(seeds, generation, label) {
  if (!seeds?.length) return null;
  const normGen = normalizeText(generation);
  const normLabel = normalizeText(label);
  let match = seeds.find((seed) => normalizeText(seed.generation) === normGen);
  if (match) return match;
  match = seeds.find((seed) => {
    const seedGen = normalizeText(seed.generation);
    return seedGen && (normLabel.includes(seedGen) || seedGen.includes(normGen));
  });
  return match ?? null;
}

function mergeRecord({ make, model, generation, generationLabel, yearRange, specs, seed }) {
  const merged = seed ? { ...seed } : { make, model };

  merged.make = make;
  merged.model = model;
  merged.generation = generation;
  merged.year_range = yearRange;
  if (generationLabel && generationLabel !== generation) {
    merged.generation_label = generationLabel;
  }

  const specSources = {};
  for (const field of Object.keys(FIELD_DEFS)) {
    const value = specs[field];
    if (value != null) {
      merged[field] = value;
      specSources[field] = "wikidata";
    } else if (merged[field] != null) {
      specSources[field] = seed ? "seed" : null;
    } else {
      merged[field] = null;
      specSources[field] = null;
    }
  }

  for (const [field, fallback] of Object.entries(REQUIRED_FIELDS)) {
    if (merged[field] == null) {
      merged[field] = Array.isArray(fallback) ? [...fallback] : fallback;
    }
  }

  merged.data_sources = {
    generation: "wikidata",
    specs: specSources,
    market_fields: seed ? "seed" : null,
  };

  return merged;
}

async function mapWithConcurrency(items, limit, iterator) {
  const results = [];
  const executing = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => iterator(item));
    results.push(p);

    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const modelMapPath = resolvePath(args.models, DEFAULT_MODEL_MAP);
  const outputPath = resolvePath(args.output, DEFAULT_OUTPUT);
  const mirrorPath = DEFAULT_MIRROR;
  const metaPath = DEFAULT_META;
  const limit = args.limit && Number.isFinite(args.limit) ? args.limit : null;

  const modelMap = JSON.parse(await fs.readFile(modelMapPath, "utf-8"));
  const models = Array.isArray(modelMap.models) ? modelMap.models : [];
  const selectedModels = limit ? models.slice(0, limit) : models;

  let seedData = [];
  try {
    seedData = JSON.parse(await fs.readFile(DEFAULT_SEED, "utf-8"));
  } catch (error) {
    seedData = [];
  }

  const seedByMakeModel = new Map();
  for (const car of seedData) {
    const key = `${normalizeText(car.make)}|${normalizeText(car.model)}`;
    if (!seedByMakeModel.has(key)) seedByMakeModel.set(key, []);
    seedByMakeModel.get(key).push(car);
  }

  const fieldProperties = await resolveFieldProperties();

  const unresolved = [];
  const generated = [];

  await mapWithConcurrency(selectedModels, 2, async (entry) => {
    const make = entry.make;
    const model = entry.model;
    const overrides = entry.generation_overrides ?? [];
    const search = entry.search ?? `${make} ${model}`;

    const modelQid = entry.qid ?? (await resolveModelQid(search));
    if (!modelQid) {
      unresolved.push({ make, model, reason: "model_not_found" });
      return;
    }

    const query = buildGenerationQuery(modelQid, fieldProperties);
    let data;
    try {
      data = await sparqlQuery(query);
    } catch (error) {
      unresolved.push({ make, model, reason: "generation_query_failed" });
      return;
    }

    const rows = data?.results?.bindings ?? [];
    if (!rows.length) {
      unresolved.push({ make, model, reason: "no_generations" });
      return;
    }

    for (const row of rows) {
      const generationLabel = row.generationLabel?.value ?? null;
      const generation = extractGenerationCode(generationLabel, overrides);
      const startYear = extractYear(row.startRaw?.value);
      const endYear = extractYear(row.endRaw?.value);
      const currentYear = new Date().getFullYear();
      const yearRangeOpen = startYear != null && endYear == null;
      const yearRange = [startYear, endYear ?? (yearRangeOpen ? currentYear : null)];

      const specs = extractSpecs(row, fieldProperties);

      const seedKey = `${normalizeText(make)}|${normalizeText(model)}`;
      const seedOptions = seedByMakeModel.get(seedKey) ?? [];
      const seedMatch = matchSeedByGeneration(seedOptions, generation, generationLabel);

      const merged = mergeRecord({
        make,
        model,
        generation,
        generationLabel,
        yearRange,
        specs,
        seed: seedMatch,
      });

      merged.data_sources.year_range_open = yearRangeOpen;
      generated.push(merged);
    }
  });

  generated.sort((a, b) => {
    const keyA = `${a.make}-${a.model}-${a.generation}`;
    const keyB = `${b.make}-${b.model}-${b.generation}`;
    return keyA.localeCompare(keyB);
  });

  await fs.writeFile(outputPath, JSON.stringify(generated, null, 2) + "\n", "utf-8");

  if (args.mirror) {
    await fs.writeFile(mirrorPath, JSON.stringify(generated, null, 2) + "\n", "utf-8");
  }

  const meta = {
    generated_at: new Date().toISOString(),
    model_count: selectedModels.length,
    generation_count: generated.length,
    unresolved_models: unresolved,
    property_map: fieldProperties,
    sources: ["wikidata"],
  };

  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf-8");

  console.log(`Generated ${generated.length} records -> ${outputPath}`);
  if (args.mirror) {
    console.log(`Mirrored to ${mirrorPath}`);
  }
  console.log(`Meta written -> ${metaPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
