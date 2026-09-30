import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { requiredEnv } from "../../utils/requiredEnv.js";



const openrouter = createOpenRouter({
  apiKey: requiredEnv("OPENROUTER_API_KEY")

});

export default openrouter;