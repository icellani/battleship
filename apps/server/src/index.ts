import cors from "@fastify/cors";
import {
  type GameAck,
  GameRuleError,
  attackPayloadSchema,
  createRoomPayloadSchema,
  joinRoomPayloadSchema,
  placeShipsPayloadSchema,
  restartPayloadSchema
} from "@batalha-naval/shared";
import Fastify from "fastify";
import { Server } from "socket.io";
import { ZodError } from "zod";
import { RoomManager } from "./roomManager";

const PORT = Number(process.env.PORT ?? 3333);
const HOST = process.env.HOST ?? "0.0.0.0";

const fastify = Fastify({ logger: true });
await fastify.register(cors, { origin: true });

const manager = new RoomManager();
const io = new Server(fastify.server, {
  cors: {
    origin: true
  }
});

fastify.get("/health", async () => ({
  ok: true,
  service: "batalha-naval-server"
}));

fastify.get("/", async () => ({
  ok: true,
  message: "Batalha Naval server"
}));

io.on("connection", (socket) => {
  socket.on("room:create", (payload, ack?: (response: GameAck) => void) => {
    handleAck(socket, ack, () => {
      const parsed = createRoomPayloadSchema.parse(payload ?? {});
      const result = manager.createRoom(socket.id, parsed.playerName);
      socket.join(result.roomCode);
      const state = manager.getRoomView(result.roomCode, result.playerId);
      emitRoomState(result.roomCode);

      return { ...result, state };
    });
  });

  socket.on("room:join", (payload, ack?: (response: GameAck) => void) => {
    handleAck(socket, ack, () => {
      const parsed = joinRoomPayloadSchema.parse(payload ?? {});
      const result = manager.joinRoom(socket.id, parsed.roomCode, parsed.playerName);
      socket.join(result.roomCode);
      const state = manager.getRoomView(result.roomCode, result.playerId);
      emitRoomState(result.roomCode);

      return { ...result, state };
    });
  });

  socket.on("ships:place", (payload, ack?: (response: GameAck) => void) => {
    handleAck(socket, ack, () => {
      const parsed = placeShipsPayloadSchema.parse(payload ?? {});
      const room = manager.placeShips(parsed.roomCode, parsed.playerId, parsed.ships);

      if (room.phase === "playing") {
        io.to(room.roomCode).emit("game:started");
      }

      emitRoomState(room.roomCode);

      return { state: manager.getRoomView(room.roomCode, parsed.playerId) };
    });
  });

  socket.on("game:attack", (payload, ack?: (response: GameAck) => void) => {
    handleAck(socket, ack, () => {
      const parsed = attackPayloadSchema.parse(payload ?? {});
      const { room, attack } = manager.attack(
        parsed.roomCode,
        parsed.playerId,
        parsed.coordinate
      );

      io.to(room.roomCode).emit("game:attackResult", attack);

      if (room.phase === "finished") {
        io.to(room.roomCode).emit("game:finished", {
          winnerPlayerId: room.winnerPlayerId
        });
      }

      emitRoomState(room.roomCode);

      return { attack, state: manager.getRoomView(room.roomCode, parsed.playerId) };
    });
  });

  socket.on("game:restart", (payload, ack?: (response: GameAck) => void) => {
    handleAck(socket, ack, () => {
      const parsed = restartPayloadSchema.parse(payload ?? {});
      const room = manager.restart(parsed.roomCode, parsed.playerId);
      emitRoomState(room.roomCode);

      return { state: manager.getRoomView(room.roomCode, parsed.playerId) };
    });
  });

  socket.on("disconnect", () => {
    for (const roomCode of manager.disconnectSocket(socket.id)) {
      emitRoomState(roomCode);
    }
  });
});

function handleAck<T>(
  socket: { emit: (event: string, payload: unknown) => void },
  ack: ((response: GameAck<T>) => void) | undefined,
  work: () => T
): void {
  try {
    ack?.({ ok: true, data: work() });
  } catch (error) {
    const message = errorToMessage(error);
    socket.emit("error:game", { message });
    ack?.({ ok: false, error: message });
  }
}

function errorToMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return "Payload invalido.";
  }

  if (error instanceof GameRuleError || error instanceof Error) {
    return error.message;
  }

  return "Erro inesperado.";
}

function emitRoomState(roomCode: string): void {
  for (const participant of manager.getRoomParticipants(roomCode)) {
    if (!participant.socketId) {
      continue;
    }

    io.to(participant.socketId).emit(
      "room:state",
      manager.getRoomView(roomCode, participant.playerId)
    );
  }
}

await fastify.listen({ port: PORT, host: HOST });
