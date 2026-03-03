import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/http-error.js';

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({ message: 'Validation failed', details: error.issues });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error';
  res.status(500).json({ message });
};

export const asyncHandler =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
