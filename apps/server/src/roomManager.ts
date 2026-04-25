import {
  type AttackEvent,
  type Coordinate,
  GameRuleError,
  type PlayerView,
  type RoomPhase,
  type RoomView,
  type ShipPlacement,
  type Shot,
  resolveAttack,
  validateFleetPlacements
} from "@batalha-naval/shared";
import { randomUUID } from "node:crypto";

interface PlayerRecord {
  id: string;
  name: string;
  socketId?: string;
  connected: boolean;
  ready: boolean;
  ships: ShipPlacement[];
  incomingShots: Shot[];
  outgoingShots: Shot[];
}

interface RoomRecord {
  roomCode: string;
  phase: RoomPhase;
  players: PlayerRecord[];
  currentTurnPlayerId?: string;
  winnerPlayerId?: string;
  lastAttack?: AttackEvent;
}

export interface CreateRoomResult {
  roomCode: string;
  playerId: string;
}

export interface AttackResult {
  room: RoomRecord;
  attack: AttackEvent;
}

const DEFAULT_PLAYER_NAME = "Jogador";
const ROOM_CODE_LENGTH = 5;

export class RoomManager {
  private readonly rooms = new Map<string, RoomRecord>();

  createRoom(socketId: string, playerName?: string): CreateRoomResult {
    const roomCode = this.generateRoomCode();
    const player = this.createPlayer(socketId, playerName, 1);

    this.rooms.set(roomCode, {
      roomCode,
      phase: "waiting",
      players: [player]
    });

    return { roomCode, playerId: player.id };
  }

  joinRoom(socketId: string, roomCodeInput: string, playerName?: string): CreateRoomResult {
    const roomCode = roomCodeInput.trim().toUpperCase();
    const room = this.getRoomOrThrow(roomCode);

    if (room.players.length >= 2) {
      throw new GameRuleError("A sala ja possui dois jogadores.");
    }

    const player = this.createPlayer(socketId, playerName, room.players.length + 1);
    room.players.push(player);
    room.phase = "placing";

    return { roomCode, playerId: player.id };
  }

  placeShips(roomCodeInput: string, playerId: string, ships: ShipPlacement[]): RoomRecord {
    const room = this.getRoomOrThrow(roomCodeInput);
    const player = this.getPlayerOrThrow(room, playerId);

    if (room.phase !== "placing") {
      throw new GameRuleError("A sala nao esta aceitando posicionamento.");
    }

    const validation = validateFleetPlacements(ships);
    if (!validation.valid) {
      throw new GameRuleError(validation.errors[0] ?? "Frota invalida.");
    }

    player.ships = ships;
    player.ready = true;

    if (room.players.length === 2 && room.players.every((entry) => entry.ready)) {
      room.phase = "playing";
      room.currentTurnPlayerId = room.players[0]?.id;
    }

    return room;
  }

  attack(roomCodeInput: string, playerId: string, coordinate: Coordinate): AttackResult {
    const room = this.getRoomOrThrow(roomCodeInput);
    const attacker = this.getPlayerOrThrow(room, playerId);
    const defender = room.players.find((player) => player.id !== attacker.id);

    if (room.phase !== "playing") {
      throw new GameRuleError("A partida ainda nao esta em andamento.");
    }

    if (!defender) {
      throw new GameRuleError("A sala precisa de dois jogadores.");
    }

    if (room.currentTurnPlayerId !== attacker.id) {
      throw new GameRuleError("Aguarde o seu turno.");
    }

    const resolution = resolveAttack(defender.ships, defender.incomingShots, coordinate);
    const shot = resolution.shot;

    attacker.outgoingShots.push(shot);
    defender.incomingShots.push(shot);

    const attack: AttackEvent = {
      attackerId: attacker.id,
      defenderId: defender.id,
      coordinate,
      result: shot.result,
      shipId: shot.shipId
    };

    if (resolution.didWin) {
      room.phase = "finished";
      room.winnerPlayerId = attacker.id;
      room.currentTurnPlayerId = undefined;
      attack.winnerPlayerId = attacker.id;
    } else {
      room.currentTurnPlayerId = defender.id;
    }

    room.lastAttack = attack;

    return { room, attack };
  }

  restart(roomCodeInput: string, playerId: string): RoomRecord {
    const room = this.getRoomOrThrow(roomCodeInput);
    this.getPlayerOrThrow(room, playerId);

    if (room.phase !== "finished") {
      throw new GameRuleError("A partida so pode ser reiniciada quando terminar.");
    }

    for (const player of room.players) {
      player.ready = false;
      player.ships = [];
      player.incomingShots = [];
      player.outgoingShots = [];
    }

    room.phase = room.players.length === 2 ? "placing" : "waiting";
    room.currentTurnPlayerId = undefined;
    room.winnerPlayerId = undefined;
    room.lastAttack = undefined;

    return room;
  }

  getRoomView(roomCodeInput: string, playerId: string): RoomView {
    const room = this.getRoomOrThrow(roomCodeInput);
    const me = this.getPlayerOrThrow(room, playerId);
    const opponent = room.players.find((player) => player.id !== playerId);
    const players: PlayerView[] = room.players.map((player) => ({
      id: player.id,
      name: player.name,
      connected: player.connected,
      ready: player.ready
    }));

    return {
      roomCode: room.roomCode,
      phase: room.phase,
      playerId,
      players,
      me: {
        id: me.id,
        name: me.name,
        ready: me.ready,
        ships: [...me.ships],
        incomingShots: [...me.incomingShots],
        outgoingShots: [...me.outgoingShots]
      },
      opponent: opponent
        ? {
            id: opponent.id,
            name: opponent.name,
            connected: opponent.connected,
            ready: opponent.ready,
            ships: room.phase === "finished" ? [...opponent.ships] : undefined
          }
        : undefined,
      currentTurnPlayerId: room.currentTurnPlayerId,
      winnerPlayerId: room.winnerPlayerId,
      lastAttack: room.lastAttack
    };
  }

  getRoomParticipants(roomCodeInput: string): Array<{ playerId: string; socketId?: string }> {
    const room = this.getRoomOrThrow(roomCodeInput);

    return room.players.map((player) => ({
      playerId: player.id,
      socketId: player.socketId
    }));
  }

  disconnectSocket(socketId: string): string[] {
    const affectedRooms: string[] = [];

    for (const room of this.rooms.values()) {
      const player = room.players.find((entry) => entry.socketId === socketId);

      if (player) {
        player.connected = false;
        player.socketId = undefined;
        affectedRooms.push(room.roomCode);
      }
    }

    return affectedRooms;
  }

  private getRoomOrThrow(roomCodeInput: string): RoomRecord {
    const roomCode = roomCodeInput.trim().toUpperCase();
    const room = this.rooms.get(roomCode);

    if (!room) {
      throw new GameRuleError("Sala nao encontrada.");
    }

    return room;
  }

  private getPlayerOrThrow(room: RoomRecord, playerId: string): PlayerRecord {
    const player = room.players.find((entry) => entry.id === playerId);

    if (!player) {
      throw new GameRuleError("Jogador nao encontrado nesta sala.");
    }

    return player;
  }

  private createPlayer(socketId: string, playerName: string | undefined, index: number): PlayerRecord {
    return {
      id: randomUUID(),
      name: playerName?.trim() || `${DEFAULT_PLAYER_NAME} ${index}`,
      socketId,
      connected: true,
      ready: false,
      ships: [],
      incomingShots: [],
      outgoingShots: []
    };
  }

  private generateRoomCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let roomCode = "";

    do {
      roomCode = Array.from({ length: ROOM_CODE_LENGTH }, () =>
        alphabet[Math.floor(Math.random() * alphabet.length)]
      ).join("");
    } while (this.rooms.has(roomCode));

    return roomCode;
  }
}
