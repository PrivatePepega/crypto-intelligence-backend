# Alchemy On-Chain Intelligence

Collector for EVM token metadata, deployed bytecode, total supply, wallet
balances and historical token transfers.

Script: `collectors/assets/crypto/alchemyFetchers.ts`

Output: `collectors/assets/crypto/data/` with an `alchemy ` file prefix.

```powershell
npx.cmd tsx collectors/assets/crypto/alchemyFetchers.ts --mode=all --network=polygon
```

Alchemy is a per-network RPC provider, not a global asset directory. A network
must be enabled for the Alchemy app behind the endpoint; otherwise the API
returns HTTP 403 with "is not enabled for this app". As of 2026-10-27 the app
configured in this repository has only **Polygon** enabled. Ethereum, Base,
Arbitrum and Solana endpoints exist in `.env` but return 403 until enabled in
the Alchemy dashboard.

## Supported networks

| `--network` | Chain id | Endpoint variable           | Explorer        | Default token (USDC) |
| ----------- | -------- | --------------------------- | --------------- | -------------------- |
| `ethereum`  | 1        | `ALCHEMY_ETH_ENDPOINT`      | etherscan.io    | `0xa0b8...eb48`      |
| `base`      | 8453     | `ALCHEMY_BASE_ENDPOINT`     | basescan.org    | `0x8335...2913`      |
| `arbitrum`  | 42161    | `ALCHEMY_ARBITRUM_ENDPOINT` | arbiscan.io     | `0xaf88...5831`      |
| `polygon`   | 137      | `ALCHEMY_POLYGON_ENDPOINT`  | polygonscan.com | `0x3c49...3359`      |

Aliases `eth`, `mainnet`, `arb` and `matic` are accepted. `solana` is rejected
with an explicit non-EVM error: Solana does not implement these JSON-RPC
methods, so it needs a separate collector.

Each network has its own endpoint. Do not send an Ethereum contract address to
another network and assume the result is the same asset.

## Authentication and limits

The endpoint URL contains the API key. Every recorded `sourceUrl` and every
error message is redacted to `/v2/<redacted>`; the key is never written to
output files or logs.

| Behavior      | Default                                                   |
| ------------- | --------------------------------------------------------- |
| Request rate  | 5 requests/second (200 ms gap), configurable with `--rps` |
| Timeout       | 30 s per request                                          |
| Retries       | 429, 5xx and JSON-RPC rate/capacity errors, up to 4 tries |
| Backoff       | `Retry-After` when present, otherwise exponential         |
| Max transfers | 1,000 per page (`--max-count`)                            |
| Max tokens    | 50 contracts per balances/token batch                     |

`ALCHEMY_REQUESTS_PER_SECOND` sets the default rate. Alchemy quotas are
compute-unit based, so a lower rate is safer for large transfer scans.

## Methods

| Operation            | Method                       | Notes                                    |
| -------------------- | ---------------------------- | ---------------------------------------- |
| Current block        | `eth_blockNumber`            | Pins `latest` before a transfer scan     |
| Token metadata       | `alchemy_getTokenMetadata`   | name, symbol, decimals, logo             |
| Runtime code         | `eth_getCode`                | hash, size and selector findings only    |
| Total supply         | `eth_call` with `0x18160ddd` | `totalSupply()`, converted with decimals |
| Wallet balances      | `alchemy_getTokenBalances`   | only the requested wallet and tokens     |
| Historical transfers | `alchemy_getAssetTransfers`  | bounded block range, paginated           |

Support is per network. A method that works on Polygon may be unavailable on
another chain or plan.

## CLI

| Mode        | Output                                                    |
| ----------- | --------------------------------------------------------- |
| `token`     | Metadata + bytecode analysis + total supply per `--token` |
| `code`      | Bytecode hash, size, proxy and selector findings          |
| `supply`    | `totalSupply()` converted with the contract's decimals    |
| `balances`  | Wallet balances for `--wallet` and the token list         |
| `transfers` | Bounded, checkpointed transfer scan                       |
| `all`       | `token` + `balances` when `--wallet` is set + `transfers` |

| Option                    | Meaning                                                                      |
| ------------------------- | ---------------------------------------------------------------------------- |
| `--network=ethereum`      | EVM network; defaults to Ethereum                                            |
| `--token=0x...`           | Token contract(s), comma separated; defaults to USDC on the selected network |
| `--wallet=0x...`          | Wallet for `balances`                                                        |
| `--from-block=N`          | First transfer block; bypasses the checkpoint                                |
| `--to-block=N`            | Last transfer block; defaults to the pinned latest                           |
| `--block-window=5000`     | First-run window when no checkpoint exists                                   |
| `--max-block-range=50000` | Rejects larger explicit ranges before requesting                             |
| `--max-count=100`         | Transfers per page, 1-1000                                                   |
| `--max-pages=1`           | Pages per scan, 1-100                                                        |
| `--categories=erc20`      | `external`, `internal`, `erc20`, `erc721`, `erc1155`, `specialnft`           |
| `--order=desc`            | `asc` or `desc`                                                              |
| `--checkpoint=true`       | Read and advance the transfer checkpoint file                                |
| `--enrich=true`           | Fetch metadata for non-zero balances                                         |
| `--rps=5`                 | Requests per second                                                          |
| `--output-dir=...`        | Default `collectors/assets/crypto/data`                                      |
| `--help`                  | Print usage                                                                  |

## Output files

```text
alchemy token_{network}_{address}.json
alchemy code_{network}_{address}.json
alchemy supply_{network}_{address}.json
alchemy balances_{network}_{wallet}.json
alchemy transfers_{network}_{address}_{from}-{to}.json
alchemy checkpoints.json
```

Outputs are normalized findings, not raw provider payloads. Bytecode is never
stored.

## Normalized records

### Token profile

`token_{network}_{address}.json` contains:

- `metadata`: name, symbol, decimals, logo, contract address, network, chain id,
  explorer URL, observation time and `isToken`.
- `contract`: bytecode hash, size, minimal-proxy detection, proxy-like
  evidence, ERC-20 selector findings and a note.
- `supply`: raw hex, decimals, decimal supply as a string, block tag/number,
  decimals source and caveats.
- `contractReference`: the record to merge into
  `assets.crypto.contract_addresses` — network, chain id, address, explorer
  link, optional `standard` and `standardConfidence`.
- `standardEvidence`: metadata flag, `totalSupply()` success and selector lists.
- `resolution`: `method: "contract_address"`, `verified: false`, because
  on-chain values do not establish canonical asset identity.

A metadata response with empty name/symbol is a plain account, not a
zero-decimal token. `isToken` is false in that case.

`standard` is only set to `ERC-20` when metadata reports a token, the
`totalSupply()` call returns data and decimals are positive. That is
deterministic evidence, but it is labelled `standardConfidence: "heuristic"`
because it is not checked against ERC-165 or verified source.

### Bytecode analysis

Only a SHA-256 hash of the runtime bytecode, its byte length, retrieval time
and deterministic findings are persisted. Bytecode is **not** Solidity source;
verified source requires a block explorer source-code API.

Selector detection searches the runtime hex for the four-byte selectors of
`name`, `symbol`, `decimals`, `totalSupply`, `balanceOf`, `transfer`,
`transferFrom`, `approve` and `allowance`. Finding a selector is evidence the
dispatcher may implement it, not proof of ERC-20 compliance, because the same
bytes can occur in data.

Proxy detection covers the EIP-1167 minimal-proxy runtime shape and the
`implementation()`, `upgradeTo()` and `upgradeToAndCall()` selectors. A
proxy-like contract can legitimately have no ERC-20 selectors in its runtime
code because they live in the implementation; the collector does not fetch the
implementation automatically.

### Supply

`0x18160ddd` calls `totalSupply()`. The result is a hexadecimal integer in the
token's smallest unit. It is converted with `BigInt` and the contract's
decimals, never a hardcoded 18. Output keeps both `rawValue` and the decimal
`totalSupply` string.

If the call returns `0x`, the contract may not implement the selector. If
decimals are unavailable, the raw integer is retained and no decimal supply is
invented.

### Wallet balances

`balances_{network}_{wallet}.json` keeps each token's raw hex balance and, for
non-zero balances, its decimals, formatted balance and metadata. A metadata
failure leaves the raw balance intact and records `metadataError`.

This endpoint answers only for the requested wallet and token contracts. It
does **not** enumerate all holders. Comprehensive holder distribution needs a
holder-indexing source or a separate indexer strategy.

### Transfers

`transfers_{network}_{address}_{from}-{to}.json` keeps:

- block number and hex value
- transaction hash, unique id and explorer link
- from/to, category, asset symbol and contract address
- raw value, decimals and formatted value
- provider float kept separately as `providerValue`
- block timestamp

Values are formatted from `rawContract.value` and `rawContract.decimal`, not
from the provider's floating-point `value`. A missing or invalid decimal count
leaves the formatted value null.

## Bounded scans and checkpoints

Historical scans never start from block zero by default.

- `--to-block` defaults to a **pinned** `eth_blockNumber` result, so pagination
  cannot drift while a scan runs.
- Without `--from-block`, the first run covers the last `--block-window` blocks
  (default 5,000) or resumes after the stored checkpoint.
- Explicit ranges larger than `--max-block-range` are rejected before a request
  is spent.
- Resuming from an old checkpoint that is more than `--max-block-range` blocks
  behind covers only `--max-block-range` blocks and advances the checkpoint to
  that boundary, so a long gap is walked in chunks instead of failing.
- A checkpoint is only advanced when pagination is exhausted
  (`nextPageKey === null`). If pages remain, the next run repeats the range.
- An explicit `--from-block` is treated as research of a fixed range and does
  not move the checkpoint.
- Checkpoints are stored per network, contract set and category set in
  `alchemy checkpoints.json`.

A transfer scan that hits `--max-pages` reports `truncated: true` and a
non-null `nextPageKey`. Increase `--max-pages` or rerun before expecting the
checkpoint to advance.

## Database mapping

The collector writes JSON only; a downstream writer owns database upserts.

| Target                             | Source                                                               |
| ---------------------------------- | -------------------------------------------------------------------- |
| `assets.crypto.contract_addresses` | `contractReference` plus metadata explorer URL                       |
| `assets.crypto.circulating_supply` | Not collected by Alchemy; use CoinGecko or another supply source     |
| `assets.crypto.total_supply`       | `supply.totalSupply`, only when decimals were established            |
| `assets.crypto.contract_analysis`  | `contract` (hash, size, proxy and selector evidence)                 |
| `assets.information`               | Transfer observations or summarized wallet activity when appropriate |

`assets.crypto` does not derive circulating supply from `totalSupply()`;
those are different values. Keep `circulating_supply` null unless a source
establishes it.

## Identity and evidence rules

- Contract metadata is network-specific. The same ticker on two chains is not
  automatically the same asset.
- Alchemy does not resolve canonical identity. Compare contract metadata with
  CoinGecko's stable id before merging.
- Never overwrite a manually verified contract address with an unverified
  provider match.
- Keep `sourceUrl`, observation time and block number so findings remain
  attributable.
- Bytecode hash and selector findings are evidence, not a compliance claim.
- Wallet and transfer observations do not prove holder distribution.

## Verification

```powershell
npx.cmd prettier --check "collectors/assets/crypto/alchemyFetchers.ts"
npx.cmd tsx tests/alchemy.normalization.test.ts
npx.cmd tsx collectors/assets/crypto/alchemyFetchers.ts --mode=token --network=polygon
npx.cmd tsx collectors/assets/crypto/alchemyFetchers.ts --mode=balances --network=polygon --wallet=0x...
npx.cmd tsx collectors/assets/crypto/alchemyFetchers.ts --mode=transfers --network=polygon --block-window=1000 --max-count=5 --max-pages=1
```

Live runs require an enabled network and a valid endpoint. An HTTP 403 with
"not enabled for this app" is a dashboard/network configuration issue, not a
request-shape bug.
