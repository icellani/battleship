import { describe, expect, it } from "vitest";
import { type ShipPlacement } from "@batalha-naval/shared";
import { RoomManager } from "../roomManager";

const fleet: ShipPlacement[] = [
  { id: "carrier", origin: { row: 0, col: 0 }, orientation: "horizontal" },
  { id: "battleship", origin: { row: 2, col: 0 }, orientation: "horizontal" },
  { id: "cruiser", origin: { row: 4, col: 0 }, orientation: "horizontal" },
  { id: "submarine", origin: { row: 6, col: 0 }, orientation: "horizontal" },
  { id: "destroyer", origin: { row: 8, col: 0 }, orientation: "horizontal" }
];

const shiftedFleet: ShipPlacement[] = [
  { id: "carrier", origin: { row: 0, col: 0 }, orientation: "vertical" },
  { id: "battleship", origin: { row: 0, col: 2 }, orientation: "vertical" },
  { id: "cruiser", origin: { row: 0, col: 4 }, orientation: "vertical" },
  { id: "submarine", origin: { row: 0, col: 6 }, orientation: "vertical" },
  { id: "destroyer", origin: { row: 0, col: 8 }, orientation: "vertical" }
];

describe("RoomManager", () => {
  it("creates rooms and lets a second player join", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("socket-a", "Ana");
    const guest = manager.joinRoom("socket-b", host.roomCode, "Bia");
    const hostView = manager.getRoomView(host.roomCode, host.playerId);

    expect(guest.roomCode).toBe(host.roomCode);
    expect(hostView.players).toHaveLength(2);
    expect(hostView.phase).toBe("placing");
  });

  it("blocks a third player", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("socket-a", "Ana");

    manager.joinRoom("socket-b", host.roomCode, "Bia");

    expect(() => manager.joinRoom("socket-c", host.roomCode, "Caio")).toThrow(
      "dois jogadores"
    );
  });

  it("starts only after both players place valid fleets", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("socket-a", "Ana");
    const guest = manager.joinRoom("socket-b", host.roomCode, "Bia");

    manager.placeShips(host.roomCode, host.playerId, fleet);
    expect(manager.getRoomView(host.roomCode, host.playerId).phase).toBe("placing");

    manager.placeShips(host.roomCode, guest.playerId, shiftedFleet);
    const state = manager.getRoomView(host.roomCode, host.playerId);

    expect(state.phase).toBe("playing");
    expect(state.currentTurnPlayerId).toBe(host.playerId);
  });

  it("rejects attacks outside the active turn", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("socket-a", "Ana");
    const guest = manager.joinRoom("socket-b", host.roomCode, "Bia");

    manager.placeShips(host.roomCode, host.playerId, fleet);
    manager.placeShips(host.roomCode, guest.playerId, shiftedFleet);

    expect(() =>
      manager.attack(host.roomCode, guest.playerId, { row: 9, col: 9 })
    ).toThrow("turno");
  });

  it("alternates turns after a valid attack", () => {
    const manager = new RoomManager();
    const host = manager.createRoom("socket-a", "Ana");
    const guest = manager.joinRoom("socket-b", host.roomCode, "Bia");

    manager.placeShips(host.roomCode, host.playerId, fleet);
    manager.placeShips(host.roomCode, guest.playerId, shiftedFleet);
    manager.attack(host.roomCode, host.playerId, { row: 9, col: 9 });

    expect(manager.getRoomView(host.roomCode, host.playerId).currentTurnPlayerId)
      .toBe(guest.playerId);
  });
});
