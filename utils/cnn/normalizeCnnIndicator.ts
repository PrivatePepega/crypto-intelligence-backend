import type { CnnFearGreedResponse, NormalizedCnnIndicator } from "../../types/cnn/fearGreed.types.js";

export function normalizeCnnIndicator(
    indicator: string,
    unit: string,
    data: {
      data: {
        x: number;
        y: number;
        rating: string;
      }[];
    },
  ): NormalizedCnnIndicator {
    const dailyObservations = new Map<
      string,
      {
        timestamp: number;
        value: number;
        rating: string;
      }
    >();
  
    for (const observation of data.data) {
      const date = new Date(observation.x).toISOString().slice(0, 10);
  
      const existing = dailyObservations.get(date);
  
      if (!existing || observation.x > existing.timestamp) {
        dailyObservations.set(date, {
          timestamp: observation.x,
          value: observation.y,
          rating: observation.rating,
        });
      }
    }
  
    const observations = Array.from(dailyObservations.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, observation]) => ({
        date,
        value: observation.value,
        rating: observation.rating,
      }));
  
    const historical = observations.at(-1) ?? null;
  
    return {
      indicator,
      frequency: "Daily",
      aggregation: "none",
      unit,
      observations,
      historical,
    };
  }
