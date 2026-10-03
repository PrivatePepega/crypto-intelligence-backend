export type NormalizedGdeltEvent = {
  id: string | null;
  family: string | null;
  title: string | null;
  summary: string | null;
  eventDateEvidence: string | null;
  category: string | null;
  domain: string | null;
  region: string | null;
  significance: number | null;
};

export type RawGdeltEvent = {
  id?: string | null;
  family?: string | null;
  title?: string | null;
  summary?: string | null;
  event_date_evidence?: string | null;
  category?: string | null;
  domain?: string | null;
  geo?: { region?: string | null } | null;
  metrics?: { significance?: number | null } | null;
};

export const normalizeGdeltEvents = (
  events: RawGdeltEvent[],
): NormalizedGdeltEvent[] => {
  return events.map((event) => ({
    id: event.id ?? null,
    family: event.family ?? null,
    title: event.title ?? null,
    summary: event.summary ?? null,
    eventDateEvidence: event.event_date_evidence ?? null,
    category: event.category ?? null,
    domain: event.domain ?? null,
    region: event.geo?.region ?? null,
    significance: event.metrics?.significance ?? null,
  }));
};