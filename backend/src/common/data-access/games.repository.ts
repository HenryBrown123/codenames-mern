import { Kysely } from "kysely";
import { DB } from "../db/db.types";
import {
  GameType,
  GameFormat,
  GAME_TYPE,
  GAME_FORMAT,
  GAME_STATE,
  GameState,
} from "@codenames/shared/types";
import { z } from "zod";

/**
 * ==================
 * DOMAIN TYPES
 * ==================
 */

/** Domain-specific identifier types */
export type PublicId = string;
export type InternalId = number;

/** Entity data types */
export type GameData = {
  _id: number;
  created_at: Date;
  updated_at?: Date | null;
  public_id: string;
  status: GameState;
  game_type: GameType;
  game_format: GameFormat;
};

/** Input and result types */
export type GameInput = {
  publicId: string;
  gameType: GameType;
  gameFormat: GameFormat;
};

export type GameResult = {
  _id: number;
  created_at: Date;
  updated_at?: Date | null;
};

/** Generic repository function types */
export type GameFinder<T extends InternalId | PublicId> = (
  identifier: T,
) => Promise<GameData | null>;

export type GameCreator = ({
  publicId,
  gameType,
  gameFormat,
}: GameInput) => Promise<GameResult>;

export type GameStatusUpdater = (
  gameId: InternalId,
  statusName: GameState,
) => Promise<GameData>;

/**
 * ==================
 * VALIDATION SCHEMAS
 * ==================
 */

/**
 * Zod schemas needed due to generated postgrest enum types returning "string" from Kysely query.
 * Other column primative types are typesafe through types generated through kysely-codegen.
 */
export const gameTypeSchema = z.enum([
  GAME_TYPE.SINGLE_DEVICE,
  GAME_TYPE.MULTI_DEVICE,
]);

export const gameFormatSchema = z.enum([
  GAME_FORMAT.QUICK,
  GAME_FORMAT.BEST_OF_THREE,
  GAME_FORMAT.ROUND_ROBIN,
]);

export const gameStateSchema = z.enum([
  GAME_STATE.LOBBY,
  GAME_STATE.PAUSED,
  GAME_STATE.IN_PROGRESS,
  GAME_STATE.COMPLETED,
  GAME_STATE.ABANDONED,
]);

/**
 * ==================
 * REPOSITORY FUNCTIONS
 * ==================
 */

/**
 * Creates a function for finding games by public ID
 *
 * @param db - Database connection
 */
export const findGameByPublicId =
  (db: Kysely<DB>): GameFinder<PublicId> =>
  /**
   * Retrieves game data using its public identifier
   *
   * @param publicId - The game's public-facing ID
   * @returns Game data if found, null otherwise
   */
  async (publicId) => {
    const game = await db
      .selectFrom("games")
      .innerJoin("game_status", "games.status_id", "game_status.id")
      .select([
        "games.id",
        "games.created_at",
        "games.updated_at",
        "games.public_id",
        "games.game_type",
        "games.game_format",
        "game_status.status_name as status",
      ])
      .where("games.public_id", "=", publicId)
      .executeTakeFirst();

    return game
      ? {
          _id: game.id,
          created_at: game.created_at || null,
          updated_at: game.updated_at || null,
          public_id: game.public_id,
          status: gameStateSchema.parse(game.status),
          game_type: gameTypeSchema.parse(game.game_type),
          game_format: gameFormatSchema.parse(game.game_format),
        }
      : null;
  };

/**
 * Creates a function for finding games by internal ID
 *
 * @param db - Database connection
 */
export const findGameById =
  (db: Kysely<DB>): GameFinder<InternalId> =>
  /**
   * Retrieves game data using its internal ID
   *
   * @param gameId - The game's internal ID
   * @returns Game data if found, null otherwise
   */
  async (gameId) => {
    const game = await db
      .selectFrom("games")
      .innerJoin("game_status", "games.status_id", "game_status.id")
      .select([
        "games.id",
        "games.created_at",
        "games.updated_at",
        "games.public_id",
        "games.game_type",
        "games.game_format",
        "game_status.status_name as status",
      ])
      .where("games.id", "=", gameId)
      .executeTakeFirst();

    return game
      ? {
          _id: game.id, // Changed from id to _id
          created_at: game.created_at,
          updated_at: game.updated_at, // Added updated_at
          public_id: game.public_id,
          status: gameStateSchema.parse(game.status),
          game_type: gameTypeSchema.parse(game.game_type),
          game_format: gameFormatSchema.parse(game.game_format),
        }
      : null;
  };

/**
 * Creates a function for creating new games
 *
 * @param db - Database connection
 */
export const createGame =
  (db: Kysely<DB>): GameCreator =>
  /**
   * Inserts a new game into the database
   *
   * @param gameInput - Game creation parameters
   * @returns Created game's ID and timestamp
   */
  async (gameInput) => {
    const now = new Date();
    const insertedGame = await db
      .insertInto("games")
      .values({
        public_id: gameInput.publicId,
        status_id: 1, // SETUP status
        created_at: now,
        updated_at: now, // Added updated_at
        game_type: gameInput.gameType,
        game_format: gameInput.gameFormat,
      })
      .returning(["id", "created_at", "updated_at"]) // Added updated_at
      .executeTakeFirstOrThrow();

    return {
      _id: insertedGame.id, // Changed from id to _id
      created_at: insertedGame.created_at,
      updated_at: insertedGame.updated_at || null, // Added updated_at
    };
  };

/**
 * Creates a function for updating a game's status
 *
 * @param db - Database connection
 */
export const updateGameStatus =
  (db: Kysely<DB>): GameStatusUpdater =>
  /**
   * Changes a game's status to a new value
   *
   * @param gameId - The game's internal ID
   * @param statusName - The new status to apply
   * @returns Updated game data
   * @throws If game not found or status is invalid
   */
  async (gameId, statusName) => {
    // Get the status_id corresponding to the status name
    const updatedGame = await db.transaction().execute(async (trx) => {
      const status = await trx
        .selectFrom("game_status")
        .where("status_name", "=", statusName)
        .select(["id"])
        .executeTakeFirstOrThrow();

      const now = new Date();
      return await db
        .updateTable("games")
        .set({
          status_id: status.id,
          updated_at: now,
        })
        .where("id", "=", gameId)
        .returning([
          "id",
          "created_at",
          "updated_at",
          "public_id",
          "game_type",
          "game_format",
        ])
        .executeTakeFirstOrThrow();
    });

    const gameWithStatus = {
      _id: updatedGame.id, // Changed from id to _id
      created_at: updatedGame.created_at,
      updated_at: updatedGame.updated_at || null,
      public_id: updatedGame.public_id,
      status: gameStateSchema.parse(statusName),
      game_type: gameTypeSchema.parse(updatedGame.game_type),
      game_format: gameFormatSchema.parse(updatedGame.game_format),
    };

    return gameWithStatus;
  };
