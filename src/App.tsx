import React, { useState } from 'react';
import { 
  Shield, Users, TrendingUp, Calendar, AlertTriangle, Zap, CheckCircle, 
  ArrowRightLeft, Sparkles, Trophy, Award, Activity, BarChart3, ChevronRight, 
  X, Info, Clock, DollarSign, Target, Flame, ChevronDown, Check, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

// --- DATA TYPES ---
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
  keyPasses: number;
  shotsOnTarget: number;
  ictIndex: number;
  bonusPts: number;
  injuryStatus: InjuryStatus;
  news?: string;
  fdr: number;
  upcomingFDR: { opponent: string; fdr: number; isHome: boolean }[];
  historyPoints: number[];
  priceTrend: 'RISE' | 'FALL' | 'STABLE';
  priceChangeProb: number;
}

export interface FMAlert {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  desc: string;
  action: string;
  type: 'INJURY' | 'DGW' | 'FORM';
  targetId?: string;
  replacementId?: string;
}

// --- INITIAL DATASET (2026/27 Premier League Stars) ---
const PLAYERS_DATA: Player[] = [
  {
    id: '1', webName: 'Raya', name: 'David Raya', team: 'Arsenal', teamCode: 'ARS', position: 'GK', price: 5.5,
    form: 6.2, expectedPoints: 6.1, xG: 0.0, xA: 0.02, keyPasses: 1, shotsOnTarget: 0, ictIndex: 45, bonusPts: 8,
    injuryStatus: 'HEALTHY', fdr: 2,
    upcomingFDR: [
      { opponent: 'BRE', fdr: 2, isHome: true }, { opponent: 'SHU', fdr: 1, isHome: false },
      { opponent: 'BLANK', fdr: 5, isHome: true }, { opponent: 'NEW', fdr: 2, isHome: true }, { opponent: 'CHE', fdr: 4, isHome: false }
    ],
    historyPoints: [6, 2, 8, 6, 7, 2, 9, 6, 7, 8], priceTrend: 'STABLE', priceChangeProb: 20
  },
  {
    id: '2', webName: 'Saliba', name: 'William Saliba', team: 'Arsenal', teamCode: 'ARS', position: 'DEF', price: 6.0,
    form: 7.1, expectedPoints: 7.4, xG: 0.08, xA: 0.05, keyPasses: 8, shotsOnTarget: 4, ictIndex: 78, bonusPts: 14,
    injuryStatus: 'HEALTHY', fdr: 2,
    upcomingFDR: [
      { opponent: 'BRE', fdr: 2, isHome: true }, { opponent: 'SHU', fdr: 1, isHome: false },
      { opponent: 'BLANK', fdr: 5, isHome: true }, { opponent: 'NEW', fdr: 2, isHome: true }, { opponent: 'CHE', fdr: 4, isHome: false }
    ],
    historyPoints: [6, 8, 9, 2, 7, 6, 8, 9, 7, 8], priceTrend: 'STABLE', priceChangeProb: 15
  },
  {
    id: '3', webName: 'Gabriel', name: 'Gabriel Magalhães', team: 'Arsenal', teamCode: 'ARS', position: 'DEF', price: 6.2,
    form: 6.8, expectedPoints: 6.8, xG: 0.18, xA: 0.02, keyPasses: 5, shotsOnTarget: 6, ictIndex: 82, bonusPts: 12,
    injuryStatus: 'HEALTHY', fdr: 2,
    upcomingFDR: [
      { opponent: 'BRE', fdr: 2, isHome: true }, { opponent: 'SHU', fdr: 1, isHome: false },
      { opponent: 'BLANK', fdr: 5, isHome: true }, { opponent: 'NEW', fdr: 2, isHome: true }, { opponent: 'CHE', fdr: 4, isHome: false }
    ],
    historyPoints: [8, 6, 2, 14, 6, 7, 2, 8, 6, 9], priceTrend: 'RISE', priceChangeProb: 65
  },
  {
    id: '4', webName: 'Tarkowski', name: 'James Tarkowski', team: 'Everton', teamCode: 'EVE', position: 'DEF', price: 4.8,
    form: 5.2, expectedPoints: 5.5, xG: 0.05, xA: 0.02, keyPasses: 6, shotsOnTarget: 3, ictIndex: 60, bonusPts: 6,
    injuryStatus: 'HEALTHY', fdr: 3,
    upcomingFDR: [
      { opponent: 'BHA', fdr: 3, isHome: true }, { opponent: 'NFO', fdr: 2, isHome: true },
      { opponent: 'BLANK', fdr: 5, isHome: false }, { opponent: 'BRE', fdr: 2, isHome: true }, { opponent: 'CHE', fdr: 4, isHome: false }
    ],
    historyPoints: [2, 5, 6, 2, 7, 1, 6, 2, 8, 5], priceTrend: 'STABLE', priceChangeProb: 10
  },
  {
    id: '5', webName: 'Porro', name: 'Pedro Porro', team: 'Spurs', teamCode: 'TOT', position: 'DEF', price: 5.8,
    form: 5.9, expectedPoints: 5.8, xG: 0.12, xA: 0.28, keyPasses: 22, shotsOnTarget: 8, ictIndex: 95, bonusPts: 10,
    injuryStatus: 'HEALTHY', fdr: 3,
    upcomingFDR: [
      { opponent: 'ARS', fdr: 4, isHome: true }, { opponent: 'BOU', fdr: 2, isHome: true },
      { opponent: 'BLANK', fdr: 5, isHome: false }, { opponent: 'LEI', fdr: 2, isHome: false }, { opponent: 'BRE', fdr: 2, isHome: false }
    ],
    historyPoints: [5, 6, 1, 9, 2, 8, 6, 5, 2, 7], priceTrend: 'STABLE', priceChangeProb: 30
  },
  {
    id: '6', webName: 'Saka', name: 'Bukayo Saka', team: 'Arsenal', teamCode: 'ARS', position: 'MID', price: 10.2,
    form: 8.5, expectedPoints: 8.9, xG: 0.54, xA: 0.52, keyPasses: 24, shotsOnTarget: 16, ictIndex: 115, bonusPts: 18,
    injuryStatus: 'CHANCE_75', news: '75% likelihood of missing GW28 (Hamstring strain)', fdr: 2,
    upcomingFDR: [
      { opponent: 'BRE', fdr: 2, isHome: true }, { opponent: 'SHU', fdr: 1, isHome: false },
      { opponent: 'BLANK', fdr: 5, isHome: true }, { opponent: 'NEW', fdr: 2, isHome: true }, { opponent: 'CHE', fdr: 4, isHome: false }
    ],
    historyPoints: [10, 8, 14, 3, 12, 9, 6, 15, 8, 11], priceTrend: 'STABLE', priceChangeProb: 15
  },
  {
    id: '7', webName: 'Foden', name: 'Phil Foden', team: 'Man City', teamCode: 'MCI', position: 'MID', price: 9.4,
    form: 8.1, expectedPoints: 8.1, xG: 0.61, xA: 0.42, keyPasses: 28, shotsOnTarget: 19, ictIndex: 121, bonusPts: 16,
    injuryStatus: 'HEALTHY', fdr: 2,
    upcomingFDR: [
      { opponent: 'LIV', fdr: 4, isHome: false }, { opponent: 'BHA', fdr: 2, isHome: false },
      { opponent: 'BLANK', fdr: 5, isHome: true }, { opponent: 'BOU', fdr: 2, isHome: true }, { opponent: 'BUR', fdr: 1, isHome: true }
    ],
    historyPoints: [7, 9, 15, 8, 12, 16, 8, 10, 14, 18], priceTrend: 'RISE', priceChangeProb: 94
  },
  {
    id: '8', webName: 'Palmer', name: 'Cole Palmer', team: 'Chelsea', teamCode: 'CHE', position: 'MID', price: 10.5,
    form: 7.8, expectedPoints: 7.8, xG: 0.58, xA: 0.38, keyPasses: 26, shotsOnTarget: 18, ictIndex: 152, bonusPts: 22,
    injuryStatus: 'HEALTHY', fdr: 1,
    upcomingFDR: [
      { opponent: 'BUN', fdr: 1, isHome: true }, { opponent: 'ARS', fdr: 4, isHome: true },
      { opponent: 'BLANK', fdr: 5, isHome: false }, { opponent: 'RED', fdr: 2, isHome: true }, { opponent: 'ARB', fdr: 3, isHome: false }
    ],
    historyPoints: [18, 5, 12, 10, 16, 7, 20, 6, 9, 14], priceTrend: 'RISE', priceChangeProb: 80
  },
  {
    id: '9', webName: 'B. Fernandes', name: 'Bruno Fernandes', team: 'Man Utd', teamCode: 'MUN', position: 'MID', price: 8.2,
    form: 6.9, expectedPoints: 7.0, xG: 0.35, xA: 0.48, keyPasses: 31, shotsOnTarget: 12, ictIndex: 130, bonusPts: 14,
    injuryStatus: 'HEALTHY', fdr: 3,
    upcomingFDR: [
      { opponent: 'AVL', fdr: 3, isHome: true }, { opponent: 'MUN', fdr: 3, isHome: false },
      { opponent: 'BLANK', fdr: 5, isHome: false }, { opponent: 'BOU', fdr: 2, isHome: false }, { opponent: 'BRA', fdr: 3, isHome: false }
    ],
    historyPoints: [6, 9, 2, 8, 12, 5, 8, 2, 7, 10], priceTrend: 'STABLE', priceChangeProb: 25
  },
  {
    id: '10', webName: 'Haaland', name: 'Erling Haaland', team: 'Man City', teamCode: 'MCI', position: 'FWD', price: 15.2,
    form: 8.4, expectedPoints: 8.4, xG: 0.88, xA: 0.12, keyPasses: 10, shotsOnTarget: 29, ictIndex: 175, bonusPts: 26,
    injuryStatus: 'HEALTHY', fdr: 2,
    upcomingFDR: [
      { opponent: 'LIV', fdr: 4, isHome: false }, { opponent: 'BHA', fdr: 2, isHome: false },
      { opponent: 'BLANK', fdr: 5, isHome: true }, { opponent: 'BOU', fdr: 2, isHome: true }, { opponent: 'BUR', fdr: 1, isHome: true }
    ],
    historyPoints: [13, 6, 17, 2, 12, 8, 6, 13, 2, 8], priceTrend: 'FALL', priceChangeProb: 62
  },
  {
    id: '11', webName: 'Watkins', name: 'Ollie Watkins', team: 'Aston Villa', teamCode: 'AVL', position: 'FWD', price: 9.0,
    form: 7.6, expectedPoints: 7.6, xG: 0.52, xA: 0.32, keyPasses: 19, shotsOnTarget: 18, ictIndex: 125, bonusPts: 18,
    injuryStatus: 'HEALTHY', fdr: 2,
    upcomingFDR: [
      { opponent: 'BUN', fdr: 1, isHome: true }, { opponent: 'MUN', fdr: 3, isHome: false },
      { opponent: 'BLANK', fdr: 5, isHome: false }, { opponent: 'TOT', fdr: 3, isHome: true }, { opponent: 'MUN', fdr: 3, isHome: false }
    ],
    historyPoints: [8, 12, 9, 6, 11, 2, 14, 8, 6, 10], priceTrend: 'STABLE', priceChangeProb: 40
  },
  // --- BENCH ---
  {
    id: '12', webName: 'Pickford', name: 'Jordan Pickford', team: 'Everton', teamCode: 'EVE', position: 'GK', price: 4.8,
    form: 4.5, expectedPoints: 4.2, xG: 0, xA: 0, keyPasses: 0, shotsOnTarget: 0, ictIndex: 40, bonusPts: 4,
    injuryStatus: 'HEALTHY', fdr: 4,
    upcomingFDR: [
      { opponent: 'BHA', fdr: 3, isHome: true }, { opponent: 'NFO', fdr: 2, isHome: true },
      { opponent: 'BLANK', fdr: 5, isHome: false }, { opponent: 'BRE', fdr: 2, isHome: true }, { opponent: 'CHE', fdr: 4, isHome: false }
    ],
    historyPoints: [2, 6, 3, 1, 7, 2, 6, 2, 8, 4], priceTrend: 'STABLE', priceChangeProb: 5
  },
  {
    id: '13', webName: 'Konsa', name: 'Ezri Konsa', team: 'Aston Villa', teamCode: 'AVL', position: 'DEF', price: 4.5,
    form: 4.8, expectedPoints: 4.5, xG: 0.02, xA: 0.01, keyPasses: 3, shotsOnTarget: 1, ictIndex: 50, bonusPts: 5,
    injuryStatus: 'HEALTHY', fdr: 2,
    upcomingFDR: [
      { opponent: 'BUN', fdr: 1, isHome: true }, { opponent: 'MUN', fdr: 3, isHome: false },
      { opponent: 'BLANK', fdr: 5, isHome: false }, { opponent: 'TOT', fdr: 3, isHome: true }, { opponent: 'MUN', fdr: 3, isHome: false }
    ],
    historyPoints: [2, 6, 5, 2, 6, 1, 8, 2, 6, 5], priceTrend: 'STABLE', priceChangeProb: 8
  },
  {
    id: '14', webName: 'Gordon', name: 'Anthony Gordon', team: 'Newcastle', teamCode: 'NEW', position: 'MID', price: 7.4,
    form: 6.5, expectedPoints: 6.8, xG: 0.38, xA: 0.25, keyPasses: 18, shotsOnTarget: 14, ictIndex: 110, bonusPts: 12,
    injuryStatus: 'HEALTHY', fdr: 3,
    upcomingFDR: [
      { opponent: 'BOU', fdr: 2, isHome: true }, { opponent: 'AVL', fdr: 3, isHome: false },
      { opponent: 'BLANK', fdr: 5, isHome: false }, { opponent: 'REB', fdr: 3, isHome: false }, { opponent: 'BOU', fdr: 2, isHome: true }
    ],
    historyPoints: [6, 10, 2, 8, 11, 3, 9, 6, 8, 7], priceTrend: 'STABLE', priceChangeProb: 20
  },
  {
    id: '15', webName: 'Isak', name: 'Alexander Isak', team: 'Newcastle', teamCode: 'NEW', position: 'FWD', price: 8.5,
    form: 7.2, expectedPoints: 7.2, xG: 0.62, xA: 0.15, keyPasses: 14, shotsOnTarget: 22, ictIndex: 118, bonusPts: 15,
    injuryStatus: 'HEALTHY', fdr: 3,
    upcomingFDR: [
      { opponent: 'BOU', fdr: 2, isHome: true }, { opponent: 'AVL', fdr: 3, isHome: false },
      { opponent: 'BLANK', fdr: 5, isHome: false }, { opponent: 'REB', fdr: 3, isHome: false }, { opponent: 'BOU', fdr: 2, isHome: true }
    ],
    historyPoints: [9, 13, 2, 10, 6, 12, 8, 2, 11, 7], priceTrend: 'RISE', priceChangeProb: 75
  },
  // Transfer Target: Solanke
  {
    id: '16', webName: 'Solanke', name: 'Dominic Solanke', team: 'Bournemouth', teamCode: 'BOU', position: 'FWD', price: 7.1,
    form: 5.8, expectedPoints: 5.4, xG: 0.44, xA: 0.18, keyPasses: 15, shotsOnTarget: 16, ictIndex: 102, bonusPts: 10,
    injuryStatus: 'HEALTHY', fdr: 4,
    upcomingFDR: [
      { opponent: 'SHU', fdr: 1, isHome: true }, { opponent: 'LUT', fdr: 1, isHome: true },
      { opponent: 'BLANK', fdr: 5, isHome: false }, { opponent: 'EVE', fdr: 3, isHome: true }, { opponent: 'CRY', fdr: 2, isHome: true }
    ],
    historyPoints: [6, 2, 8, 5, 6, 2, 9, 2, 5, 6], priceTrend: 'STABLE', priceChangeProb: 12
  },
  // Transfer Target: Eze
  {
    id: '17', webName: 'Eze', name: 'Eberechi Eze', team: 'Crystal Palace', teamCode: 'CRY', position: 'MID', price: 6.0,
    form: 6.8, expectedPoints: 6.9, xG: 0.40, xA: 0.35, keyPasses: 20, shotsOnTarget: 14, ictIndex: 108, bonusPts: 11,
    injuryStatus: 'HEALTHY', fdr: 2,
    upcomingFDR: [
      { opponent: 'ARS', fdr: 5, isHome: true }, { opponent: 'BOU', fdr: 2, isHome: false },
      { opponent: 'BLANK', fdr: 5, isHome: false }, { opponent: 'LEI', fdr: 2, isHome: false }, { opponent: 'BHA', fdr: 3, isHome: true }
    ],
    historyPoints: [8, 10, 3, 7, 9, 6, 11, 2, 8, 7], priceTrend: 'RISE', priceChangeProb: 68
  }
];

const FDR_MATRIX_DATA = [
  { team: 'Arsenal', code: 'ARS', gw28: 'BOU (H) + AVL (H)', gw28Fdr: 2, gw29: 'BLANK', gw30: 'NEW (H)', gw30Fdr: 2, gw31: 'CHE (A)', gw31Fdr: 4, gw32: 'NFO (A)', gw32Fdr: 2, gw33: 'BRE (A)', gw33Fdr: 2, gw34: 'RBO (A)', gw34Fdr: 2 },
  { team: 'Aston Villa', code: 'AVL', gw28: 'BUN (H) + MUN (A)', gw28Fdr: 2, gw29: 'BLANK', gw30: 'TOT (H)', gw30Fdr: 3, gw31: 'MUN (A)', gw31Fdr: 3, gw32: 'NFO (A)', gw32Fdr: 2, gw33: 'RED (A)', gw33Fdr: 4, gw34: 'TOT (H)', gw34Fdr: 3 },
  { team: 'Brentford', code: 'BRE', gw28: 'LRS (A) + NFO (H)', gw28Fdr: 2, gw29: 'BLANK', gw30: 'BRE (A)', gw30Fdr: 3, gw31: 'LER (A)', gw31Fdr: 3, gw32: 'BOU (H)', gw32Fdr: 2, gw33: 'CHE (A)', gw33Fdr: 4, gw34: 'AVL (H)', gw34Fdr: 3 },
  { team: 'Brighton', code: 'BHA', gw28: 'BOA (H) + LEI (A)', gw28Fdr: 2, gw29: 'BLANK', gw30: 'NEW (H)', gw30Fdr: 2, gw31: 'RED (A)', gw31Fdr: 4, gw32: 'LER (A)', gw32Fdr: 3, gw33: 'BRE (A)', gw33Fdr: 2, gw34: 'BHA (A)', gw34Fdr: 2 },
  { team: 'Chelsea', code: 'CHE', gw28: 'BUN (H) + ARS (H)', gw28Fdr: 3, gw29: 'BLANK', gw30: 'RED (H)', gw30Fdr: 4, gw31: 'ARB (A)', gw31Fdr: 3, gw32: 'NBS (A)', gw32Fdr: 3, gw33: 'NEW (H)', gw33Fdr: 2, gw34: 'NFO (A)', gw34Fdr: 2 },
  { team: 'Crystal Palace', code: 'CRY', gw28: 'ARS (H) + BOU (A)', gw28Fdr: 3, gw29: 'BLANK', gw30: 'LEI (A)', gw30Fdr: 2, gw31: 'BHA (A)', gw31Fdr: 3, gw32: 'BOU (H)', gw32Fdr: 2, gw33: 'CHE (A)', gw33Fdr: 4, gw34: 'LER (A)', gw34Fdr: 3 },
  { team: 'Everton', code: 'EVE', gw28: 'BHA (H) + NFO (H)', gw28Fdr: 2, gw29: 'BLANK', gw30: 'BRE (H)', gw30Fdr: 2, gw31: 'CHE (A)', gw31Fdr: 4, gw32: 'TOT (A)', gw32Fdr: 4, gw33: 'LER (A)', gw33Fdr: 3, gw34: 'RED (A)', gw34Fdr: 4 },
  { team: 'Fulham', code: 'FUL', gw28: 'BOU (H) + AVL (H)', gw28Fdr: 2, gw29: 'BLANK', gw30: 'NED (A)', gw30Fdr: 3, gw31: 'BEE (A)', gw31Fdr: 3, gw32: 'ARS (H)', gw32Fdr: 4, gw33: 'MUN (A)', gw33Fdr: 3, gw34: 'RED (A)', gw34Fdr: 4 },
  { team: 'Liverpool', code: 'LIV', gw28: 'LEI (A) + NFO (H)', gw28Fdr: 2, gw29: 'BLANK', gw30: 'BRE (A)', gw30Fdr: 3, gw31: 'TOT (A)', gw31Fdr: 3, gw32: 'BUN (A)', gw32Fdr: 2, gw33: 'BHE (A)', gw33Fdr: 2, gw34: 'REB (A)', gw34Fdr: 4 },
  { team: 'Man City', code: 'MCI', gw28: 'NFO (H) + NFO (A)', gw28Fdr: 2, gw29: 'BLANK', gw30: 'BRO (A)', gw30Fdr: 3, gw31: 'BUR (H)', gw31Fdr: 1, gw32: 'BRD (A)', gw32Fdr: 3, gw33: 'NOR (A)', gw33Fdr: 2, gw34: 'CHE (A)', gw34Fdr: 3 },
  { team: 'Man Utd', code: 'MUN', gw28: 'AVL (H) + MUN (A)', gw28Fdr: 3, gw29: 'BLANK', gw30: 'BOU (A)', gw30Fdr: 2, gw31: 'BRA (A)', gw31Fdr: 3, gw32: 'HOT (A)', gw32Fdr: 3, gw33: 'LEB (A)', gw33Fdr: 3, gw34: 'BOR (A)', gw34Fdr: 3 },
  { team: 'Newcastle', code: 'NEW', gw28: 'BOU (H) + AVL (A)', gw28Fdr: 2, gw29: 'BLANK', gw30: 'REB (A)', gw30Fdr: 4, gw31: 'BOU (H)', gw31Fdr: 2, gw32: 'BEE (A)', gw32Fdr: 3, gw33: 'TOT (A)', gw33Fdr: 4, gw34: 'ARS (A)', gw34Fdr: 4 },
  { team: 'Spurs', code: 'TOT', gw28: 'ARS (H) + BOU (H)', gw28Fdr: 3, gw29: 'BLANK', gw30: 'LEI (A)', gw30Fdr: 2, gw31: 'BRE (A)', gw31Fdr: 2, gw32: 'HOT (A)', gw32Fdr: 3, gw33: 'BRD (A)', gw33Fdr: 3, gw34: 'SOL (A)', gw34Fdr: 3 }
];

export default function App() {
  // --- STATE ---
  const [players, setPlayers] = useState<Player[]>(PLAYERS_DATA);
  const [starters, setStarters] = useState<Player[]>(PLAYERS_DATA.slice(0, 11));
  const [bench, setBench] = useState<Player[]>(PLAYERS_DATA.slice(11, 15));
  const [captainId, setCaptainId] = useState<string>('6'); // Saka
  const [viceCaptainId, setViceCaptainId] = useState<string>('10'); // Haaland
  const [formation, setFormation] = useState<'4-3-3' | '3-5-2' | '4-4-2' | '3-4-3'>('4-3-3');
  const [activeTab, setActiveTab] = useState<'pitch' | 'transfers' | 'fixtures' | 'inbox'>('pitch');
  const [activeChip, setActiveChip] = useState<'NONE' | 'WILDCARD' | 'FREE_HIT' | 'TRIPLE_CAPTAIN' | 'BENCH_BOOST'>('NONE');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  
  // Comparison player IDs in Transfer Hub
  const [compareLeftId, setCompareLeftId] = useState<string>('6'); // Saka
  const [compareRightId, setCompareRightId] = useState<string>('7'); // Foden

  // Alerts state
  const [alerts, setAlerts] = useState<FMAlert[]>([
    {
      id: 'a1', severity: 'CRITICAL', type: 'INJURY',
      title: 'INJURY RISK: Bukayo Saka (ARS)',
      desc: 'Bukayo Saka has a 75% hamstring injury risk for GW28. AI Assistant suggests swapping with Phil Foden (+4.5 xP) or benching for Anthony Gordon.',
      action: 'Auto-Swap with Foden',
      targetId: '6', replacementId: '7'
    },
    {
      id: 'a2', severity: 'WARNING', type: 'DGW',
      title: 'DOUBLE GAMEWEEK CONFIRMED: GW28',
      desc: 'Arsenal & Man City have confirmed DGW fixtures (2 matches in GW28). Triple-asset exposure and Triple Captain chip recommended.',
      action: 'Activate Triple Captain',
    },
    {
      id: 'a3', severity: 'INFO', type: 'FORM',
      title: 'LOSS OF FORM: Haaland (MCI)',
      desc: 'Haaland xG has dropped by 25% over the last 3 GWs. Watkins or Isak offer superior points-per-million value.',
      action: 'Compare with Watkins',
      targetId: '10', replacementId: '11'
    }
  ]);

  // Total Expected Points calculation
  const totalXP = starters.reduce((acc, p) => {
    let pts = p.expectedPoints;
    if (p.id === captainId) pts *= (activeChip === 'TRIPLE_CAPTAIN' ? 3 : 2);
    return acc + pts;
  }, 0).toFixed(1);

  // Bench Swap handler
  const handleSwapWithBench = (starterId: string, benchId: string) => {
    const starterIdx = starters.findIndex(p => p.id === starterId);
    const benchIdx = bench.findIndex(p => p.id === benchId);
    if (starterIdx > -1 && benchIdx > -1) {
      const newStarters = [...starters];
      const newBench = [...bench];
      const temp = newStarters[starterIdx];
      newStarters[starterIdx] = newBench[benchIdx];
      newBench[benchIdx] = temp;
      setStarters(newStarters);
      setBench(newBench);
    }
  };

  // 1-Click Alert action
  const handleFixAlert = (alert: FMAlert) => {
    if (alert.id === 'a1') {
      // Transfer / Swap Saka with Foden
      const foden = players.find(p => p.id === '7');
      if (foden) {
        setStarters(starters.map(p => p.id === '6' ? foden : p));
        if (captainId === '6') setCaptainId('7');
      }
      setAlerts(alerts.filter(a => a.id !== 'a1'));
    } else if (alert.id === 'a2') {
      setActiveChip('TRIPLE_CAPTAIN');
      setAlerts(alerts.filter(a => a.id !== 'a2'));
    } else if (alert.id === 'a3') {
      setCompareLeftId('10'); // Haaland
      setCompareRightId('11'); // Watkins
      setActiveTab('transfers');
    }
  };

  // Transfer Execution handler
  const handleExecuteTransfer = (outId: string, inId: string) => {
    const playerIn = players.find(p => p.id === inId);
    if (playerIn) {
      setStarters(starters.map(p => p.id === outId ? playerIn : p));
      if (captainId === outId) setCaptainId(inId);
    }
  };

  const compareLeft = players.find(p => p.id === compareLeftId) || players[0];
  const compareRight = players.find(p => p.id === compareRightId) || players[1];

  // Helper for FDR Badge Color
  const getFDRBadge = (fdr: number) => {
    if (fdr <= 1) return 'bg-emerald-950 text-emerald-300 border-emerald-500/40';
    if (fdr === 2) return 'bg-emerald-900/80 text-emerald-200 border-emerald-500/30';
    if (fdr === 3) return 'bg-amber-950 text-amber-300 border-amber-500/30';
    if (fdr === 4) return 'bg-orange-950 text-orange-300 border-orange-500/30';
    return 'bg-red-950 text-red-300 border-red-500/40';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      
      {/* 1. TOP GLOBAL HEADER */}
      <header className="bg-slate-900/90 border-b border-slate-800/80 px-6 py-3.5 backdrop-blur-md sticky top-0 z-40 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-900 via-fplPurple to-purple-950 border border-purple-500/40 flex items-center justify-center shadow-lg shadow-purple-950/50">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-wide bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                FPL TACTICAL SQUAD PLANNER
              </h1>
              <span className="text-[10px] bg-purple-950 text-purple-300 font-extrabold px-2 py-0.5 rounded-full border border-purple-500/40 uppercase">
                AI Powered
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">Football Manager Tactical Hub • GW28</p>
          </div>
        </div>

        {/* Gameweek 28 FDR Ticker */}
        <div className="hidden xl:flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mr-1">GW28 FDR Ticker:</span>
          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">SHU (E)</span>
          <span className="px-2 py-0.5 rounded bg-emerald-900 text-emerald-200 border border-emerald-500/30 text-[10px] font-bold">LUT (H)</span>
          <span className="px-2 py-0.5 rounded bg-orange-950 text-orange-300 border border-orange-500/30 text-[10px] font-bold">MCI (H)</span>
          <span className="px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-500/30 text-[10px] font-bold">BOU (A)</span>
          <span className="px-2 py-0.5 rounded bg-emerald-900 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">LIV (H)</span>
        </div>

        {/* Squad Economics & Metrics Bar */}
        <div className="flex items-center gap-4 sm:gap-6 bg-slate-950/90 px-4 py-2 rounded-xl border border-slate-800 shadow-inner">
          <div className="text-right">
            <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Squad Value</span>
            <span className="text-sm font-black text-slate-200">£103.4M</span>
          </div>
          <div className="h-6 w-px bg-slate-800"></div>
          <div className="text-right">
            <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">In Bank</span>
            <span className="text-sm font-black text-emerald-400">£0.6M</span>
          </div>
          <div className="h-6 w-px bg-slate-800"></div>
          <div className="text-right">
            <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Pred. GW28 Points</span>
            <span className="text-base font-black text-emerald-400 flex items-center gap-1 justify-end">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> {totalXP} xP
            </span>
          </div>
          {activeChip !== 'NONE' && (
            <div className="ml-2 px-2.5 py-1 bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 rounded-lg text-[10px] font-black uppercase tracking-wider animate-pulse">
              {activeChip.replace('_', ' ')} ACTIVE
            </div>
          )}
        </div>
      </header>

      {/* 2. NAVIGATION BAR */}
      <nav className="bg-slate-900/60 border-b border-slate-800/80 px-6 flex justify-between items-center overflow-x-auto">
        <div className="flex gap-6 text-xs font-bold">
          <button
            onClick={() => setActiveTab('pitch')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'pitch' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" /> Tactics & Pitch View
          </button>
          <button
            onClick={() => setActiveTab('transfers')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'transfers' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-4 h-4" /> AI Transfer & Analytics Hub
          </button>
          <button
            onClick={() => setActiveTab('fixtures')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'fixtures' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" /> Fixture Matrix & Chips
          </button>
          <button
            onClick={() => setActiveTab('inbox')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'inbox' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-400" /> Assistant Manager Inbox
            {alerts.length > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                {alerts.length}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* 3. MAIN CONTENT CONTAINER */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">

        {/* ============================================================ */}
        {/* TAB 1: TACTICAL PITCH VIEW & SQUAD MANAGEMENT */}
        {/* ============================================================ */}
        {activeTab === 'pitch' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Col: 3D Pitch Graphic */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
                
                {/* Formation & Tactical Controls */}
                <div className="flex flex-wrap justify-between items-center bg-slate-950/70 p-3 rounded-xl border border-slate-800 gap-2">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Formation:</span>
                  </div>
                  <div className="flex gap-2">
                    {(['4-3-3', '3-5-2', '4-4-2', '3-4-3'] as const).map(fmt => (
                      <button
                        key={fmt}
                        onClick={() => setFormation(fmt)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          formation === fmt 
                            ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black' 
                            : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3D Football Pitch Surface */}
                <div className="relative h-[530px] bg-gradient-to-b from-emerald-950/90 via-emerald-900/40 to-emerald-950/90 rounded-2xl border-2 border-emerald-500/30 p-4 flex flex-col justify-between overflow-hidden shadow-2xl">
                  {/* Field Pitch Lines Overlay */}
                  <div className="absolute inset-0 border-2 border-white/10 m-4 rounded-xl pointer-events-none">
                    <div className="absolute top-1/2 w-full border-t border-white/10"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-white/10 rounded-full"></div>
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-20 border-b-2 border-x-2 border-white/10 rounded-b-xl"></div>
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-20 border-t-2 border-x-2 border-white/10 rounded-t-xl"></div>
                  </div>

                  {/* Rows By Position */}
                  {['FWD', 'MID', 'DEF', 'GK'].map(pos => (
                    <div key={pos} className="relative z-10 flex justify-around items-center my-1">
                      {starters.filter(p => p.position === pos).map(player => (
                        <div
                          key={player.id}
                          className="group relative flex flex-col items-center cursor-pointer transition-all hover:scale-105"
                          onClick={() => setSelectedPlayer(player)}
                        >
                          {/* Captain / Vice Captain Badge */}
                          {captainId === player.id && (
                            <span className="absolute -top-2 -right-2 bg-yellow-400 text-slate-950 font-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-950 z-20 shadow-md">
                              C
                            </span>
                          )}
                          {viceCaptainId === player.id && (
                            <span className="absolute -top-2 -right-2 bg-slate-300 text-slate-950 font-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-950 z-20 shadow-md">
                              V
                            </span>
                          )}

                          {/* Injury Warning Badge */}
                          {player.injuryStatus !== 'HEALTHY' && (
                            <span className="absolute -top-2 -left-2 bg-red-500 text-white text-[10px] p-1 rounded-full z-20 animate-pulse shadow-md">
                              <AlertTriangle className="w-3 h-3" />
                            </span>
                          )}

                          {/* Player Card UI */}
                          <div className="w-20 bg-slate-950/95 border border-slate-700/80 rounded-xl p-2 flex flex-col items-center gap-1 shadow-xl group-hover:border-emerald-400 transition-colors">
                            <div className="w-10 h-10 rounded-full bg-slate-800/90 flex items-center justify-center font-black text-xs text-emerald-400 border border-slate-700 shadow-inner">
                              {player.teamCode}
                            </div>
                            <span className="text-[11px] font-bold text-slate-100 truncate w-full text-center">
                              {player.webName}
                            </span>
                            <div className="flex justify-between items-center w-full px-1.5 py-0.5 bg-slate-900 rounded text-[10px] font-bold border border-slate-800">
                              <span className="text-slate-400">£{player.price}M</span>
                              <span className="text-emerald-400">{player.expectedPoints} xP</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Substitutes Bench Row */}
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2 shadow-inner">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Substitutes Bench (Click to Swap with Starters)</span>
                    <span className="text-[10px] text-emerald-400 font-semibold">4 Bench Players</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {bench.map((player, idx) => (
                      <div
                        key={player.id}
                        onClick={() => setSelectedPlayer(player)}
                        className="bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/50 p-2 rounded-xl cursor-pointer transition-all flex items-center gap-2 shadow"
                      >
                        <span className="text-[9px] font-extrabold text-slate-500 bg-slate-950 px-1.5 py-1 rounded">
                          SUB {idx + 1}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-slate-200 truncate">{player.webName}</span>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                            <span>{player.teamCode}</span>
                            <span>•</span>
                            <span className="text-emerald-400 font-bold">{player.expectedPoints} xP</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            {/* Right Col: Assistant Manager Quick Feed */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-400" />
                    <h3 className="font-extrabold text-sm text-slate-100">ASSISTANT MANAGER INBOX</h3>
                  </div>
                  <span className="bg-red-500/20 text-red-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-red-500/30">
                    {alerts.length} URGENT
                  </span>
                </div>

                <div className="space-y-3">
                  {alerts.map(alert => (
                    <div
                      key={alert.id}
                      className={`p-3.5 rounded-xl border flex flex-col gap-2 transition-all ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-red-950/20 border-red-900/60'
                          : alert.severity === 'WARNING'
                          ? 'bg-amber-950/20 border-amber-900/60'
                          : 'bg-blue-950/20 border-blue-900/60'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`w-4 h-4 ${alert.severity === 'CRITICAL' ? 'text-red-400' : 'text-amber-400'}`} />
                        <span className="text-xs font-black text-slate-200">{alert.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{alert.desc}</p>
                      <button
                        onClick={() => handleFixAlert(alert)}
                        className="self-start mt-1 px-3 py-1.5 bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> {alert.action}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: AI TRANSFER & PLAYER ANALYTICS HUB */}
        {/* ============================================================ */}
        {activeTab === 'transfers' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Top AI Transfer Suggestions */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-extrabold text-sm text-slate-100">AI OPTIMIZER TRANSFERS</h3>
                  </div>
                  <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-black">
                    GW28 RANKED
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Suggestion 1: Saka -> Foden */}
                  <div className="bg-slate-950 border border-slate-800 hover:border-emerald-500/40 p-3.5 rounded-xl flex flex-col gap-2.5 transition-all shadow-md">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400">1. PRIMARY RECOMMENDATION</span>
                      <span className="text-xs font-black text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                        +4.5 xP GAIN
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-red-950/80 text-red-300 flex items-center justify-center font-bold text-xs border border-red-500/30">
                          ARS
                        </div>
                        <div>
                          <span className="text-[10px] text-red-400 font-bold block uppercase">OUT</span>
                          <span className="text-xs font-bold text-slate-200">Saka (£10.2M)</span>
                        </div>
                      </div>
                      <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-950/80 text-emerald-300 flex items-center justify-center font-bold text-xs border border-emerald-500/30">
                          MCI
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-400 font-bold block uppercase">IN</span>
                          <span className="text-xs font-bold text-slate-200">Foden (£9.4M)</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleExecuteTransfer('6', '7')}
                      className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-lg transition-colors cursor-pointer shadow-md shadow-emerald-500/20"
                    >
                      Execute Transfer (Save £0.8M)
                    </button>
                  </div>

                  {/* Suggestion 2: Solanke -> Isak */}
                  <div className="bg-slate-950 border border-slate-800 hover:border-emerald-500/40 p-3.5 rounded-xl flex flex-col gap-2.5 transition-all shadow-md">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400">2. FORWARD UPGRADE</span>
                      <span className="text-xs font-black text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                        +3.8 xP GAIN
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs border border-slate-700">
                          BOU
                        </div>
                        <div>
                          <span className="text-[10px] text-red-400 font-bold block uppercase">OUT</span>
                          <span className="text-xs font-bold text-slate-200">Solanke (£7.1M)</span>
                        </div>
                      </div>
                      <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs border border-slate-700">
                          NEW
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-400 font-bold block uppercase">IN</span>
                          <span className="text-xs font-bold text-slate-200">Isak (£8.5M)</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleExecuteTransfer('16', '15')}
                      className="w-full py-1.5 bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Execute Transfer (-£1.4M)
                    </button>
                  </div>

                  {/* Suggestion 3: Douglas Luiz -> Eze */}
                  <div className="bg-slate-950 border border-slate-800 hover:border-emerald-500/40 p-3.5 rounded-xl flex flex-col gap-2.5 transition-all shadow-md">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400">3. DIFFERENTIAL PICK</span>
                      <span className="text-xs font-black text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                        +2.9 xP GAIN
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs border border-slate-700">
                          AVL
                        </div>
                        <div>
                          <span className="text-[10px] text-red-400 font-bold block uppercase">OUT</span>
                          <span className="text-xs font-bold text-slate-200">Luiz (£5.6M)</span>
                        </div>
                      </div>
                      <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs border border-slate-700">
                          CRY
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-400 font-bold block uppercase">IN</span>
                          <span className="text-xs font-bold text-slate-200">Eze (£6.0M)</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleExecuteTransfer('4', '17')}
                      className="w-full py-1.5 bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Execute Transfer (-£0.4M)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Middle Panel: Head-to-Head Radar Comparison */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
                
                {/* Header & Comparison Title */}
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-cyan-400" />
                    <h3 className="font-extrabold text-sm text-slate-100">HEAD-TO-HEAD RADAR</h3>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs font-bold text-cyan-400">{compareLeft.webName}</span>
                    <span className="text-xs text-slate-500">vs</span>
                    <span className="text-xs font-bold text-purple-400">{compareRight.webName}</span>
                  </div>
                </div>

                {/* SVG Radar Chart Visualization */}
                <div className="relative h-60 flex items-center justify-center bg-slate-950/80 rounded-xl border border-slate-800 p-2">
                  <svg viewBox="0 0 200 200" className="w-full h-full">
                    {/* Concentric radar web lines */}
                    <circle cx="100" cy="100" r="80" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
                    <circle cx="100" cy="100" r="55" fill="none" stroke="#1e293b" strokeWidth="1" />
                    <circle cx="100" cy="100" r="30" fill="none" stroke="#1e293b" strokeWidth="1" />
                    {/* Axis spokes */}
                    <line x1="100" y1="20" x2="100" y2="180" stroke="#1e293b" strokeWidth="1" />
                    <line x1="20" y1="100" x2="180" y2="100" stroke="#1e293b" strokeWidth="1" />

                    {/* Polygon 1: Left Player (Cyan) */}
                    <polygon 
                      points="100,35 155,75 145,150 100,165 45,140 50,70" 
                      fill="rgba(6, 182, 212, 0.25)" 
                      stroke="#06b6d4" 
                      strokeWidth="2" 
                    />

                    {/* Polygon 2: Right Player (Purple) */}
                    <polygon 
                      points="100,25 165,65 155,145 100,155 55,150 40,60" 
                      fill="rgba(168, 85, 247, 0.25)" 
                      stroke="#a855f7" 
                      strokeWidth="2" 
                    />

                    {/* Labels */}
                    <text x="100" y="15" fill="#94a3b8" fontSize="8" textAnchor="middle" fontWeight="bold">Expected Goals (xG)</text>
                    <text x="185" y="70" fill="#94a3b8" fontSize="8" textAnchor="end" fontWeight="bold">Expected Assists (xA)</text>
                    <text x="180" y="165" fill="#94a3b8" fontSize="8" textAnchor="end" fontWeight="bold">Shots on Target</text>
                    <text x="100" y="195" fill="#94a3b8" fontSize="8" textAnchor="middle" fontWeight="bold">ICT Index</text>
                    <text x="15" y="165" fill="#94a3b8" fontSize="8" textAnchor="start" fontWeight="bold">Key Passes</text>
                    <text x="15" y="70" fill="#94a3b8" fontSize="8" textAnchor="start" fontWeight="bold">Bonus Pts</text>
                  </svg>
                </div>

                {/* Metrics Breakdown Table */}
                <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-center">
                  <span className="font-extrabold text-cyan-400">{compareLeft.xG}</span>
                  <span className="text-slate-400 font-medium">Expected Goals (xG)</span>
                  <span className="font-extrabold text-purple-400">{compareRight.xG}</span>

                  <span className="font-extrabold text-cyan-400">{compareLeft.keyPasses}</span>
                  <span className="text-slate-400 font-medium">Key Passes</span>
                  <span className="font-extrabold text-purple-400">{compareRight.keyPasses}</span>

                  <span className="font-extrabold text-cyan-400">{compareLeft.ictIndex}</span>
                  <span className="text-slate-400 font-medium">ICT Index</span>
                  <span className="font-extrabold text-purple-400">{compareRight.ictIndex}</span>
                </div>

                {/* Upcoming Fixtures (GW28-32) */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Upcoming Fixture Sequences (GW28-32)</span>
                  <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
                    <span className="text-cyan-400 w-16 truncate">{compareLeft.webName}:</span>
                    <div className="flex gap-1 flex-1">
                      {compareLeft.upcomingFDR.map((f, i) => (
                        <span key={i} className={`flex-1 py-1 rounded text-center ${getFDRBadge(f.fdr)}`}>
                          {f.fdr}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
                    <span className="text-purple-400 w-16 truncate">{compareRight.webName}:</span>
                    <div className="flex gap-1 flex-1">
                      {compareRight.upcomingFDR.map((f, i) => (
                        <span key={i} className={`flex-1 py-1 rounded text-center ${getFDRBadge(f.fdr)}`}>
                          {f.fdr}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Right Column: Historical Trends & Nightly Price Predictions */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              
              {/* Historical Trend Lines */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black text-slate-200">HISTORICAL FORM TREND</h4>
                  <span className="text-[10px] text-slate-400">Last 10 GWs</span>
                </div>
                <div className="h-28 bg-slate-950 rounded-xl border border-slate-800 p-2 flex items-end justify-between gap-1">
                  {compareRight.historyPoints.map((pts, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                      <div 
                        style={{ height: `${Math.min(100, pts * 5)}%` }} 
                        className="w-full bg-gradient-to-t from-purple-700 to-cyan-400 rounded-t transition-all"
                      ></div>
                      <span className="text-[8px] text-slate-500 font-bold">{pts}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Nightly Price Change Predictions */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-3">
                <h4 className="text-xs font-black text-slate-200 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-400" /> PRICE PREDICTIONS
                </h4>
                
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-200">Foden (MCI)</span>
                    <span className="text-[10px] font-black text-emerald-400 flex items-center gap-0.5">
                      <ArrowUpRight className="w-3 h-3" /> RISE +£0.1M
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-400 h-full w-[94%] rounded-full"></div>
                  </div>
                  <span className="text-[9px] text-slate-400">94% probability of rise tonight</span>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-200">Saka (ARS)</span>
                    <span className="text-[10px] font-black text-slate-400">CONSTANT</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-slate-500 h-full w-[15%] rounded-full"></div>
                  </div>
                  <span className="text-[9px] text-slate-400">15% change probability</span>
                </div>
              </div>

              {/* FM Tactical Scout Notes */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-2">
                <h4 className="text-xs font-black text-amber-400">SCOUT REPORT</h4>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Foden’s recent form (3G, 1A last 3 GWs) and Man City’s favourable fixtures (Avg FDR 2.0) make him an elite captain pick. Saka faces top defensive setups in GW31+.
                </p>
              </div>

            </div>

          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: MULTI-GAMEWEEK FIXTURE MATRIX & CHIP STRATEGY */}
        {/* ============================================================ */}
        {activeTab === 'fixtures' && (
          <div className="flex flex-col gap-6">
            
            {/* Top Overview & Chip Strategy Bar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div>
                  <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-emerald-400" /> MULTI-GAMEWEEK FIXTURE MATRIX (GW28–GW34)
                  </h3>
                  <p className="text-xs text-slate-400">Comprehensive 20-Team FDR Heatmap with DGW & Blank flags</p>
                </div>

                {/* FDR Legend Key */}
                <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-[10px] font-bold">
                  <span className="text-slate-400">FDR Key:</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">1 (Easy)</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-900 text-emerald-200 border border-emerald-500/30">2</span>
                  <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/30">3</span>
                  <span className="px-2 py-0.5 rounded bg-orange-950 text-orange-300 border border-orange-500/30">4</span>
                  <span className="px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-500/30">5 (Hard)</span>
                </div>
              </div>

              {/* 20-Team FDR Matrix Table */}
              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-extrabold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4"># Team</th>
                      <th className="py-3 px-3 bg-purple-950/40 text-purple-300 border-x border-purple-800/40">
                        GW28 (DOUBLE)
                      </th>
                      <th className="py-3 px-3 bg-red-950/40 text-red-300 border-r border-red-800/40">
                        GW29 (BLANK)
                      </th>
                      <th className="py-3 px-3">GW30</th>
                      <th className="py-3 px-3">GW31</th>
                      <th className="py-3 px-3">GW32</th>
                      <th className="py-3 px-3">GW33</th>
                      <th className="py-3 px-3">GW34</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {FDR_MATRIX_DATA.map((row, idx) => (
                      <tr key={row.code} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-slate-200 flex items-center gap-2">
                          <span className="text-slate-500 text-[10px] w-4">{idx + 1}</span>
                          <span className="text-emerald-400 font-black">{row.code}</span>
                          <span className="text-slate-400 hidden sm:inline">{row.team}</span>
                        </td>
                        <td className="py-2.5 px-3 bg-purple-950/20 border-x border-purple-800/30">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold block truncate ${getFDRBadge(row.gw28Fdr)}`}>
                            {row.gw28}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 bg-red-950/20 border-r border-red-800/30">
                          <span className="px-2 py-1 rounded text-[10px] font-black bg-red-950 text-red-400 border border-red-500/40 block text-center">
                            BLANK/BGW29
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold block truncate ${getFDRBadge(row.gw30Fdr)}`}>
                            {row.gw30}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold block truncate ${getFDRBadge(row.gw31Fdr)}`}>
                            {row.gw31}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold block truncate ${getFDRBadge(row.gw32Fdr)}`}>
                            {row.gw32}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold block truncate ${getFDRBadge(row.gw33Fdr)}`}>
                            {row.gw33}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold block truncate ${getFDRBadge(row.gw34Fdr)}`}>
                            {row.gw34}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Interactive Chip Strategy Timeline */}
              <div className="mt-2 bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
                <span className="text-xs font-black text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" /> AI CHIP STRATEGY TIMELINE (GW27–GW34)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <button
                    onClick={() => setActiveChip('WILDCARD')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      activeChip === 'WILDCARD' ? 'bg-emerald-950 border-emerald-400 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-[9px] font-extrabold text-slate-500 uppercase">GW27</span>
                    <span className="text-xs font-black">Activate WILDCARD</span>
                    <span className="text-[10px] text-slate-400">Rebuild for DGW28</span>
                  </button>

                  <button
                    onClick={() => setActiveChip('TRIPLE_CAPTAIN')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      activeChip === 'TRIPLE_CAPTAIN' ? 'bg-purple-950 border-purple-400 text-purple-300' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-[9px] font-extrabold text-slate-500 uppercase">GW28 (DGW)</span>
                    <span className="text-xs font-black">Activate TRIPLE CAPTAIN</span>
                    <span className="text-[10px] text-purple-400">Recommended: Haaland / Saka</span>
                  </button>

                  <button
                    onClick={() => setActiveChip('FREE_HIT')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      activeChip === 'FREE_HIT' ? 'bg-red-950 border-red-400 text-red-300' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-[9px] font-extrabold text-slate-500 uppercase">GW29 (BGW)</span>
                    <span className="text-xs font-black">Activate FREE HIT</span>
                    <span className="text-[10px] text-slate-400">Field 11 Starters for Blank</span>
                  </button>

                  <button
                    onClick={() => setActiveChip('BENCH_BOOST')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      activeChip === 'BENCH_BOOST' ? 'bg-cyan-950 border-cyan-400 text-cyan-300' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-[9px] font-extrabold text-slate-500 uppercase">GW34 (DGW)</span>
                    <span className="text-xs font-black">Activate BENCH BOOST</span>
                    <span className="text-[10px] text-slate-400">Score from all 15 players</span>
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: ASSISTANT MANAGER INBOX */}
        {/* ============================================================ */}
        {activeTab === 'inbox' && (
          <div className="max-w-4xl mx-auto flex flex-col gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-lg font-black text-slate-100 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-400" /> ASSISTANT MANAGER TACTICAL DIGEST
                  </h3>
                  <p className="text-xs text-slate-400">Automated squad health, tactical updates, and press alerts</p>
                </div>
                <span className="bg-red-500/20 text-red-400 text-xs font-black px-3 py-1 rounded-full border border-red-500/30">
                  {alerts.length} Pending Actions
                </span>
              </div>

              <div className="space-y-4">
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-xl border flex flex-col gap-2.5 transition-all ${
                      alert.severity === 'CRITICAL'
                        ? 'bg-red-950/20 border-red-900/60'
                        : alert.severity === 'WARNING'
                        ? 'bg-amber-950/20 border-amber-900/60'
                        : 'bg-blue-950/20 border-blue-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`w-4 h-4 ${alert.severity === 'CRITICAL' ? 'text-red-400' : 'text-amber-400'}`} />
                        <span className="text-sm font-black text-slate-100">{alert.title}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold">Gameweek 28 Deadline in 2d 4h</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{alert.desc}</p>
                    <button
                      onClick={() => handleFixAlert(alert)}
                      className="self-start px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20"
                    >
                      <CheckCircle className="w-4 h-4" /> {alert.action}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* 4. PLAYER DETAIL MODAL / DRAWER */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setSelectedPlayer(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950 border border-slate-700 flex items-center justify-center text-xl font-black text-emerald-400">
                {selectedPlayer.teamCode}
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-100">{selectedPlayer.name}</h3>
                <p className="text-xs text-slate-400">{selectedPlayer.team} • {selectedPlayer.position} • £{selectedPlayer.price}M</p>
              </div>
            </div>

            {selectedPlayer.injuryStatus !== 'HEALTHY' && (
              <div className="bg-red-950/40 border border-red-900/60 p-3 rounded-xl text-xs text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span>{selectedPlayer.news}</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-center text-xs">
              <div>
                <span className="text-[10px] text-slate-500 block">EXPECTED PTS</span>
                <span className="text-sm font-black text-emerald-400">{selectedPlayer.expectedPoints} xP</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">RECENT FORM</span>
                <span className="text-sm font-black text-slate-200">{selectedPlayer.form} / 10</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">ICT INDEX</span>
                <span className="text-sm font-black text-cyan-400">{selectedPlayer.ictIndex}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCaptainId(selectedPlayer.id);
                  setSelectedPlayer(null);
                }}
                className="flex-1 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black text-xs rounded-xl transition-colors cursor-pointer"
              >
                Make Captain (C)
              </button>
              <button
                onClick={() => {
                  setCompareLeftId(selectedPlayer.id);
                  setActiveTab('transfers');
                  setSelectedPlayer(null);
                }}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Compare in Transfer Hub
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
