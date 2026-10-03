export type NormalizedGdeltStory = {
  id: string | null;
  title: string | null;
  category: string | null;
  region: string | null;
  significance: number | null;
};

type RawGdeltStory = {
  id?: string | null;
  title?: string | null;
  category?: string | null;

  geo?: {
    region?: string | null;
  } | null;

  metrics?: {
    significance?: number | null;
  } | null;
};

export const normalizeGdeltStories = (
  stories: RawGdeltStory[],
): NormalizedGdeltStory[] => {
  return stories.map((story) => ({
    id: story.id ?? null,
    title: story.title ?? null,
    category: story.category ?? null,
    region: story.geo?.region ?? null,
    significance: story.metrics?.significance ?? null,
  }));
};