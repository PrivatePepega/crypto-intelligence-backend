import type { Request, Response, NextFunction, Errback } from 'express'
import { getCnnFearGreed } from '../collectors/cnn/cnnFearGreed.js';










const cnnMacro = async(req: Request, res: Response) => {
    try {


      const data = await getCnnFearGreed("latest")

  
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










export { cnnMacro}