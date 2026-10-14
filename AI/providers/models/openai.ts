import { createOpenAI } from "@ai-sdk/openai";

import { requiredEnv } from "../../../utils/requiredEnv.js";

const openai = createOpenAI({
  apiKey: requiredEnv("OPENAI_API_KEY"),
});

export default openai;
