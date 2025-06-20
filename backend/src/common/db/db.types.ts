/**
 * This file was generated by kysely-codegen.
 * Please do not edit it manually.
 */

import type { ColumnType } from "kysely";

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface Cards {
  card_type: string;
  id: Generated<number>;
  round_id: number;
  selected: Generated<boolean>;
  team_id: number | null;
  word: string;
}

export interface Clues {
  created_at: Generated<Timestamp>;
  id: Generated<number>;
  number: number;
  turn_id: number;
  word: string;
}

export interface Decks {
  created_at: Generated<Timestamp>;
  deck: string;
  id: Generated<number>;
  language_code: Generated<string>;
  word: string;
}

export interface Games {
  created_at: Generated<Timestamp>;
  game_format: string;
  game_type: string;
  /**
   * Internal ID
   */
  id: Generated<number>;
  /**
   * Public-facing ID used in URLs and APIs
   */
  public_id: string;
  status_id: number;
  updated_at: Generated<Timestamp | null>;
}

export interface GameStatus {
  id: number;
  status_name: string;
}

export interface Guesses {
  card_id: number;
  created_at: Generated<Timestamp>;
  id: Generated<number>;
  outcome: string | null;
  player_id: number;
  turn_id: number;
}

export interface PlayerRoles {
  id: number;
  role_name: string;
}

export interface PlayerRoundRoles {
  assigned_at: Generated<Timestamp>;
  player_id: number;
  role_id: number;
  round_id: number;
}

export interface Players {
  game_id: number;
  id: Generated<number>;
  /**
   * Public UUID identifier for API responses
   */
  public_id: Generated<string>;
  /**
   * Public-facing name shown to other players
   */
  public_name: string;
  status_id: number;
  status_last_changed: Generated<Timestamp>;
  team_id: number;
  updated_at: Generated<Timestamp | null>;
  user_id: number;
}

export interface PlayerStatuses {
  id: number;
  status_name: string;
}

export interface Rounds {
  created_at: Generated<Timestamp>;
  game_id: number;
  id: Generated<number>;
  round_number: number;
  /**
   * Current status of the round (setup, in progress, completed)
   */
  status_id: number;
  updated_at: Generated<Timestamp | null>;
  winning_team_id: number | null;
}

export interface RoundStatus {
  id: number;
  status_name: string;
}

export interface Sessions {
  created_at: Generated<Timestamp>;
  expires_at: Timestamp;
  id: Generated<number>;
  token: string;
  user_id: number;
}

export interface Teams {
  game_id: number;
  id: Generated<number>;
  team_name: string;
}

export interface Turns {
  completed_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  guesses_remaining: Generated<number>;
  id: Generated<number>;
  /**
   * Public UUID identifier for API responses
   */
  public_id: Generated<string>;
  round_id: number;
  status: Generated<string>;
  team_id: number;
  updated_at: Generated<Timestamp | null>;
}

export interface Users {
  created_at: Generated<Timestamp>;
  /**
   * Internal ID
   */
  id: Generated<number>;
  username: string;
}

export interface DB {
  cards: Cards;
  clues: Clues;
  decks: Decks;
  game_status: GameStatus;
  games: Games;
  guesses: Guesses;
  player_roles: PlayerRoles;
  player_round_roles: PlayerRoundRoles;
  player_statuses: PlayerStatuses;
  players: Players;
  round_status: RoundStatus;
  rounds: Rounds;
  sessions: Sessions;
  teams: Teams;
  turns: Turns;
  users: Users;
}
