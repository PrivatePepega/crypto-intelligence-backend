import { generateText } from "ai";

import { models } from "./AI/providers/model.js";

const show = async (label: string, model: never) => {
  try {
    const r = await generateText({
      model,
      prompt: "Reply with the single word: ok",
      maxOutputTokens: 16,
    });
    console.log("  === " + label + " ===");
    console.log("  text: " + JSON.stringify(r.text.slice(0, 40)));
    console.log("  usage: " + JSON.stringify(r.usage, null, 2).split("\n").join("\n  "));
  } catch (e) {
    console.log("  === " + label + " === FAILED");
    console.log("  " + (e instanceof Error ? e.message.slice(0, 300) : String(e)));
  }
  console.log("");
};

// free first - should cost nothing
await show("openrouter/free", models.openrouterFree as never);
await show("google gemini-3.8-flash", models.google as never);
// this is the existence check for the id the user gave
await show("openai gpt-6-luna", models.openai as never);
