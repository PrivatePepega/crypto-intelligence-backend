// utils/alternativeMe/fearGreedFetcher.ts

import axios from "axios";

import { alternativeMeFearGreedSchema } from "../../types/alternative.me/alternative.me.type.js";

const ALTERNATIVE_ME_API = "https://api.alternative.me/fng/";

export const fetchFearGreed = async () => {
  try {
    const response = await axios.get(ALTERNATIVE_ME_API, {
      params: {
        limit: 1,
      },
    });

    const data = alternativeMeFearGreedSchema.parse(response.data);

    const latest = data.data[0];

    if (!latest) {
      throw new Error("Alternative.me returned no Fear & Greed data");
    }

    return {
      value: Number(latest.value),
      classification: latest.value_classification,
      date: new Date(Number(latest.timestamp) * 1000)
        .toISOString()
        .split("T")[0]!,
      source: "Alternative.me" as const,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        "Alternative.me Fear & Greed fetch failed:",
        error.response?.status,
        error.response?.data
      );
    } else {
      console.error(
        "Alternative.me Fear & Greed fetch failed:",
        error
      );
    }

    throw error;
  }
};