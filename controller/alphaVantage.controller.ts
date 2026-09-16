import type { Request, Response, NextFunction, Errback } from 'express'
import { getFxData } from '../collectors/alpha vantage/fx/fx.js';
import { getCommodityData } from '../collectors/alpha vantage/commodities/commodities.js';









const alphaVantageMacro = async(req: Request, res: Response) => {
    try {


      const data = await getCommodityData("latest")

  
      res.json({
        data,
      });
    } catch (error) {
        console.error("FRED macro error:", error);
      
        res.status(500).json({
          error: error instanceof Error ? error.message : error,
        });
      }
  }










export { alphaVantageMacro}