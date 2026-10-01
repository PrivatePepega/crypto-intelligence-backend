import type { LanguageModel } from "ai";

import groq from "./models/groq.js";
import google from "./models/google.js";
import cloudflare from "./models/cloudFlare.js";
import openrouter from "./models/openRouter.js";

type Models = {
    groq: LanguageModel;
    google: LanguageModel;
    openrouter: LanguageModel;
    cloudflare: LanguageModel;
  };

export const models: Models = {
  groq: groq("openai/gpt-oss-120b"),

  google: google("gemini-3.8-flash"),
  
  openrouter: openrouter("openrouter/free"),

  cloudflare: cloudflare("@cf/zai-org/glm-4.7-flash"),
};