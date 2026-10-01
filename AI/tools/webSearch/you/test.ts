import "dotenv/config";

import { searchYou } from "./client.js";
import { normalizeYouResults } from "./normalizer.js";

const response = await searchYou(
    "latest Bitcoin crypto market developments",
    15,
  );

const normalized = normalizeYouResults(response);

console.dir(normalized, { depth: null });