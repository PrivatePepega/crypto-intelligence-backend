import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { requiredEnv } from "../../utils/requiredEnv.js";



const google = createGoogleGenerativeAI({
  apiKey: requiredEnv("GOOGLE_GENERATIVE_AI_API_KEY")

});

export default google;