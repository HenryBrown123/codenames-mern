import { Request, Response, NextFunction } from "express";
import { UnexpectedSetupError } from "./setup.errors";
import { UnauthorizedError } from "express-jwt";
import { NoResultError } from "kysely";
import { JsonObject } from "swagger-ui-express";
import { generateAdditionalErrorInfo } from "@backend/common/http-middleware/add-error-details.helper";

/**
 * Type definition for setup error API responses
 * Includes error details in development environment
 */
type SetupErrorApiResponse = {
  succces: boolean;
  error: string;
  details?: { stack?: JsonObject; cause?: any; req?: Request };
};

/**
 * Error handling middleware for setup-related errors
 * Processes UnexpectedSetupError and NoResultError with appropriate responses
 * Includes detailed error information in development environment
 *
 * @param err - The error object to be handled
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const setupErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const errorResponse: SetupErrorApiResponse = {
    succces: false,
    error: "Unexpected error",
  };

  if (process.env.NODE_ENV === "development") {
    const errorDetails = generateAdditionalErrorInfo(err, req);
    errorResponse.details = errorDetails;
  }

  if (err instanceof UnauthorizedError) {
    res.status(401).json(errorResponse);
    return;
  }

  if (err instanceof UnexpectedSetupError || err instanceof NoResultError) {
    res.status(500).json(errorResponse);
    return;
  }
  err.cause;
  next(err);
};
