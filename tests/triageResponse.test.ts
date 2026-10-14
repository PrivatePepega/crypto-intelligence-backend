import {
  MIN_LABELLED_SHARE,
  triageResponseProblem,
  triageSchema,
} from "../AI/utils/weather/triage.js";

// The check that stands between a model response and the promotions it drives.
//
// The case that matters is real, not invented: AI/data/Weather Triage/
// financial_markets-001.json labelled two of forty-eight observations, using ids
// that were fragments of JSON syntax, promoted nothing, and reported success at
// every stage downstream. triageSchema passed it, because `z.string().min(1)`
// accepts any non-empty text - including "]}  {".
//
// So these cases check the ids against the rows actually supplied, and check that
// enough of the day was labelled at all.

let failures = 0;

const pass = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures += 1;

  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

// The 48 observation ids from that run, as the agent saw them.
const runLog = JSON.parse(
  await import("node:fs/promises").then((fs) =>
    fs.readFile("AI/data/Weather Triage/financial_markets-001.json", "utf8"),
  ),
) as {
  entries: { section: string; data: Record<string, unknown> }[];
};

const decisionsEntry = runLog.entries.find((entry) => entry.section === "decisions");

if (decisionsEntry === undefined) {
  throw new Error("financial_markets-001.json has no decisions entry");
}

const missingIds = decisionsEntry.data.missingIds as string[];

const knownIds = new Set(missingIds);

// 1. The real failure is rejected, and named as invented ids.
{
  // Verbatim from the run log's triage_output section.
  const real = JSON.parse(
    '{"signals": [{"id": "exek", "important": false, "reason": " observation not important enough: not important"}, {"id": "]}  {", "important": false, "reason": "sho"}]}',
  ) as { signals: { id: string }[] };

  // It really does pass the schema, which is the whole point.
  const schemaOk = triageSchema.safeParse(real).success;

  const problem = triageResponseProblem(real.signals, knownIds, missingIds.length);

  pass(
    "the real garbage response passes triageSchema",
    schemaOk,
    "so the schema alone would not have caught it",
  );

  pass("the real garbage response is rejected", problem !== null);

  pass(
    "the rejection names the invented ids",
    problem !== null && problem.includes("exek"),
    problem ?? "",
  );
}

// 2. A response that labels the whole day is accepted.
{
  const signals = missingIds.map((id, index) => ({
    id,
    important: index < 5,
    reason: "checked",
  }));

  pass(
    "a full day of real ids is accepted",
    triageResponseProblem(signals, knownIds, missingIds.length) === null,
  );
}

// 3. Shortened UUIDs are the failure that actually happened in the reasoning.
{
  const signals = missingIds.map((id) => ({
    id: id.slice(0, 8),
    important: false,
    reason: "checked",
  }));

  const problem = triageResponseProblem(signals, knownIds, missingIds.length);

  pass("eight-character ids are rejected", problem !== null, problem ?? "");
}

// 4. Real ids, but far too few to be a real attempt at the job.
{
  const signals = missingIds.slice(0, 4).map((id) => ({
    id,
    important: false,
    reason: "checked",
  }));

  const problem = triageResponseProblem(signals, knownIds, missingIds.length);

  pass("4 of 48 labelled is rejected", problem !== null, problem ?? "");

  pass(
    "the rejection says how many were labelled",
    problem !== null && problem.includes("labelled 4 of 48"),
    problem ?? "",
  );
}

// 5. The threshold is exact: the required count is accepted, one below it is not.
//    Derived from the constant so lowering it cannot quietly invalidate the test.
{
  const required = Math.ceil(missingIds.length * MIN_LABELLED_SHARE);

  console.log(
    `      (threshold for ${missingIds.length} observations is ${required} labelled, ` +
      `${MIN_LABELLED_SHARE} of them)`,
  );

  const atThreshold = missingIds.slice(0, required).map((id) => ({
    id,
    important: false,
    reason: "checked",
  }));

  pass(
    `exactly ${required} labelled is accepted`,
    triageResponseProblem(atThreshold, knownIds, missingIds.length) === null,
  );

  const under = missingIds.slice(0, required - 1).map((id) => ({
    id,
    important: false,
    reason: "checked",
  }));

  pass(
    `${required - 1} labelled is rejected`,
    triageResponseProblem(under, knownIds, missingIds.length) !== null,
  );
}

// 6. Nothing at all.
{
  pass("an empty signals array is rejected", triageResponseProblem([], knownIds, 48) !== null);
  pass("undefined signals is rejected", triageResponseProblem(undefined, knownIds, 48) !== null);
}

// 7. Duplicate real ids do not inflate the labelled count.
{
  const one = missingIds[0];

  if (one === undefined) throw new Error("no ids to test with");

  const signals = new Array(missingIds.length).fill(null).map(() => ({
    id: one,
    important: false,
    reason: "checked",
  }));

  pass(
    "the same id 48 times counts as one labelled",
    triageResponseProblem(signals, knownIds, missingIds.length) !== null,
  );
}

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
