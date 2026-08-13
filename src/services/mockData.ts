import { Player, FMAlert } from '../types/fpl';

export const INITIAL_PLAYERS: Player[] = [
  { id: '1', webName: 'Raya', name: 'David Raya', team: 'Arsenal', teamCode: 'ARS', position: 'GK', price: 5.5, form: 6.2, expectedPoints: 6.1, xG: 0.0, xA: 0.0, ictIndex: 45, injuryStatus: 'HEALTHY', fdr: 2 },
  { id: '2', webName: 'Saliba', name: 'William Saliba', team: 'Arsenal', teamCode: 'ARS', position: 'DEF', price: 6.0, form: 7.1, expectedPoints: 7.4, xG: 0.08, xA: 0.05, ictIndex: 78, injuryStatus: 'HEALTHY', fdr: 2 },
  { id: '3', webName: 'Gabriel', name: 'Gabriel Magalhães', team: 'Arsenal', teamCode: 'ARS', position: 'DEF', price: 6.2, form: 6.8, expectedPoints: 6.8, xG: 0.15, xA: 0.02, ictIndex: 82, injuryStatus: 'HEALTHY', fdr: 2 },
  { id: '4', webName: 'Tarkowski', name: 'James Tarkowski', team: 'Everton', teamCode: 'EVE', position: 'DEF', price: 4.8, form: 5.2, expectedPoints: 5.5, xG: 0.05, xA: 0.02, ictIndex: 60, injuryStatus: 'HEALTHY', fdr: 3 },
  { id: '5', webName: 'Porro', name: 'Pedro Porro', team: 'Spurs', teamCode: 'TOT', position: 'DEF', price: 5.8, form: 5.9, expectedPoints: 5.8, xG: 0.12, xA: 0.28, ictIndex: 95, injuryStatus: 'HEALTHY', fdr: 3 },
  { id: '6', webName: 'Saka', name: 'Bukayo Saka', team: 'Arsenal', teamCode: 'ARS', position: 'MID', price: 10.2, form: 8.5, expectedPoints: 8.9, xG: 0.45, xA: 0.52, ictIndex: 145, injuryStatus: 'CHANCE_75', news: '75% chance of playing (Hamstring strain)', fdr: 2 },
  { id: '7', webName: 'Foden', name: 'Phil Foden', team: 'Man City', teamCode: 'MCI', position: 'MID', price: 9.4, form: 8.1, expectedPoints: 8.1, xG: 0.48, xA: 0.42, ictIndex: 138, injuryStatus: 'HEALTHY', fdr: 2 },
  { id: '8', webName: 'Palmer', name: 'Cole Palmer', team: 'Chelsea', teamCode: 'CHE', position: 'MID', price: 10.5, form: 7.8, expectedPoints: 7.8, xG: 0.55, xA: 0.38, ictIndex: 152, injuryStatus: 'HEALTHY', fdr: 1 },
  { id: '9', webName: 'B. Fernandes', name: 'Bruno Fernandes', team: 'Man Utd', teamCode: 'MUN', position: 'MID', price: 8.2, form: 6.9, expectedPoints: 7.0, xG: 0.35, xA: 0.45, ictIndex: 130, injuryStatus: 'HEALTHY', fdr: 3 },
  { id: '10', webName: 'Haaland', name: 'Erling Haaland', team: 'Man City', teamCode: 'MCI', position: 'FWD', price: 15.2, form: 8.4, expectedPoints: 8.4, xG: 0.88, xA: 0.12, ictIndex: 175, injuryStatus: 'HEALTHY', fdr: 2 },
  { id: '11', webName: 'Watkins', name: 'Ollie Watkins', team: 'Aston Villa', teamCode: 'AVL', position: 'FWD', price: 9.0, form: 7.6, expectedPoints: 7.6, xG: 0.52, xA: 0.32, ictIndex: 125, injuryStatus: 'HEALTHY', fdr: 2 },
  // Bench
  { id: '12', webName: 'Pickford', name: 'Jordan Pickford', team: 'Everton', teamCode: 'EVE', position: 'GK', price: 4.8, form: 4.5, expectedPoints: 4.2, xG: 0, xA: 0, ictIndex: 40, injuryStatus: 'HEALTHY', fdr: 4 },
  { id: '13', webName: 'Konsa', name: 'Ezri Konsa', team: 'Aston Villa', teamCode: 'AVL', position: 'DEF', price: 4.5, form: 4.8, expectedPoints: 4.5, xG: 0.02, xA: 0.01, ictIndex: 50, injuryStatus: 'HEALTHY', fdr: 2 },
  { id: '14', webName: 'Gordon', name: 'Anthony Gordon', team: 'Newcastle', teamCode: 'NEW', position: 'MID', price: 7.4, form: 6.5, expectedPoints: 6.8, xG: 0.38, xA: 0.25, ictIndex: 110, injuryStatus: 'HEALTHY', fdr: 3 },
  { id: '15', webName: 'Isak', name: 'Alexander Isak', team: 'Newcastle', teamCode: 'NEW', position: 'FWD', price: 8.5, form: 7.2, expectedPoints: 7.2, xG: 0.62, xA: 0.15, ictIndex: 118, injuryStatus: 'HEALTHY', fdr: 3 },
];

export const INITIAL_ALERTS: FMAlert[] = [
  {
    id: 'a1',
    severity: 'CRITICAL',
    title: 'INJURY RISK: Bukayo Saka (ARS)',
    description: 'Bukayo Saka is flagged with a 75% hamstring injury risk for GW28. AI recommends benching or swapping to Phil Foden.',
    actionText: 'Swap with Foden',
    playerTargetId: '6'
  },
  {
    id: 'a2',
    severity: 'WARNING',
    title: 'DOUBLE GAMEWEEK CONFIRMED (GW28)',
    description: 'Arsenal and Man City have confirmed DGW fixtures (2 matches in GW28). Triple-asset exposure recommended.',
    actionText: 'Optimize DGW Lineup'
  },
  {
    id: 'a3',
    severity: 'INFO',
    title: 'LOSS OF FORM: Haaland (MCI)',
    description: 'Haaland xG has dropped by 25% over the last 3 GWs. Cole Palmer or Watkins currently offer higher xP value.',
    actionText: 'Compare Alternatives',
    playerTargetId: '10'
  }
];
