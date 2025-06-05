import { Kysely, sql } from "kysely";
import { DB } from "../../db/db.types";
import { UnexpectedRepositoryError } from "./repository.errors";
import { PLAYER_ROLE, PlayerRole } from "@codenames/shared/types";
import { randomUUID } from "crypto";

/**
 * ==================
 * TYPES
 * ==================
 */

export type PlayerId = number;
export type PublicPlayerId = string;
export type UserId = number;
export type GameId = number;
export type TeamId = number;
export type RoundId = number;

/** Unified player type - used for all player data */
export type PlayerResult = {
  _id: number;
  publicId: string;
  _userId: number;
  _gameId: number;
  _teamId: number;
  teamName: string;
  statusId: number;
  publicName: string;
  role: PlayerRole;
  username?: string; // Include when user context needed
};

export type PlayerRoleInput = {
  playerId: number;
  roundId: number;
  roleId: number;
  teamId: number;
};

export type RoleAssignmentResult = {
  _playerId: number;
  _roundId: number;
  _teamId: number;
  role: PlayerRole;
};

export type PlayerInput = {
  userId: number;
  gameId: number;
  publicName: string;
  teamId: number;
  statusId: number;
};

export type ModifyPlayerInput = {
  gameId: number;
  publicPlayerId: string;
  publicName?: string;
  teamId?: number;
  userId?: number;
};

/**
 * ==================
 * REPOSITORY FUNCTION TYPES
 * ==================
 */

/** Generic repository function type for finding multiple players */
export type PlayerFinderAll<T extends GameId | RoundId> = (
  identifier: T,
) => Promise<PlayerResult[]>;

/** Repository function type for finding single player by public ID */
export type PlayerFinderByPublicId = (
  publicId: PublicPlayerId,
) => Promise<PlayerResult | null>;

/** Repository function type for player context */
export type PlayerContextFinder = (
  gameId: GameId,
  userId: UserId,
  roundId: RoundId | null,
) => Promise<PlayerResult | null>;

/** Repository function types for role operations */
export type RoleHistoryFinder = (
  gameId: GameId,
  role: PlayerRole,
) => Promise<number[]>;

export type RoleAssignmentCreator = (
  input: PlayerRoleInput | PlayerRoleInput[],
) => Promise<RoleAssignmentResult[]>;

/** Repository function types for player CRUD */
export type PlayersCreator = (
  playersData: PlayerInput[],
) => Promise<PlayerResult[]>;

export type PlayerRemover = (playerId: PlayerId) => Promise<PlayerResult>;

export type PlayersUpdater = (
  playersData: ModifyPlayerInput[],
) => Promise<PlayerResult[]>;

/**
 * ==================
 * SQL HELPERS
 * ==================
 */

const playerResultColumns = [
  "players.id as id",
  "players.public_id as public_id",
  "players.user_id as user_id",
  "players.game_id as game_id",
  "players.team_id as team_id",
  "players.status_id as status_id",
  "players.public_name as public_name",
  "players.updated_at as updated_at",
  "players.status_last_changed as status_last_changed",
] as const;

/** this is a helper used to add the team name to queries */
const teamNameLookup =
  sql<string>`(SELECT team_name FROM teams WHERE teams.id = players.team_id)`.as(
    "team_name",
  );

/** */
function parseRoleName(roleName: string | null): PlayerRole {
  if (!roleName) return PLAYER_ROLE.NONE;

  switch (roleName.toUpperCase()) {
    case "CODEMASTER":
      return PLAYER_ROLE.CODEMASTER;
    case "CODEBREAKER":
      return PLAYER_ROLE.CODEBREAKER;
    case "SPECTATOR":
      return PLAYER_ROLE.SPECTATOR;
    default:
      return PLAYER_ROLE.NONE;
  }
}

/**
 * ==================
 * CORE PLAYER QUERIES
 * ==================
 */

/**
 * Find players by game ID with latest role information
 */
export const findPlayersByGameId =
  (db: Kysely<DB>): PlayerFinderAll<GameId> =>
  async (gameId) => {
    const players = await db
      .selectFrom("players")
      .leftJoin("player_round_roles as latest_prr", (join) =>
        join
          .onRef("latest_prr.player_id", "=", "players.id")
          .on("latest_prr.round_id", "=", (eb) =>
            eb
              .selectFrom("rounds")
              .where("rounds.game_id", "=", gameId)
              .select("rounds.id")
              .orderBy("rounds.round_number", "desc")
              .limit(1),
          ),
      )
      .leftJoin("player_roles", "latest_prr.role_id", "player_roles.id")
      .where("players.game_id", "=", gameId)
      .select([
        ...playerResultColumns,
        teamNameLookup,
        "player_roles.role_name",
      ])
      .execute();

    return players.map((player) => ({
      _id: player.id,
      publicId: player.public_id,
      _userId: player.user_id,
      _gameId: player.game_id,
      _teamId: player.team_id,
      teamName: player.team_name,
      statusId: player.status_id,
      publicName: player.public_name,
      role: parseRoleName(player.role_name),
    }));
  };

/**
 * Find players by round ID with their round-specific roles
 */
export const findPlayersByRoundId =
  (db: Kysely<DB>): PlayerFinderAll<RoundId> =>
  async (roundId) => {
    const players = await db
      .selectFrom("players")
      .innerJoin(
        "player_round_roles",
        "players.id",
        "player_round_roles.player_id",
      )
      .innerJoin(
        "player_roles",
        "player_round_roles.role_id",
        "player_roles.id",
      )
      .where("player_round_roles.round_id", "=", roundId)
      .select([
        ...playerResultColumns,
        teamNameLookup,
        "player_roles.role_name",
      ])
      .execute();

    return players.map((player) => ({
      _id: player.id,
      publicId: player.public_id,
      _userId: player.user_id,
      _gameId: player.game_id,
      _teamId: player.team_id,
      teamName: player.team_name,
      statusId: player.status_id,
      publicName: player.public_name,
      role: parseRoleName(player.role_name),
    }));
  };
/**
 * Find player by public ID
 */
export const findPlayerByPublicId =
  (db: Kysely<DB>): PlayerFinderByPublicId =>
  async (publicId) => {
    const player = await db
      .selectFrom("players")
      .innerJoin("teams", "players.team_id", "teams.id")
      .leftJoin("player_round_roles as latest_prr", (join) =>
        join
          .onRef("latest_prr.player_id", "=", "players.id")
          .on("latest_prr.round_id", "=", (eb) =>
            eb
              .selectFrom("rounds")
              .where("rounds.game_id", "=", eb.ref("players.game_id")) // ← Fix: use ref for correlation
              .select("rounds.id")
              .orderBy("rounds.round_number", "desc")
              .limit(1),
          ),
      )
      .leftJoin("player_roles", "latest_prr.role_id", "player_roles.id")
      .where("players.public_id", "=", publicId)
      .select([
        ...playerResultColumns,
        "teams.team_name",
        "player_roles.role_name",
      ])
      .executeTakeFirst();

    return player
      ? {
          _id: player.id,
          publicId: player.public_id,
          _userId: player.user_id,
          _gameId: player.game_id,
          _teamId: player.team_id,
          teamName: player.team_name,
          statusId: player.status_id,
          publicName: player.public_name,
          role: parseRoleName(player.role_name),
        }
      : null;
  };

/**
 * Get player context with username included
 */
export const getPlayerContext =
  (db: Kysely<DB>): PlayerContextFinder =>
  async (gameId, userId, roundId) => {
    const player = await db
      .selectFrom("players")
      .innerJoin("users", "players.user_id", "users.id")
      .innerJoin("teams", "players.team_id", "teams.id")
      .leftJoin("player_round_roles", (join) =>
        join
          .onRef("player_round_roles.player_id", "=", "players.id")
          .on("player_round_roles.round_id", "=", roundId),
      )
      .leftJoin("player_roles", "player_round_roles.role_id", "player_roles.id")
      .where("players.game_id", "=", gameId)
      .where("players.user_id", "=", userId)
      .select([
        ...playerResultColumns,
        teamNameLookup,
        "users.username",
        "player_roles.role_name",
      ])
      .executeTakeFirst();

    if (!player) return null;

    return {
      _id: player.id,
      publicId: player.public_id,
      _userId: player.user_id,
      _gameId: player.game_id,
      _teamId: player.team_id,
      teamName: player.team_name,
      statusId: player.status_id,
      publicName: player.public_name,
      username: player.username,
      role: player.role_name
        ? parseRoleName(player.role_name)
        : PLAYER_ROLE.NONE,
    };
  };

/**
 * ==================
 * ROLE QUERIES
 * ==================
 */

export const getRoleHistory =
  (db: Kysely<DB>): RoleHistoryFinder =>
  async (gameId, role) => {
    const history = await db
      .selectFrom("player_round_roles")
      .innerJoin("rounds", "player_round_roles.round_id", "rounds.id")
      .innerJoin(
        "player_roles",
        "player_round_roles.role_id",
        "player_roles.id",
      )
      .where("rounds.game_id", "=", gameId)
      .where("player_roles.role_name", "=", role)
      .select("player_round_roles.player_id")
      .execute();

    return [...new Set(history.map((r) => r.player_id))];
  };

/**
 * ==================
 * PLAYER MUTATIONS
 * ==================
 */

export const assignPlayerRoles =
  (db: Kysely<DB>): RoleAssignmentCreator =>
  async (input) => {
    const inputArray = Array.isArray(input) ? input : [input];
    if (inputArray.length === 0) return [];

    try {
      const values = inputArray.map((assignment) => ({
        player_id: assignment.playerId,
        round_id: assignment.roundId,
        role_id: assignment.roleId,
        assigned_at: new Date(),
      }));

      await db.insertInto("player_round_roles").values(values).execute();

      return inputArray.map((assignment) => ({
        _playerId: assignment.playerId,
        _roundId: assignment.roundId,
        _teamId: assignment.teamId,
        role:
          assignment.roleId === 1
            ? PLAYER_ROLE.CODEMASTER
            : PLAYER_ROLE.CODEBREAKER,
      }));
    } catch (error) {
      throw new UnexpectedRepositoryError("Failed to assign player roles", {
        cause: error,
      });
    }
  };

export const addPlayers =
  (db: Kysely<DB>): PlayersCreator =>
  async (playersData) => {
    if (playersData.length === 0) return [];

    const values = playersData.map((player) => ({
      public_id: randomUUID(),
      user_id: player.userId,
      game_id: player.gameId,
      public_name: player.publicName,
      team_id: player.teamId,
      status_id: player.statusId,
      updated_at: new Date(),
    }));

    const newPlayers = await db
      .insertInto("players")
      .values(values)
      .returning([...playerResultColumns, teamNameLookup])
      .execute();

    return newPlayers.map((player) => ({
      _id: player.id,
      publicId: player.public_id,
      _userId: player.user_id,
      _gameId: player.game_id,
      _teamId: player.team_id,
      teamName: player.team_name,
      statusId: player.status_id,
      publicName: player.public_name,
      role: PLAYER_ROLE.NONE,
    }));
  };

export const removePlayer =
  (db: Kysely<DB>): PlayerRemover =>
  async (playerId) => {
    const removedPlayer = await db
      .deleteFrom("players")
      .where("players.id", "=", playerId)
      .returning([...playerResultColumns, teamNameLookup])
      .executeTakeFirstOrThrow();

    return {
      _id: removedPlayer.id,
      publicId: removedPlayer.public_id,
      _userId: removedPlayer.user_id,
      _gameId: removedPlayer.game_id,
      _teamId: removedPlayer.team_id,
      teamName: removedPlayer.team_name,
      statusId: removedPlayer.status_id,
      publicName: removedPlayer.public_name,
      role: PLAYER_ROLE.NONE,
    };
  };

export const modifyPlayers =
  (db: Kysely<DB>): PlayersUpdater =>
  async (playersData) => {
    if (!playersData.length) return [];

    const playersWithUpdates = playersData.filter(
      (player) =>
        player.publicName !== undefined ||
        player.teamId !== undefined ||
        player.userId !== undefined,
    );

    const repositoryResponse = await db.transaction().execute(async (trx) => {
      const updates = playersWithUpdates.map((player) => {
        const updateValues = Object.fromEntries(
          Object.entries({
            user_id: player.userId,
            public_name: player.publicName,
            team_id: player.teamId,
            updated_at: new Date(),
          }).filter(([_, value]) => value !== undefined),
        );

        return trx
          .updateTable("players")
          .set(updateValues)
          .where("players.public_id", "=", player.publicPlayerId)
          .where("players.game_id", "=", player.gameId)
          .executeTakeFirstOrThrow();
      });

      await Promise.all(updates);

      const allPublicPlayerIds = playersData.map(
        (player) => player.publicPlayerId,
      );
      return await trx
        .selectFrom("players")
        .where("public_id", "in", allPublicPlayerIds)
        .innerJoin("teams", "players.team_id", "teams.id")
        .leftJoin("player_round_roles as latest_prr", (join) =>
          join
            .onRef("latest_prr.player_id", "=", "players.id")
            .on("latest_prr.round_id", "=", (eb) =>
              eb
                .selectFrom("rounds")
                .where("rounds.game_id", "=", eb.ref("players.game_id"))
                .select("rounds.id")
                .orderBy("rounds.round_number", "desc")
                .limit(1),
            ),
        )
        .leftJoin("player_roles", "latest_prr.role_id", "player_roles.id")
        .where("players.public_id", "in", allPublicPlayerIds)
        .select([
          ...playerResultColumns,
          "teams.team_name",
          "player_roles.role_name",
        ])
        .execute();
    });

    return repositoryResponse.map((player) => ({
      _id: player.id,
      publicId: player.public_id,
      _userId: player.user_id,
      _gameId: player.game_id,
      _teamId: player.team_id,
      teamName: player.team_name,
      statusId: player.status_id,
      publicName: player.public_name,
      role: parseRoleName(player.role_name),
    }));
  };
