import { z } from "zod";

export const BOARD_SIZE = 10;

export const SHIP_IDS = [
  "carrier",
  "battleship",
  "cruiser",
  "submarine",
  "destroyer"
] as const;

export type ShipId = (typeof SHIP_IDS)[number];

export const FLEET = [
  { id: "carrier", name: "Porta-avioes", size: 5 },
  { id: "battleship", name: "Encouracado", size: 4 },
  { id: "cruiser", name: "Cruzador", size: 3 },
  { id: "submarine", name: "Submarino", size: 3 },
  { id: "destroyer", name: "Destroyer", size: 2 }
] as const satisfies ReadonlyArray<ShipDefinition>;

export type Orientation = "horizontal" | "vertical";
export type RoomPhase = "waiting" | "placing" | "playing" | "finished";
export type AttackResult = "miss" | "hit" | "sunk";

export interface Coordinate {
  row: number;
  col: number;
}

export interface ShipDefinition {
  id: ShipId;
  name: string;
  size: number;
}

export interface ShipPlacement {
  id: ShipId;
  origin: Coordinate;
  orientation: Orientation;
}

export interface Shot {
  coordinate: Coordinate;
  result: AttackResult;
  shipId?: ShipId;
}

export interface AttackResolution {
  shot: Shot;
  didWin: boolean;
  sunkShipId?: ShipId;
}

export interface PlayerView {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
}

export interface PlayerPrivateView {
  id: string;
  name: string;
  ready: boolean;
  ships: ShipPlacement[];
  incomingShots: Shot[];
  outgoingShots: Shot[];
}

export interface OpponentView {
  id?: string;
  name?: string;
  connected?: boolean;
  ready?: boolean;
  ships?: ShipPlacement[];
}

export interface AttackEvent {
  attackerId: string;
  defenderId: string;
  coordinate: Coordinate;
  result: AttackResult;
  shipId?: ShipId;
  winnerPlayerId?: string;
}

export interface RoomView {
  roomCode: string;
  phase: RoomPhase;
  playerId: string;
  players: PlayerView[];
  me: PlayerPrivateView;
  opponent?: OpponentView;
  currentTurnPlayerId?: string;
  winnerPlayerId?: string;
  lastAttack?: AttackEvent;
}

export interface GameAck<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export class GameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameRuleError";
  }
}

export const coordinateSchema = z.object({
  row: z.number().int().min(0).max(BOARD_SIZE - 1),
  col: z.number().int().min(0).max(BOARD_SIZE - 1)
});

export const orientationSchema = z.enum(["horizontal", "vertical"]);
export const shipIdSchema = z.enum(SHIP_IDS);

export const shipPlacementSchema = z.object({
  id: shipIdSchema,
  origin: coordinateSchema,
  orientation: orientationSchema
});

export const createRoomPayloadSchema = z.object({
  playerName: z.string().trim().min(1).max(24).optional()
});

export const joinRoomPayloadSchema = z.object({
  roomCode: z.string().trim().min(4).max(8),
  playerName: z.string().trim().min(1).max(24).optional()
});

export const placeShipsPayloadSchema = z.object({
  roomCode: z.string().trim().min(4).max(8),
  playerId: z.string().min(1),
  ships: z.array(shipPlacementSchema)
});

export const attackPayloadSchema = z.object({
  roomCode: z.string().trim().min(4).max(8),
  playerId: z.string().min(1),
  coordinate: coordinateSchema
});

export const restartPayloadSchema = z.object({
  roomCode: z.string().trim().min(4).max(8),
  playerId: z.string().min(1)
});

export function getShipDefinition(id: ShipId): ShipDefinition {
  const ship = FLEET.find((entry) => entry.id === id);

  if (!ship) {
    throw new GameRuleError(`Navio desconhecido: ${id}`);
  }

  return ship;
}

export function coordinateKey(coordinate: Coordinate): string {
  return `${coordinate.row}:${coordinate.col}`;
}

export function sameCoordinate(left: Coordinate, right: Coordinate): boolean {
  return left.row === right.row && left.col === right.col;
}

export function isCoordinateInsideBoard(coordinate: Coordinate): boolean {
  return (
    Number.isInteger(coordinate.row) &&
    Number.isInteger(coordinate.col) &&
    coordinate.row >= 0 &&
    coordinate.row < BOARD_SIZE &&
    coordinate.col >= 0 &&
    coordinate.col < BOARD_SIZE
  );
}

export function getShipCells(placement: ShipPlacement): Coordinate[] {
  const definition = getShipDefinition(placement.id);

  return Array.from({ length: definition.size }, (_, offset) => ({
    row:
      placement.orientation === "vertical"
        ? placement.origin.row + offset
        : placement.origin.row,
    col:
      placement.orientation === "horizontal"
        ? placement.origin.col + offset
        : placement.origin.col
  }));
}

export function validatePlacementAgainstFleet(
  existingShips: ShipPlacement[],
  candidate: ShipPlacement
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const candidateCells = getShipCells(candidate);
  const occupied = new Set(
    existingShips
      .filter((ship) => ship.id !== candidate.id)
      .flatMap((ship) => getShipCells(ship))
      .map(coordinateKey)
  );

  if (existingShips.some((ship) => ship.id === candidate.id)) {
    errors.push("Este navio ja foi posicionado.");
  }

  for (const cell of candidateCells) {
    if (!isCoordinateInsideBoard(cell)) {
      errors.push("O navio ultrapassa o limite do tabuleiro.");
      break;
    }

    if (occupied.has(coordinateKey(cell))) {
      errors.push("O navio sobrepoe outro navio.");
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateFleetPlacements(
  ships: ShipPlacement[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const ids = ships.map((ship) => ship.id);
  const uniqueIds = new Set(ids);

  if (ships.length !== FLEET.length) {
    errors.push("A frota deve conter todos os navios padrao.");
  }

  for (const ship of FLEET) {
    if (!uniqueIds.has(ship.id)) {
      errors.push(`Falta posicionar: ${ship.name}.`);
    }
  }

  if (uniqueIds.size !== ids.length) {
    errors.push("A frota contem navios duplicados.");
  }

  const occupied = new Map<string, ShipId>();

  for (const placement of ships) {
    const parsed = shipPlacementSchema.safeParse(placement);

    if (!parsed.success) {
      errors.push("A frota contem um navio invalido.");
      continue;
    }

    for (const cell of getShipCells(placement)) {
      if (!isCoordinateInsideBoard(cell)) {
        errors.push(`${getShipDefinition(placement.id).name} sai do tabuleiro.`);
        continue;
      }

      const key = coordinateKey(cell);
      const previousShip = occupied.get(key);

      if (previousShip && previousShip !== placement.id) {
        errors.push(
          `${getShipDefinition(placement.id).name} sobrepoe ${getShipDefinition(previousShip).name}.`
        );
      }

      occupied.set(key, placement.id);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function hasShotAt(shots: Shot[], coordinate: Coordinate): boolean {
  return shots.some((shot) => sameCoordinate(shot.coordinate, coordinate));
}

export function resolveAttack(
  ships: ShipPlacement[],
  previousShots: Shot[],
  coordinate: Coordinate
): AttackResolution {
  if (!isCoordinateInsideBoard(coordinate)) {
    throw new GameRuleError("Ataque fora do tabuleiro.");
  }

  if (hasShotAt(previousShots, coordinate)) {
    throw new GameRuleError("Esta coordenada ja foi atacada.");
  }

  const hitShip = ships.find((ship) =>
    getShipCells(ship).some((cell) => sameCoordinate(cell, coordinate))
  );

  if (!hitShip) {
    const shot: Shot = { coordinate, result: "miss" };
    return { shot, didWin: areAllShipsSunk(ships, [...previousShots, shot]) };
  }

  const hitKeys = new Set(
    previousShots
      .filter((shot) => shot.result === "hit" || shot.result === "sunk")
      .map((shot) => coordinateKey(shot.coordinate))
  );
  hitKeys.add(coordinateKey(coordinate));

  const sunk = getShipCells(hitShip).every((cell) =>
    hitKeys.has(coordinateKey(cell))
  );
  const shot: Shot = {
    coordinate,
    result: sunk ? "sunk" : "hit",
    shipId: hitShip.id
  };
  const shots = [...previousShots, shot];

  return {
    shot,
    didWin: areAllShipsSunk(ships, shots),
    sunkShipId: sunk ? hitShip.id : undefined
  };
}

export function areAllShipsSunk(ships: ShipPlacement[], shots: Shot[]): boolean {
  if (ships.length === 0) {
    return false;
  }

  const hitKeys = new Set(
    shots
      .filter((shot) => shot.result === "hit" || shot.result === "sunk")
      .map((shot) => coordinateKey(shot.coordinate))
  );

  return ships.every((ship) =>
    getShipCells(ship).every((cell) => hitKeys.has(coordinateKey(cell)))
  );
}

export function createEmptyBoard<T>(initialValue: T): T[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => initialValue)
  );
}
