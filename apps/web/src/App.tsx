import {
  Anchor,
  Clipboard,
  Crosshair,
  LogIn,
  Plus,
  RefreshCw,
  RotateCw,
  Send,
  Shuffle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import {
  type AttackResult,
  FLEET,
  type Coordinate,
  type GameAck,
  type RoomView,
  type ShipId,
  type ShipPlacement,
  hasShotAt,
  validateFleetPlacements,
  validatePlacementAgainstFleet
} from "@batalha-naval/shared";
import { shipAssetById } from "./assets/ships";
import { Board } from "./components/Board";

interface RoomCreateResponse {
  roomCode: string;
  playerId: string;
  state: RoomView;
}

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ??
  `${window.location.protocol}//${window.location.hostname}:3333`;
const socket = io(SERVER_URL);

const AUTO_FLEET: ShipPlacement[] = [
  { id: "carrier", origin: { row: 0, col: 0 }, orientation: "horizontal" },
  { id: "battleship", origin: { row: 2, col: 0 }, orientation: "horizontal" },
  { id: "cruiser", origin: { row: 4, col: 0 }, orientation: "horizontal" },
  { id: "submarine", origin: { row: 6, col: 0 }, orientation: "horizontal" },
  { id: "destroyer", origin: { row: 8, col: 0 }, orientation: "horizontal" }
];

export function App() {
  const [playerName, setPlayerName] = useState("Jogador");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomView | null>(null);
  const [placements, setPlacements] = useState<ShipPlacement[]>([]);
  const [selectedShipId, setSelectedShipId] = useState<ShipId>("carrier");
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [message, setMessage] = useState("Conectando ao servidor...");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const handleConnect = () => setMessage("Servidor conectado.");
    const handleDisconnect = () => setMessage("Servidor desconectado.");
    const handleRoomState = (state: RoomView) => {
      setRoomState(state);
      setPlayerId(state.playerId);
      localStorage.setItem("batalha-naval-player", state.playerId);
      localStorage.setItem("batalha-naval-room", state.roomCode);
    };
    const handleGameError = (payload: { message: string }) => setMessage(payload.message);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room:state", handleRoomState);
    socket.on("error:game", handleGameError);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room:state", handleRoomState);
      socket.off("error:game", handleGameError);
    };
  }, []);

  useEffect(() => {
    if (roomState?.phase === "placing" && !roomState.me.ready) {
      setPlacements(roomState.me.ships);
      const firstAvailable = FLEET.find(
        (ship) => !roomState.me.ships.some((placement) => placement.id === ship.id)
      );
      setSelectedShipId(firstAvailable?.id ?? "carrier");
    }
  }, [roomState?.phase, roomState?.me.ready, roomState?.me.ships]);

  const unplacedShips = useMemo(
    () => FLEET.filter((ship) => !placements.some((placement) => placement.id === ship.id)),
    [placements]
  );
  const fleetValidation = validateFleetPlacements(placements);
  const isMyTurn = roomState?.phase === "playing" && roomState.currentTurnPlayerId === playerId;

  async function createRoom() {
    await runRequest(async () => {
      const response = await emitWithAck<RoomCreateResponse>("room:create", {
        playerName
      });
      setPlayerId(response.playerId);
      setRoomState(response.state);
      setMessage("Sala criada.");
    });
  }

  async function joinRoom() {
    await runRequest(async () => {
      const response = await emitWithAck<RoomCreateResponse>("room:join", {
        roomCode: roomCodeInput,
        playerName
      });
      setPlayerId(response.playerId);
      setRoomState(response.state);
      setMessage("Voce entrou na sala.");
    });
  }

  async function confirmFleet() {
    if (!roomState || !playerId || !fleetValidation.valid) {
      setMessage(fleetValidation.errors[0] ?? "Frota incompleta.");
      return;
    }

    await runRequest(async () => {
      await emitWithAck("ships:place", {
        roomCode: roomState.roomCode,
        playerId,
        ships: placements
      });
      setMessage("Frota confirmada.");
    });
  }

  async function attack(coordinate: Coordinate) {
    if (!roomState || !playerId || !isMyTurn || hasShotAt(roomState.me.outgoingShots, coordinate)) {
      return;
    }

    await runRequest(async () => {
      await emitWithAck("game:attack", {
        roomCode: roomState.roomCode,
        playerId,
        coordinate
      });
    });
  }

  async function restartGame() {
    if (!roomState || !playerId) {
      return;
    }

    await runRequest(async () => {
      await emitWithAck("game:restart", {
        roomCode: roomState.roomCode,
        playerId
      });
      setMessage("Nova partida preparada.");
    });
  }

  function placeShip(coordinate: Coordinate) {
    const candidate: ShipPlacement = {
      id: selectedShipId,
      origin: coordinate,
      orientation
    };
    const existing = placements.filter((ship) => ship.id !== selectedShipId);
    const validation = validatePlacementAgainstFleet(existing, candidate);

    if (!validation.valid) {
      setMessage(validation.errors[0] ?? "Posicao invalida.");
      return;
    }

    const nextPlacements = [...existing, candidate];
    setPlacements(nextPlacements);
    const nextShip = FLEET.find(
      (ship) => !nextPlacements.some((placement) => placement.id === ship.id)
    );

    if (nextShip) {
      setSelectedShipId(nextShip.id);
    }

    setMessage("Navio posicionado.");
  }

  function selectShip(shipId: ShipId) {
    setSelectedShipId(shipId);
  }

  function copyRoomCode() {
    if (!roomState) {
      return;
    }

    navigator.clipboard?.writeText(roomState.roomCode).catch(() => undefined);
    setMessage("Codigo copiado.");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-mark">
            <Anchor size={22} />
            <span>Batalha Naval</span>
          </div>
          <p className="status-line" data-testid="status-line">
            {statusText(roomState, playerId, isMyTurn, message)}
          </p>
        </div>

        {roomState ? (
          <div className="room-chip">
            <span data-testid="room-code">{roomState.roomCode}</span>
            <button className="icon-button" onClick={copyRoomCode} title="Copiar codigo" type="button">
              <Clipboard size={18} />
            </button>
          </div>
        ) : null}
      </header>

      {!roomState ? (
        <Lobby
          isBusy={isBusy}
          onCreate={createRoom}
          onJoin={joinRoom}
          playerName={playerName}
          roomCodeInput={roomCodeInput}
          setPlayerName={setPlayerName}
          setRoomCodeInput={setRoomCodeInput}
        />
      ) : null}

      {roomState?.phase === "waiting" ? <WaitingRoom roomState={roomState} /> : null}

      {roomState?.phase === "placing" ? (
        <PlacementScreen
          disabled={isBusy}
          feedbackMessage={message}
          fleetValidation={fleetValidation}
          onAutoPlace={() => {
            setPlacements(AUTO_FLEET);
            setSelectedShipId("carrier");
            setMessage("Frota automatica posicionada.");
          }}
          onConfirm={confirmFleet}
          onPlaceShip={placeShip}
          onRotate={() =>
            setOrientation((current) =>
              current === "horizontal" ? "vertical" : "horizontal"
            )
          }
          onSelectShip={selectShip}
          orientation={orientation}
          placements={placements}
          roomState={roomState}
          selectedShipId={selectedShipId}
          unplacedShips={unplacedShips}
        />
      ) : null}

      {roomState?.phase === "playing" || roomState?.phase === "finished" ? (
        <GameScreen
          isMyTurn={isMyTurn}
          onAttack={attack}
          onRestart={restartGame}
          playerId={playerId}
          roomState={roomState}
        />
      ) : null}
    </main>
  );

  async function runRequest(work: () => Promise<void>) {
    setIsBusy(true);
    setMessage("Processando...");

    try {
      await work();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setIsBusy(false);
    }
  }
}

function Lobby({
  isBusy,
  onCreate,
  onJoin,
  playerName,
  roomCodeInput,
  setPlayerName,
  setRoomCodeInput
}: {
  isBusy: boolean;
  onCreate: () => void;
  onJoin: () => void;
  playerName: string;
  roomCodeInput: string;
  setPlayerName: (value: string) => void;
  setRoomCodeInput: (value: string) => void;
}) {
  return (
    <section className="panel lobby-panel">
      <div className="field-group">
        <label htmlFor="player-name">Nome</label>
        <input
          id="player-name"
          maxLength={24}
          onChange={(event) => setPlayerName(event.target.value)}
          value={playerName}
        />
      </div>

      <div className="lobby-actions">
        <button disabled={isBusy || !playerName.trim()} onClick={onCreate} type="button">
          <Plus size={18} />
          Criar sala
        </button>

        <div className="join-row">
          <input
            aria-label="Codigo da sala"
            maxLength={8}
            onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
            placeholder="CODIGO"
            value={roomCodeInput}
          />
          <button
            disabled={isBusy || !playerName.trim() || roomCodeInput.trim().length < 4}
            onClick={onJoin}
            type="button"
          >
            <LogIn size={18} />
            Entrar
          </button>
        </div>
      </div>
    </section>
  );
}

function WaitingRoom({ roomState }: { roomState: RoomView }) {
  return (
    <section className="panel waiting-panel">
      <h1>Sala de espera</h1>
      <div className="player-list">
        {roomState.players.map((player) => (
          <div className="player-row" key={player.id}>
            <span>{player.name}</span>
            <strong>{player.connected ? "Online" : "Offline"}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlacementScreen({
  disabled,
  feedbackMessage,
  fleetValidation,
  onAutoPlace,
  onConfirm,
  onPlaceShip,
  onRotate,
  onSelectShip,
  orientation,
  placements,
  roomState,
  selectedShipId,
  unplacedShips
}: {
  disabled: boolean;
  feedbackMessage: string;
  fleetValidation: { valid: boolean; errors: string[] };
  onAutoPlace: () => void;
  onConfirm: () => void;
  onPlaceShip: (coordinate: Coordinate) => void;
  onRotate: () => void;
  onSelectShip: (shipId: ShipId) => void;
  orientation: "horizontal" | "vertical";
  placements: ShipPlacement[];
  roomState: RoomView;
  selectedShipId: ShipId;
  unplacedShips: ReadonlyArray<(typeof FLEET)[number]>;
}) {
  if (roomState.me.ready) {
    return (
      <section className="panel waiting-panel">
        <h1>Frota pronta</h1>
        <Board
          label="Seu tabuleiro"
          mode="own"
          ships={roomState.me.ships}
          testId="own-board"
        />
      </section>
    );
  }

  return (
    <section className="game-layout">
      <aside className="panel fleet-panel">
        <div className="panel-heading">
          <h1>Frota</h1>
          <button className="icon-button" onClick={onRotate} title="Rotacionar" type="button">
            <RotateCw size={18} />
          </button>
        </div>

        <div className="orientation-pill">{orientation === "horizontal" ? "Horizontal" : "Vertical"}</div>

        <div className="ship-list">
          {FLEET.map((ship) => {
            const placed = placements.some((placement) => placement.id === ship.id);
            const selected = selectedShipId === ship.id;

            return (
              <button
                className={`ship-button ${placed ? "is-placed" : ""} ${selected ? "is-selected" : ""}`}
                key={ship.id}
                onClick={() => onSelectShip(ship.id)}
                type="button"
              >
                <img alt="" className="ship-button-image" src={shipAssetById[ship.id]} />
                <span>{ship.name}</span>
                <strong>{ship.size}</strong>
              </button>
            );
          })}
        </div>

        <div className="toolbar">
          <button onClick={onAutoPlace} type="button">
            <Shuffle size={18} />
            Auto
          </button>
          <button disabled={disabled} onClick={onConfirm} type="button">
            <Send size={18} />
            Confirmar frota
          </button>
        </div>

        <p className="small-note">
          {fleetValidation.valid
            ? "Frota completa"
            : unplacedShips.length
              ? `${unplacedShips.length} pendente(s)`
              : fleetValidation.errors[0]}
        </p>
        <p className="feedback-note" data-testid="fleet-feedback">
          {feedbackMessage}
        </p>
      </aside>

      <Board
        interactive
        label="Seu tabuleiro"
        mode="placement"
        onCellClick={onPlaceShip}
        ships={placements}
        testId="placement-board"
      />
    </section>
  );
}

function GameScreen({
  isMyTurn,
  onAttack,
  onRestart,
  playerId,
  roomState
}: {
  isMyTurn: boolean;
  onAttack: (coordinate: Coordinate) => void;
  onRestart: () => void;
  playerId: string | null;
  roomState: RoomView;
}) {
  const isFinished = roomState.phase === "finished";
  const didWin = isFinished && roomState.winnerPlayerId === playerId;
  const recentIncomingShot =
    roomState.lastAttack?.defenderId === playerId
      ? roomState.lastAttack.coordinate
      : undefined;
  const recentOutgoingShot =
    roomState.lastAttack?.attackerId === playerId
      ? roomState.lastAttack.coordinate
      : undefined;

  return (
    <section className="battle-stack">
      <div className={`turn-banner ${isMyTurn ? "is-active" : ""}`} data-testid="turn-banner">
        <Crosshair size={18} />
        {isFinished ? (didWin ? "Vitoria" : "Derrota") : isMyTurn ? "Seu turno" : "Turno adversario"}
        {isFinished ? (
          <button onClick={onRestart} type="button">
            <RefreshCw size={18} />
            Nova partida
          </button>
        ) : null}
      </div>

      <AttackNotice roomState={roomState} />

      <div className="boards-grid">
        <Board
          label="Seu tabuleiro"
          mode="own"
          recentShot={recentIncomingShot}
          ships={roomState.me.ships}
          shots={roomState.me.incomingShots}
          testId="own-board"
        />

        <Board
          disabled={!isMyTurn || isFinished}
          interactive={isMyTurn && !isFinished}
          label="Tabuleiro inimigo"
          mode="enemy"
          onCellClick={onAttack}
          recentShot={recentOutgoingShot}
          ships={roomState.opponent?.ships}
          shots={roomState.me.outgoingShots}
          testId="enemy-board"
        />
      </div>
    </section>
  );
}

function AttackNotice({ roomState }: { roomState: RoomView }) {
  if (!roomState.lastAttack) {
    return (
      <div className="attack-notice is-empty" data-testid="last-attack">
        Aguardando a primeira jogada.
      </div>
    );
  }

  const attacker = roomState.players.find(
    (player) => player.id === roomState.lastAttack?.attackerId
  );
  const defender = roomState.players.find(
    (player) => player.id === roomState.lastAttack?.defenderId
  );

  return (
    <div className="attack-notice" data-testid="last-attack">
      <span>Ultima jogada</span>
      <strong>{coordinateLabel(roomState.lastAttack.coordinate)}</strong>
      <em>
        {attacker?.name ?? "Jogador"} atacou {defender?.name ?? "adversario"}:{" "}
        {attackResultLabel(roomState.lastAttack.result)}
      </em>
    </div>
  );
}

function statusText(
  roomState: RoomView | null,
  playerId: string | null,
  isMyTurn: boolean,
  fallback: string
): string {
  if (!roomState) {
    return fallback;
  }

  if (roomState.phase === "waiting") {
    return "Aguardando adversario.";
  }

  if (roomState.phase === "placing") {
    return roomState.me.ready ? "Aguardando frota adversaria." : "Posicione sua frota.";
  }

  if (roomState.phase === "playing") {
    return isMyTurn ? "Seu turno." : "Turno adversario.";
  }

  if (roomState.winnerPlayerId === playerId) {
    return "Voce venceu.";
  }

  return "Voce perdeu.";
}

function coordinateLabel(coordinate: Coordinate): string {
  return `${String.fromCharCode(65 + coordinate.row)}${coordinate.col + 1}`;
}

function attackResultLabel(result: AttackResult): string {
  if (result === "miss") {
    return "agua";
  }

  if (result === "hit") {
    return "acerto";
  }

  return "navio afundado";
}

function emitWithAck<T = unknown>(event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (response: GameAck<T>) => {
      if (response.ok) {
        resolve(response.data as T);
        return;
      }

      reject(new Error(response.error ?? "Erro inesperado."));
    });
  });
}
