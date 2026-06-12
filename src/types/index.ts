export type Player = {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "ATT";
  overall: number;
};

export type DraftState = {
  id: string;
  users: string[];
  currentTurn: number;
  order: string[];
  pool: Player[];
  picks: Record<string, Player[]>;
};
