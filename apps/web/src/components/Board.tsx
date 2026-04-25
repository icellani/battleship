import {
  BOARD_SIZE,
  type Coordinate,
  type ShipPlacement,
  type Shot,
  coordinateKey,
  getShipDefinition,
  getShipCells,
  sameCoordinate
} from "@batalha-naval/shared";
import type { CSSProperties } from "react";
import { shipAssetById } from "../assets/ships";

type BoardMode = "own" | "enemy" | "placement";

export interface BoardProps {
  label: string;
  mode: BoardMode;
  ships?: ShipPlacement[];
  shots?: Shot[];
  recentShot?: Coordinate;
  interactive?: boolean;
  disabled?: boolean;
  onCellClick?: (coordinate: Coordinate) => void;
  testId?: string;
}

export function Board({
  label,
  mode,
  ships = [],
  shots = [],
  recentShot,
  interactive = false,
  disabled = false,
  onCellClick,
  testId = "board"
}: BoardProps) {
  const shipCells = new Set(
    ships.flatMap((ship) => getShipCells(ship).map(coordinateKey))
  );
  const shotByCell = new Map<string, Shot>(
    shots.map((shot) => [coordinateKey(shot.coordinate), shot])
  );
  const rows = Array.from({ length: BOARD_SIZE }, (_, row) => row);
  const columns = Array.from({ length: BOARD_SIZE }, (_, col) => col);
  const hasVisibleShips = ships.length > 0;
  const recentShotKey = recentShot ? coordinateKey(recentShot) : undefined;
  const recentShotRecord = recentShotKey ? shotByCell.get(recentShotKey) : undefined;

  return (
    <section className="board-shell" aria-label={label} data-testid={testId}>
      <div className="board-title">{label}</div>
      <div className={`board-frame board-${mode} ${hasVisibleShips ? "has-ships" : ""}`}>
        {hasVisibleShips ? (
          <div className="ship-layer" aria-hidden="true">
            {ships.map((ship) => {
              const definition = getShipDefinition(ship.id);
              const isRecentHit =
                recentShotRecord?.shipId === ship.id &&
                (recentShotRecord.result === "hit" || recentShotRecord.result === "sunk");

              return (
                <img
                  alt=""
                  className={`ship-image ship-${ship.orientation} ${isRecentHit ? "ship-under-fire" : ""}`}
                  key={ship.id}
                  src={shipAssetById[ship.id]}
                  style={getShipImageStyle(ship, definition.size)}
                />
              );
            })}
          </div>
        ) : null}

        <div className="board-grid">
          {rows.map((row) =>
            columns.map((col) => {
              const coordinate = { row, col };
              const key = coordinateKey(coordinate);
              const shot = shotByCell.get(key);
              const containsShip = shipCells.has(key);
              const cellState = getCellState(containsShip, shot);
              const isRecentShot = recentShotKey === key;
              const isDisabled =
                disabled ||
                !interactive ||
                !onCellClick ||
                shots.some((entry) => sameCoordinate(entry.coordinate, coordinate));

              return (
                <button
                  className={`board-cell ${cellState} ${isRecentShot ? "is-latest-shot" : ""}`}
                  data-state={cellState}
                  data-testid={`${testId}-cell-${row}-${col}`}
                  disabled={isDisabled}
                  key={key}
                  onClick={() => onCellClick?.(coordinate)}
                  title={`${String.fromCharCode(65 + row)}${col + 1}`}
                  type="button"
                >
                  <span className="sr-only">
                    {label} {String.fromCharCode(65 + row)}
                    {col + 1} {cellState}
                  </span>
                  {shot ? (
                    <span
                      aria-hidden="true"
                      className={`shot-effect shot-${shot.result}`}
                    />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

function getShipImageStyle(ship: ShipPlacement, size: number): CSSProperties {
  const cell = 100 / BOARD_SIZE;

  if (ship.orientation === "vertical") {
    return {
      height: `${cell}%`,
      left: `${(ship.origin.col + 1) * cell}%`,
      top: `${ship.origin.row * cell}%`,
      transform: "rotate(90deg)",
      transformOrigin: "top left",
      width: `${size * cell}%`
    };
  }

  return {
    height: `${cell}%`,
    left: `${ship.origin.col * cell}%`,
    top: `${ship.origin.row * cell}%`,
    width: `${size * cell}%`
  };
}

function getCellState(containsShip: boolean, shot?: Shot): string {
  if (shot?.result === "miss") {
    return "cell-miss";
  }

  if (shot?.result === "hit") {
    return "cell-hit";
  }

  if (shot?.result === "sunk") {
    return "cell-sunk";
  }

  if (containsShip) {
    return "cell-ship";
  }

  return "cell-water";
}
