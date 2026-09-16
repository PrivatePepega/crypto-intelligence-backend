import type { Request, Response, NextFunction, Errback } from 'express'

import { fetchCftcTff } from '../utils/CFTC/cftcFetcher.js';
import { parseCftcTff } from '../utils/CFTC/cftcParser.js';
import { getCftcTff } from '../collectors/CFTC/getCftc.js';
import { getRussell2000 } from '../collectors/FMP/russell2000Provider.js';









const CFTCMacro = async(req: Request, res: Response) => {
    try {


      const data = await getRussell2000("latest")

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








export { CFTCMacro}