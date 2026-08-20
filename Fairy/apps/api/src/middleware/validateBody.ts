import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        code: "VALIDATION_ERROR",
        data: result.error.format(),
        msg: "Invalid request body",
      });
      return;
    }

    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const isMissingSearchCriteria = result.error.issues.some(
        (issue) => issue.message === "At least one of mood, scene, or keyword is required"
      );

      res.status(400).json({
        code: isMissingSearchCriteria ? "MISSING_SEARCH_CRITERIA" : "VALIDATION_ERROR",
        data: result.error.format(),
        msg: isMissingSearchCriteria
          ? "At least one search criterion is required"
          : "Invalid query parameters",
      });
      return;
    }

    res.locals.validatedQuery = result.data;
    next();
  };
}
