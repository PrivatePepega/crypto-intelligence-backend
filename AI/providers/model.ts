import type { LanguageModel } from "ai";

import groq from "./groq.js";
import google from "./google.js";
import cloudflare from "./cloudFlare.js";
import openrouter from "./openRouter.js";

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