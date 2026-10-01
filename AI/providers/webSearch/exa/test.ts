import "dotenv/config";

import { searchExa } from "./client.js";
import { normalizeExaResults } from "./normalizer.js";

const response = await searchExa(
  "latest Bitcoin crypto market developments",
);

const normalized = normalizeExaResults(response);

console.dir(normalized, { depth: null });