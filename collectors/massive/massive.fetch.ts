import type { FundingCondition, Inflation, InflationExpectation, LaborMarket, MassiveResponse, TreasuryYield } from "../../types/massive.types.js";
import {massiveFetch} from "./massive.client.js"



export async function getTreasuryYields(
    params: Record<string, string> = {}
  ) {
    return massiveFetch<MassiveResponse<TreasuryYield>>("/fed/v1/treasury-yields", params);
  }
  
  export async function getInflation(
    params: Record<string, string> = {}
  ) {
    return massiveFetch<MassiveResponse<Inflation>>("/fed/v1/inflation", params);
  }
  
  export async function getInflationExpectations(
    params: Record<string, string> = {}
  ) {
    return massiveFetch<MassiveResponse<InflationExpectation>>("/fed/v1/inflation-expectations", params);
  }
  
  export async function getLaborMarket(
    params: Record<string, string> = {}
  ) {
    return massiveFetch<MassiveResponse<LaborMarket>>("/fed/v1/labor-market", params);
  }
  
  export async function getFundingConditions(
    params: Record<string, string> = {}
  ) {
    return massiveFetch<MassiveResponse<FundingCondition>>("/fed/v1/funding-conditions", params);
  }