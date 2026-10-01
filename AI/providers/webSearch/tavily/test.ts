import "dotenv/config";

import { searchTavily } from "./client.js";
import { normalizeTavilyResults } from "./normalizer.js";

const response = await searchTavily(
  "latest Bitcoin crypto market developments",
);

const normalized = normalizeTavilyResults(response);

console.dir(normalized, { depth: null });