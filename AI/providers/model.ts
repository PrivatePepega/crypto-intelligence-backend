import type { LanguageModel } from "ai";

import groq from "./models/groq.js";
import google from "./models/google.js";
import cloudflare from "./models/cloudFlare.js";
import openai from "./models/openai.js";
import openrouter from "./models/openRouter.js";

type Models = {
    groq: LanguageModel;
    google: LanguageModel;
    openai: LanguageModel;
    openrouterFree: LanguageModel;
    openrouter: LanguageModel;
    cloudflare: LanguageModel;
  };

export const models: Models = {
  groq: groq("openai/gpt-oss-120b"),

  google: google("gemini-3.8-flash"),

  openai: openai("gpt-6-luna"),

  openrouterFree: openrouter("openrouter/free"),

  openrouter: openrouter("nvidia/nemotron-3-ultra-550b-a55b-20260604:free"),

  cloudflare: cloudflare("@cf/zai-org/glm-4.7-flash"),
};