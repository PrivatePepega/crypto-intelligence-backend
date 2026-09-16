import type { Request, Response, NextFunction, Errback } from 'express'

import { getAaiiSentiment } from '../utils/aaii/aaiiSentiment.js';









const aaiiSentiment = async(req: Request, res: Response) => {
    try {


      const data = await getAaiiSentiment("latest")

  
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










export { aaiiSentiment}