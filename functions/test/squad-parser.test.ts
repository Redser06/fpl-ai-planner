import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapSchema } from '../src/fpl/schemas';
import { transformBootstrap } from '../src/ingest/transform';
import { parseSquadFromText, cleanString, matchPlayerInPool } from '../../shared/model/squadParser';

const bootstrap = bootstrapSchema.parse(
  JSON.parse(readFileSync(join(__dirname, 'fixtures', 'bootstrap.json'), 'utf8')),
);
const { teams, players, meta } = transformBootstrap(bootstrap, '2026-08-13T00:00:00.000Z');
const rules = meta.rules;

const USER_SAMPLE_PASTE = `Player
F	GWP	TP	Fix
Goalkeepers
Roefs, Sunderland



Roefs, Sunderland
Roefs
Sunderland
GKP
3.5	6	7	
BRE (A)
Brentford, Away
Defenders
Hall, Newcastle



Hall, Newcastle
Hall
Newcastle
DEF
7.0	11	14	
BOU (H)
Bournemouth, Home
Guéhi, Man City



Guéhi, Man City
Guéhi
Man City
DEF
6.0	2	12	
COV (H)
Coventry City, Home
Gabriel, Arsenal



Gabriel, Arsenal
Gabriel
Arsenal
DEF
6.5	8	13	
CHE (H)
Chelsea, Home
Midfielders
Wilson, Leeds



Wilson, Leeds
Wilson
Leeds
MID
2.0	1	4	
BHA (A)
Brighton, Away
Mbeumo, Man Utd



Mbeumo, Man Utd
Mbeumo
Man Utd
MID
6.5	11	13	
EVE (A)
Everton, Away
B.Fernandes, Man Utd



B.Fernandes, Man Utd
B.Fernandes
Man Utd
MID
12.5	23	25	
EVE (A)
Everton, Away
Rogers, Chelsea



Rogers, Chelsea
Rogers
Chelsea
MID
6.5	5	13	
ARS (A)
Arsenal, Away
Cherki, Man City



Cherki, Man City
Cherki
Man City
MID
11.0	14	22	
COV (H)
Coventry City, Home
Forwards
Wissa, Newcastle



Wissa, Newcastle
Wissa
Newcastle
FWD
6.0	8	12	
BOU (H)
Bournemouth, Home
Šeško, Man Utd



Šeško, Man Utd
Šeško
Man Utd
FWD
1.0	1	2	
EVE (A)
Everton, Away
Substitutes
Dubravka, Spurs



Dubravka, Spurs
Dubravka
Spurs
GKP
0.0	0	0	
NFO (A)
Nott'm Forest, Away
Gyökeres, Arsenal



Gyökeres, Arsenal
Gyökeres
Arsenal
FWD
0.0	0	0	
CHE (H)
Chelsea, Home
Kayode, Brentford



Kayode, Brentford
Kayode
Brentford
DEF
7.5	2	15	
SUN (H)
Sunderland, Home
Van Hecke, Spurs



Van Hecke, Spurs
Van Hecke
Spurs
DEF
1.0	1	2	
NFO (A)
Nott'm Forest, Away`;

describe('parseSquadFromText', () => {
  it('parses user raw FPL copy-paste with 3-5-2 formation and exact bench order', () => {
    const result = parseSquadFromText(USER_SAMPLE_PASTE, players, teams, rules);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.formation).toBe('3-5-2');
    expect(result.starters).toHaveLength(11);
    expect(result.bench).toHaveLength(4);

    // Starters order: 1 GKP, 3 DEF, 5 MID, 2 FWD
    const starterNames = result.starters.map((p) => p.webName);
    expect(starterNames).toEqual([
      'Roefs',
      'Hall',
      'Guéhi',
      'Gabriel',
      'Wilson',
      'Mbeumo',
      'B.Fernandes',
      'Rogers',
      'Cherki',
      'Wissa',
      'Šeško',
    ]);

    // Bench order: Reserve GK (slot 12), then outfield subs 1, 2, 3
    const benchNames = result.bench.map((p) => p.webName);
    expect(benchNames).toEqual(['Dubravka', 'Gyökeres', 'Kayode', 'Van Hecke']);

    // Picks check
    expect(result.squad.picks).toHaveLength(15);
    expect(result.squad.picks[0]?.playerId).toBe(result.starters[0]?.id); // Roefs is slot 1
    expect(result.squad.picks[11]?.playerId).toBe(result.bench[0]?.id); // Dubravka is slot 12
    expect(result.squad.picks[12]?.playerId).toBe(result.bench[1]?.id); // Gyökeres is slot 13
    expect(result.squad.picks[13]?.playerId).toBe(result.bench[2]?.id); // Kayode is slot 14
    expect(result.squad.picks[14]?.playerId).toBe(result.bench[3]?.id); // Van Hecke is slot 15

    // Budget check
    expect(result.squad.squadValue).toBeGreaterThan(0);
    expect(result.squad.bank).toBeGreaterThanOrEqual(0);
  });

  it('matches players with accents stripped or converted', () => {
    expect(cleanString('Guéhi')).toBe('guehi');
    expect(cleanString('Šeško')).toBe('sesko');
    expect(cleanString('Gyökeres')).toBe('gyokeres');
    expect(cleanString('Ødegaard')).toBe('odegaard');

    const guehi = matchPlayerInPool('Guehi', players, teams, 'Man City', 'DEF');
    expect(guehi).not.toBeNull();
    expect(guehi?.webName).toBe('Guéhi');

    const sesko = matchPlayerInPool('Sesko', players, teams, 'Man Utd', 'FWD');
    expect(sesko).not.toBeNull();
    expect(sesko?.webName).toBe('Šeško');

    const gyokeres = matchPlayerInPool('Gyokeres', players, teams, 'Arsenal', 'FWD');
    expect(gyokeres).not.toBeNull();
    expect(gyokeres?.webName).toBe('Gyökeres');
  });

  it('disambiguates players with same name using team hint', () => {
    const wilsonLeeds = matchPlayerInPool('Wilson', players, teams, 'Leeds');
    expect(wilsonLeeds).not.toBeNull();
    expect(wilsonLeeds?.teamShort).toBe('LEE');

    const wilsonBrentford = matchPlayerInPool('Wilson', players, teams, 'Brentford');
    expect(wilsonBrentford).not.toBeNull();
    expect(wilsonBrentford?.teamShort).toBe('BRE');
  });

  it('detects captain and vice captain markers (C) and (V)', () => {
    const pasteWithArmbands = USER_SAMPLE_PASTE
      .replace('Cherki, Man City', 'Cherki (C), Man City')
      .replace('Hall, Newcastle', 'Hall (V), Newcastle');

    const result = parseSquadFromText(pasteWithArmbands, players, teams, rules);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.captain.webName).toBe('Cherki');
    expect(result.viceCaptain.webName).toBe('Hall');
    expect(result.squad.captainId).toBe(result.captain.id);
    expect(result.squad.viceCaptainId).toBe(result.viceCaptain.id);
  });

  it('parses a 4-4-2 formation correctly', () => {
    const paste442 = `
Goalkeepers
Roefs, Sunderland
Defenders
Hall, Newcastle
Guéhi, Man City
Gabriel, Arsenal
Kayode, Brentford
Midfielders
Wilson, Leeds
Mbeumo, Man Utd
B.Fernandes, Man Utd
Rogers, Chelsea
Forwards
Wissa, Newcastle
Šeško, Man Utd
Substitutes
Dubravka, Spurs
Gyökeres, Arsenal
Cherki, Man City
Van Hecke, Spurs
`;

    const result = parseSquadFromText(paste442, players, teams, rules);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.formation).toBe('4-4-2');
    expect(result.starters).toHaveLength(11);
    expect(result.bench).toHaveLength(4);
    expect(result.bench[0]?.webName).toBe('Dubravka'); // Sub GK
  });

  it('returns failure when an unknown player is in the text', () => {
    const invalidPaste = USER_SAMPLE_PASTE.replace('Roefs, Sunderland', 'FakePlayerXYZ, Sunderland');
    const result = parseSquadFromText(invalidPaste, players, teams, rules);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('FakePlayerXYZ');
  });

  it('returns failure when fewer than 15 players are provided', () => {
    const partial = `
Goalkeepers
Roefs, Sunderland
Defenders
Hall, Newcastle
Guéhi, Man City
`;
    const result = parseSquadFromText(partial, players, teams, rules);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Expected 11 starters and 4 substitutes');
  });

  it('falls back to flat list parsing when section headers are absent', () => {
    const flatList = [
      'Roefs, Sunderland',
      'Dubravka, Spurs',
      'Hall, Newcastle',
      'Guéhi, Man City',
      'Gabriel, Arsenal',
      'Kayode, Brentford',
      'Van Hecke, Spurs',
      'Wilson, Leeds',
      'Mbeumo, Man Utd',
      'B.Fernandes, Man Utd',
      'Rogers, Chelsea',
      'Cherki, Man City',
      'Wissa, Newcastle',
      'Šeško, Man Utd',
      'Gyökeres, Arsenal',
    ].join('\n');

    const result = parseSquadFromText(flatList, players, teams, rules);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.squad.picks).toHaveLength(15);
  });
});
