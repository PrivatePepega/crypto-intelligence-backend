import {
  type CoinGeckoAssetProfile,
  type CoinGeckoMarketSnapshotData,
  type CoinGeckoInformationRecord,
  type CoinGeckoOhlcCandle,
  type CoinGeckoOhlcParseResult,
  type CoinGeckoMarketChartReport,
  normalizeCoinProfile,
  normalizeMarketChart,
  normalizeOhlcRows,
  type CoinGeckoContractAddress,
  type CoinGeckoMarketSnapshotRecord,
} from "../../collectors/assets/crypto/coingeckoFetchers.js";
import {
  type AlchemyTokenMetadataRecord,
  type AlchemyContractAnalysis,
  type AlchemyTokenSupplyRecord,
  type AlchemyTokenProfile,
  normalizeTokenMetadata,
  analyzeContractBytecode,
  normalizeTokenSupply,
  type AlchemyTokenMetadataRecord as AlchemyTokenMetadataRecordType,
} from "../../collectors/assets/crypto/alchemyFetchers.js";
import {
  type GoPlusTokenSecurityRecord,
  type GoPlusSecuritySnapshot,
  normalizeTokenSecurity,
  buildSecuritySnapshot,
  type GoPlusSecurityContext,
} from "../../collectors/assets/crypto/goplusFetchers.js";
import type {
  CryptoProfile,
  CryptoMarketSnapshot,
  CryptoPriceHistory,
  CryptoCandle,
  CryptoTokenomics,
  CryptoSocials,
  CryptoContractMetadata,
  CryptoContractAnalysis,
  CryptoTokenSupply,
  CryptoSecurityRecord,
  CryptoSecuritySnapshot,
  CryptoIdentity,
  CryptoDeployment,
} from "../../types/crypto/crypto.types.js";

/* -------------------------------------------------------------------------- */
/*                              CoinGecko Normalizers                         */
/* -------------------------------------------------------------------------- */

/**
 * Converts a CoinGecko profile into our canonical CryptoProfile.
 */
export function normalizeCryptoProfile(profile: CoinGeckoAssetProfile): CryptoProfile {
  const asset = profile.asset;
  const crypto = profile.crypto;

  const tokenomics: CryptoTokenomics = {
    categories: crypto.tokenomics.categories,
    genesisDate: crypto.tokenomics.genesisDate,
    hashingAlgorithm: crypto.tokenomics.hashingAlgorithm,
    blockTimeMinutes: crypto.tokenomics.blockTimeInMinutes,
    hasSupplyBreakdown: crypto.tokenomics.hasSupplyBreakdown,
    circulatingSupply: crypto.circulatingSupply,
    totalSupply: crypto.totalSupply,
    maxSupply: crypto.maxSupply,
    maxSupplyInfinite: null, // Not directly from CoinGecko profile
  };

  const socials: CryptoSocials = {
    homepage: crypto.socials.homepage,
    whitepaper: crypto.socials.whitepaper,
    blockchainSites: crypto.socials.blockchainSites,
    officialForumUrls: crypto.socials.officialForumUrls,
    chatUrls: crypto.socials.chatUrls,
    announcementUrls: crypto.socials.announcementUrls,
    twitter: crypto.socials.twitter,
    telegram: crypto.socials.telegram,
    subreddit: crypto.socials.subreddit,
    repos: {
      github: crypto.socials.repos.github,
      bitbucket: crypto.socials.repos.bitbucket,
    },
  };

  return {
    assetId: "",
    symbol: asset.symbol.toUpperCase(),
    name: asset.name,
    network: crypto.network,
    coingeckoId: asset.externalIds.coingecko_id,
    description: asset.description,
    category: asset.category,
    logoUrl: asset.logoUrl,
    websiteUrl: asset.websiteUrl,
    genesisDate: crypto.tokenomics.genesisDate,
    hashingAlgorithm: crypto.tokenomics.hashingAlgorithm,
    blockTimeMinutes: crypto.tokenomics.blockTimeInMinutes,
    providerData: {
      coingecko: {
        asset: profile.asset,
        crypto: profile.crypto,
        market: profile.market,
        fetchedAt: profile.fetchedAt,
        observedAt: profile.observedAt,
      },
    },
    updatedAt: profile.fetchedAt,
  };
}

/**
 * Converts a CoinGecko market snapshot into our canonical CryptoMarketSnapshot.
 */
export function normalizeCryptoMarketSnapshot(
  snapshot: CoinGeckoMarketSnapshotRecord,
  sourceUrl: string,
  observedAt: string,
  collectedAt: string,
): CryptoMarketSnapshot {
  const data = snapshot.information.data;
  return {
    provider: "CoinGecko",
    coingeckoId: data.coingeckoId,
    vsCurrency: data.vsCurrency,
    currentPrice: data.currentPrice,
    marketCap: data.marketCap,
    fullyDilutedValuation: data.fullyDilutedValuation,
    marketCapRank: data.marketCapRank,
    totalVolume: data.totalVolume,
    totalValueLocked: data.totalValueLocked,
    high24h: data.high24h,
    low24h: data.low24h,
    priceChange24h: data.priceChange24h,
    priceChangePercentage24h: data.priceChangePercentage24h,
    priceChangePercentage7d: data.priceChangePercentage7d,
    priceChangePercentage30d: data.priceChangePercentage30d,
    marketCapChange24h: data.marketCapChange24h,
    marketCapChangePercentage24h: data.marketCapChangePercentage24h,
    ath: data.ath,
    athDate: data.athDate,
    athChangePercentage: data.athChangePercentage,
    atl: data.atl,
    atlDate: data.atlDate,
    atlChangePercentage: data.atlChangePercentage,
    circulatingSupply: data.circulatingSupply,
    totalSupply: data.totalSupply,
    maxSupply: data.maxSupply,
    maxSupplyInfinite: data.maxSupplyInfinite,
    lastUpdated: data.lastUpdated,
    sourceUrl,
    observedAt,
    collectedAt,
  };
}

/**
 * Converts CoinGecko OHLC candles into our canonical CryptoCandle array.
 */
export function normalizeCryptoOhlcCandles(
  ohlcReport: { candles: CoinGeckoOhlcCandle[]; coingeckoId: string; vsCurrency: string },
  requested: { from: string | null; to: string | null },
): CryptoPriceHistory {
  const candles: CryptoCandle[] = ohlcReport.candles.map((c) => ({
    symbol: "", // Will be filled by caller
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    quoteCurrency: c.quoteCurrency,
    interval: c.interval ?? "1d",
  }));

  return {
    provider: "CoinGecko",
    coingeckoId: ohlcReport.coingeckoId,
    contractAddress: null,
    network: null,
    vsCurrency: ohlcReport.vsCurrency,
    interval: "1d",
    fetchedAt: new Date().toISOString(),
    requested,
    candles,
    rejected: [],
    duplicatesRemoved: 0,
    coverage: {
      earliestCandle: candles[0]?.timestamp ?? null,
      latestCandle: candles[candles.length - 1]?.timestamp ?? null,
      expectedCount: null,
      actualCount: candles.length,
      gaps: [],
    },
  };
}

/**
 * Converts CoinGecko market chart observations into our canonical CryptoPriceHistory.
 * Note: These are observations (price/market-cap/volume), NOT OHLC candles.
 * They should be stored in assets.information, not asset_price_history.
 */
export function normalizeCryptoMarketChart(
  chartReport: CoinGeckoMarketChartReport,
  requested: { from: string | null; to: string | null },
): CryptoPriceHistory {
  // Market chart observations are not candles - they're scalar observations
  // Return empty candles array since these are not OHLC data
  return {
    provider: "CoinGecko",
    coingeckoId: chartReport.coingeckoId,
    contractAddress: null,
    network: null,
    vsCurrency: chartReport.vsCurrency,
    interval: "1d",
    fetchedAt: chartReport.fetchedAt,
    requested,
    candles: [],
    rejected: [],
    duplicatesRemoved: 0,
    coverage: {
      earliestCandle: chartReport.observations[0]?.observedAt ?? null,
      latestCandle: chartReport.observations[chartReport.observations.length - 1]?.observedAt ?? null,
      expectedCount: null,
      actualCount: chartReport.observations.length,
      gaps: [],
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                              Alchemy Normalizers                           */
/* -------------------------------------------------------------------------- */

/**
 * Converts Alchemy token metadata into our canonical CryptoContractMetadata.
 */
export function normalizeCryptoContractMetadata(
  metadata: AlchemyTokenMetadataRecord,
): CryptoContractMetadata {
  return {
    network: metadata.network,
    chainId: metadata.chainId,
    contractAddress: metadata.contractAddress,
    name: metadata.name,
    symbol: metadata.symbol,
    decimals: metadata.decimals,
    logoUrl: metadata.logoUrl,
    isToken: metadata.isToken,
    explorerUrl: metadata.explorerUrl,
    verified: false, // Alchemy metadata is provider-reported, not independently verified
    source: "Alchemy",
    observedAt: metadata.observedAt,
  };
}

/**
 * Converts Alchemy contract analysis into our canonical CryptoContractAnalysis.
 */
export function normalizeCryptoContractAnalysis(
  analysis: AlchemyContractAnalysis,
): CryptoContractAnalysis {
  return {
    network: analysis.network,
    chainId: analysis.chainId,
    contractAddress: analysis.contractAddress,
    isContract: analysis.isContract,
    bytecodeHash: analysis.bytecodeHash,
    hashAlgorithm: analysis.hashAlgorithm,
    bytecodeBytes: analysis.bytecodeBytes,
    isMinimalProxy: analysis.isMinimalProxy,
    minimalProxyImplementation: analysis.minimalProxyImplementation,
    isProxyLike: analysis.isProxyLike,
    proxyEvidence: analysis.proxyEvidence,
    selectorsPresent: analysis.selectorsPresent,
    selectorsMissing: analysis.selectorsMissing,
    note: analysis.note,
    source: "Alchemy",
    retrievedAt: analysis.retrievedAt,
    explorerUrl: analysis.explorerUrl,
  };
}

/**
 * Converts Alchemy token supply into our canonical CryptoTokenSupply.
 */
export function normalizeCryptoTokenSupply(
  supply: AlchemyTokenSupplyRecord,
): CryptoTokenSupply {
  return {
    network: supply.network,
    chainId: supply.chainId,
    contractAddress: supply.contractAddress,
    blockTag: supply.blockTag,
    blockNumber: supply.blockNumber,
    callData: supply.callData,
    rawValue: supply.rawValue,
    decimals: supply.decimals,
    decimalsSource: supply.decimalsSource,
    totalSupply: supply.totalSupply,
    note: supply.note,
    source: "Alchemy",
    observedAt: supply.observedAt,
    explorerUrl: supply.explorerUrl,
  };
}

/* -------------------------------------------------------------------------- */
/*                              GoPlus Normalizers                            */
/* -------------------------------------------------------------------------- */

/**
 * Converts GoPlus security record into our canonical CryptoSecurityRecord.
 */
export function normalizeCryptoSecurityRecord(
  security: GoPlusTokenSecurityRecord,
): CryptoSecurityRecord {
  return {
    provider: "GoPlus",
    chainId: security.chain_id,
    chainName: security.chain_name,
    contractAddress: security.contract_address,
    tokenName: security.token_name,
    tokenSymbol: security.token_symbol,
    checkedAt: security.checked_at,
    sourceUrl: security.source_url,
    providerCode: security.provider_code,
    providerMessage: security.provider_message,
    found: security.found,
    isOpenSource: security.is_open_source,
    isProxy: security.is_proxy,
    isMintable: security.is_mintable,
    ownerControls: {
      ownerAddress: security.owner_controls.owner_address,
      ownerRenounced: security.owner_controls.owner_renounced,
      ownerBalance: security.owner_controls.owner_balance,
      ownerPercent: security.owner_controls.owner_percent,
      creatorAddress: security.owner_controls.creator_address,
      creatorPercent: security.owner_controls.creator_percent,
      canTakeBackOwnership: security.owner_controls.can_take_back_ownership,
      hiddenOwner: security.owner_controls.hidden_owner,
      ownerChangeBalance: security.owner_controls.owner_change_balance,
      selfdestruct: security.owner_controls.selfdestruct,
      externalCall: security.owner_controls.external_call,
    },
    permissions: {
      transferPausable: security.permissions.transfer_pausable,
      isBlacklisted: security.permissions.is_blacklisted,
      isWhitelisted: security.permissions.is_whitelisted,
      tradingCooldown: security.permissions.trading_cooldown,
      personalSlippageModifiable: security.permissions.personal_slippage_modifiable,
      slippageModifiable: security.permissions.slippage_modifiable,
      antiWhaleModifiable: security.permissions.anti_whale_modifiable,
      isAntiWhale: security.permissions.is_anti_whale,
      cannotBuy: security.permissions.cannot_buy,
      cannotSellAll: security.permissions.cannot_sell_all,
    },
    taxIndicators: {
      buyTaxPercent: security.tax_indicators.buy_tax_percent,
      sellTaxPercent: security.tax_indicators.sell_tax_percent,
      transferTaxPercent: security.tax_indicators.transfer_tax_percent,
    },
    trading: {
      isHoneypot: security.trading.is_honeypot,
      honeypotWithSameCreator: security.trading.honeypot_with_same_creator,
      isInDex: security.trading.is_in_dex,
      isInCex: security.trading.is_in_cex,
      cexList: security.trading.cex_list,
      dexes: security.trading.dexes.map((d) => ({
        name: d.name,
        liquidityType: d.liquidity_type,
        liquidity: d.liquidity,
        pair: d.pair,
        poolFee: d.pool_fee,
      })),
      lpHolderCount: security.trading.lp_holder_count,
      lpTotalSupply: security.trading.lp_total_supply,
    },
    trust: {
      trustList: security.trust.trust_list,
      isAirdropScam: security.trust.is_airdrop_scam,
      isTrueToken: security.trust.is_true_token,
      isVerified: security.trust.is_verified,
      fakeToken: security.trust.fake_token,
      otherPotentialRisks: security.trust.other_potential_risks,
      note: security.trust.note,
    },
    riskFlags: security.risk_flags,
    missingFields: security.missing_fields,
    securitySummary: security.security_summary,
    limitations: security.limitations,
    raw: security.raw,
    holders: { count: security.holders.count },
    supply: { providerTotalSupply: security.supply.provider_total_supply },
  };
}

/**
 * Converts GoPlus security record into a compact snapshot for history storage.
 */
export function normalizeCryptoSecuritySnapshot(
  security: GoPlusTokenSecurityRecord,
): CryptoSecuritySnapshot {
  const snapshot = buildSecuritySnapshot(security);
  return {
    checkedAt: snapshot.checked_at,
    isOpenSource: snapshot.is_open_source,
    isProxy: snapshot.is_proxy,
    isMintable: snapshot.is_mintable,
    ownerAddress: snapshot.owner_address,
    ownerRenounced: snapshot.owner_renounced,
    ownerCanTakeBackOwnership: snapshot.owner_can_take_back_ownership,
    ownerHidden: snapshot.owner_hidden,
    ownerCanChangeBalance: snapshot.owner_can_change_balance,
    transferPausable: snapshot.transfer_pausable,
    isBlacklisted: snapshot.is_blacklisted,
    isWhitelisted: snapshot.is_whitelisted,
    tradingCooldown: snapshot.trading_cooldown,
    personalSlippageModifiable: snapshot.personal_slippage_modifiable,
    slippageModifiable: snapshot.slippage_modifiable,
    antiWhaleModifiable: snapshot.anti_whale_modifiable,
    isAntiWhale: snapshot.is_anti_whale,
    cannotBuy: snapshot.cannot_buy,
    cannotSellAll: snapshot.cannot_sell_all,
    isHoneypot: snapshot.is_honeypot,
    honeypotWithSameCreator: snapshot.honeypot_with_same_creator,
    buyTaxPercent: snapshot.buy_tax_percent,
    sellTaxPercent: snapshot.sell_tax_percent,
    transferTaxPercent: snapshot.transfer_tax_percent,
    riskFlagIds: snapshot.risk_flag_ids,
    securitySummary: snapshot.security_summary,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Composite Helpers                             */
/* -------------------------------------------------------------------------- */

/**
 * Merges contract metadata from multiple networks into the identity's deployments.
 */
export function mergeDeploymentsWithMetadata(
  identity: CryptoIdentity,
  metadataRecords: CryptoContractMetadata[],
): CryptoIdentity {
  const deployments = { ...identity.deployments };

  for (const meta of metadataRecords) {
    const network = meta.network;
    const existing = deployments[network];

    deployments[network] = {
      network,
      chainId: meta.chainId,
      contractAddress: meta.contractAddress,
      decimals: meta.decimals ?? existing?.decimals ?? null,
      isNative: existing?.isNative ?? false,
      verified: existing?.verified ?? false,
      source: "Alchemy",
      explorerUrl: meta.explorerUrl,
    };
  }

  return { ...identity, deployments };
}

/**
 * Builds a complete CryptoIdentity from CoinGecko profile + Alchemy metadata.
 */
export function buildCryptoIdentity(
  profile: CoinGeckoAssetProfile,
  alchemyMetadata: CryptoContractMetadata[] = [],
): CryptoIdentity {
  const baseIdentity = {
    assetId: "",
    symbol: profile.asset.symbol.toUpperCase(),
    name: profile.asset.name,
    network: profile.crypto.network,
    coingeckoId: profile.asset.externalIds.coingecko_id,
    deployments: {} as Record<string, CryptoDeployment>,
    providerIds: {
      coingecko: {
        id: profile.asset.externalIds.coingecko_id,
        ...profile.asset.externalIds.other_provider_ids,
      },
    },
  };

  // Start with CoinGecko contract mappings
  for (const ca of profile.crypto.contractAddresses) {
    const network = ca.network.toLowerCase();
    baseIdentity.deployments[network] = {
      network,
      chainId: null,
      contractAddress: ca.address,
      decimals: ca.decimalPlace,
      isNative: false,
      verified: ca.verified,
      source: "CoinGecko",
      explorerUrl: `https://www.coingecko.com/en/coins/${network}/contract/${ca.address}`,
    };
  }

  // Add native asset if no contract mappings
  if (Object.keys(baseIdentity.deployments).length === 0 && profile.crypto.network) {
    baseIdentity.deployments[profile.crypto.network.toLowerCase()] = {
      network: profile.crypto.network.toLowerCase(),
      chainId: null,
      contractAddress: "",
      decimals: null,
      isNative: true,
      verified: true,
      source: "Manual",
      explorerUrl: null,
    };
  }

  // Merge Alchemy metadata (overwrites decimals, adds chainId, verified status)
  return mergeDeploymentsWithMetadata(baseIdentity, alchemyMetadata);
}