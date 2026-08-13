import React, { useState } from 'react';
import { Shield, Users, TrendingUp, Calendar, AlertTriangle, Zap, CheckCircle, ArrowRightLeft } from 'lucide-react';

const PLAYERS = [
  { id: '1', name: 'Raya', team: 'ARS', pos: 'GK', price: 5.5, xp: 6.1, status: 'OK' },
  { id: '2', name: 'Saliba', team: 'ARS', pos: 'DEF', price: 6.0, xp: 7.4, status: 'OK' },
  { id: '3', name: 'Gabriel', team: 'ARS', pos: 'DEF', price: 6.2, xp: 6.8, status: 'OK' },
  { id: '4', name: 'Tarkowski', team: 'EVE', pos: 'DEF', price: 4.8, xp: 5.5, status: 'OK' },
  { id: '5', name: 'Porro', team: 'TOT', pos: 'DEF', price: 5.8, xp: 5.8, status: 'OK' },
  { id: '6', name: 'Saka', team: 'ARS', pos: 'MID', price: 10.2, xp: 8.9, status: '75% INJURY' },
  { id: '7', name: 'Foden', team: 'MCI', pos: 'MID', price: 9.4, xp: 8.1, status: 'OK' },
  { id: '8', name: 'Palmer', team: 'CHE', pos: 'MID', price: 10.5, xp: 7.8, status: 'OK' },
  { id: '9', name: 'Fernandes', team: 'MUN', pos: 'MID', price: 8.2, xp: 7.0, status: 'OK' },
  { id: '10', name: 'Haaland', team: 'MCI', pos: 'FWD', price: 15.2, xp: 8.4, status: 'OK' },
  { id: '11', name: 'Watkins', team: 'AVL', pos: 'FWD', price: 9.0, xp: 7.6, status: 'OK' },
];

const BENCH = [
  { id: '12', name: 'Pickford', team: 'EVE', pos: 'GK', price: 4.8, xp: 4.2 },
  { id: '13', name: 'Konsa', team: 'AVL', pos: 'DEF', price: 4.5, xp: 4.5 },
  { id: '14', name: 'Gordon', team: 'NEW', pos: 'MID', price: 7.4, xp: 6.8 },
  { id: '15', name: 'Isak', team: 'NEW', pos: 'FWD', price: 8.5, xp: 7.2 },
];

export default function App() {
  const [starters, setStarters] = useState(PLAYERS);
  const [bench, setBench] = useState(BENCH);
  const [captainId, setCaptainId] = useState('6');
  const [tab, setTab] = useState<'pitch' | 'transfers' | 'fixtures'>('pitch');
  const [alerts, setAlerts] = useState([
    { id: '1', title: 'INJURY RISK: Saka (ARS)', desc: '75% chance of playing (Hamstring). AI recommends Gordon or Foden.', action: 'Auto-Swap with Gordon' },
    { id: '2', title: 'DOUBLE GAMEWEEK: GW28', desc: 'Arsenal & Man City have 2 fixtures in GW28. Triple captain recommended.', action: 'Apply DGW Strategy' },
    { id: '3', title: 'LOSS OF FORM: Haaland', desc: 'Haaland xG down 25% in last 3 GWs. Watkins offers +1.2 xP per £M.', action: 'Compare Transfers' }
  ]);

  const totalXP = starters.reduce((acc, p) => acc + (p.id === captainId ? p.xp * 2 : p.xp), 0).toFixed(1);

  const swapSakaWithGordon = () => {
    const s = [...starters];
    const b = [...bench];
    const sakaIdx = s.findIndex(p => p.id === '6');
    const gordonIdx = b.findIndex(p => p.id === '14');
    if (sakaIdx > -1 && gordonIdx > -1) {
      const temp = s[sakaIdx];
      s[sakaIdx] = b[gordonIdx];
      b[gordonIdx] = temp;
      setStarters(s);
      setBench(b);
      setAlerts(alerts.filter(a => a.id !== '1'));
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-900 border border-purple-500/30 flex items-center justify-center">
            <Shield className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-black text-emerald-400">FPL TACTICAL SQUAD PLANNER</h1>
            <p className="text-xs text-slate-400">Gameweek 28 • AI Assistant Manager</p>
          </div>
        </div>
        <div className="flex gap-4 bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-right text-xs">
          <div><span className="text-slate-500 block">SQUAD</span><span className="font-bold">£103.4M</span></div>
          <div><span className="text-slate-500 block">BANK</span><span className="font-bold text-emerald-400">£0.6M</span></div>
          <div><span className="text-slate-500 block">PRED. xP</span><span className="font-black text-emerald-400 text-sm">{totalXP} xP</span></div>
        </div>
      </header>

      <div className="bg-slate-900/60 border-b border-slate-800 px-6 flex gap-4 text-xs font-bold">
        <button onClick={() => setTab('pitch')} className={`py-3 border-b-2 flex items-center gap-1.5 ${tab === 'pitch' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-400'}`}><Users className="w-4 h-4" /> Tactics & Pitch</button>
        <button onClick={() => setTab('transfers')} className={`py-3 border-b-2 flex items-center gap-1.5 ${tab === 'transfers' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-400'}`}><TrendingUp className="w-4 h-4" /> AI Transfers</button>
        <button onClick={() => setTab('fixtures')} className={`py-3 border-b-2 flex items-center gap-1.5 ${tab === 'fixtures' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-400'}`}><Calendar className="w-4 h-4" /> Fixture Matrix</button>
      </div>

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto w-full">
        <div className="lg:col-span-8 flex flex-col gap-4">
          {tab === 'pitch' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
              <div className="relative h-[480px] bg-gradient-to-b from-emerald-950/80 via-emerald-900/40 to-emerald-950/90 rounded-xl border border-emerald-500/30 p-4 flex flex-col justify-between">
                {['FWD', 'MID', 'DEF', 'GK'].map(pos => (
                  <div key={pos} className="flex justify-around items-center">
                    {starters.filter(p => p.pos === pos).map(p => (
                      <div key={p.id} onClick={() => setCaptainId(p.id)} className="relative flex flex-col items-center cursor-pointer group hover:scale-105 transition-all">
                        {captainId === p.id && <span className="absolute -top-2 -right-2 bg-yellow-400 text-black font-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center border border-black z-20">C</span>}
                        {p.status !== 'OK' && <span className="absolute -top-2 -left-2 bg-red-500 text-white text-[10px] p-0.5 rounded-full z-20"><AlertTriangle className="w-3 h-3" /></span>}
                        <div className="w-20 bg-slate-950 border border-slate-700 rounded-lg p-2 flex flex-col items-center group-hover:border-emerald-400 shadow">
                          <span className="text-[10px] font-bold text-emerald-400">{p.team}</span>
                          <span className="text-xs font-bold truncate w-full text-center">{p.name}</span>
                          <div className="flex justify-between w-full text-[10px] text-slate-400 mt-1"><span>£{p.price}</span><span className="text-emerald-400 font-bold">{p.xp}xP</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-4 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] font-bold text-slate-500 block mb-2">BENCH (CLICK ALERT TO AUTO-SWAP)</span>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {bench.map(b => (
                    <div key={b.id} className="bg-slate-900 border border-slate-800 p-2 rounded-lg"><span className="text-[9px] text-slate-500 block">{b.pos}</span><span className="font-bold">{b.name}</span><div className="text-[10px] text-emerald-400">{b.xp} xP</div></div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'transfers' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-400" /> AI Transfer Optimizer</h2>
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                <div><span className="text-red-400 text-xs font-bold block">OUT: Saka (£10.2M)</span><span className="text-emerald-400 text-xs font-bold">IN: Foden (£9.4M)</span></div>
                <ArrowRightLeft className="w-5 h-5 text-emerald-400" />
                <div className="text-right"><span className="text-emerald-400 font-black text-sm block">+4.2 xP</span><span className="text-slate-500 text-xs">Save £0.8M</span></div>
              </div>
            </div>
          )}

          {tab === 'fixtures' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-xs">
              <h2 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-emerald-400" /> Fixture Difficulty Matrix</h2>
              <div className="space-y-2">
                <div className="p-2 bg-slate-950 rounded flex justify-between items-center"><span className="font-bold">Arsenal (ARS)</span><span className="bg-emerald-900 text-emerald-300 font-bold px-2 py-1 rounded">GW28: DGW (BRE H + SHU A)</span><span className="bg-red-950 text-red-400 px-2 py-1 rounded">GW29: BLANK</span></div>
                <div className="p-2 bg-slate-950 rounded flex justify-between items-center"><span className="font-bold">Man City (MCI)</span><span className="bg-emerald-900 text-emerald-300 font-bold px-2 py-1 rounded">GW28: DGW (LIV A + BHA A)</span><span className="bg-red-950 text-red-400 px-2 py-1 rounded">GW29: BLANK</span></div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2"><Zap className="w-4 h-4 text-amber-400" /><h3 className="text-xs font-black">ASSISTANT MANAGER FEED</h3></div>
          <div className="space-y-3">
            {alerts.map(a => (
              <div key={a.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400"><AlertTriangle className="w-3.5 h-3.5" />{a.title}</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{a.desc}</p>
                <button onClick={() => a.id === '1' && swapSakaWithGordon()} className="mt-1 self-start px-2.5 py-1 bg-slate-800 hover:bg-emerald-500 hover:text-black text-slate-200 text-[10px] font-bold rounded flex items-center gap-1"><CheckCircle className="w-3 h-3" />{a.action}</button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
