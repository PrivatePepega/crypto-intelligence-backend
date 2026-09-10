import type { Request, Response, NextFunction} from 'express'
import type { ZodType } from "zod";

export const validateRequest = (schema:ZodType) => {
    return (req:Request, res:Response, next:NextFunction) => {
      const result = schema.safeParse(req.body);
  
      if (!result.success) {
        const errors = result.error.issues.map((issue) => issue.message);
  
        return res.status(400).json({
          message: errors.join(", "),
        });
      }
  
      req.body = result.data;
  
      next();
    };
  };
  