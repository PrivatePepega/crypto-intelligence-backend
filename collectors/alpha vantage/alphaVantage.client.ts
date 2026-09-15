import axios from "axios";

export const alphaVantageClient = axios.create({
  baseURL: "https://www.alphavantage.co/query",
  params: {
    apikey: process.env.ALPHA_VANTAGE_API_KEY,
  },
});