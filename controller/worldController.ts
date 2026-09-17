import type { Request, Response, NextFunction, Errback } from 'express'
import { fetchIGSentiment } from '../collectors/IG/sentimentFetcher.js';
import { fetchBinancePositioning } from '../collectors/binance/binanceFetcher.js';










const test = async(req: Request, res: Response) => {
    try {


      const data = await fetchBinancePositioning("full")

  
      res.json({
        data,
      });
    } catch (error) {
        console.error("macro error:", error);
      
        res.status(500).json({
          error: error instanceof Error ? error.message : error,
        });
      }
  }










export { test}