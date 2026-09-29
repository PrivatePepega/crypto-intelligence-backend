
import OpenAI from "openai";

const openai = new OpenAI();



export const createQueryEmbedding = async (query: string) => {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
  
    if (!response?.data?.[0]?.embedding) {
      throw new Error("Failed to generate embedding from OpenAI API.");
    }
  
    return response.data[0].embedding;
  };
  