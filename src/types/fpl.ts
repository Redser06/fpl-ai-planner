export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';
export type InjuryStatus = 'HEALTHY' | 'CHANCE_75' | 'CHANCE_50' | 'INJURED';

export interface Player {
  id: string;
  webName: string;
  name: string;
  team: string;
  teamCode: string;
  position: Position;
  price: number;
  form: number;
  expectedPoints: number;
  xG: number;
  xA: number;
  ictIndex: number;
  injuryStatus: InjuryStatus;
  news?: string;
  fdr: number;
}

export interface SquadState {
  starters: Player[];
  bench: Player[];
  formation: '4-3-3' | '3-5-2' | '4-4-2' | '3-4-3';
  captainId: string;
  viceCaptainId: string;
  bank: number;
  squadValue: number;
}

export interface FMAlert {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  description: string;
  actionText: string;
  playerTargetId?: string;
}
