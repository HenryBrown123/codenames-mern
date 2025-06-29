import type { GameplayStateProvider } from "../state/gameplay-state.provider";
import type { TurnStateProvider } from "../state/turn-state.provider";
import type { GameplayValidationError } from "../state/gameplay-state.validation";
import type { TransactionalHandler } from "@backend/common/data-access/transaction-handler";
import type { GameplayOperations } from "../gameplay-actions";
import { complexProperties } from "../state/gameplay-state.helpers";

import {
  validateClueWord,
  validate as checkClueGivingRules,
} from "./give-clue.rules";

/**
 * Input parameters for giving a clue
 */
export type GiveClueInput = {
  gameId: string;
  roundNumber: number;
  userId: number;
  word: string;
  targetCardCount: number;
};

/**
 * Complete turn data that matches frontend TurnData interface
 */
export type CompleteTurnData = {
  id: string;
  teamName: string;
  status: "ACTIVE" | "COMPLETED";
  guessesRemaining: number;
  createdAt: Date;
  completedAt?: Date | null;
  clue?: {
    word: string;
    number: number;
    createdAt: Date;
  };
  hasGuesses: boolean;
  lastGuess?: {
    cardWord: string;
    playerName: string;
    outcome: string | null;
    createdAt: Date;
  };
  prevGuesses: {
    cardWord: string;
    playerName: string;
    outcome: string | null;
    createdAt: Date;
  }[];
};

/**
 * Successful clue result with complete turn data
 */
export type GiveClueSuccess = {
  clue: {
    word: string;
    targetCardCount: number;
    createdAt: Date;
  };
  turn: CompleteTurnData;
};

/**
 * Clue giving error types
 */
export const GIVE_CLUE_ERROR = {
  INVALID_GAME_STATE: "invalid-game-state",
  INVALID_CLUE_WORD: "invalid-clue-word",
  GAME_NOT_FOUND: "game-not-found",
  USER_NOT_PLAYER: "user-not-player",
  ROUND_NOT_FOUND: "round-not-found",
  ROUND_NOT_CURRENT: "round-not-current",
} as const;

/**
 * Clue giving failure details
 */
export type GiveClueFailure =
  | {
      status: typeof GIVE_CLUE_ERROR.INVALID_GAME_STATE;
      currentState: string;
      validationErrors: GameplayValidationError[];
    }
  | {
      status: typeof GIVE_CLUE_ERROR.INVALID_CLUE_WORD;
      word: string;
      reason: string;
    }
  | {
      status: typeof GIVE_CLUE_ERROR.GAME_NOT_FOUND;
      gameId: string;
    }
  | {
      status: typeof GIVE_CLUE_ERROR.USER_NOT_PLAYER;
      gameId: string;
      userId: number;
    }
  | {
      status: typeof GIVE_CLUE_ERROR.ROUND_NOT_FOUND;
      roundNumber: number;
    }
  | {
      status: typeof GIVE_CLUE_ERROR.ROUND_NOT_CURRENT;
      requestedRound: number;
      currentRound: number;
    };

/**
 * Combined result type for clue giving
 */
export type GiveClueResult =
  | { success: true; data: GiveClueSuccess }
  | { success: false; error: GiveClueFailure };

/**
 * Dependencies required by the give clue service
 */
export type GiveClueDependencies = {
  getGameState: GameplayStateProvider;
  gameplayHandler: TransactionalHandler<GameplayOperations>;
  getTurnState: TurnStateProvider; // ← Add turn state provider
};

/**
 * Creates a service for handling clue giving with business rule validation
 */
export const giveClueService = (dependencies: GiveClueDependencies) => {
  /**
   * Helper to get complete turn data for API response
   */
  const getCompleteTurnData = async (
    turnPublicId: string,
  ): Promise<CompleteTurnData> => {
    const turnData = await dependencies.getTurnState(turnPublicId);
    if (!turnData) {
      throw new Error(`Failed to fetch turn data for ${turnPublicId}`);
    }

    return {
      id: turnData.publicId,
      teamName: turnData.teamName,
      status: turnData.status,
      guessesRemaining: turnData.guessesRemaining,
      createdAt: turnData.createdAt,
      completedAt: turnData.completedAt,
      clue: turnData.clue,
      hasGuesses: turnData.hasGuesses,
      lastGuess: turnData.lastGuess,
      prevGuesses: turnData.prevGuesses,
    };
  };

  return async (input: GiveClueInput): Promise<GiveClueResult> => {
    const result = await dependencies.getGameState(input.gameId, input.userId);

    if (result.status === "game-not-found") {
      return {
        success: false,
        error: {
          status: GIVE_CLUE_ERROR.GAME_NOT_FOUND,
          gameId: input.gameId,
        },
      };
    }

    if (result.status === "user-not-player") {
      return {
        success: false,
        error: {
          status: GIVE_CLUE_ERROR.USER_NOT_PLAYER,
          gameId: input.gameId,
          userId: input.userId,
        },
      };
    }

    const gameData = result.data;

    // Validate round exists
    if (!gameData.currentRound) {
      return {
        success: false,
        error: {
          status: GIVE_CLUE_ERROR.ROUND_NOT_FOUND,
          roundNumber: input.roundNumber,
        },
      };
    }

    if (gameData.currentRound.number !== input.roundNumber) {
      return {
        success: false,
        error: {
          status: GIVE_CLUE_ERROR.ROUND_NOT_CURRENT,
          requestedRound: input.roundNumber,
          currentRound: gameData.currentRound.number,
        },
      };
    }

    // Validate clue word against cards and previous clues
    const clueWordValidation = validateClueWord(gameData, input.word);
    if (!clueWordValidation.valid) {
      return {
        success: false,
        error: {
          status: GIVE_CLUE_ERROR.INVALID_CLUE_WORD,
          word: input.word,
          reason: clueWordValidation.error!,
        },
      };
    }

    const validationResult = checkClueGivingRules(gameData);

    if (!validationResult.valid) {
      return {
        success: false,
        error: {
          status: GIVE_CLUE_ERROR.INVALID_GAME_STATE,
          currentState: gameData.status,
          validationErrors: validationResult.errors,
        },
      };
    }

    const operationResult = await dependencies.gameplayHandler(async (ops) => {
      return await ops.giveClue(
        validationResult.data,
        input.word,
        input.targetCardCount,
      );
    });

    // ← CRITICAL FIX: Fetch complete turn data after transaction completes
    const currentTurn = complexProperties.getCurrentTurnOrThrow(gameData);
    const completeTurnData = await getCompleteTurnData(currentTurn.publicId);

    return {
      success: true,
      data: {
        clue: {
          word: operationResult.clue.word,
          targetCardCount: operationResult.clue.number,
          createdAt: operationResult.clue.createdAt,
        },
        turn: completeTurnData, // ← Return complete enriched turn data
      },
    };
  };
};

export type GiveClueService = ReturnType<typeof giveClueService>;
