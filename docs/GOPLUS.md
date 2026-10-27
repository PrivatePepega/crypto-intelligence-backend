# GoPlus Security Intelligence

Collector for provider-reported EVM token risk indicators: source-code status,
proxy status, owner controls, mint/pause/blacklist permissions, taxes, honeypot
signals and DEX/CEX presence.

Script: `collectors/assets/crypto/goplusFetchers.ts`

Output: `collectors/assets/crypto/data/` with a `goplus ` file prefix.

```powershell
npx.cmd tsx collectors/assets/crypto/goplusFetchers.ts --mode=token --chain=1 --token=0xa0b8...
```

GoPlus is an external **security signal** provider. Its values are
provider-reported indicators, not proof that a token is malicious or safe, and
not a source of canonical asset identity. Always keep the observation time and
compare snapshots before drawing conclusions.

No API key is required for the public API used here.

## Endpoints

| Purpose         | Request                                                       |
| --------------- | ------------------------------------------------------------- |
| Discover chains | `GET /supported_chains`                                       |
| Token security  | `GET /token_security/{chain_id}?contract_addresses={address}` |

Base URL: `https://api.gopluslabs.io/api/v1`

`GOPLUS_BASE_URL` overrides the base URL if a mirror is used.
`GO_PLUS_ENDPOINT` in `.env` is a single example request with a hardcoded
contract address, so it is **not** used as a base URL.

## Supported chains

Support is decided by `/supported_chains`, not by a hardcoded table. The live
list held **46 chains, 44 with numeric EVM ids** on 2026-10-27.

- `--chain` accepts a numeric chain id (`1`, `137`, `42161`, `8453`, `56`) or a
  convenience alias (`ethereum`, `eth`, `bsc`, `polygon`, `matic`, `arbitrum`,
  `arb`, `optimism`, `base`, `avalanche`).
- A chain missing from the provider list is rejected with the list of supported
  EVM ids.
- `solana` and `tron` are rejected explicitly: this collector is built around EVM
  addresses. Those chains need a separate collector.
- Run `--mode=chains` to refresh the cached list in
  `goplus supported_chains.json`.

Each network has its own chain id. Do not send an Ethereum contract to another
chain id and assume the result describes the same asset.

## Observed API behavior (2026-10-27, free tier)

The API returns HTTP 200 even for application errors. The envelope is
`{ code, message, result }`:

| Envelope     | Meaning              | Collector behavior                  |
| ------------ | -------------------- | ----------------------------------- |
| `code: 1`    | Success              | Normalize the result                |
| `code: 2022` | Chain not supported  | Throw with the provider message     |
| `code: 4029` | Rate limited         | Back off and retry up to 4 attempts |
| `code: 5000` | Generic system error | Throw; usually an invalid address   |

Other observed behavior:

- An unknown contract returns `code: 1` with an empty `result` object. This is
  stored as `found: false` with every field null, **not** as a clean result.
- A multi-address request (`contract_addresses=a,b`, comma encoded or not)
  returned **one** entry. The collector therefore issues one request per
  contract. This is verified behavior, not a missing feature.
- Responses carry no rate-limit headers. The documented free limit is 30
  requests per minute; the collector enforces a 2 s gap by default.
- Moving `--rpm` above 30 triggers `code: 4029`; it is retried with exponential
  backoff (10 s base, 60 s cap), but it still costs time.
- Field presence varies by chain and token: 19 fields for USDC on Ethereum, 40
  for PEPE. Missing fields mean "not reported", never "no risk".
- `"transfer_tax": ""` means unknown, not 0.
- `owner_address: 0x000...000` means the owner is renounced.
- Addresses are returned lowercase regardless of request casing.

## CLI

| Mode      | Output                                                 |
| --------- | ------------------------------------------------------ |
| `chains`  | `/supported_chains` snapshot with EVM id list          |
| `token`   | One security record per contract, plus audit history   |
| `all`     | `chains` + `token`                                     |
| `compare` | Diff of the last two stored snapshots for one contract |

| Option                | Meaning                                        |
| --------------------- | ---------------------------------------------- |
| `--chain=1`           | Numeric EVM chain id or alias; default `1`     |
| `--token=0x...`       | Contract(s), comma separated                   |
| `--rpm=30`            | Requests per minute; free tier is 30           |
| `--history=true`      | Append a compact snapshot to the audit history |
| `--history-limit=200` | Snapshots kept per contract, 1-2000            |
| `--output-dir=...`    | Default `collectors/assets/crypto/data`        |
| `--help`              | Print usage                                    |

When `--token` is omitted, a default stablecoin is used for Ethereum (`1`), BSC
(`56`), Polygon (`137`), Base (`8453`) and Arbitrum (`42161`). Other chains
require `--token`.

## Output files

```text
goplus supported_chains.json
goplus security_{chainId}_{address}.json
goplus history_{chainId}_{address}.json
goplus change_{chainId}_{address}.json
```

`security_*.json` is the latest full record, including the raw provider entry.
`history_*.json` is a bounded list of compact snapshots used for change
detection. `change_*.json` is written only when the last two snapshots differ.

## Normalized record

The normalized schema follows the proposal in the task, with snake_case keys:

```json
{
  "provider": "goplus",
  "chain_id": "1",
  "chain_name": "Ethereum",
  "contract_address": "0x...",
  "token_name": "USD Coin",
  "token_symbol": "USDC",
  "checked_at": "2026-10-27T16:08:01.120Z",
  "source_url": "https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=0x...",
  "provider_code": 1,
  "provider_message": "OK",
  "found": true,
  "is_open_source": true,
  "is_proxy": true,
  "is_mintable": null,
  "owner_controls": {
    "owner_address": null,
    "owner_renounced": null,
    "owner_balance": null,
    "owner_percent": null,
    "creator_address": "0x95ba...3911",
    "creator_percent": 0,
    "can_take_back_ownership": null,
    "hidden_owner": null,
    "owner_change_balance": null,
    "selfdestruct": null,
    "external_call": null
  },
  "permissions": {
    "transfer_pausable": null,
    "is_blacklisted": null,
    "is_whitelisted": null,
    "trading_cooldown": null,
    "personal_slippage_modifiable": null,
    "slippage_modifiable": null,
    "anti_whale_modifiable": null,
    "is_anti_whale": null,
    "cannot_buy": null,
    "cannot_sell_all": null
  },
  "tax_indicators": {
    "buy_tax_percent": 0,
    "sell_tax_percent": 0,
    "transfer_tax_percent": null
  },
  "trading": {
    "is_honeypot": false,
    "honeypot_with_same_creator": false,
    "is_in_dex": true,
    "is_in_cex": true,
    "cex_list": ["Binance", "Coinbase"],
    "dexes": [
      {
        "name": "UniswapV3",
        "liquidity_type": "UniV3",
        "liquidity": "38556.54",
        "pair": "0x...",
        "pool_fee": "0.003"
      }
    ],
    "lp_holder_count": 77,
    "lp_total_supply": "28163713.006717445280785212"
  },
  "holders": { "count": 9357810 },
  "supply": { "provider_total_supply": "47479287875.263976" },
  "trust": {
    "trust_list": true,
    "is_airdrop_scam": null,
    "is_true_token": null,
    "is_verified": null,
    "fake_token": null,
    "other_potential_risks": null,
    "note": null
  },
  "risk_flags": [
    {
      "id": "proxy_contract",
      "severity": "info",
      "label": "Proxy contract",
      "evidence": "is_proxy=true"
    }
  ],
  "missing_fields": ["fake_token", "is_mintable", "note"],
  "security_summary": "GoPlus reported 1 risk indicator(s), ...",
  "limitations": ["Provider-reported indicators; not independently verified ..."],
  "raw": { "...": "provider entry verbatim" }
}
```

Every boolean is tri-state: `true`, `false` or `null`. Null means "not reported"
or "unparseable", never "safe". `missing_fields` lists documented provider fields
that this entry did not include, so a later normalization pass can see what was
absent rather than infer it.

`raw` is the provider entry verbatim, including `holders`, `lp_holders` and
`dex`. Normalized fields can be revised later without losing evidence.

### Field semantics

- `owner_controls.owner_renounced`: `true` when the reported owner is the zero
  address, `false` for a real address, `null` when the field is absent.
- `owner_controls.owner_address`: the real owner only; the zero address is never
  stored as an owner.
- `tax_indicators.*_percent`: numbers parsed from provider strings; `""`,
  `"n/a"` and values above 1000 become `null`.
- `trading.is_in_cex`: accepts both the object form
  `{listed, cex_list}` and the scalar form.
- `trading.dexes`: bounded to rows with at least one usable field.
- `holders.count` is the reported holder count. Holder addresses are not
  enumerated by this endpoint and are not copied into the normalized record.
- `supply.provider_total_supply` is GoPlus's decimal-adjusted string. It is
  **not** written to `assets.crypto.total_supply`; Alchemy holds the raw value
  and the contract's decimals.
- `provider_code` / `provider_message` preserve the envelope for audit.

## Risk flags

Flags are derived deterministically from explicit provider findings. A field
that is missing or unknown never produces a flag.

| Flag                           | Severity | Source                                   |
| ------------------------------ | -------- | ---------------------------------------- |
| `honeypot`                     | critical | `is_honeypot=true`                       |
| `owner_can_change_balance`     | critical | `owner_change_balance=true`              |
| `honeypot_same_creator`        | high     | `honeypot_with_same_creator=true`        |
| `cannot_buy`                   | high     | `cannot_buy=true`                        |
| `cannot_sell_all`              | high     | `cannot_sell_all=true`                   |
| `hidden_owner`                 | high     | `hidden_owner=true`                      |
| `owner_can_reclaim`            | high     | `can_take_back_ownership=true`           |
| `selfdestruct`                 | high     | `selfdestruct=true`                      |
| `high_sell_tax`                | high     | `sell_tax >= 10%`                        |
| `high_transfer_tax`            | high     | `transfer_tax >= 10%`                    |
| `airdrop_scam`                 | high     | `is_airdrop_scam=true`                   |
| `fake_token`                   | high     | `fake_token=true`                        |
| `not_true_token`               | high     | `is_true_token=false`                    |
| `external_call`                | medium   | `external_call=true`                     |
| `mintable`                     | medium   | `is_mintable=true`                       |
| `transfer_pausable`            | medium   | `transfer_pausable=true`                 |
| `blacklist`                    | medium   | `is_blacklisted=true`                    |
| `slippage_modifiable`          | medium   | `slippage_modifiable=true`               |
| `personal_slippage_modifiable` | medium   | `personal_slippage_modifiable=true`      |
| `closed_source`                | medium   | `is_open_source=false`                   |
| `high_buy_tax`                 | medium   | `buy_tax >= 10%`                         |
| `other_potential_risks`        | medium   | non-empty `other_potential_risks`        |
| `creator_holds_large_share`    | medium   | `creator_percent >= 10%`                 |
| `owner_holds_large_share`      | medium   | `owner_percent >= 10%`                   |
| `whitelist`                    | low      | `is_whitelisted=true`                    |
| `trading_cooldown`             | low      | `trading_cooldown=true`                  |
| `anti_whale_modifiable`        | low      | `anti_whale_modifiable=true`             |
| `anti_whale`                   | low      | `is_anti_whale=true`                     |
| `no_dex_market`                | low      | `is_in_dex=false`                        |
| `no_liquidity_providers`       | low      | `is_in_dex=true` and `lp_holder_count=0` |
| `proxy_contract`               | info     | `is_proxy=true`                          |
| `provider_note`                | info     | non-empty `note`                         |

Tax and ownership thresholds (10%) are chosen by this collector, not by GoPlus,
and the evidence text says so. A proxy is not inherently malicious; the info
flag exists so the contract shape is visible.

## Security summary

`security_summary` is a short deterministic sentence, not an AI interpretation.

- **No entry:** states that GoPlus returned nothing and that no conclusion about
  safety can be drawn.
- **Entry with no flags:** "GoPlus reported no risk indicator matching this
  collector's checks." It then states source, proxy and owner state, and ends
  with "Absence of flags is not evidence that the token is safe."
- **Entry with flags:** states the count, the highest severity, the first four
  flag ids (plus "and N more"), then source/proxy/owner state and the caveat
  that provider indicators are not proof of malicious behaviour.

The summary never asserts that a token is safe.

## Snapshots and change detection

`--mode=token` appends a compact snapshot to
`goplus history_{chainId}_{address}.json` unless `--history=false`.

Snapshots track owner identity and renouncement, owner privileges, mint/pause/
blacklist permissions, honeypot signals, taxes and risk-flag ids. They exclude
the raw entry and the timestamp-only fields used for diffing.

`--mode=compare` reads the last two snapshots:

```powershell
npx.cmd tsx collectors/assets/crypto/goplusFetchers.ts --mode=compare --chain=1 --token=0xa0b8...
```

- Identical snapshots report "no material change" and write nothing.
- Differences write `goplus change_{chainId}_{address}.json` with
  `{field, before, after}` entries and print them.
- History is capped by `--history-limit`. The latest full record is never
  truncated.
- If a history file is unreadable, the collector warns and leaves it untouched
  instead of overwriting it.

Refreshing is a scheduling concern. There is no job infrastructure in this
collector yet; a periodic run plus `compare` is the intended pattern.

## Database mapping

The collector writes JSON only; a downstream writer owns database upserts.

| Target                             | Source                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `assets.crypto.contract_analysis`  | Merge `risk_flags`, `owner_controls`, `permissions`, `tax_indicators`, `trading`, `checked_at`, `missing_fields` under a `goplus` key |
| `assets.crypto.security_summary`   | `security_summary`                                                                                                                    |
| `assets.information`               | One row per observation, `information_type: 'event'`, `data` = compact snapshot                                                       |
| `assets.crypto.total_supply`       | Not from GoPlus; use Alchemy's raw value plus decimals                                                                                |
| `assets.crypto.contract_addresses` | Not authoritative; GoPlus reports the address you queried                                                                             |

`assets.information.information_type` is constrained to
`news`, `event`, `sentiment`, `market_snapshot`, `market_analysis` and
`macro_context`; `event` is the closest fit for a security observation. Store
`source = 'goplus'`, `source_url` and `observed_at = checked_at`.

`contract_analysis` is also used by the Alchemy collector for bytecode metadata.
Merge under a provider key instead of replacing the object, or the bytecode
evidence is lost.

## Limitations

- Indicators are provider-reported and not independently verified.
- The provider does not model every attack; a clean result is not proof of
  safety.
- Missing or unknown fields normalize to null rather than false.
- One contract per request because multi-address requests returned one entry.
- Free tier is 30 requests per minute; bulk scans need pacing or a paid plan.
- Holder addresses are not enumerated; only the reported count is stored.
- GoPlus `total_supply` is decimal-adjusted by the provider and not used as a
  canonical supply value.
- Change detection only covers the tracked snapshot fields. Raw provider changes
  outside those fields are visible in the latest record but not diffed.

## Verification

```powershell
npx.cmd prettier --check "collectors/assets/crypto/goplusFetchers.ts"
npx.cmd tsx tests/goplus.normalization.test.ts
npx.cmd tsx collectors/assets/crypto/goplusFetchers.ts --mode=chains
npx.cmd tsx collectors/assets/crypto/goplusFetchers.ts --mode=token --chain=1 --token=0xa0b8...
npx.cmd tsx collectors/assets/crypto/goplusFetchers.ts --mode=compare --chain=1 --token=0xa0b8...
```
