import "dotenv/config";

import { searchBrave } from "./client.js";
import { normalizeBraveResults } from "./normalizer.js";

const response = await searchBrave(
  "latest Bitcoin crypto market developments",
  1,
);

const normalized = normalizeBraveResults(response);

console.dir(normalized, { depth: null });