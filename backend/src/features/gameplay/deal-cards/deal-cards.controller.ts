import type { Response, NextFunction } from "express";
import type { Request } from "express-jwt";
import type { DealCardsService } from "./deal-cards.service";
import { z } from "zod";

/**
 * Request validation schema for dealing cards
 */
export const dealCardsRequestSchema = z.object({
  params: z.object({
    gameId: z.string().min(1, "Game ID is required"),
    id: z.string().min(1, "Round ID is required"),
  }),
  auth: z.object({
    userId: z.number().int().positive("User ID must be a positive integer"),
  }),
  body: z
    .object({
      deck: z.string().min(1).default("BASE"),
      languageCode: z.string().min(2).max(5).default("en"),
    })
    .optional()
    .default({}),
});

/**
 * Type definition for validated request
 */
export type ValidatedDealCardsRequest = z.infer<typeof dealCardsRequestSchema>;

/**
 * Type definition for error response
 */
export type DealCardsErrorResponse = {
  success: false;
  error: string;
  details?: {
    code: string;
    validationErrors?: { path: string; message: string }[];
  };
};

/**
 * Type definition for deal cards response
 */
export type DealCardsResponse = {
  success: boolean;
  data: {
    roundId: number;
    roundNumber: number;
    startingTeamId: number;
    cards: { id?: number; word: string; selected: boolean }[];
  };
};

/**
 * Dependencies required by the deal cards controller
 */
export type Dependencies = {
  dealCards: DealCardsService;
};

/**
 * Creates a controller for handling card dealing
 */
export const dealCardsController = ({ dealCards }: Dependencies) => {
  /**
   * Handles HTTP request to deal random cards for a round
   *
   * @param req - Express request with game ID, round ID, and optional deck parameters
   * @param res - Express response object
   * @param next - Express error handling function
   */
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validatedRequest = dealCardsRequestSchema.parse({
        params: req.params,
        auth: req.auth,
        body: req.body || {},
      });

      const result = await dealCards({
        gameId: validatedRequest.params.gameId,
        userId: validatedRequest.auth.userId,
      });

      if (result.success) {
        // Format successful response - note we don't expose full card details
        // to avoid revealing team assignments to all players
        const response: DealCardsResponse = {
          success: true,
          data: {
            roundId: result.data._roundId,
            roundNumber: result.data.roundNumber,
            startingTeamId: result.data._startingTeamId,
            cards: result.data.cards.map((card) => ({
              id: card._id,
              word: card.word,
              selected: card.selected,
            })),
          },
        };

        res.status(201).json(response);
      } else {
        const errorResponse: DealCardsErrorResponse = {
          success: false,
          error: "Failed to deal cards",
          details: {
            code: result.error.status,
          },
        };

        if (
          result.error.status === "invalid-game-state" &&
          result.error.validationErrors
        ) {
          errorResponse.details!.validationErrors =
            result.error.validationErrors;
        }

        const statusCode =
          result.error.status === "game-not-found"
            ? 404
            : result.error.status === "invalid-game-state"
              ? 409
              : 500;

        res.status(statusCode).json(errorResponse);
      }
    } catch (error) {
      next(error);
    }
  };
};
