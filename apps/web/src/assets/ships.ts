import carrierUrl from "./ships/carrier.svg";
import battleshipUrl from "./ships/battleship.svg";
import cruiserUrl from "./ships/cruiser.svg";
import submarineUrl from "./ships/submarine.svg";
import destroyerUrl from "./ships/destroyer.svg";
import type { ShipId } from "@batalha-naval/shared";

export const shipAssetById: Record<ShipId, string> = {
  carrier: carrierUrl,
  battleship: battleshipUrl,
  cruiser: cruiserUrl,
  submarine: submarineUrl,
  destroyer: destroyerUrl
};
