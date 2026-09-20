import type { Request, Response, NextFunction, Errback } from 'express'



import { collectAllSosoValueEtfs } from '../collectors/sosoValue/spotETFfetcher.js';










const test = async(req: Request, res: Response) => {
    try {


      const data = await collectAllSosoValueEtfs("latest")

  
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