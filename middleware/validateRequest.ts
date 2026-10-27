import type { Request, Response, NextFunction } from 'express'
import type { ZodType } from "zod";

export const validateRequest = (schema: ZodType, source: 'body' | 'query' = 'body') => {
    return (req: Request, res: Response, next: NextFunction) => {
      const data = source === 'query' ? req.query : req.body;
      const result = schema.safeParse(data);

      if (!result.success) {
        const errors = result.error.issues.map((issue) => issue.message);

        return res.status(400).json({
          message: errors.join(", "),
        });
      }

      if (source === 'query') {
        req.query = result.data as Record<string, unknown>;
      } else {
        req.body = result.data;
      }

      next();
    };
};