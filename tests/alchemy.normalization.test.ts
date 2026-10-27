import {
  alchemyCheckpointKey,
  analyzeContractBytecode,
  applyBalanceMetadata,
  blockTagToNumber,
  formatTokenUnits,
  getExplorerTokenUrl,
  normalizeAlchemyNetwork,
  normalizeAssetTransfers,
  normalizeBlockTag,
  normalizeEvmAddress,
  normalizeTokenBalances,
  normalizeTokenMetadata,
  normalizeTokenSupply,
  redactAlchemyEndpoint,
  setAlchemyRequestsPerSecond,
  type AlchemyTokenMetadataRecord,
} from "../collectors/assets/crypto/alchemyFetchers.js";

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

const USDC = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";
const WALLET = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const SOURCE_URL = "https://polygon-mainnet.g.alchemy.com/v2/<redacted>";

// --------------------------------------------------
// Network and input validation
// --------------------------------------------------

pass("network accepts polygon", normalizeAlchemyNetwork("polygon") === "polygon");
pass("network accepts ethereum", normalizeAlchemyNetwork("ethereum") === "ethereum");
pass("network accepts eth alias", normalizeAlchemyNetwork("eth") === "ethereum");
pass("network accepts arb alias", normalizeAlchemyNetwork("arb") === "arbitrum");
pass("network accepts matic alias", normalizeAlchemyNetwork("matic") === "polygon");
pass(
  "network rejects solana with a non-EVM explanation",
  throws(() => normalizeAlchemyNetwork("solana")),
);
pass(
  "network rejects an unknown name",
  throws(() => normalizeAlchemyNetwork("optimism")),
);

pass(
  "address is lowercased",
  normalizeEvmAddress("0x3C499C542cEF5E3811e1192ce70d8cC03d5c3359") === USDC,
);
pass(
  "address rejects a short value",
  throws(() => normalizeEvmAddress("0x1234")),
);
pass(
  "address rejects a non-hex value",
  throws(() => normalizeEvmAddress(`0x${"z".repeat(40)}`)),
);
pass(
  "explorer token URL uses the selected chain",
  getExplorerTokenUrl("polygon", USDC) === `https://polygonscan.com/token/${USDC}`,
);

pass("block number becomes hex", normalizeBlockTag(123) === "0x7b");
pass("decimal block string becomes hex", normalizeBlockTag("123") === "0x7b");
pass("hex block passes through", normalizeBlockTag("0x7B") === "0x7b");
pass("latest block tag passes through", normalizeBlockTag("latest") === "latest");
pass("bigint block becomes hex", normalizeBlockTag(123n) === "0x7b");
pass(
  "negative block is rejected",
  throws(() => normalizeBlockTag(-1)),
);
pass(
  "non-numeric block is rejected",
  throws(() => normalizeBlockTag("soon")),
);
pass("hex block converts to a number", blockTagToNumber("0x7b") === 123);
pass("latest block has no fixed number", blockTagToNumber("latest") === null);

// --------------------------------------------------
// Unit conversion
// --------------------------------------------------

pass("zero amount formats as zero", formatTokenUnits(0n, 6) === "0");
pass("whole token formats without a decimal point", formatTokenUnits(1_000_000n, 6) === "1");
pass("USDC balance formats exactly", formatTokenUnits(9_885_164n, 6) === "9.885164");
pass(
  "one wei formats as 0.000000000000000001",
  formatTokenUnits(1n, 18) === "0.000000000000000001",
);
pass(
  "large 18-decimal amount keeps precision",
  formatTokenUnits(123_456_789_012_345_678_901_234_567_890n, 18) ===
    "123456789012.34567890123456789",
);
pass("zero decimals formats as an integer", formatTokenUnits(42n, 0) === "42");
pass("fraction is zero-padded", formatTokenUnits(1n, 2) === "0.01");
pass("trailing fractional zeros are trimmed", formatTokenUnits(1_500_000n, 6) === "1.5");
pass("hex raw values are accepted", formatTokenUnits("0x96d5ec", 6) === "9.885164");
pass("decimal raw strings are accepted", formatTokenUnits("9885164", 6) === "9.885164");
pass("negative raw values keep their sign", formatTokenUnits(-1_500_000n, 6) === "-1.5");
pass(
  "negative decimals are rejected",
  throws(() => formatTokenUnits(1n, -1)),
);
pass(
  "fractional decimals are rejected",
  throws(() => formatTokenUnits(1n, 1.5)),
);
pass(
  "invalid raw values are rejected",
  throws(() => formatTokenUnits("nope", 6)),
);

// --------------------------------------------------
// Endpoint redaction
// --------------------------------------------------

const redacted = redactAlchemyEndpoint("https://polygon-mainnet.g.alchemy.com/v2/super-secret-key");
pass(
  "endpoint key is redacted",
  redacted === "https://polygon-mainnet.g.alchemy.com/v2/<redacted>",
);
pass("redacted endpoint contains no key", !redacted.includes("super-secret-key"));
pass(
  "keys in messages are redacted",
  !redactAlchemyEndpoint("failed https://eth-mainnet.g.alchemy.com/v2/another-key boom").includes(
    "another-key",
  ),
);

// --------------------------------------------------
// Token metadata
// --------------------------------------------------

const metadata = normalizeTokenMetadata(
  {
    decimals: 6,
    logo: "https://static.alchemyapi.io/images/assets/3408.png",
    name: "USDC",
    symbol: "USDC",
  },
  {
    network: "polygon",
    sourceUrl: SOURCE_URL,
    observedAt: "2026-10-27T12:00:00.000Z",
    contractAddress: USDC,
  },
);
pass("metadata keeps name and symbol", metadata.name === "USDC" && metadata.symbol === "USDC");
pass("metadata keeps decimals", metadata.decimals === 6);
pass("metadata marks a token", metadata.isToken === true);
pass("metadata keeps the logo", metadata.logoUrl?.includes("3408.png") === true);
pass("metadata keeps the contract address", metadata.contractAddress === USDC);
pass("metadata records the chain id", metadata.chainId === 137);
pass("metadata builds an explorer URL", metadata.explorerUrl.endsWith(USDC));

const emptyMetadata = normalizeTokenMetadata(
  { decimals: null, logo: null, name: "", symbol: "" },
  {
    network: "polygon",
    sourceUrl: SOURCE_URL,
    observedAt: "2026-10-27T12:00:00.000Z",
    contractAddress: WALLET,
  },
);
pass("empty metadata is not a token", emptyMetadata.isToken === false);
pass("empty metadata leaves name null", emptyMetadata.name === null);
pass("empty metadata leaves decimals null", emptyMetadata.decimals === null);

const legacyEmptyMetadata = normalizeTokenMetadata(
  { decimals: 0, logo: null, name: "", symbol: "" },
  {
    network: "polygon",
    sourceUrl: SOURCE_URL,
    observedAt: "2026-10-27T12:00:00.000Z",
    contractAddress: WALLET,
  },
);
pass("zero-decimal empty metadata is not a token", legacyEmptyMetadata.isToken === false);
pass("zero decimals are preserved", legacyEmptyMetadata.decimals === 0);

const badLogoMetadata = normalizeTokenMetadata(
  { decimals: 18, logo: "javascript:alert(1)", name: "X", symbol: "X" },
  {
    network: "ethereum",
    sourceUrl: SOURCE_URL,
    observedAt: "2026-10-27T12:00:00.000Z",
    contractAddress: USDC,
  },
);
pass("non-http logo is dropped", badLogoMetadata.logoUrl === null);
pass(
  "out-of-range decimals are dropped",
  normalizeTokenMetadata(
    { decimals: 300, name: "X", symbol: "X" },
    {
      network: "ethereum",
      sourceUrl: SOURCE_URL,
      observedAt: "2026-10-27T12:00:00.000Z",
      contractAddress: USDC,
    },
  ).decimals === null,
);

// --------------------------------------------------
// Bytecode analysis
// --------------------------------------------------

const eoaCode = analyzeContractBytecode("0x", {
  network: "polygon",
  sourceUrl: SOURCE_URL,
  retrievedAt: "2026-10-27T12:00:00.000Z",
  contractAddress: WALLET,
});
pass("empty bytecode is not a contract", eoaCode.isContract === false);
pass("empty bytecode has no hash", eoaCode.bytecodeHash === null);
pass("empty bytecode has zero bytes", eoaCode.bytecodeBytes === 0);
pass("empty bytecode has no selectors", eoaCode.selectorsPresent.length === 0);
pass("empty bytecode reports every ERC-20 selector missing", eoaCode.selectorsMissing.length === 9);
pass("empty bytecode is not a proxy", eoaCode.isProxyLike === false);

const tokenCodeHex = `0x6080604052${[
  "06fdde03",
  "95d89b41",
  "313ce567",
  "18160ddd",
  "70a08231",
  "a9059cbb",
  "23b872dd",
  "095ea7b3",
  "dd62ed3e",
].join("")}00`;
const tokenCode = analyzeContractBytecode(tokenCodeHex, {
  network: "polygon",
  sourceUrl: SOURCE_URL,
  retrievedAt: "2026-10-27T12:00:00.000Z",
  contractAddress: USDC,
});
pass("bytecode is recognized as a contract", tokenCode.isContract === true);
pass(
  "bytecode size counts runtime bytes",
  tokenCode.bytecodeBytes === (tokenCodeHex.length - 2) / 2,
);
pass("bytecode hash is sha256", tokenCode.hashAlgorithm === "sha256");
pass(
  "bytecode hash is 0x-prefixed 32 bytes",
  /^0x[0-9a-f]{64}$/.test(tokenCode.bytecodeHash ?? ""),
);
pass("all ERC-20 selectors are found", tokenCode.selectorsPresent.length === 9);
pass("no ERC-20 selector is reported missing", tokenCode.selectorsMissing.length === 0);
pass(
  "selector findings include totalSupply",
  tokenCode.selectorsPresent.some((entry) => entry.name === "totalSupply"),
);
pass("bytecode analysis never persists raw code", !("bytecode" in tokenCode));

const repeatedHash = analyzeContractBytecode(tokenCodeHex, {
  network: "polygon",
  sourceUrl: SOURCE_URL,
  retrievedAt: "2026-10-27T12:00:01.000Z",
  contractAddress: USDC,
});
pass("bytecode hash is deterministic", repeatedHash.bytecodeHash === tokenCode.bytecodeHash);
pass(
  "different bytecode hashes differently",
  analyzeContractBytecode("0x6000", {
    network: "polygon",
    sourceUrl: SOURCE_URL,
    retrievedAt: "2026-10-27T12:00:00.000Z",
    contractAddress: USDC,
  }).bytecodeHash !== tokenCode.bytecodeHash,
);

const implementation = "1234567890abcdef1234567890abcdef12345678";
const minimalProxy = analyzeContractBytecode(
  `0x363d3d373d3d3d363d73${implementation}5af43d82803e903d91602b57fd5bf3`,
  {
    network: "ethereum",
    sourceUrl: SOURCE_URL,
    retrievedAt: "2026-10-27T12:00:00.000Z",
    contractAddress: USDC,
  },
);
pass("minimal proxy is detected", minimalProxy.isMinimalProxy === true);
pass(
  "minimal proxy implementation is extracted",
  minimalProxy.minimalProxyImplementation === implementation,
);
pass("minimal proxy is proxy-like", minimalProxy.isProxyLike === true);

const proxyLike = analyzeContractBytecode("0x6080604052635c60da1b146100", {
  network: "polygon",
  sourceUrl: SOURCE_URL,
  retrievedAt: "2026-10-27T12:00:00.000Z",
  contractAddress: USDC,
});
pass("implementation selector marks a proxy-like contract", proxyLike.isProxyLike === true);
pass("proxy evidence names the selector", proxyLike.proxyEvidence[0]?.name === "implementation");
pass(
  "proxy note warns that implementation code is not fetched",
  (proxyLike.note ?? "").includes("implementation"),
);
pass(
  "invalid bytecode is rejected",
  throws(() =>
    analyzeContractBytecode("0xzz", {
      network: "polygon",
      sourceUrl: SOURCE_URL,
      retrievedAt: "2026-10-27T12:00:00.000Z",
      contractAddress: USDC,
    }),
  ),
);

// --------------------------------------------------
// Token supply
// --------------------------------------------------

const supply = normalizeTokenSupply(
  "0x00000000000000000000000000000000000000000000000000023a025b9c9bdc",
  {
    network: "polygon",
    sourceUrl: SOURCE_URL,
    observedAt: "2026-10-27T12:00:00.000Z",
    contractAddress: USDC,
    blockTag: "0x5bd06c7",
    decimals: 6,
    decimalsSource: "alchemy_getTokenMetadata",
  },
);
pass("supply converts the raw integer with decimals", supply.totalSupply === "626731754.757084");
pass(
  "supply keeps the raw value",
  supply.rawValue === "0x00000000000000000000000000000000000000000000000000023a025b9c9bdc",
);
pass("supply records the block tag", supply.blockTag === "0x5bd06c7");
pass("supply records the block number", supply.blockNumber === 96_274_119);
pass("supply records the call data", supply.callData === "0x18160ddd");
pass("supply records the decimals source", supply.decimalsSource === "alchemy_getTokenMetadata");

const emptySupply = normalizeTokenSupply("0x", {
  network: "polygon",
  sourceUrl: SOURCE_URL,
  observedAt: "2026-10-27T12:00:00.000Z",
  contractAddress: WALLET,
  blockTag: "latest",
  decimals: null,
  decimalsSource: null,
});
pass("empty supply has no raw value", emptySupply.rawValue === null);
pass("empty supply has no total", emptySupply.totalSupply === null);
pass(
  "empty supply explains the missing selector",
  (emptySupply.note ?? "").includes("totalSupply"),
);
pass("latest block has no fixed number in supply", emptySupply.blockNumber === null);

const unconvertedSupply = normalizeTokenSupply("0xff", {
  network: "polygon",
  sourceUrl: SOURCE_URL,
  observedAt: "2026-10-27T12:00:00.000Z",
  contractAddress: USDC,
  blockTag: "latest",
  decimals: null,
  decimalsSource: null,
});
pass("supply without decimals keeps the raw value", unconvertedSupply.rawValue === "0xff");
pass("supply without decimals is not converted", unconvertedSupply.totalSupply === null);
pass(
  "supply without decimals explains the omission",
  (unconvertedSupply.note ?? "").includes("Decimals are unavailable"),
);
pass(
  "invalid supply response is rejected",
  throws(() =>
    normalizeTokenSupply(
      {},
      {
        network: "polygon",
        sourceUrl: SOURCE_URL,
        observedAt: "2026-10-27T12:00:00.000Z",
        contractAddress: USDC,
        blockTag: "latest",
        decimals: 6,
        decimalsSource: "cli",
      },
    ),
  ),
);

// --------------------------------------------------
// Wallet balances
// --------------------------------------------------

const balanceFixture = {
  address: WALLET,
  tokenBalances: [
    {
      contractAddress: USDC,
      tokenBalance: "0x000000000000000000000000000000000000000000000000000000000096d5ec",
    },
    {
      contractAddress: "0x0000000000000000000000000000000000000002",
      tokenBalance: "0x0",
    },
    {
      contractAddress: "0x0000000000000000000000000000000000000003",
      tokenBalance: "not-hex",
      error: "bad row",
    },
    {
      contractAddress: USDC,
      tokenBalance: "0x1",
    },
  ],
};
const balances = normalizeTokenBalances(balanceFixture, {
  network: "polygon",
  sourceUrl: SOURCE_URL,
  observedAt: "2026-10-27T12:00:00.000Z",
  walletAddress: WALLET,
  requestedTokens: [USDC],
});
pass("balances keep valid rows", balances.tokens.length === 2);
pass(
  "balances deduplicate the same contract",
  balances.tokens.filter((token) => token.contractAddress === USDC).length === 1,
);
pass("balances count rejected and duplicate rows", balances.rejectedRows === 2);
pass(
  "balances keep the raw amount",
  balances.tokens[0]?.tokenBalanceRaw.endsWith("96d5ec") === true,
);
pass("balances wait for decimals before converting", balances.tokens[0]?.balance === null);
pass("zero balance formats as zero", balances.tokens[1]?.balance === "0");
pass("zero balance skips metadata", balances.tokens[1]?.note?.includes("Zero balance") === true);
pass(
  "balance explorer URL is chain-specific",
  balances.tokens[0]?.explorerUrl.startsWith("https://polygonscan.com/token/") === true,
);

const metadataMap = new Map<string, AlchemyTokenMetadataRecord>([
  [
    USDC,
    {
      ...metadata,
      sourceUrl: SOURCE_URL,
      observedAt: "2026-10-27T12:00:01.000Z",
    },
  ],
]);
const enriched = applyBalanceMetadata(balances.tokens, metadataMap, new Map());
pass("enriched balance uses token decimals", enriched[0]?.balance === "9.885164");
pass("enriched balance keeps decimals", enriched[0]?.decimals === 6);
pass("enriched balance attaches metadata", enriched[0]?.metadata?.symbol === "USDC");
pass(
  "enriched balance keeps the metadata source URL",
  enriched[0]?.metadata?.sourceUrl === SOURCE_URL,
);
pass("zero balance stays zero after enrichment", enriched[1]?.balance === "0");

const metadataFailure = applyBalanceMetadata(
  balances.tokens.slice(0, 1),
  new Map(),
  new Map([[USDC, "metadata timeout"]]),
);
pass("metadata failure leaves the balance unconverted", metadataFailure[0]?.balance === null);
pass(
  "metadata failure is attached to the token",
  metadataFailure[0]?.metadataError === "metadata timeout",
);
pass(
  "metadata failure keeps the raw amount",
  metadataFailure[0]?.tokenBalanceRaw.endsWith("96d5ec") === true,
);

const noDecimals = applyBalanceMetadata(
  balances.tokens.slice(0, 1),
  new Map([[USDC, { ...metadata, decimals: null }]]),
  new Map(),
);
pass("missing decimals leaves a nonzero balance null", noDecimals[0]?.balance === null);
pass(
  "missing decimals explains the omission",
  (noDecimals[0]?.note ?? "").includes("Decimals are unavailable"),
);

// --------------------------------------------------
// Historical transfers
// --------------------------------------------------

const transferFixture = {
  transfers: [
    {
      blockNum: "0x5bd06c7",
      uniqueId: "0x0b139472a01fd59df55ce1b0063fd12c3af88e1d2a569f33dd1b1086e81e6643:log:864",
      hash: "0x0b139472a01fd59df55ce1b0063fd12c3af88e1d2a569f33dd1b1086e81e6643",
      from: "0x211978e988b84256fad09831c753edce4b3078f2",
      to: "0xf32a7f37df3ab101b4ce57d86783a7133a352dce",
      value: 0.650262,
      asset: "USDC",
      category: "erc20",
      rawContract: {
        value: "0x9ec16",
        address: USDC,
        decimal: "0x6",
      },
      metadata: { blockTimestamp: "2026-10-27T15:55:50.000Z" },
    },
    {
      blockNum: "0x5bd06c8",
      hash: null,
      uniqueId: null,
    },
    {
      blockNum: "0x5bd06c9",
      uniqueId: "no-hash-but-unique",
      hash: null,
      from: "not-an-address",
      to: null,
      value: 12,
      rawContract: { value: "0x1", decimal: "0xffff" },
      metadata: {},
    },
  ],
  pageKey: "next-page",
};
const transfers = normalizeAssetTransfers(transferFixture, {
  network: "polygon",
  sourceUrl: SOURCE_URL,
  observedAt: "2026-10-27T12:00:00.000Z",
});
pass("transfers keep valid rows", transfers.transfers.length === 2);
pass("transfers reject rows without an id", transfers.rejectedRows === 1);
pass("transfers convert raw values with decimals", transfers.transfers[0]?.value === "0.650262");
pass("transfers keep the raw value", transfers.transfers[0]?.valueRaw === "0x9ec16");
pass(
  "transfers keep the provider float separately",
  transfers.transfers[0]?.providerValue === 0.650262,
);
pass("transfers keep the block number", transfers.transfers[0]?.blockNumber === 96_274_119);
pass(
  "transfers keep the timestamp",
  transfers.transfers[0]?.blockTimestamp === "2026-10-27T15:55:50.000Z",
);
pass(
  "transfers build an explorer link",
  transfers.transfers[0]?.explorerTransactionUrl?.startsWith("https://polygonscan.com/tx/") ===
    true,
);
pass("transfers keep the asset symbol", transfers.transfers[0]?.asset === "USDC");
pass(
  "transfers lowercase addresses",
  transfers.transfers[0]?.from === "0x211978e988b84256fad09831c753edce4b3078f2",
);
pass("invalid decimals are dropped", transfers.transfers[1]?.decimals === null);
pass("invalid decimals prevent conversion", transfers.transfers[1]?.value === null);
pass("invalid from address becomes null", transfers.transfers[1]?.from === null);
pass("page key is preserved", transfers.pageKey === "next-page");
pass(
  "a response without transfers is rejected",
  throws(() =>
    normalizeAssetTransfers(
      {},
      {
        network: "polygon",
        sourceUrl: SOURCE_URL,
        observedAt: "2026-10-27T12:00:00.000Z",
      },
    ),
  ),
);

// --------------------------------------------------
// Checkpoints and rate limiter
// --------------------------------------------------

const checkpointA = alchemyCheckpointKey("polygon", [USDC, WALLET], ["erc20"]);
const checkpointB = alchemyCheckpointKey("polygon", [WALLET, USDC], ["erc20"]);
pass("checkpoint key ignores address order", checkpointA === checkpointB);
pass("checkpoint key includes the network", checkpointA.startsWith("polygon:"));
pass("checkpoint key includes the address", checkpointA.includes(USDC));
pass(
  "checkpoint key falls back to all contracts",
  alchemyCheckpointKey("ethereum", [], ["erc20"]).includes(":all:"),
);
pass(
  "different networks have different checkpoint keys",
  checkpointA !== alchemyCheckpointKey("ethereum", [USDC, WALLET], ["erc20"]),
);

pass(
  "request rate rejects zero",
  throws(() => setAlchemyRequestsPerSecond(0)),
);
pass(
  "request rate rejects NaN",
  throws(() => setAlchemyRequestsPerSecond(Number.NaN)),
);
pass("request rate accepts a positive value", !throws(() => setAlchemyRequestsPerSecond(5)));

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll Alchemy normalization tests passed.");
}
