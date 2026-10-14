import {
  researchEvidenceProblem,
  researchRecordProblem,
  researchSchema,
} from "../AI/utils/weather/researcher.js";

// Two checks that guard the researcher, the one agent that had neither.
//
// The motivating case is in AI/data/Weather Researcher/crypto-001.json: nine
// observations were queued, one was researched, and steps 2 and 3 failed 48 times
// each with "returned an empty result". The old check was `text.trim().length === 0`
// on the prose - but this agent's own comment records that research happens inside
// tool calls and often returns little or no prose, so that check discarded runs that
// did the work and passed runs that did nothing.

/**
 * The only fields `researchEvidenceProblem` reads.
 *
 * A full `SdkStep` carries half a dozen more, and fabricating all of them to test
 * three would be noise. The cast lives here rather than in the validator's signature,
 * so the type it accepts in production is still the real one.
 */
type StepLike = {
  text?: string;
  toolCalls?: unknown[];
  toolResults?: unknown[];
};

const steps = (...list: StepLike[]) => list as never;

let failures = 0;

const pass = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures += 1;

  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

// --------------------------------------------------
// Phase one: evidence, not prose
// --------------------------------------------------

// 1. The failure the old check produced: a step came back but said and did nothing.
{
  const problem = researchEvidenceProblem(steps({ text: "", toolCalls: [], toolResults: [] }));

  pass("a step with no text and no tool calls is rejected", problem !== null, problem ?? "");
}

// 2. The success the old check threw away: all the work was in tool calls.
{
  const toolOnly = steps(
    { text: "", toolCalls: [{ toolName: "google_search", input: {} }], toolResults: [] },
    {
      text: "",
      toolCalls: [],
      toolResults: [{ toolName: "google_search", output: "results" }],
    },
  );

  pass(
    "a tool-only run with no prose is accepted",
    researchEvidenceProblem(toolOnly) === null,
    "this is the case the blank check discarded",
  );
}

// 3. Prose with no tools is still a real attempt.
{
  const prose = steps({ text: "Findings on the rate cut", toolCalls: [], toolResults: [] });

  pass("a run that wrote prose is accepted", researchEvidenceProblem(prose) === null);
}

// 4. Nothing at all.
{
  pass("no steps is rejected", researchEvidenceProblem([]) !== null);
  pass("undefined steps is rejected", researchEvidenceProblem(undefined as never) !== null);
}

// --------------------------------------------------
// Phase two: a record that carries a finding
// --------------------------------------------------

// 5. A schema-valid record with an empty finding validates and says nothing. This is
//    the case the schema cannot catch.
{
  const empty = {
    finding: "",
    importance: "matters",
    evidence: "some evidence",
    sources: ["a"],
    context: "ctx",
    uncertainty: "",
    status: "supported",
  };

  pass(
    "the empty-finding record really does pass researchSchema",
    researchSchema.safeParse(empty).success,
  );

  const problem = researchRecordProblem(empty);

  pass("the empty-finding record is rejected anyway", problem !== null, problem ?? "");
}

// 6. A real record.
{
  const good = {
    finding: "The Fed cut rates by 25bp, the first cut since March.",
    importance: "It resets the front end of the curve.",
    evidence: "Statement at 14:00 ET confirmed the cut.",
    sources: ["https://example.com/fed"],
    context: "Third cut this cycle.",
    uncertainty: "",
    status: "supported",
  };

  pass("a real record is accepted", researchRecordProblem(good) === null);
}

// 7. Empty `uncertainty` and `context` are honest answers, not defects. Requiring them
//    would reject good records.
{
  const honest = {
    finding: "Something was established.",
    importance: "",
    evidence: "",
    sources: [],
    context: "",
    uncertainty: "",
    status: "unconfirmed",
  };

  pass(
    "a record with empty context and uncertainty is accepted",
    researchRecordProblem(honest) === null,
    "only `finding` must carry content",
  );
}

// 8. Not a record at all.
{
  pass("an empty object is rejected", researchRecordProblem({}) !== null);
  pass("null is rejected", researchRecordProblem(null) !== null);
  pass("a string is rejected", researchRecordProblem("finding") !== null);
  pass("an array is rejected", researchRecordProblem([]) !== null);
}

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
