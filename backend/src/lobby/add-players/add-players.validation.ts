import { z } from "zod";

/**
 * Schema for a single player's data
 */
export const playerSchema = z
  .object({
    playerName: z.string().min(1).max(30),
    teamName: z.string().min(1),
  })
  .strict();

/**
 * Complete request validation schema
 */
export const addPlayersRequestSchema = z.object({
  params: z.object({
    gameId: z.string().min(1, "Game ID is required"),
  }),
  auth: z.object({
    userId: z.number().int().positive("User ID must be a positive integer"),
  }),
  body: z.array(playerSchema).min(1, "At least one player is required"),
});

/**
 * Type for the parsed request
 */
export type ValidatedAddPlayersRequest = z.infer<
  typeof addPlayersRequestSchema
>;

/**
 * Schema for a player in the response
 */
const playerResponseSchema = z.object({
  id: z.string(),
  playerName: z.string(),
  username: z.string().optional(),
  teamName: z.string(),
  isActive: z.boolean(),
});

/**
 * Response schema for adding players
 */
export const addPlayersResponseSchema = z
  .object({
    success: z.boolean(),
    data: z.object({
      players: z.array(playerResponseSchema),
      gameId: z.string(),
    }),
  })
  .strict();

/**
 * Type for the response schema
 */
export type AddPlayersResponse = z.infer<typeof addPlayersResponseSchema>;
