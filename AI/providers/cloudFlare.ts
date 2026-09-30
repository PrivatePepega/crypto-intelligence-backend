import { createWorkersAI } from "workers-ai-provider";
import { requiredEnv } from "../../utils/requiredEnv.js";




const cloudflare = createWorkersAI({
  accountId: requiredEnv("CLOUDFLARE_ACCOUNT_ID"),
  apiKey: requiredEnv("CLOUDFLARE_API_TOKEN")
});

export default cloudflare;