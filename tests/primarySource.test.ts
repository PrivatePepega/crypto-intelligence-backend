import { researchSchema, researchRecordProblem } from "../AI/utils/weather/researcher.js";

// primarySource, and the reason it is not optional.
//
// The field exists so a finding can be traced to the one source it rests on, without
// narrowing `sources` - which stays broad on purpose, because several outlets reporting
// the same thing is signal, and filtering down to two known publishers would lose
// whatever the others caught.

let failures = 0;

const pass = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures += 1;

  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

const withPrimary = {
  finding: "The Fed cut the target range to 4.25-4.50%.",
  importance: "It resets the front end of the curve.",
  evidence: "The FOMC statement at 14:00 ET confirms the cut.",
  primarySource: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260923a.htm",
  sources: ["Federal Reserve", "Reuters", "Axios", "CNBC"],
  context: "Third cut this cycle.",
  uncertainty: "",
  status: "supported",
};

// 1. A record with the field is accepted, and the URL survives.
{
  const parsed = researchSchema.safeParse(withPrimary);

  pass("a record carrying primarySource validates", parsed.success);

  if (parsed.success) {
    pass(
      "and the URL survives the parse",
      parsed.data.primarySource === withPrimary.primarySource,
      parsed.data.primarySource.slice(0, 48),
    );
  }
}

// 2. It is required. Defaulting it would make every pre-existing row read as "no primary
//    source" rather than as predating the field.
{
  const { primarySource, ...without } = withPrimary;

  pass("a record without primarySource is rejected", !researchSchema.safeParse(without).success);
}

// 3. An empty string is the documented "nothing stood out" answer, so it has to survive
//    - otherwise there would be no way to say that at all.
{
  pass(
    "an empty primarySource is accepted as 'none stood out'",
    researchSchema.safeParse({ ...withPrimary, primarySource: "" }).success,
  );
}

// 4. A bare publication name is allowed, since the prompt asks for one when the research
//    surfaced no address.
{
  pass(
    "a bare publication name is accepted",
    researchSchema.safeParse({ ...withPrimary, primarySource: "Axios" }).success,
  );
}

// 5. Pinning a source must not make a record that says nothing look acceptable. The
//    content check still only requires `finding`.
{
  pass(
    "a record with a pinned source but no finding is still rejected",
    researchRecordProblem({ ...withPrimary, finding: "  " }) !== null,
  );
}

// 6. A full record is accepted by the content check too.
{
  pass("a complete record passes the content check", researchRecordProblem(withPrimary) === null);
}

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
