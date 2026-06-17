import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const WIKIDATA_SEARCH = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "car-picker-model-map/0.1";

const DEFAULT_OUTPUT = path.join(__dirname, "model_map.json");

const DEFAULT_MAKES = [
  "Toyota",
  "Honda",
  "Nissan",
  "Mazda",
  "Subaru",
  "Mitsubishi",
  "Suzuki",
  "Hyundai",
  "Kia",
  "Ford",
  "Chevrolet",
  "GMC",
  "Dodge",
  "Jeep",
  "Tesla",
  "BMW",
  "Mercedes-Benz",
  "Audi",
  "Volkswagen",
  "Skoda",
  "SEAT",
  "Volvo",
  "Peugeot",
  "Renault",
  "Citroen",
  "Fiat",
  "Alfa Romeo",
  "Opel",
  "Vauxhall",
  "Land Rover",
  "Jaguar",
  "Porsche",
  "Lexus",
  "Acura",
  "Infiniti",
  "Buick",
  "Cadillac",
  "Mini",
];

const SEARCH_INCLUDE = [
  "car",
  "automobile",
  "vehicle",
  "crossover",
  "suv",
  "hatchback",
  "sedan",
  "wagon",
  "pickup",
  "van",
  "minivan",
  "truck",
];

const SEARCH_EXCLUDE = [
  "manufacturer",
  "brand",
  "company",
  "concept",
  "prototype",
  "race car",
  "engine",
  "motorcycle",
];

const MODEL_TYPES = ["wd:Q3231690", "wd:Q1420"];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--output") {
      args.output = argv[i + 1];
      i += 1;
    } else if (arg === "--limit") {
      args.limit = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--min-year") {
      args.minYear = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--per-make") {
      args.perMake = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--makes") {
      args.makesPath = argv[i + 1];
      i += 1;
    } else if (arg === "--delay") {
      args.delay = Number(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

function resolvePath(inputPath, fallbackPath) {
  const selected = inputPath ?? fallbackPath;
  return path.isAbsolute(selected) ? selected : path.join(repoRoot, selected);
}

function stripDiacritics(value) {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(make, model) {
  return `${stripDiacritics(make).toLowerCase()}|${stripDiacritics(model).toLowerCase()}`;
}

async function fetchWithRetry(url, options = {}, retries = 4, delayMs = 800) {
  let attempt = 0;
  while (true) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(options.headers ?? {}),
      },
    });

    if (response.ok) {
      return response;
    }

    const shouldRetry = response.status === 429 || response.status >= 500;
    if (!shouldRetry || attempt >= retries) {
      throw new Error(`Request failed (${response.status}): ${url}`);
    }

    const retryAfter = Number(response.headers.get("retry-after")) || null;
    const backoff = retryAfter ? retryAfter * 1000 : delayMs * Math.pow(2, attempt);
    await sleep(backoff);
    attempt += 1;
  }
}

async function fetchJson(url, options = {}, retries = 4, delayMs = 800) {
  const response = await fetchWithRetry(url, options, retries, delayMs);
  return response.json();
}

async function sparqlQuery(query, delayMs) {
  const url = `${WIKIDATA_ENDPOINT}?format=json&maxlag=20&query=${encodeURIComponent(query)}`;
  const response = await fetchWithRetry(
    url,
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/sparql-results+json",
      },
    },
    4,
    delayMs
  );
  return response.json();
}

async function resolveManufacturerQid(make) {
  const url = `${WIKIDATA_SEARCH}?action=wbsearchentities&language=en&format=json&limit=10&search=${encodeURIComponent(
    make
  )}`;
  const data = await fetchJson(url, { headers: { "Api-User-Agent": USER_AGENT } }, 4, 900);
  if (!data?.search?.length) return null;
  const candidates = data.search;
  const preferred = candidates.find((item) => {
    const description = String(item?.description ?? "").toLowerCase();
    return (
      description.includes("car manufacturer") ||
      description.includes("automobile manufacturer") ||
      description.includes("vehicle manufacturer")
    );
  });
  return (preferred ?? candidates[0]).id ?? null;
}

function isSearchModelCandidate(item, make) {
  const description = String(item?.description ?? "").toLowerCase();
  const label = stripDiacritics(item?.label ?? "");
  if (!label) return false;
  if (SEARCH_EXCLUDE.some((term) => description.includes(term))) return false;
  const hasInclude = SEARCH_INCLUDE.some((term) => description.includes(term));
  const hasMake = label.toLowerCase().includes(stripDiacritics(make).toLowerCase());
  return hasInclude && (hasMake || description.includes("model"));
}

async function searchModelsForMake(make, perMake) {
  const search = `${make} model`;
  const url = `${WIKIDATA_SEARCH}?action=wbsearchentities&language=en&format=json&limit=50&search=${encodeURIComponent(
    search
  )}`;
  const data = await fetchJson(url, { headers: { "Api-User-Agent": USER_AGENT } }, 4, 1000);
  const matches = (data?.search ?? []).filter((item) => isSearchModelCandidate(item, make));
  return matches.slice(0, perMake);
}

function buildModelQuery(manufacturerQid, minYear, perMake, mode = "typed") {
  if (mode === "minimal") {
    return `SELECT ?model ?modelLabel ?startDate WHERE {
  ?model wdt:P176 wd:${manufacturerQid} .
  OPTIONAL { ?model wdt:P571 ?startDate . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${perMake}`;
  }

  const typeFilter =
    mode === "typed"
      ? `VALUES ?modelType { ${MODEL_TYPES.join(" ")} }\n  ?model wdt:P31 ?modelType .`
      : "";

  return `SELECT ?model ?modelLabel ?modelDescription (MIN(?startDate) AS ?startDate) WHERE {
  ?model wdt:P176 wd:${manufacturerQid} .
  ${typeFilter}
  OPTIONAL { ?model wdt:P571 ?start1 . }
  OPTIONAL { ?model wdt:P580 ?start2 . }
  BIND(COALESCE(?start1, ?start2) AS ?startDate)
  FILTER(!BOUND(?startDate) || YEAR(?startDate) >= ${minYear})
  FILTER(!CONTAINS(LCASE(STR(?modelLabel)), "concept"))
  FILTER(!CONTAINS(LCASE(STR(?modelLabel)), "prototype"))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?model ?modelLabel ?modelDescription
ORDER BY DESC(?startDate)
LIMIT ${perMake}`;
}

function extractYear(value) {
  if (!value) return null;
  const match = String(value).match(/\d{4}/);
  if (!match) return null;
  return Number(match[0]);
}

function shouldSkipLabel(label) {
  const lower = String(label ?? "").toLowerCase();
  return lower.includes("concept") || lower.includes("prototype");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadExisting(outputPath) {
  try {
    const data = JSON.parse(await fs.readFile(outputPath, "utf-8"));
    return Array.isArray(data?.models) ? data.models : [];
  } catch (error) {
    return [];
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = resolvePath(args.output, DEFAULT_OUTPUT);
  const limit = Number.isFinite(args.limit) ? args.limit : 200;
  const minYear = Number.isFinite(args.minYear) ? args.minYear : 2000;
  const delayMs = Number.isFinite(args.delay) ? args.delay : 900;

  const makes = args.makesPath
    ? JSON.parse(await fs.readFile(resolvePath(args.makesPath, args.makesPath), "utf-8"))
    : DEFAULT_MAKES;

  const perMake = Number.isFinite(args.perMake)
    ? args.perMake
    : Math.max(5, Math.ceil(limit / makes.length) * 2);

  const existing = await loadExisting(outputPath);
  const seen = new Map();
  for (const entry of existing) {
    const key = entry.qid ? entry.qid : normalizeKey(entry.make, entry.model);
    if (!seen.has(key)) {
      seen.set(key, entry);
    }
  }

  const added = [];

  for (const make of makes) {
    if (seen.size >= limit) break;
    const manufacturerQid = await resolveManufacturerQid(make);
    if (!manufacturerQid) {
      console.warn(`Manufacturer not found: ${make}`);
      continue;
    }

    const query = buildModelQuery(manufacturerQid, minYear, perMake, "typed");
    let data;
    try {
      data = await sparqlQuery(query, delayMs);
    } catch (error) {
      console.warn(`Query failed for ${make}: ${error.message}`);
      const fallbackQuery = buildModelQuery(manufacturerQid, minYear, perMake, "basic");
      try {
        data = await sparqlQuery(fallbackQuery, delayMs * 1.5);
        console.warn(`Fallback query succeeded for ${make}.`);
      } catch (fallbackError) {
        console.warn(`Fallback query failed for ${make}: ${fallbackError.message}`);
        const minimalQuery = buildModelQuery(manufacturerQid, minYear, perMake, "minimal");
        try {
          data = await sparqlQuery(minimalQuery, delayMs * 2);
          console.warn(`Minimal query succeeded for ${make}.`);
        } catch (minimalError) {
          console.warn(`Minimal query failed for ${make}: ${minimalError.message}`);
          const searchMatches = await searchModelsForMake(make, perMake);
          if (!searchMatches.length) {
            await sleep(delayMs);
            continue;
          }

          for (const match of searchMatches) {
            if (seen.size >= limit) break;
            const label = stripDiacritics(match?.label ?? "");
            if (!label || shouldSkipLabel(label)) continue;
            const modelQid = match?.id ?? null;
            const key = modelQid ? modelQid : normalizeKey(make, label);
            if (seen.has(key)) continue;

            const entry = {
              make: stripDiacritics(make),
              model: label,
              qid: modelQid,
              search: `${stripDiacritics(make)} ${label}`.trim(),
              year_start: null,
            };

            seen.set(key, entry);
            added.push(entry);
          }

          await sleep(delayMs);
          continue;
        }
      }
    }

    const rows = data?.results?.bindings ?? [];
    for (const row of rows) {
      if (seen.size >= limit) break;
      const label = stripDiacritics(row?.modelLabel?.value ?? "");
      if (!label || shouldSkipLabel(label)) continue;
      const modelQid = row?.model?.value?.split("/").pop();
      const key = modelQid ? modelQid : normalizeKey(make, label);
      if (seen.has(key)) continue;

      const entry = {
        make: stripDiacritics(make),
        model: label,
        qid: modelQid ?? null,
        search: `${stripDiacritics(make)} ${label}`.trim(),
        year_start: extractYear(row?.startDate?.value),
      };

      seen.set(key, entry);
      added.push(entry);
    }

    await sleep(delayMs);
  }

  const merged = [...existing, ...added].slice(0, limit);
  const output = { models: merged };

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2) + "\n", "utf-8");

  console.log(`Added ${added.length} models. Total: ${merged.length}`);
  console.log(`Updated model map -> ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
