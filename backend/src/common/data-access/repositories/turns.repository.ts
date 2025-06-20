import { Kysely } from "kysely";
import { DB } from "../../db/db.types";
import { CODEBREAKER_OUTCOME, TurnOutcome } from "@codenames/shared/types";
import { z } from "zod";
import { UnexpectedRepositoryError } from "./repository.errors";

/**
 * ==================
 * REPOSITORY TYPES
 * ==================
 */

/** Domain-specific identifier types */
export type TurnId = number;
export type PublicId = string;
export type RoundId = number;
export type TeamId = number;
export type PlayerId = number;
export type CardId = number;

/** Zod schema for validating outcome values from database */
export const outcomeSchema = z
  .enum([
    CODEBREAKER_OUTCOME.ASSASSIN_CARD,
    CODEBREAKER_OUTCOME.BYSTANDER_CARD,
    CODEBREAKER_OUTCOME.CORRECT_TEAM_CARD,
    CODEBREAKER_OUTCOME.OTHER_TEAM_CARD,
  ])
  .nullable();

/** Standardized results returned from repository */
export type ClueResult = {
  _id: number;
  _turnId: number;
  word: string;
  number: number;
  createdAt: Date;
};

export type GuessResult = {
  _id: number;
  _turnId: number;
  _playerId: number;
  _cardId: number;
  cardWord: string; // ENHANCED: Added card word
  playerName: string;
  outcome: TurnOutcome | null;
  createdAt: Date;
};

export type TurnResult = {
  _id: number;
  publicId: string; // ENHANCED: Added public ID
  _roundId: number;
  _teamId: number;
  _gameId: number; // ENHANCED: Added game ID for auth
  teamName: string;
  status: string;
  guessesRemaining: number;
  createdAt: Date;
  completedAt: Date | null;
  clue?: ClueResult;
  guesses: GuessResult[];
};

/** Input types */
export type ClueInput = {
  word: string;
  targetCardCount: number;
};

export type GuessInput = {
  turnId: number;
  playerId: number;
  cardId: number;
  outcome: string;
};

export type TurnInput = {
  roundId: number;
  teamId: number;
  guessesRemaining: number;
};

/** Repository function types */
export type TurnsFinder<T extends RoundId> = (
  identifier: T,
) => Promise<TurnResult[]>;

export type TurnFinder<T extends TurnId | PublicId> = (
  identifier: T,
) => Promise<TurnResult | null>;

export type ClueCreator = (
  turnId: TurnId,
  clue: ClueInput,
) => Promise<ClueResult>;

export type GuessCreator = (input: GuessInput) => Promise<GuessResult>;

export type TurnCreator = (input: TurnInput) => Promise<TurnResult>;

export type TurnGuessUpdater = (
  turnId: TurnId,
  guessesRemaining: number,
) => Promise<TurnResult>;

export type TurnStatusUpdater = (
  turnId: TurnId,
  status: string,
) => Promise<TurnResult>;

/**
 * ==================
 * SHARED HELPERS
 * ==================
 */

/**
 * ENHANCED: Fetches clues and guesses with card words for given turn IDs
 */
const fetchTurnRelatedData = async (
  db: Kysely<DB>,
  turnIds: number[],
): Promise<Record<number, { clue?: ClueResult; guesses: GuessResult[] }>> => {
  if (turnIds.length === 0) {
    return {};
  }

  const [clues, guesses] = await Promise.all([
    db
      .selectFrom("clues")
      .where("turn_id", "in", turnIds)
      .select(["id", "turn_id", "word", "number", "created_at"])
      .execute(),

    // ENHANCED: Added join with cards table to get card words
    db
      .selectFrom("guesses")
      .innerJoin("players", "guesses.player_id", "players.id")
      .innerJoin("cards", "guesses.card_id", "cards.id") // ENHANCED: Added this join
      .where("guesses.turn_id", "in", turnIds)
      .select([
        "guesses.id",
        "guesses.turn_id",
        "guesses.player_id",
        "guesses.card_id",
        "guesses.outcome",
        "guesses.created_at",
        "players.public_name as playerName",
        "cards.word as cardWord", // ENHANCED: Added card word
      ])
      .orderBy("guesses.created_at", "asc")
      .execute(),
  ]);

  // Initialize lookup with empty guesses arrays
  const relatedData: Record<
    number,
    { clue?: ClueResult; guesses: GuessResult[] }
  > = {};

  turnIds.forEach((turnId) => {
    relatedData[turnId] = { guesses: [] };
  });

  // Map clues
  clues.forEach((clue) => {
    relatedData[clue.turn_id].clue = {
      _id: clue.id,
      _turnId: clue.turn_id,
      word: clue.word,
      number: clue.number,
      createdAt: clue.created_at,
    };
  });

  // Map guesses (now with card words)
  guesses.forEach((guess) => {
    relatedData[guess.turn_id].guesses.push({
      _id: guess.id,
      _turnId: guess.turn_id,
      _playerId: guess.player_id,
      _cardId: guess.card_id,
      cardWord: guess.cardWord, // ENHANCED: Now included
      playerName: guess.playerName,
      outcome: outcomeSchema.parse(guess.outcome),
      createdAt: guess.created_at,
    });
  });

  return relatedData;
};

/**
 * ENHANCED: Standard query for fetching turn base data with publicId and gameId
 */
const getTurnBaseData = (db: Kysely<DB>) =>
  db
    .selectFrom("turns")
    .innerJoin("teams", "turns.team_id", "teams.id")
    .innerJoin("rounds", "turns.round_id", "rounds.id") // ENHANCED: Added join for gameId
    .select([
      "turns.id as _id",
      "turns.public_id as publicId", // ENHANCED: Added public ID
      "turns.round_id as _roundId",
      "turns.team_id as _teamId",
      "rounds.game_id as _gameId", // ENHANCED: Added game ID for auth
      "teams.team_name as teamName",
      "turns.status",
      "turns.guesses_remaining as guessesRemaining",
      "turns.created_at as createdAt",
      "turns.completed_at as completedAt",
    ]);

/**
 * ==================
 * REPOSITORY FUNCTIONS
 * ==================
 */

/**
 * Creates a function for adding clues to turns
 */
export const createClue =
  (db: Kysely<DB>): ClueCreator =>
  async (turnId, { word, targetCardCount }) => {
    try {
      const clue = await db
        .insertInto("clues")
        .values({
          turn_id: turnId,
          word,
          number: targetCardCount,
          created_at: new Date(),
        })
        .returning(["id", "turn_id", "word", "number", "created_at"])
        .executeTakeFirstOrThrow();

      return {
        _id: clue.id,
        _turnId: clue.turn_id,
        word: clue.word,
        number: clue.number,
        createdAt: clue.created_at,
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to create clue for turn ${turnId}`,
        { cause: error },
      );
    }
  };

/**
 * Creates a function for creating guesses
 */
export const createGuess =
  (db: Kysely<DB>): GuessCreator =>
  async ({ turnId, playerId, cardId, outcome }) => {
    try {
      const guess = await db
        .insertInto("guesses")
        .values({
          turn_id: turnId,
          player_id: playerId,
          card_id: cardId,
          outcome,
          created_at: new Date(),
        })
        .returning([
          "id",
          "turn_id",
          "player_id",
          "card_id",
          "outcome",
          "created_at",
        ])
        .executeTakeFirstOrThrow();

      // Get player name and card word
      const [player, card] = await Promise.all([
        db
          .selectFrom("players")
          .where("id", "=", playerId)
          .select("public_name")
          .executeTakeFirstOrThrow(),
        db
          .selectFrom("cards")
          .where("id", "=", cardId)
          .select("word")
          .executeTakeFirstOrThrow(),
      ]);

      return {
        _id: guess.id,
        _turnId: guess.turn_id,
        _playerId: guess.player_id,
        _cardId: guess.card_id,
        cardWord: card.word, // ENHANCED: Now included
        playerName: player.public_name,
        outcome: outcomeSchema.parse(guess.outcome),
        createdAt: guess.created_at,
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to create guess for turn ${turnId}`,
        { cause: error },
      );
    }
  };

/**
 * Creates a function for creating new turns
 */
export const createTurn =
  (db: Kysely<DB>): TurnCreator =>
  async ({ roundId, teamId, guessesRemaining }) => {
    try {
      const turn = await db
        .insertInto("turns")
        .values({
          round_id: roundId,
          team_id: teamId,
          guesses_remaining: guessesRemaining,
          status: "ACTIVE",
          created_at: new Date(),
        })
        .returning([
          "id",
          "public_id", // ENHANCED: Include public_id
          "round_id",
          "team_id",
          "guesses_remaining",
          "status",
          "created_at",
          "completed_at",
        ])
        .executeTakeFirstOrThrow();

      // Get team name and game ID
      const [team, round] = await Promise.all([
        db
          .selectFrom("teams")
          .where("id", "=", teamId)
          .select("team_name")
          .executeTakeFirstOrThrow(),
        db
          .selectFrom("rounds")
          .where("id", "=", roundId)
          .select("game_id")
          .executeTakeFirstOrThrow(),
      ]);

      return {
        _id: turn.id,
        publicId: turn.public_id,
        _roundId: turn.round_id,
        _teamId: turn.team_id,
        _gameId: round.game_id,
        teamName: team.team_name,
        status: turn.status,
        guessesRemaining: turn.guesses_remaining,
        createdAt: turn.created_at,
        completedAt: turn.completed_at,
        guesses: [],
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to create turn for round ${roundId}`,
        { cause: error },
      );
    }
  };

/**
 * Creates a function for updating turn guess counts
 */
export const updateTurnGuesses =
  (db: Kysely<DB>): TurnGuessUpdater =>
  async (turnId, guessesRemaining) => {
    try {
      // Update the turn
      await db
        .updateTable("turns")
        .set({
          guesses_remaining: guessesRemaining,
          updated_at: new Date(),
        })
        .where("id", "=", turnId)
        .execute();

      // Get the updated turn data using shared query
      const turn = await getTurnBaseData(db)
        .where("turns.id", "=", turnId)
        .executeTakeFirstOrThrow();

      // Fetch related data
      const relatedData = await fetchTurnRelatedData(db, [turnId]);

      return {
        ...turn,
        ...relatedData[turnId],
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to update guesses for turn ${turnId}`,
        { cause: error },
      );
    }
  };

/**
 * Creates a function for updating turn status
 */
export const updateTurnStatus =
  (db: Kysely<DB>): TurnStatusUpdater =>
  async (turnId, status) => {
    try {
      const now = new Date();

      // Update the turn with new status and completion time if completing
      await db
        .updateTable("turns")
        .set({
          status,
          completed_at: status === "COMPLETED" ? now : null,
          updated_at: now,
        })
        .where("id", "=", turnId)
        .execute();

      // Get the updated turn data using shared query
      const turn = await getTurnBaseData(db)
        .where("turns.id", "=", turnId)
        .executeTakeFirstOrThrow();

      // Fetch related data
      const relatedData = await fetchTurnRelatedData(db, [turnId]);

      return {
        ...turn,
        ...relatedData[turnId],
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to update status for turn ${turnId}`,
        { cause: error },
      );
    }
  };

/**
 * Creates a function for retrieving turns by round ID
 */
export const getTurnsByRoundId =
  (db: Kysely<DB>): TurnsFinder<RoundId> =>
  async (roundId) => {
    const turns = await getTurnBaseData(db)
      .where("turns.round_id", "=", roundId)
      .orderBy("turns.created_at", "asc")
      .execute();

    if (turns.length === 0) {
      return [];
    }

    const turnIds = turns.map((turn) => turn._id);
    const relatedData = await fetchTurnRelatedData(db, turnIds);

    return turns.map((turn) => ({
      ...turn,
      ...relatedData[turn._id],
    }));
  };

/**
 * Creates a function for retrieving a turn by public ID
 */
export const getTurnByPublicId =
  (db: Kysely<DB>): TurnFinder<PublicId> =>
  async (publicId: string) => {
    const turn = await getTurnBaseData(db)
      .where("turns.public_id", "=", publicId)
      .executeTakeFirst();

    if (!turn) return null;

    const relatedData = await fetchTurnRelatedData(db, [turn._id]);

    return {
      ...turn,
      ...relatedData[turn._id],
    };
  };

/**
 * Creates a function for retrieving a turn by internal ID
 */
export const getTurnById =
  (db: Kysely<DB>): TurnFinder<TurnId> =>
  async (turnId) => {
    const turn = await getTurnBaseData(db)
      .where("turns.id", "=", turnId)
      .executeTakeFirst();

    if (!turn) return null;

    const relatedData = await fetchTurnRelatedData(db, [turnId]);

    return {
      ...turn,
      ...relatedData[turnId],
    };
  };
