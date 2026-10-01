import { Exa } from "exa-js";


const apiKey = process.env.EXA_API_KEY;

if (!apiKey) {
  throw new Error("EXA_API_KEY is not configured.");
}

const exa = new Exa(apiKey);

export const searchExa = async (
  query: string,
  numResults = 10,
) => {
  const response = await exa.search(query, {
    type: "auto",
    numResults,
    contents: {
      highlights: true,
    },
  });

  return response;
};