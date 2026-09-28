import {
  mergeBinanceDailyPositioning,
  isBinanceDailyComplete,
  selectBinancePositioningPayload,
  type BinanceLongShortPoint,
  type BinancePositioningHistory,
} from "../database/injection/config/binancePositioning.js";

const longShort = (date: string) => ({
  symbol: "BTCUSDT",
  longAccount: "60.5",
  longShortRatio: "1.53",
  shortAccount: "39.5",
  date,
});

// 3 days for most sources; taker is missing 2026-09-02; funding has two
// settlements on 2026-09-02 and one blank longAccount on 2026-09-03.
const payload: BinancePositioningHistory = {
  symbol: "BTCUSDT",
  globalLongShort: [
    longShort("2026-09-01"),
    longShort("2026-09-02"),
    longShort("2026-09-03"),
  ],
  topAccount: [longShort("2026-09-01"), longShort("2026-09-02"), longShort("2026-09-03")],
  topPosition: [longShort("2026-09-01"), longShort("2026-09-02"), longShort("2026-09-03")],
  openInterest: [
    { symbol: "BTCUSDT", sumOpenInterest: "1000", sumOpenInterestValue: "65000000", CMCCirculatingSupply: "19900000", date: "2026-09-01" },
    { symbol: "BTCUSDT", sumOpenInterest: "1100", sumOpenInterestValue: "66000000", CMCCirculatingSupply: "19900000", date: "2026-09-02" },
    { symbol: "BTCUSDT", sumOpenInterest: "1200", sumOpenInterestValue: "67000000", CMCCirculatingSupply: "19900000", date: "2026-09-03" },
  ],
  funding: [
    { symbol: "BTCUSDT", fundingRate: "0.0001", markPrice: "65000", rateType: "PERIODIC", date: "2026-09-01" },
    { symbol: "BTCUSDT", fundingRate: "0.0002", markPrice: "65100", rateType: "PERIODIC", date: "2026-09-02" },
    { symbol: "BTCUSDT", fundingRate: "0.0009", markPrice: "65200", rateType: "PERIODIC", date: "2026-09-02" },
    { symbol: "BTCUSDT", fundingRate: "0.0003", markPrice: "65300", rateType: "PERIODIC", date: "2026-09-03" },
  ],
  taker: [
    { buySellRatio: "1.10", sellVol: "500", buyVol: "550", date: "2026-09-01" },
    { buySellRatio: "1.20", sellVol: "600", buyVol: "720", date: "2026-09-03" },
  ],
};

const other: BinancePositioningHistory = { ...payload, symbol: "ETHUSDT" };

const selected = selectBinancePositioningPayload([other, payload], "BTCUSDT");
console.log("1. selectBinancePositioningPayload picks the right symbol:", selected?.symbol === "BTCUSDT" ? "PASS" : "FAIL");
console.log("   unknown symbol returns undefined:", selectBinancePositioningPayload([payload], "DOGEUSDT") === undefined ? "PASS" : "FAIL");

const rows = mergeBinanceDailyPositioning(payload);
const dates = rows.map((r) => r.date);
console.log("\n2. only dates present in all six sources are emitted");
console.log("   dates:", JSON.stringify(dates), dates.length === 2 ? "PASS" : "FAIL");
console.log("   excludes 09-02 (taker missing):", !dates.includes("2026-09-02") ? "PASS" : "FAIL");
console.log("   ascending order:", JSON.stringify(dates) === JSON.stringify([...dates].sort()) ? "PASS" : "FAIL");

const sep2 = rows.find((r) => r.date === "2026-09-01")!;
const sep3 = rows.find((r) => r.date === "2026-09-03")!;
console.log("\n3. per-source date columns are carried through");
console.log("   09-01 globalDate/openInterestDate/takerDate:",
  sep2.globalDate === "2026-09-01" && sep2.openInterestDate === "2026-09-01" && sep2.takerDate === "2026-09-01" ? "PASS" : "FAIL");

console.log("\n4. strings converted to numbers");
console.log("   globalLongAccount 60.5:", sep2.globalLongAccount === 60.5 ? "PASS" : `FAIL (${sep2.globalLongAccount})`);
console.log("   sumOpenInterest 1000:", sep2.sumOpenInterest === 1000 ? "PASS" : `FAIL (${sep2.sumOpenInterest})`);
console.log("   fundingRateType is a string:", sep2.fundingRateType === "PERIODIC" ? "PASS" : "FAIL");

console.log("\n5. last funding settlement of the day wins (8h feed)");
const blank = mergeBinanceDailyPositioning({
  ...payload,
  globalLongShort: [longShort("2026-09-02")],
  topAccount: [longShort("2026-09-02")],
  topPosition: [longShort("2026-09-02")],
  taker: [{ buySellRatio: "1.2", sellVol: "600", buyVol: "720", date: "2026-09-02" }],
});
const d2 = blank[0]!;
console.log("   picked 0.0009 not 0.0002:", d2.fundingRate === 0.0009 ? "PASS" : `FAIL (${d2.fundingRate})`);

console.log("\n6. completeness guard");
console.log("   good row is complete:", isBinanceDailyComplete(sep2) ? "PASS" : "FAIL");

// Number("") is 0, not NaN, so the merge must map blanks to NaN itself.
const blanked = mergeBinanceDailyPositioning({
  ...payload,
  globalLongShort: [{ ...longShort("2026-09-04"), longAccount: "" }],
  topAccount: [longShort("2026-09-04")],
  topPosition: [longShort("2026-09-04")],
  openInterest: [{ symbol: "BTCUSDT", sumOpenInterest: "1000", sumOpenInterestValue: "65", CMCCirculatingSupply: "1", date: "2026-09-04" }],
  funding: [{ symbol: "BTCUSDT", fundingRate: "0.0001", markPrice: "65000", rateType: "PERIODIC", date: "2026-09-04" }],
  taker: [{ buySellRatio: "1.1", sellVol: "500", buyVol: "550", date: "2026-09-04" }],
})[0]!;

console.log("   blank upstream cell becomes NaN, not 0:", Number.isNaN(blanked.globalLongAccount) ? "PASS" : `FAIL (${blanked.globalLongAccount})`);
console.log("   blanked row is rejected by the guard:", isBinanceDailyComplete(blanked) === false ? "PASS" : "FAIL");
const single = (overrides: Partial<BinanceLongShortPoint> = {}) => {
  const d = "2026-09-05";
  return mergeBinanceDailyPositioning({
    ...payload,
    globalLongShort: [{ ...longShort(d), ...overrides }],
    topAccount: [longShort(d)],
    topPosition: [longShort(d)],
    openInterest: [{ symbol: "BTCUSDT", sumOpenInterest: "1000", sumOpenInterestValue: "65", CMCCirculatingSupply: "1", date: d }],
    funding: [{ symbol: "BTCUSDT", fundingRate: "0.0001", markPrice: "65000", rateType: "PERIODIC", date: d }],
    taker: [{ buySellRatio: "1.1", sellVol: "500", buyVol: "550", date: d }],
  })[0]!;
};

console.log("   whitespace-only cell is rejected too:",
  isBinanceDailyComplete(single({ longAccount: "   " })) === false ? "PASS" : "FAIL");
console.log("   a real 0 is still accepted:",
  isBinanceDailyComplete(single({ longAccount: "0" })) ? "PASS" : "FAIL");
console.log("   09-02 is absent because taker had no reading for it, so no partial day is written:",
  !dates.includes("2026-09-02") ? "PASS" : "FAIL");
console.log("   09-03 IS present because all six sources had a reading:",
  dates.includes("2026-09-03") ? "PASS" : "FAIL");
