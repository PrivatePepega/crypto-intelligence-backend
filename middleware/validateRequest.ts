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

      // Store validated data in res.locals instead of mutating req (Express 5 compatible)
      if (source === 'query') {
        res.locals.validatedQuery = result.data;
      } else {
        res.locals.validatedBody = result.data;
      }

      next();
    };
};