import { briefResponseProblem } from "../AI/utils/weather/briefAnalyst.js";

// The check that stands between a provider response and a brief being written.
//
// Every case below is a real response this pipeline received and accepted, or a real
// shape of failure it hit. The motivating one is in
// AI/data/Weather Brief Analyst/commodities_energy-001.json: the AI context brief came
// back as "User Safety: safe" - 17 characters, finishReason "stop", meaning the
// provider considered the request finished - and the blank check passed it, so the
// stage died at the JSON parse with "no JSON object" and nothing better.

let failures = 0;

const pass = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures += 1;

  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

// 1. The real failure. A provider safety stub, reported as a finished response.
{
  const stub = "User Safety: safe";

  const problem = briefResponseProblem(stub);

  pass("the real 17-character safety stub is rejected", problem !== null, problem ?? "");

  pass(
    "the rejection quotes what came back",
    problem !== null && problem.includes("User Safety: safe"),
    "so the terminal says what the provider actually sent",
  );
}

// 2. A brief that parses. Both shapes this pipeline actually produces.
{
  pass(
    "a JSON object brief is accepted",
    briefResponseProblem('{"summary": "Oil rallied on supply cuts.", "sections": []}') === null,
  );

  pass("fenced JSON is accepted", briefResponseProblem('```json\n{"summary": "ok"}\n```') === null);

  pass(
    "prose before the object is accepted",
    briefResponseProblem('Here is the brief:\n{"summary": "ok"}') === null,
  );
}

// 3. Truncation. The braces never close, so extractJsonObject returns null.
{
  const truncated = '{"summary": "Oil rallied sharply on supply cuts across OPEC+, and'.slice(
    0,
    62,
  );

  const problem = briefResponseProblem(truncated);

  pass("a response cut off mid-value is rejected", problem !== null, problem ?? "");
}

// 4. Truncation that extractJsonObject mistakes for complete. Braces balance, the
//    value does not exist - which is why this needs a real parse, not a brace count.
{
  const broken = '{"summary": }';

  const problem = briefResponseProblem(broken);

  pass("balanced but unparseable JSON is rejected", problem !== null, problem ?? "");

  pass(
    "the rejection names the parse failure",
    problem !== null && problem.includes("did not parse"),
    problem ?? "",
  );
}

// 5. Parses cleanly and is not a brief.
{
  pass("an empty object is rejected", briefResponseProblem("{}") !== null);
  pass("a bare null is rejected", briefResponseProblem("null") !== null);
  pass("a bare string is rejected", briefResponseProblem('"a brief"') !== null);
  pass("a number is rejected", briefResponseProblem("42") !== null);
}

// 6. Empty, which the old blank check did catch. Kept so the reordering is visible.
{
  pass("an empty string is rejected", briefResponseProblem("") !== null);
  pass("whitespace is rejected", briefResponseProblem("   \n\t ") !== null);
}

// 7. A top-level array has no opening brace, so extractJsonObject never sees it. It
//    is rejected by the first check rather than by an object test - worth pinning,
//    because the natural place to add it (after the parse) is unreachable.
{
  pass("an empty array is rejected", briefResponseProblem("[]") !== null);

  const problem = briefResponseProblem("[1, 2, 3]");

  pass("a populated array is rejected", problem !== null, problem ?? "");

  pass(
    "it is rejected as having no JSON object, not by an object test",
    problem !== null && problem.includes("no JSON object"),
    problem ?? "",
  );
}

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
