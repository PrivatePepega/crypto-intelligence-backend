import { createGroq } from "@ai-sdk/groq";
import { requiredEnv } from "../../../utils/requiredEnv.js";



const groq = createGroq({
  apiKey: requiredEnv("GROQ_API_KEY")
});

export default groq;