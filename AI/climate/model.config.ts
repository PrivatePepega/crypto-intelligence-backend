import { generateText } from "ai";
import { models } from "../providers/model.js";

const modelPick = models.openrouterFree;

type ModelCallInput = {
  instructions: string;
  prompt: string;
  maxOutputTokens?: number;
};

export async function runModel({
  instructions,
  prompt,
  maxOutputTokens,
}: ModelCallInput) {
  return generateText({
    model: modelPick,
    instructions,
    prompt,
    ...(maxOutputTokens !== undefined && { maxOutputTokens }),
  });
}