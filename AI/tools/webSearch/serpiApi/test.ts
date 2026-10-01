import "dotenv/config";

import { searchGoogle } from "./client.js";

const response = await searchGoogle(
  "latest Bitcoin crypto market developments",
  10,
);

console.dir(response, { depth: null });