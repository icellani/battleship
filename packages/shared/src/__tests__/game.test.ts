import { describe, expect, it } from "vitest";
import {
  FLEET,
  ShipPlacement,
  areAllShipsSunk,
  resolveAttack,
  validateFleetPlacements
} from "../index";

const validFleet: ShipPlacement[] = [
  { id: "carrier", origin: { row: 0, col: 0 }, orientation: "horizontal" },
  { id: "battleship", origin: { row: 2, col: 0 }, orientation: "horizontal" },
  { id: "cruiser", origin: { row: 4, col: 0 }, orientation: "horizontal" },
  { id: "submarine", origin: { row: 6, col: 0 }, orientation: "horizontal" },
  { id: "destroyer", origin: { row: 8, col: 0 }, orientation: "horizontal" }
];

describe("game rules", () => {
  it("accepts the standard fleet in valid positions", () => {
    expect(validateFleetPlacements(validFleet)).toEqual({
      valid: true,
      errors: []
    });
  });

  it("rejects ships that leave the board", () => {
    const fleet = validFleet.map((ship) =>
      ship.id === "carrier"
        ? { ...ship, origin: { row: 0, col: 8 }, orientation: "horizontal" as const }
        : ship
    );

    expect(validateFleetPlacements(fleet).valid).toBe(false);
  });

  it("rejects overlapping ships", () => {
    const fleet = validFleet.map((ship) =>
      ship.id === "destroyer"
        ? { ...ship, origin: { row: 0, col: 2 }, orientation: "horizontal" as const }
        : ship
    );

    expect(validateFleetPlacements(fleet).valid).toBe(false);
  });

  it("reports misses, hits and sunk ships", () => {
    const miss = resolveAttack(validFleet, [], { row: 9, col: 9 });
    expect(miss.shot.result).toBe("miss");

    const hit = resolveAttack(validFleet, [miss.shot], { row: 8, col: 0 });
    expect(hit.shot.result).toBe("hit");

    const sunk = resolveAttack(validFleet, [miss.shot, hit.shot], {
      row: 8,
      col: 1
    });
    expect(sunk.shot.result).toBe("sunk");
    expect(sunk.sunkShipId).toBe("destroyer");
  });

  it("blocks repeated attacks", () => {
    const first = resolveAttack(validFleet, [], { row: 9, col: 9 });

    expect(() => resolveAttack(validFleet, [first.shot], { row: 9, col: 9 }))
      .toThrow("ja foi atacada");
  });

  it("detects victory when every ship cell has been hit", () => {
    const shots = validFleet.flatMap((ship) => {
      const definition = FLEET.find((entry) => entry.id === ship.id);
      if (!definition) {
        return [];
      }

      return Array.from({ length: definition.size }, (_, offset) => ({
        coordinate: { row: ship.origin.row, col: ship.origin.col + offset },
        result: "hit" as const,
        shipId: ship.id
      }));
    });

    expect(areAllShipsSunk(validFleet, shots)).toBe(true);
  });
});
