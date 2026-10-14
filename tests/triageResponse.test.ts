import {
  MIN_LABELLED_SHARE,
  triageResponseProblem,
  triageSchema,
} from "../AI/utils/weather/triage.js";

// The check that stands between a triage response and the promotions it drives.
//
// Every input below is taken verbatim from the real run that failed: the response in
// case 1 is what the model returned, and the ids are the 48 it was shown. That run
// labelled two of forty-eight observations, promoted nothing, and reported success at
// every stage downstream.
//
// The data is embedded rather than read from AI/data/ because the run logs are
// numbered per run and get replaced on every pipeline run - a test that read one
// broke the moment the pipeline ran again, which is exactly when there is most reason
// to want the test to work.

// Verbatim from that run's triage_output section. The two ids are fragments of JSON
// syntax, not observations.
const REAL_RESPONSE =
  '{"signals": [{"id": "exek", "important": false, "reason": " observation not important enough: not important"},' +
  ' {"id": "]}  {", "important": false, "reason": "sho"}]}';

/**
 * The observation ids Triage was shown for that run, in the order it saw them.
 *
 * Recovered from the committed copy of that run's log rather than from AI/data: the
 * logs are renumbered and replaced on every pipeline run, so a test that reads one
 * breaks exactly when there is most reason to want it working.
 */
const KNOWN_IDS = [
  "f8f35fc0-f29f-4810-bea9-e053b501e6d3",
  "26d1c537-2a6e-47c2-9bd7-62f12fbbd643",
  "789a3bac-faec-4bbc-a000-30d48df955aa",
  "b67b398d-fe55-48c6-aba5-bab74f07e0bc",
  "107120e2-cf01-42cb-9cd9-92daf7851012",
  "7d006a74-583e-4c48-bd2c-730079f67473",
  "7a1de757-f74c-40a0-bc7b-5f74dfbdf744",
  "c9e2dbec-6491-482a-b43a-66e81def57ca",
  "eeaa2312-a582-445a-978d-89342ae7c29e",
  "bde7d49f-ded3-4381-89cc-842f7cb962c1",
  "946d5cb9-5155-4a4d-8530-6dcd18381cb1",
  "583bf7d1-4ee0-48f3-9041-9a6757f594e5",
  "a7ecf142-4e64-4496-bf17-acf9415f4905",
  "9404d7ef-d4ae-4b1d-88c6-0820021b9fd6",
  "d9618943-10d7-42ce-9311-996416487047",
  "4f845779-0f64-4059-a622-1dd15c097e0a",
  "c19b3e08-e4e2-46d2-afb0-95d4f6057dc6",
  "4f213f27-2598-4a2f-8d2f-bd2519c3f282",
  "79f2b2b4-6108-4385-898b-3d6c60708500",
  "abbad0ab-c3d4-4864-8452-f87a69fad973",
  "b87b2470-1009-4aa2-9e69-4cd923da507a",
  "98201ca5-a3f6-4205-b9fd-0e2450098d61",
  "d2f2202f-43b1-4654-b441-25391e6a0a51",
  "a65ec440-c6f7-4b67-a952-6a18a29a9605",
  "300af98f-1ebe-4330-a0ee-c27239eac433",
  "a3e8ac56-f791-46fc-9b66-87d68ad55829",
  "5375c7e1-dcc1-4762-aa54-720fb2edb9a4",
  "edc13818-372b-4da7-b2c0-b4015713c540",
  "62a58d85-d2dd-4869-b4cf-f7094629d53a",
  "e366461e-f702-4c7b-a57f-3826589cce9f",
  "2ab0de81-e614-44a4-86ef-aa28f6c730e8",
  "a0070987-e683-441d-82bd-cce881472977",
  "6c943864-0292-4381-90d3-b327e4fab0be",
  "afe4f66f-ead8-49d5-9748-72fe927808a5",
  "58c1a10d-567e-4324-9838-a6f494741f4c",
  "d9981ec7-b42e-418f-8d7b-cf36fbbfcf37",
  "c9061ca4-37f6-46e6-a039-f4c5bcb41c0c",
  "70f80d15-cc9e-4639-b1d6-4baeefacf70a",
  "f096819e-c33a-4aa9-be3f-19f91d61087c",
  "1c8efa1c-a689-4165-875e-1fba5d1a812b",
  "8e180c2b-18d2-4124-8502-8f1b08e47337",
  "e233ec5d-103c-4523-ac39-b8686665ef25",
  "8ffa507b-ac22-44e6-923d-c66df9146754",
  "e200369b-49e1-4bb9-9f75-9c1c5f7794bd",
  "f0af1422-ac9b-44a1-8661-bfd15eba6aff",
  "17b7ebcc-5769-494f-9cc9-18b85ef24079",
  "0470c564-555b-4f2e-94ad-b6fe1c957cbd",
  "c9e2d82d-f55c-455e-9fe8-331a3d11e92b",
];

const knownIds = new Set(KNOWN_IDS);

let failures = 0;

const pass = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures += 1;

  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

// 1. The real failure. It passes the schema, which is the whole point.
{
  const real = JSON.parse(REAL_RESPONSE) as { signals: { id: string }[] };

  pass(
    "the real garbage response passes triageSchema",
    triageSchema.safeParse(real).success,
    "so the schema alone would not have caught it",
  );

  const problem = triageResponseProblem(real.signals, knownIds, KNOWN_IDS.length);

  pass("the real garbage response is rejected", problem !== null);

  pass(
    "the rejection names the invented ids",
    problem !== null && problem.includes("exek"),
    problem ?? "",
  );
}

// 2. A response that labels the whole day is accepted.
{
  const signals = KNOWN_IDS.map((id, index) => ({ id, important: index < 5, reason: "checked" }));

  pass(
    "a full day of real ids is accepted",
    triageResponseProblem(signals, knownIds, KNOWN_IDS.length) === null,
  );
}

// 3. Shortened UUIDs - the failure the model's own reasoning showed, where it reasoned
//    with eight-character ids and then emitted junk.
{
  const signals = KNOWN_IDS.map((id) => ({
    id: id.slice(0, 8),
    important: false,
    reason: "checked",
  }));

  const problem = triageResponseProblem(signals, knownIds, KNOWN_IDS.length);

  pass("eight-character ids are rejected", problem !== null, problem ?? "");
}

// 4. Real ids, but far too few to be a real attempt at the job.
{
  const signals = KNOWN_IDS.slice(0, 4).map((id) => ({ id, important: false, reason: "checked" }));

  const problem = triageResponseProblem(signals, knownIds, KNOWN_IDS.length);

  pass("4 of 48 labelled is rejected", problem !== null, problem ?? "");

  pass(
    "the rejection says how many were labelled",
    problem !== null && problem.includes("labelled 4 of 48"),
    problem ?? "",
  );
}

// 5. The threshold is exact: the required count is accepted, one below it is not.
//    Derived from the constant so changing it cannot quietly invalidate the test.
{
  const required = Math.ceil(KNOWN_IDS.length * MIN_LABELLED_SHARE);

  console.log(
    `      (threshold for ${KNOWN_IDS.length} observations is ${required} labelled, ` +
      `${MIN_LABELLED_SHARE} of them)`,
  );

  const at = KNOWN_IDS.slice(0, required).map((id) => ({
    id,
    important: false,
    reason: "checked",
  }));

  pass(
    `exactly ${required} labelled is accepted`,
    triageResponseProblem(at, knownIds, KNOWN_IDS.length) === null,
  );

  const under = KNOWN_IDS.slice(0, required - 1).map((id) => ({
    id,
    important: false,
    reason: "checked",
  }));

  pass(
    `${required - 1} labelled is rejected`,
    triageResponseProblem(under, knownIds, KNOWN_IDS.length) !== null,
  );
}

// 6. Nothing at all.
{
  pass("an empty signals array is rejected", triageResponseProblem([], knownIds, 48) !== null);
  pass("undefined signals is rejected", triageResponseProblem(undefined, knownIds, 48) !== null);
}

// 7. Duplicate real ids do not inflate the labelled count.
{
  const one = KNOWN_IDS[0];

  if (one === undefined) throw new Error("no ids to test with");

  const signals = new Array(KNOWN_IDS.length).fill(null).map(() => ({
    id: one,
    important: false,
    reason: "checked",
  }));

  pass(
    "the same id 48 times counts as one labelled",
    triageResponseProblem(signals, knownIds, KNOWN_IDS.length) !== null,
  );
}

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
