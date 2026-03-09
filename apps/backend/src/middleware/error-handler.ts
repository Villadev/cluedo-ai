import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/http-error.js';
import { errorResponse } from '../utils/api-response.js';

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json(errorResponse(error.message));
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json(errorResponse('Validation failed'));
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error';
  res.status(500).json(errorResponse(message));
};

export const asyncHandler =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
