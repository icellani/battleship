import { expect, test } from "@playwright/test";

const winningShots = [
  [0, 0],
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [2, 0],
  [2, 1],
  [2, 2],
  [2, 3],
  [4, 0],
  [4, 1],
  [4, 2],
  [6, 0],
  [6, 1],
  [6, 2],
  [8, 0],
  [8, 1]
];

const missShots = [
  [9, 9],
  [9, 8],
  [9, 7],
  [9, 6],
  [9, 5],
  [9, 4],
  [9, 3],
  [9, 2],
  [9, 1],
  [9, 0],
  [1, 9],
  [3, 9],
  [5, 9],
  [7, 9],
  [1, 8],
  [3, 8]
];

test("two players complete a match", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const playerA = await contextA.newPage();
  const playerB = await contextB.newPage();

  await playerA.goto("/");
  await playerA.getByLabel("Nome").fill("Ana");
  await playerA.getByRole("button", { name: /Criar sala/i }).click();

  const roomCode = await playerA.getByTestId("room-code").textContent();
  expect(roomCode).toBeTruthy();

  await playerB.goto("/");
  await playerB.getByLabel("Nome").fill("Bia");
  await playerB.getByLabel("Codigo da sala").fill(roomCode ?? "");
  await playerB.getByRole("button", { name: /Entrar/i }).click();

  await playerA.getByRole("button", { name: /Auto/i }).click();
  await playerA.getByRole("button", { name: /Confirmar frota/i }).click();
  await playerB.getByRole("button", { name: /Auto/i }).click();
  await playerB.getByRole("button", { name: /Confirmar frota/i }).click();

  for (let index = 0; index < winningShots.length; index += 1) {
    const [row, col] = winningShots[index]!;
    await expect(playerA.getByTestId("turn-banner")).toContainText("Seu turno");
    await playerA.getByTestId(`enemy-board-cell-${row}-${col}`).click();

    if (index < winningShots.length - 1) {
      const [missRow, missCol] = missShots[index]!;
      await expect(playerB.getByTestId("turn-banner")).toContainText("Seu turno");
      await playerB.getByTestId(`enemy-board-cell-${missRow}-${missCol}`).click();
    }
  }

  await expect(playerA.getByTestId("turn-banner")).toContainText("Vitoria");
  await expect(playerB.getByTestId("turn-banner")).toContainText("Derrota");

  await contextA.close();
  await contextB.close();
});
