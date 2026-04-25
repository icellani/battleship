import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Board } from "../components/Board";

describe("Board", () => {
  it("renders ship, miss, hit and sunk cells", () => {
    render(
      <Board
        label="Tabuleiro de teste"
        mode="own"
        ships={[
          { id: "destroyer", origin: { row: 0, col: 0 }, orientation: "horizontal" }
        ]}
        shots={[
          { coordinate: { row: 1, col: 1 }, result: "miss" },
          { coordinate: { row: 0, col: 0 }, result: "hit", shipId: "destroyer" },
          { coordinate: { row: 0, col: 1 }, result: "sunk", shipId: "destroyer" }
        ]}
        testId="test-board"
      />
    );

    expect(screen.getByTestId("test-board-cell-1-1")).toHaveAttribute(
      "data-state",
      "cell-miss"
    );
    expect(screen.getByTestId("test-board-cell-0-0")).toHaveAttribute(
      "data-state",
      "cell-hit"
    );
    expect(screen.getByTestId("test-board-cell-0-1")).toHaveAttribute(
      "data-state",
      "cell-sunk"
    );
  });
});
