import type { Request, Response, NextFunction, Errback } from 'express'

import { getVix } from '../collectors/fred/Risk Sentiment/VIX.js';









const fredMacro = async(req: Request, res: Response) => {
    try {


      const data = await getVix("latest")

  
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










export { fredMacro}