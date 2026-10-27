import {
  appendSecuritySnapshot,
  assertSupportedChain,
  booleanOrNull,
  buildChainList,
  buildSecuritySnapshot,
  coerceSecuritySnapshot,
  compareSecuritySnapshots,
  normalizeChainId,
  normalizeEvmAddress,
  normalizeSupportedChains,
  normalizeTokenSecurity,
  setGoPlusRequestsPerMinute,
  summarizeTokenSecurity,
  type GoPlusSecurityContext,
  type GoPlusSecurityHistory,
  type GoPlusSecuritySnapshot,
  type GoPlusTokenSecurityRecord,
} from "../collectors/assets/crypto/goplusFetchers.js";

let failures = 0;

const pass = (name: string, ok: boolean, extra = ""): void => {
  if (!ok) {
    failures++;
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

const throws = (work: () => unknown): boolean => {
  try {
    work();
    return false;
  } catch {
    return true;
  }
};

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const OWNER = "0x73feaa1ee314f8c655e354234017be2193c9e24e";

const context: GoPlusSecurityContext = {
  chainId: "1",
  chainName: "Ethereum",
  contractAddress: USDC,
  checkedAt: "2026-10-27T12:00:00.000Z",
  sourceUrl:
    "https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  providerCode: 1,
  providerMessage: "OK",
};

const baseEntry = {
  token_name: "USD Coin",
  token_symbol: "USDC",
  is_open_source: "1",
  is_proxy: "1",
  is_mintable: "0",
  owner_address: "0x0000000000000000000000000000000000000000",
  owner_balance: "0",
  owner_percent: "0.0",
  creator_address: "0x95ba4cf87d6723ad9c0db21737d862be80e93911",
  creator_percent: "0.000000",
  can_take_back_ownership: "0",
  hidden_owner: "0",
  owner_change_balance: "0",
  selfdestruct: "0",
  external_call: "0",
  transfer_pausable: "0",
  is_blacklisted: "0",
  is_whitelisted: "0",
  trading_cooldown: "0",
  personal_slippage_modifiable: "0",
  slippage_modifiable: "0",
  anti_whale_modifiable: "0",
  is_anti_whale: "0",
  cannot_buy: "0",
  cannot_sell_all: "0",
  is_honeypot: "0",
  honeypot_with_same_creator: "0",
  buy_tax: "0",
  sell_tax: "0",
  transfer_tax: "0",
  is_in_dex: "1",
  is_in_cex: { listed: "1", cex_list: ["Binance", "Coinbase"] },
  lp_holder_count: "77",
  lp_total_supply: "28163713.006717445280785212",
  holder_count: "9357810",
  total_supply: "47479287875.263976",
  trust_list: "1",
  dex: [
    {
      name: "UniswapV3",
      liquidity_type: "UniV3",
      liquidity: "38556.541686819045236806",
      pair: "0x11950d141ecb863f01007add7d1a342041227b58",
      pool_fee: "0.003",
    },
  ],
};

const makeRecord = (
  overrides: Record<string, unknown> = {},
  contextOverrides: Partial<GoPlusSecurityContext> = {},
): GoPlusTokenSecurityRecord =>
  normalizeTokenSecurity({ ...baseEntry, ...overrides }, { ...context, ...contextOverrides });

/** A record with every explicit flag cleared, including the informational proxy flag. */
const makeCleanRecord = (overrides: Record<string, unknown> = {}): GoPlusTokenSecurityRecord =>
  makeRecord({ is_proxy: "0", ...overrides });

const hasFlag = (record: GoPlusTokenSecurityRecord, id: string): boolean =>
  record.risk_flags.some((entry) => entry.id === id);

const flagSeverity = (record: GoPlusTokenSecurityRecord, id: string): string | null =>
  record.risk_flags.find((entry) => entry.id === id)?.severity ?? null;

// --------------------------------------------------
// Tri-state booleans
// --------------------------------------------------

pass('boolean parses "1"', booleanOrNull("1") === true);
pass('boolean parses "0"', booleanOrNull("0") === false);
pass("boolean parses 1", booleanOrNull(1) === true);
pass("boolean parses 0", booleanOrNull(0) === false);
pass("boolean parses true", booleanOrNull(true) === true);
pass("boolean parses false", booleanOrNull(false) === false);
pass('boolean parses "TRUE"', booleanOrNull("TRUE") === true);
pass("empty string is unknown", booleanOrNull("") === null);
pass("whitespace is unknown", booleanOrNull("   ") === null);
pass("unknown word is null", booleanOrNull("yes") === null);
pass("number 2 is null", booleanOrNull(2) === null);
pass("null is null", booleanOrNull(null) === null);
pass("undefined is null", booleanOrNull(undefined) === null);

// --------------------------------------------------
// Chain ids and addresses
// --------------------------------------------------

pass("numeric chain id passes through", normalizeChainId("1") === "1");
pass("eth alias resolves", normalizeChainId("eth") === "1");
pass("uppercase alias resolves", normalizeChainId("ETHEREUM") === "1");
pass("polygon alias resolves", normalizeChainId("polygon") === "137");
pass("arb alias resolves", normalizeChainId("arb") === "42161");
pass("leading zeros are trimmed", normalizeChainId("0045") === "45");
pass(
  "zero chain id is rejected",
  throws(() => normalizeChainId("0")),
);
pass(
  "solana is rejected as non-EVM",
  throws(() => normalizeChainId("solana")),
);
pass(
  "tron is rejected as non-EVM",
  throws(() => normalizeChainId("tron")),
);
pass(
  "unknown chain name is rejected",
  throws(() => normalizeChainId("mychain")),
);
pass(
  "empty chain id is rejected",
  throws(() => normalizeChainId("  ")),
);

pass(
  "addresses are lowercased",
  normalizeEvmAddress("0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48") === USDC,
);
pass(
  "short address is rejected",
  throws(() => normalizeEvmAddress("0x1234")),
);
pass(
  "non-hex address is rejected",
  throws(() => normalizeEvmAddress(`0x${"z".repeat(40)}`)),
);

// --------------------------------------------------
// Supported chains
// --------------------------------------------------

const chainFixture = [
  { name: "Ethereum", id: "1" },
  { name: "BSC", id: "56" },
  { name: "Solana", id: "solana" },
  { name: "Polygon", id: "137" },
  { name: "Ethereum duplicate", id: "1" },
  { name: "No id" },
  { name: "Numeric id", id: 8453 },
];

const chains = normalizeSupportedChains(chainFixture);
pass("chains skip rows without an id", chains.length === 5);
pass("chains deduplicate ids", chains.filter((chain) => chain.id === "1").length === 1);
pass(
  "numeric ids become strings",
  chains.some((chain) => chain.id === "8453"),
);
pass("numeric ids are EVM", chains.find((chain) => chain.id === "8453")?.is_evm === true);
pass("solana is not EVM", chains.find((chain) => chain.id === "solana")?.is_evm === false);
pass("chain names are kept", chains.find((chain) => chain.id === "137")?.name === "Polygon");
pass("non-array input yields no chains", normalizeSupportedChains({}).length === 0);

const chainList = buildChainList(
  chainFixture,
  "https://api.gopluslabs.io/api/v1/supported_chains",
  "2026-10-27T12:00:00.000Z",
);
pass("chain list keeps the provider", chainList.provider === "goplus");
pass("chain list keeps the source URL", chainList.source_url.endsWith("/supported_chains"));
pass("chain list lists EVM ids only", !chainList.evm_chain_ids.includes("solana"));
pass("chain list keeps numeric EVM ids", chainList.evm_chain_ids.includes("137"));

pass("supported chain resolves", assertSupportedChain(chains, "137").name === "Polygon");
pass(
  "unsupported chain is rejected",
  throws(() => assertSupportedChain(chains, "999999")),
);
pass(
  "non-EVM chain is rejected",
  throws(() => assertSupportedChain(chains, "solana")),
);

// --------------------------------------------------
// Record normalization
// --------------------------------------------------

const record = makeRecord();

pass("record keeps the provider", record.provider === "goplus");
pass("record keeps the chain id", record.chain_id === "1");
pass("record keeps the chain name", record.chain_name === "Ethereum");
pass("record keeps the address", record.contract_address === USDC);
pass(
  "record keeps name and symbol",
  record.token_name === "USD Coin" && record.token_symbol === "USDC",
);
pass("record keeps the observation time", record.checked_at === context.checkedAt);
pass("record keeps the provider code", record.provider_code === 1);
pass("record marks a found entry", record.found === true);
pass("open source is true", record.is_open_source === true);
pass("proxy is true", record.is_proxy === true);
pass("mintable is false", record.is_mintable === false);
pass("zero owner address becomes renounced", record.owner_controls.owner_renounced === true);
pass("renounced owner is not an address", record.owner_controls.owner_address === null);
pass(
  "creator address is kept",
  record.owner_controls.creator_address?.startsWith("0x95ba") === true,
);
pass("taxes are numbers", record.tax_indicators.buy_tax_percent === 0);
pass(
  "empty transfer tax is null",
  makeRecord({ transfer_tax: "" }).tax_indicators.transfer_tax_percent === null,
);
pass("junk tax is null", makeRecord({ buy_tax: "n/a" }).tax_indicators.buy_tax_percent === null);
pass("absurd tax is null", makeRecord({ buy_tax: "5000" }).tax_indicators.buy_tax_percent === null);
pass("cex object is parsed", record.trading.is_in_cex === true);
pass("cex list is parsed", record.trading.cex_list.length === 2);
pass("cex list keeps names", record.trading.cex_list[0] === "Binance");
pass("dex listings are parsed", record.trading.dexes.length === 1);
pass("dex liquidity is a string", record.trading.dexes[0]?.liquidity?.startsWith("38556") === true);
pass("lp holder count is a number", record.trading.lp_holder_count === 77);
pass("holder count is a number", record.holders.count === 9_357_810);
pass(
  "provider supply keeps full precision",
  record.supply.provider_total_supply === "47479287875.263976",
);
pass("trust list is parsed", record.trust.trust_list === true);
pass("raw entry is preserved", record.raw["holder_count"] === "9357810");
pass("raw holders are untouched", "dex" in record.raw);
pass("missing fields are tracked", record.missing_fields.includes("fake_token"));
pass("present fields are not listed as missing", !record.missing_fields.includes("is_honeypot"));
pass("limitations are attached", record.limitations.length >= 3);
pass("source URL is kept", record.source_url.includes("/token_security/1"));

const stringCex = makeRecord({ is_in_cex: "1" });
pass("string cex form is parsed", stringCex.trading.is_in_cex === true);
pass("string cex form has no list", stringCex.trading.cex_list.length === 0);

const realOwner = makeRecord({ owner_address: OWNER, owner_percent: "0.001276" });
pass("real owner is kept", realOwner.owner_controls.owner_address === OWNER);
pass("real owner is not renounced", realOwner.owner_controls.owner_renounced === false);
pass("owner percent is parsed", realOwner.owner_controls.owner_percent === 0.001276);

const uppercaseOwner = makeRecord({ owner_address: OWNER.toUpperCase().replace("0X", "0x") });
pass("owner address is lowercased", uppercaseOwner.owner_controls.owner_address === OWNER);

const missingOwner = makeRecord({ owner_address: undefined });
pass(
  "missing owner is unknown, not renounced",
  missingOwner.owner_controls.owner_renounced === null,
);
pass("missing owner has no address", missingOwner.owner_controls.owner_address === null);

const missingOptional = makeRecord({ is_mintable: undefined, is_proxy: undefined });
pass("missing mintable stays null", missingOptional.is_mintable === null);
pass("missing proxy stays null", missingOptional.is_proxy === null);

const badDex = makeRecord({ dex: [{}, { name: "UniswapV2" }, "junk", { liquidity: "12.5" }] });
pass("invalid dex rows are dropped", badDex.trading.dexes.length === 2);
pass("dex row with only liquidity is kept", badDex.trading.dexes[1]?.liquidity === "12.5");

const notFound = normalizeTokenSecurity({}, context);
pass("empty result is not found", notFound.found === false);
pass("not found keeps the address", notFound.contract_address === USDC);
pass("not found leaves flags empty", notFound.risk_flags.length === 0);
pass("not found marks every known field missing", notFound.missing_fields.length === 47);
pass("not found has no open-source claim", notFound.is_open_source === null);
pass("not found summary refuses a conclusion", notFound.security_summary.includes("no conclusion"));
pass("not found raw is empty", Object.keys(notFound.raw).length === 0);

// --------------------------------------------------
// Risk flags
// --------------------------------------------------

pass("clean token has no flags", makeCleanRecord().risk_flags.length === 0);
pass(
  "honeypot is critical",
  flagSeverity(makeRecord({ is_honeypot: "1" }), "honeypot") === "critical",
);
pass(
  "honeypot same creator is high",
  flagSeverity(makeRecord({ honeypot_with_same_creator: "1" }), "honeypot_same_creator") === "high",
);
pass("cannot buy is high", flagSeverity(makeRecord({ cannot_buy: "1" }), "cannot_buy") === "high");
pass(
  "cannot sell all is high",
  flagSeverity(makeRecord({ cannot_sell_all: "1" }), "cannot_sell_all") === "high",
);
pass(
  "hidden owner is high",
  flagSeverity(makeRecord({ hidden_owner: "1" }), "hidden_owner") === "high",
);
pass(
  "owner can change balance is critical",
  flagSeverity(makeRecord({ owner_change_balance: "1" }), "owner_can_change_balance") ===
    "critical",
);
pass(
  "owner can reclaim is high",
  flagSeverity(makeRecord({ can_take_back_ownership: "1" }), "owner_can_reclaim") === "high",
);
pass(
  "selfdestruct is high",
  flagSeverity(makeRecord({ selfdestruct: "1" }), "selfdestruct") === "high",
);
pass(
  "external call is medium",
  flagSeverity(makeRecord({ external_call: "1" }), "external_call") === "medium",
);
pass("mintable is medium", flagSeverity(makeRecord({ is_mintable: "1" }), "mintable") === "medium");
pass(
  "pausable transfers are medium",
  flagSeverity(makeRecord({ transfer_pausable: "1" }), "transfer_pausable") === "medium",
);
pass(
  "blacklist is medium",
  flagSeverity(makeRecord({ is_blacklisted: "1" }), "blacklist") === "medium",
);
pass("whitelist is low", flagSeverity(makeRecord({ is_whitelisted: "1" }), "whitelist") === "low");
pass(
  "trading cooldown is low",
  flagSeverity(makeRecord({ trading_cooldown: "1" }), "trading_cooldown") === "low",
);
pass(
  "slippage modifiable is medium",
  flagSeverity(makeRecord({ slippage_modifiable: "1" }), "slippage_modifiable") === "medium",
);
pass(
  "personal slippage is medium",
  flagSeverity(
    makeRecord({ personal_slippage_modifiable: "1" }),
    "personal_slippage_modifiable",
  ) === "medium",
);
pass(
  "anti-whale modifiable is low",
  flagSeverity(makeRecord({ anti_whale_modifiable: "1" }), "anti_whale_modifiable") === "low",
);
pass("anti-whale is low", flagSeverity(makeRecord({ is_anti_whale: "1" }), "anti_whale") === "low");
pass(
  "closed source is medium",
  flagSeverity(makeRecord({ is_open_source: "0" }), "closed_source") === "medium",
);
pass(
  "proxy is informational",
  flagSeverity(makeRecord({ is_proxy: "1" }), "proxy_contract") === "info",
);
pass(
  "no proxy flag when proxy is false",
  !hasFlag(makeRecord({ is_proxy: "0" }), "proxy_contract"),
);
pass("buy tax at threshold flags", hasFlag(makeRecord({ buy_tax: "10" }), "high_buy_tax"));
pass(
  "buy tax below threshold does not flag",
  !hasFlag(makeRecord({ buy_tax: "9.99" }), "high_buy_tax"),
);
pass(
  "sell tax flags at 50",
  flagSeverity(makeRecord({ sell_tax: "50" }), "high_sell_tax") === "high",
);
pass(
  "transfer tax flags at 10",
  flagSeverity(makeRecord({ transfer_tax: "10" }), "high_transfer_tax") === "high",
);
pass("no dex market is low", hasFlag(makeRecord({ is_in_dex: "0" }), "no_dex_market"));
pass(
  "zero lp holders flags when in dex",
  hasFlag(makeRecord({ is_in_dex: "1", lp_holder_count: "0" }), "no_liquidity_providers"),
);
pass(
  "zero lp holders does not flag outside dex",
  !hasFlag(makeRecord({ is_in_dex: "0", lp_holder_count: "0" }), "no_liquidity_providers"),
);
pass("airdrop scam is high", hasFlag(makeRecord({ is_airdrop_scam: "1" }), "airdrop_scam"));
pass("fake token is high", hasFlag(makeRecord({ fake_token: "1" }), "fake_token"));
pass("not true token is high", hasFlag(makeRecord({ is_true_token: "0" }), "not_true_token"));
pass(
  "other risks are medium",
  hasFlag(makeRecord({ other_potential_risks: "unverified owner" }), "other_potential_risks"),
);
pass(
  "provider note is informational",
  flagSeverity(makeRecord({ note: "be careful" }), "provider_note") === "info",
);
pass(
  "creator share at threshold flags",
  hasFlag(makeRecord({ creator_percent: "10" }), "creator_holds_large_share"),
);
pass(
  "owner share at threshold flags",
  hasFlag(makeRecord({ owner_address: OWNER, owner_percent: "12.5" }), "owner_holds_large_share"),
);
pass(
  "owner share below threshold does not flag",
  !hasFlag(makeRecord({ owner_address: OWNER, owner_percent: "9.9" }), "owner_holds_large_share"),
);
pass(
  "false booleans never raise flags",
  makeRecord({ is_proxy: "0", is_honeypot: "0", hidden_owner: "0", is_mintable: "0" }).risk_flags
    .length === 0,
);
pass(
  "unknown booleans never raise flags",
  makeRecord({
    is_proxy: "0",
    is_honeypot: "",
    hidden_owner: undefined,
    is_mintable: null,
  }).risk_flags.length === 0,
);
pass(
  "tax threshold is documented in evidence",
  makeRecord({ buy_tax: "25" })
    .risk_flags.find((entry) => entry.id === "high_buy_tax")
    ?.evidence.includes("threshold 10%") === true,
);

// --------------------------------------------------
// Summary
// --------------------------------------------------

const cleanSummary = summarizeTokenSecurity(makeCleanRecord());
pass("clean summary avoids a safety claim", cleanSummary.includes("Absence of flags"));
pass("clean summary says not evidence", cleanSummary.includes("not evidence"));
pass("clean summary describes source state", cleanSummary.includes("Open source: yes"));
pass("clean summary describes the owner", cleanSummary.includes("owner renounced"));
pass("clean summary mentions no indicators", cleanSummary.includes("no risk indicator"));

const riskSummary = summarizeTokenSecurity(makeCleanRecord({ is_honeypot: "1", sell_tax: "50" }));
pass("risk summary counts findings", riskSummary.includes("2 risk indicator(s)"));
pass("risk summary names the highest severity", riskSummary.includes("highest severity critical"));
pass("risk summary lists flag ids", riskSummary.includes("honeypot"));
pass("risk summary keeps the caveat", riskSummary.includes("not proof of malicious behaviour"));

const longSummary = summarizeTokenSecurity(
  makeRecord({
    is_honeypot: "1",
    cannot_buy: "1",
    cannot_sell_all: "1",
    hidden_owner: "1",
    selfdestruct: "1",
    fake_token: "1",
  }),
);
pass("long summaries collapse the remainder", longSummary.includes("more"));

// --------------------------------------------------
// Snapshots
// --------------------------------------------------

const snapshot = buildSecuritySnapshot(record);
pass("snapshot keeps the timestamp", snapshot.checked_at === record.checked_at);
pass("snapshot keeps owner state", snapshot.owner_renounced === true);
pass("snapshot keeps taxes", snapshot.buy_tax_percent === 0);
pass("snapshot keeps flag ids", snapshot.risk_flag_ids.length === 1);
pass("snapshot keeps the summary", snapshot.security_summary === record.security_summary);
pass("snapshot has no raw payload", !("raw" in snapshot));

const roundTrip = coerceSecuritySnapshot(JSON.parse(JSON.stringify(snapshot)) as unknown);
pass("snapshot round-trips", JSON.stringify(roundTrip) === JSON.stringify(snapshot));
pass(
  "snapshot without a timestamp is rejected",
  coerceSecuritySnapshot({ is_proxy: true }) === null,
);
pass(
  "snapshot coercion tolerates junk booleans",
  coerceSecuritySnapshot({ checked_at: "2026-10-27T12:00:00.000Z", is_proxy: "maybe" })
    ?.is_proxy === null,
);

pass(
  "identical snapshots have no changes",
  compareSecuritySnapshots(snapshot, snapshot).length === 0,
);

const ownerChanged: GoPlusSecuritySnapshot = {
  ...snapshot,
  owner_address: OWNER,
  owner_renounced: false,
  checked_at: "2026-10-28T12:00:00.000Z",
};
const ownerChanges = compareSecuritySnapshots(snapshot, ownerChanged);
pass(
  "owner change is detected",
  ownerChanges.some((change) => change.field === "owner_address"),
);
pass(
  "owner change records before and after",
  ownerChanges.find((change) => change.field === "owner_address")?.before === null &&
    ownerChanges.find((change) => change.field === "owner_address")?.after === OWNER,
);
pass(
  "renouncement change is detected",
  ownerChanges.some((change) => change.field === "owner_renounced"),
);

const permissionChanged: GoPlusSecuritySnapshot = {
  ...snapshot,
  transfer_pausable: true,
  risk_flag_ids: [...snapshot.risk_flag_ids, "transfer_pausable"],
};
const permissionChanges = compareSecuritySnapshots(snapshot, permissionChanged);
pass(
  "permission change is detected",
  permissionChanges.some((change) => change.field === "transfer_pausable"),
);
pass(
  "new risk flags are detected",
  permissionChanges.some((change) => change.field === "risk_flag_ids"),
);
pass(
  "timestamp-only changes are ignored",
  compareSecuritySnapshots(snapshot, { ...snapshot, checked_at: "2026-10-29T00:00:00.000Z" })
    .length === 0,
);
pass(
  "summary-only changes are ignored",
  compareSecuritySnapshots(snapshot, { ...snapshot, security_summary: "rewritten" }).length === 0,
);

// --------------------------------------------------
// History
// --------------------------------------------------

const emptyHistory: GoPlusSecurityHistory = {
  provider: "goplus",
  chain_id: "1",
  contract_address: USDC,
  updated_at: snapshot.checked_at,
  snapshots: [],
};

const oneHistory = appendSecuritySnapshot(emptyHistory, snapshot, 10);
pass("history appends a snapshot", oneHistory.snapshots.length === 1);
pass("history keeps the contract", oneHistory.contract_address === USDC);
pass("history updated_at follows the snapshot", oneHistory.updated_at === snapshot.checked_at);

const twoHistory = appendSecuritySnapshot(oneHistory, ownerChanged, 10);
pass("history appends in order", twoHistory.snapshots[1]?.checked_at === ownerChanged.checked_at);

const cappedHistory = appendSecuritySnapshot(
  twoHistory,
  { ...snapshot, checked_at: "2026-10-30T00:00:00.000Z" },
  2,
);
pass("history is capped", cappedHistory.snapshots.length === 2);
pass(
  "history keeps the newest snapshots",
  cappedHistory.snapshots[1]?.checked_at === "2026-10-30T00:00:00.000Z",
);
pass(
  "history limit must be positive",
  throws(() => appendSecuritySnapshot(emptyHistory, snapshot, 0)),
);
pass(
  "history limit is bounded",
  throws(() => appendSecuritySnapshot(emptyHistory, snapshot, 5_000)),
);
pass("history does not mutate the input", emptyHistory.snapshots.length === 0);

// --------------------------------------------------
// Rate limiter
// --------------------------------------------------

pass(
  "request rate rejects zero",
  throws(() => setGoPlusRequestsPerMinute(0)),
);
pass(
  "request rate rejects NaN",
  throws(() => setGoPlusRequestsPerMinute(Number.NaN)),
);
pass("request rate accepts a positive value", !throws(() => setGoPlusRequestsPerMinute(30)));

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll GoPlus normalization tests passed.");
}
