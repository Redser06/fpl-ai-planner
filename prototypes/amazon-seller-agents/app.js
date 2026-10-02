/* North Harbour Gear · Seller Agent Console — prototype
   Single-file app: seed data → Mandate Gate → state → views → copilot (chat + voice).
   Everything rendered is wired: every button mutates state and writes to the audit log. */

'use strict';

/* =========================================================================
   Helpers
   ========================================================================= */
const NOW = Date.now();
const ago = (min) => NOW - min * 60000;
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gbp = (n, dp) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: dp ?? (Number.isInteger(n) ? 0 : 2), maximumFractionDigits: 2 });
const pct = (n, dp = 0) => `${n > 0 ? '+' : ''}${n.toFixed(dp)}%`;
const uid = (p) => `${p}-${Math.floor(1000 + Math.random() * 9000)}`;
function rel(ts) {
  const d = Math.max(0, Date.now() - ts);
  const m = Math.round(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
function clock(ts) {
  return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const SURFACES = {
  claude: { name: 'Claude', vendor: 'Anthropic', kind: 'MCP connector', install: 'https://claude.ai/connectors/northharbourgear', color: '#d4714f', initials: 'C' },
  chatgpt: { name: 'ChatGPT', vendor: 'OpenAI', kind: 'App (Apps SDK) + ACP checkout', install: 'https://chatgpt.com/apps/north-harbour-gear', color: '#16a37f', initials: 'G' },
  gemini: { name: 'Gemini', vendor: 'Google', kind: 'Extension', install: 'https://gemini.google.com/extensions/north-harbour-gear', color: '#3b7bea', initials: 'Ge' },
};

const AGENT_TEMPLATES = {
  storefront: { name: 'Storefront Agent', role: 'Sells and answers shopper questions inside Claude, ChatGPT and Gemini', facing: 'shopper', tools: ['catalog:read', 'orders:read', 'checkout:create (Meridian Pay)'] },
  pricing: { name: 'Pricing Agent', role: 'Holds the Featured Offer inside your margin floor', facing: 'seller', tools: ['pricing:read', 'pricing:write (approval)', 'competitor:read'] },
  listing: { name: 'Listing Agent', role: 'Improves titles, bullets, images and A+ content from shopper questions', facing: 'seller', tools: ['listings:read', 'listings:write (approval)', 'reviews:read'] },
  restock: { name: 'Restock Agent', role: 'Keeps FBA stock above floor with inbound shipment proposals', facing: 'seller', tools: ['inventory:read', 'fba:inbound (approval)', 'sales:read'] },
  ads: { name: 'Ads Agent', role: 'Sponsored Products bid and budget management', facing: 'seller', tools: ['ads:read', 'ads:write (approval)'] },
  support: { name: 'Support Agent', role: 'Handles returns, order status and delivery questions', facing: 'shopper', tools: ['orders:read', 'returns:create (approval)'] },
};

/* =========================================================================
   Seed data
   ========================================================================= */
function seed() {
  const catalog = [
    { sku: 'NHG-OSK-01', title: 'Offshore Shell Jacket', cost: 92, price: 189, stock: 64, sold7d: 31, by: { claude: 17, chatgpt: 9, gemini: 5 }, trend: [3, 4, 6, 4, 5, 5, 4], foWin: true },
    { sku: 'NHG-DRB-20', title: '20L Roll-top Dry Bag', cost: 9.5, price: 24.99, stock: 412, sold7d: 88, by: { claude: 30, chatgpt: 41, gemini: 17 }, trend: [10, 12, 14, 11, 13, 15, 13], foWin: false },
    { sku: 'NHG-SGL-03', title: 'Polarised Sailing Sunglasses', cost: 18, price: 59, stock: 18, sold7d: 27, by: { claude: 9, chatgpt: 8, gemini: 10 }, trend: [3, 3, 4, 5, 4, 4, 4], foWin: true },
    { sku: 'NHG-BTS-07', title: 'Deck Boots', cost: 41, price: 95, stock: 73, sold7d: 14, by: { claude: 5, chatgpt: 4, gemini: 5 }, trend: [3, 2, 2, 1, 2, 2, 2], foWin: false },
    { sku: 'NHG-GLV-11', title: 'Grip Sailing Gloves', cost: 7.2, price: 22, stock: 230, sold7d: 42, by: { claude: 12, chatgpt: 19, gemini: 11 }, trend: [5, 6, 7, 6, 6, 6, 6], foWin: true },
    { sku: 'NHG-TRM-05', title: 'Thermal Base Layer', cost: 14, price: 36.99, stock: 150, sold7d: 36, by: { claude: 19, chatgpt: 10, gemini: 7 }, trend: [3, 4, 4, 6, 7, 6, 6], foWin: true },
    { sku: 'NHG-LFJ-02', title: '150N Auto Lifejacket', cost: 58, price: 129, stock: 42, sold7d: 19, by: { claude: 8, chatgpt: 6, gemini: 5 }, trend: [2, 3, 2, 3, 3, 3, 3], foWin: true },
  ];

  const agents = [
    { id: 'storefront', tpl: 'storefront', status: 'active', surfaces: ['claude', 'chatgpt', 'gemini'], runtime: 'Claude', goal: 'Convert qualified shoppers. Ground every claim in listing specs. Hand returns and policy questions to a human. No discretionary discounts unless mandated.', metrics: { sessions7d: 486, conversions7d: 212, gmv7d: 14820, escalations: 11 }, lastRun: ago(2), trend: [24, 28, 31, 27, 35, 33, 34] },
    { id: 'pricing', tpl: 'pricing', status: 'active', surfaces: ['claude', 'chatgpt'], runtime: 'Claude', goal: 'Win the Featured Offer on the top-20 ASINs. Prefer small, frequent moves. Never chase below the floor.', metrics: { proposals7d: 42, approved: 31, blocked: 3, foWin: 84 }, lastRun: ago(4), trend: [76, 78, 79, 81, 82, 84, 84] },
    { id: 'listing', tpl: 'listing', status: 'active', surfaces: ['chatgpt'], runtime: 'GPT', goal: 'Close the gaps shoppers ask about most (sizing, waterproof ratings, care). One listing change per ASIN per week.', metrics: { proposals7d: 9, approved: 7, blocked: 0, quality: 91 }, lastRun: ago(47), trend: [84, 85, 87, 88, 89, 91, 91] },
    { id: 'restock', tpl: 'restock', status: 'active', surfaces: ['gemini'], runtime: 'Gemini', goal: 'Keep every active ASIN above the stock floor with 14 days of cover. Batch inbound shipments weekly.', metrics: { proposals7d: 5, approved: 4, blocked: 1, stockouts: 0 }, lastRun: ago(55), trend: [1, 1, 0, 0, 0, 0, 0] },
    { id: 'ads', tpl: 'ads', status: 'not-installed', surfaces: [], runtime: '—', goal: '', metrics: {}, lastRun: null, trend: [] },
  ];

  const proposals = [
    { id: 'P-1042', agentId: 'pricing', type: 'price_change', sku: 'NHG-DRB-20', proposed: { price: 22.99 }, from: 24.99, rationale: 'Lost the Featured Offer to SeaKit at £22.79. Projected +22% units; margin after cut stays at 59%.', createdAt: ago(14), status: 'pending' },
    { id: 'P-1041', agentId: 'pricing', type: 'price_change', sku: 'NHG-BTS-07', proposed: { price: 76 }, from: 95, rationale: 'Competitor flash sale at £74.99. Projected +38% units over 72h, then revert.', createdAt: ago(31), status: 'pending' },
    { id: 'P-1040', agentId: 'restock', type: 'restock', sku: 'NHG-SGL-03', proposed: { units: 120 }, rationale: 'Stock 18 is below floor 25. 14-day velocity 3.9/day; FBA inbound lead time 9 days → stock-out in ~5 days.', createdAt: ago(55), status: 'pending' },
    { id: 'P-1039', agentId: 'listing', type: 'listing_update', sku: 'NHG-OSK-01', proposed: { fields: ['title', 'bullets', 'size_chart'] }, summary: 'Add "20,000mm hydrostatic head", taped seams, and a size chart.', rationale: 'Sizing is the #1 unanswered shopper question on Gemini (38% drop-off). The spec is in the tech sheet but not on the listing.', createdAt: ago(120), status: 'pending' },
    { id: 'P-1038', agentId: 'storefront', type: 'discount_offer', sku: 'NHG-OSK-01', proposed: { pct: 5, bundleWith: 'NHG-TRM-05' }, rationale: '61% of shoppers who ask "is there a discount?" abandon. A 5% jacket + base-layer bundle offer is projected to recover ~19 orders/week at 51% margin.', createdAt: ago(190), status: 'pending' },
    { id: 'P-1037', agentId: 'pricing', type: 'price_change', sku: 'NHG-GLV-11', proposed: { price: 6.99 }, from: 22, rationale: 'Match the lowest offer to regain the Featured Offer.', createdAt: ago(300), status: 'pending' },
    { id: 'P-1036', agentId: 'restock', type: 'restock', sku: 'NHG-LFJ-02', proposed: { units: 300 }, rationale: 'Autumn demand +40% YoY; current cover 11 days. One inbound now avoids two in November.', createdAt: ago(400), status: 'pending' },
    { id: 'P-1035', agentId: 'pricing', type: 'price_change', sku: 'NHG-TRM-05', proposed: { price: 36.99 }, from: 39, rationale: 'Hold the Featured Offer vs. competitor at £37.50.', createdAt: ago(1500), status: 'confirmed', decidedBy: 'Priya (owner)', decidedAt: ago(1480), gate: { verdict: 'in-mandate', checks: [] } },
    { id: 'P-1034', agentId: 'listing', type: 'listing_update', sku: 'NHG-DRB-20', proposed: { fields: ['images'] }, summary: 'Replace hero image with a lifestyle shot; add roll-top close-up.', rationale: 'Image CTR 2.1% vs category 3.4%.', createdAt: ago(2800), status: 'declined', decidedBy: 'Priya (owner)', decidedAt: ago(2700), note: 'Waiting on new photography', gate: { verdict: 'in-mandate', checks: [] } },
  ];

  const conversations = [
    { id: 'C-2211', surface: 'claude', startedAt: ago(9), shopper: 'Shopper · Bristol', question: 'Need a jacket that will survive a Channel crossing in October', outcome: 'converted', value: 225.99, products: ['NHG-OSK-01', 'NHG-TRM-05'], sentiment: 'positive', transcript: [
      ['shopper', 'I\'m crewing a Channel crossing in October. Need a jacket that will actually keep me dry for 14 hours.'],
      ['agent', 'For an overnight crossing I\'d look at the Offshore Shell Jacket: 20,000mm hydrostatic head, fully taped seams, high fleece-lined collar and a hood that cinches over a cap. It\'s the one our offshore crews wear. £189.'],
      ['shopper', 'What goes under it?'],
      ['agent', 'Most people pair it with the Thermal Base Layer (£36.99) — merino blend, wicks under a shell. Together that\'s £225.99. Want me to check out with the card you\'ve saved with Meridian Pay?'],
      ['shopper', 'Yes, size L jacket, M base layer.'],
      ['system', 'Checkout created via Meridian Pay agentic checkout · AP2 mandate signed · authorised £225.99 · order 204-7781'],
    ] },
    { id: 'C-2210', surface: 'chatgpt', startedAt: ago(26), shopper: 'Shopper · Leeds', question: 'cheapest dry bag that is actually waterproof', outcome: 'converted', value: 24.99, products: ['NHG-DRB-20'], sentiment: 'neutral', transcript: [
      ['shopper', 'cheapest dry bag that is actually waterproof, not splash proof'],
      ['agent', 'The 20L Roll-top Dry Bag is IPX6 rated — roll it three times and it\'s submersible to 1m for 30 minutes. £24.99 with free delivery. It\'s not our cheapest bag but it\'s the cheapest one I\'d trust with a phone.'],
      ['shopper', 'ok buy it'],
      ['system', 'ACP checkout · Meridian Pay authorised £24.99 · order 204-7779'],
    ] },
    { id: 'C-2209', surface: 'gemini', startedAt: ago(41), shopper: 'Shopper · Cork', question: 'Are the deck boots true to size?', outcome: 'browsing', value: 0, products: ['NHG-BTS-07'], sentiment: 'neutral', transcript: [
      ['shopper', 'Are the deck boots true to size? I\'m a 44 normally.'],
      ['agent', 'Reviews say they run about half a size large to allow for a thick sock. Most 44s take the 43/44. I don\'t have a size chart on the listing yet, so if you\'re between sizes I\'d go down.'],
      ['shopper', 'thanks, I\'ll think about it'],
      ['system', 'No checkout · Listing Agent notified: size chart missing (→ P-1039)'],
    ] },
    { id: 'C-2208', surface: 'gemini', startedAt: ago(63), shopper: 'Shopper · Hull', question: 'Is there a discount code?', outcome: 'abandoned', value: 0, products: ['NHG-OSK-01'], sentiment: 'negative', transcript: [
      ['shopper', 'Is there a discount code for the Offshore jacket?'],
      ['agent', 'There\'s no active promotion on the Offshore Shell Jacket right now. It\'s £189 with free next-day delivery.'],
      ['shopper', 'I\'ll wait for a sale then.'],
      ['system', 'Abandoned · Insight: discount requests abandon at 61% (→ P-1038 proposes a 5% bundle mandate)'],
    ] },
    { id: 'C-2207', surface: 'chatgpt', startedAt: ago(95), shopper: 'Shopper · Glasgow', question: 'Can I return sunglasses if they don\'t fit my face?', outcome: 'escalated', value: 0, products: ['NHG-SGL-03'], sentiment: 'neutral', transcript: [
      ['shopper', 'Can I return the sunglasses if they don\'t fit my face? And who pays postage?'],
      ['agent', 'Returns and postage policy are outside what I\'m allowed to promise, so I\'ve passed this to the North Harbour team — they\'ll reply here within a few hours. In the meantime: the frame is 142mm wide, which is a medium–large fit.'],
      ['system', 'Escalated to human (policy question out of mandate) · SLA 4h · assigned to Priya'],
    ] },
    { id: 'C-2206', surface: 'claude', startedAt: ago(140), shopper: 'Shopper · Plymouth', question: 'Lifejacket for a 7-year-old', outcome: 'declined', value: 0, products: ['NHG-LFJ-02'], sentiment: 'neutral', transcript: [
      ['shopper', 'Do you do a lifejacket for a 7 year old? About 25kg.'],
      ['agent', 'Not one I can recommend. The 150N Auto Lifejacket is adult-only (40kg+). For a 25kg child you need a junior 100N or 150N with crotch straps — we don\'t stock one, and I won\'t suggest the adult one for a child.'],
      ['system', 'No sale by design (safety) · Catalog gap logged: junior lifejacket · 9 similar requests this week'],
    ] },
  ];

  const audit = [
    { ts: ago(6), actor: 'Storefront Agent', via: 'Claude', action: 'Checkout completed', detail: 'C-2211 · £225.99 · AP2 mandate · order 204-7781', outcome: 'ok' },
    { ts: ago(14), actor: 'Pricing Agent', via: 'Mandate Gate', action: 'Proposal queued', detail: 'P-1042 · 20L Dry Bag £24.99 → £22.99 (−8%) · in-mandate', outcome: 'info' },
    { ts: ago(31), actor: 'Mandate Gate', via: 'Policy engine', action: 'Auto-blocked proposal', detail: 'P-1041 · Deck Boots −20% exceeds max cut 10%', outcome: 'bad' },
    { ts: ago(55), actor: 'Restock Agent', via: 'Mandate Gate', action: 'Proposal queued', detail: 'P-1040 · Sunglasses 120 units (stock 18 < floor 25)', outcome: 'info' },
    { ts: ago(95), actor: 'Storefront Agent', via: 'ChatGPT', action: 'Escalated to human', detail: 'C-2207 · returns policy question · assigned Priya', outcome: 'warn' },
    { ts: ago(300), actor: 'Mandate Gate', via: 'Policy engine', action: 'Auto-blocked proposal', detail: 'P-1037 · Gloves £6.99 below unit cost £7.20', outcome: 'bad' },
    { ts: ago(620), actor: 'Priya (owner)', via: 'Console', action: 'Mandate changed', detail: 'Stock floor 20 → 25 units', outcome: 'info' },
    { ts: ago(1480), actor: 'Priya (owner)', via: 'Console', action: 'Approved proposal', detail: 'P-1035 · Thermal Base Layer £39 → £36.99', outcome: 'ok' },
    { ts: ago(1478), actor: 'Selling Partner plugin', via: 'SP-API (MCP)', action: 'Write confirmed', detail: 'P-1035 · pricing:write · listing price updated', outcome: 'ok' },
    { ts: ago(2700), actor: 'Priya (owner)', via: 'Console', action: 'Declined proposal', detail: 'P-1034 · Dry Bag images · "Waiting on new photography"', outcome: 'warn' },
    { ts: ago(4100), actor: 'Priya (owner)', via: 'Console', action: 'Connector re-authorised', detail: 'Claude MCP connector · scopes unchanged', outcome: 'info' },
  ];

  const insights = [
    { id: 'I-1', kind: 'works', title: 'Jacket + base-layer bundle recommendation', metric: '+31% AOV', evidence: 'When the Storefront Agent suggests the Thermal Base Layer alongside the Offshore Shell, order value rises from £189 to £226. 14 of 17 bundle suggestions converted this week on Claude.', action: { label: 'Make it a mandated offer (P-1038)', run: 'goto:inbox:P-1038' } },
    { id: 'I-2', kind: 'works', title: 'Spec-grounded answers convert', metric: '2.1×', evidence: 'Answers citing a listed spec (hydrostatic head, IPX rating, frame width) convert at 55% vs 26% for generic answers. The agent is only allowed to cite what is on the listing — so listing quality is the lever.', action: { label: 'Open Listing Agent', run: 'goto:agents' } },
    { id: 'I-3', kind: 'works', title: 'Featured Offer win rate since Pricing Agent', metric: '78% → 84%', evidence: '31 approved micro-adjustments (median −3.2%) over 7 days. Zero below-floor writes. Margin on affected ASINs down 0.8pt, units up 14%.', action: { label: 'View pricing audit', run: 'goto:audit:Pricing' } },
    { id: 'I-4', kind: 'not', title: 'Discount requests with no offer', metric: '61% abandon', evidence: '23 shoppers asked for a discount this week; 14 abandoned. The Storefront Agent has no discretionary mandate so it can only say no. Worst on Gemini (71%).', action: { label: 'Review 5% bundle proposal', run: 'goto:inbox:P-1038' } },
    { id: 'I-5', kind: 'not', title: 'Sizing questions on Gemini', metric: '38% drop-off', evidence: 'Deck Boots and Offshore Shell get sizing questions the listing cannot answer. The agent is honest about the gap, which is right, but it costs ~6 orders/week.', action: { label: 'Approve size chart (P-1039)', run: 'goto:inbox:P-1039' } },
    { id: 'I-6', kind: 'not', title: 'Catalog gap: junior lifejacket', metric: '9 requests', evidence: 'Nine shoppers asked for a child\'s lifejacket. The agent correctly refused to sell the adult 150N. Nothing to sell them.', action: { label: 'Ask Restock Agent to source', run: 'copilot:ask restock agent to source a junior lifejacket' } },
  ];

  const integrations = {
    claude: { connected: true, since: ago(4100), agents: ['storefront', 'pricing'] },
    chatgpt: { connected: true, since: ago(9000), agents: ['storefront', 'pricing', 'listing'] },
    gemini: { connected: true, since: ago(12000), agents: ['storefront', 'restock'] },
    amazon: { connected: true, since: ago(20000), endpoint: 'sellingpartner-ai.amazon.com/mcp', scopes: ['listings:read', 'listings:write', 'pricing:read', 'pricing:write', 'inventory:read', 'fba:inbound', 'orders:read'] },
    sellerAssistant: { connected: true, workflows: 3, memory: true },
    meridian: { connected: true, mode: 'live', protocols: ['AP2 mandates', 'ACP checkout', 'Visa Intelligent Commerce'], auth7d: 212, authRate: 96.2, disputes: 0, avgTicket: 69.9 },
  };

  const mandate = {
    maxCutPct: 10,
    maxRisePct: 15,
    neverBelowCost: true,
    stockFloor: 25,
    noDiscountBelowFloor: true,
    maxInboundSpend: 20000,
    maxDiscretionaryPct: 5,
    lockedFields: ['brand', 'category'],
  };

  const state = {
    merchant: { name: 'North Harbour Gear', owner: 'Priya' },
    mandate, catalog, agents, proposals, conversations, audit, insights, integrations,
    copilot: { messages: [], tts: false },
    ui: { view: 'overview', inboxTab: 'pending', editing: null, draft: {}, convo: 'C-2211', auditFilter: '', auditSearch: '', mandateDraft: null },
  };
  // Run every undecided proposal through the gate on first load.
  for (const p of state.proposals) if (p.status === 'pending') applyGate(p, state);
  return state;
}

/* =========================================================================
   Mandate Gate — the policy engine. Every proposal passes through here.
   ========================================================================= */
function evaluateProposal(p, mandate, catalog) {
  const item = catalog.find((c) => c.sku === p.sku);
  const checks = []; // { rule, ok, note }
  const add = (rule, ok, note) => checks.push({ rule, ok, note });

  if (p.type === 'price_change') {
    const from = item.price;
    const to = Number(p.proposed.price);
    const cut = ((from - to) / from) * 100;
    if (cut >= 0) add(`Max cut ${mandate.maxCutPct}%`, cut <= mandate.maxCutPct, `${cut.toFixed(1)}% cut`);
    else add(`Max rise ${mandate.maxRisePct}%`, -cut <= mandate.maxRisePct, `${(-cut).toFixed(1)}% rise`);
    if (mandate.neverBelowCost) add('Never below cost', to >= item.cost, `${gbp(to)} vs cost ${gbp(item.cost)}`);
    if (mandate.noDiscountBelowFloor && cut > 0) add(`No discounts under stock floor (${mandate.stockFloor})`, item.stock >= mandate.stockFloor, `stock ${item.stock}`);
  }
  if (p.type === 'restock') {
    const spend = Number(p.proposed.units) * item.cost;
    add(`Inbound spend cap ${gbp(mandate.maxInboundSpend)}`, spend <= mandate.maxInboundSpend, `${p.proposed.units} × ${gbp(item.cost)} = ${gbp(spend)}`);
    add('Units > 0', Number(p.proposed.units) > 0, `${p.proposed.units} units`);
  }
  if (p.type === 'discount_offer') {
    const d = Number(p.proposed.pct);
    add(`Discretionary discount ≤ ${mandate.maxDiscretionaryPct}%`, d <= mandate.maxDiscretionaryPct, `${d}% offer`);
    const to = item.price * (1 - d / 100);
    if (mandate.neverBelowCost) add('Never below cost', to >= item.cost, `${gbp(to)} vs cost ${gbp(item.cost)}`);
    if (mandate.noDiscountBelowFloor) add(`No discounts under stock floor (${mandate.stockFloor})`, item.stock >= mandate.stockFloor, `stock ${item.stock}`);
  }
  if (p.type === 'listing_update') {
    const locked = p.proposed.fields.filter((f) => mandate.lockedFields.includes(f));
    add('No locked fields', locked.length === 0, locked.length ? `touches ${locked.join(', ')}` : `${p.proposed.fields.join(', ')}`);
  }
  const failed = checks.filter((c) => !c.ok);
  return { verdict: failed.length ? 'blocked' : 'in-mandate', checks, reasons: failed.map((c) => `${c.rule}: ${c.note}`) };
}

function applyGate(p, state) {
  const gate = evaluateProposal(p, state.mandate, state.catalog);
  p.gate = gate;
  if (p.status === 'pending' && gate.verdict === 'blocked') p.status = 'blocked';
  else if (p.status === 'blocked' && gate.verdict === 'in-mandate') p.status = 'pending';
  return gate;
}

/* =========================================================================
   State, persistence, audit
   ========================================================================= */
const STORE_KEY = 'nhg-seller-console-v1';
let S = load();
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const s = JSON.parse(raw); if (s && s.catalog && s.mandate) return s; }
  } catch (_) { /* ignore */ }
  return seed();
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (_) { /* ignore */ } }
function log(actor, via, action, detail, outcome = 'info') {
  S.audit.unshift({ ts: Date.now(), actor, via, action, detail, outcome });
}
function agentOf(id) { return S.agents.find((a) => a.id === id); }
function agentName(id) { const a = agentOf(id); return a ? (a.name || AGENT_TEMPLATES[a.tpl].name) : id; }
function itemOf(sku) { return S.catalog.find((c) => c.sku === sku); }
function proposalTitle(p) {
  const it = itemOf(p.sku);
  if (p.type === 'price_change') return `Reprice ${it.title}`;
  if (p.type === 'restock') return `Inbound ${p.proposed.units} × ${it.title}`;
  if (p.type === 'discount_offer') return `Allow ${p.proposed.pct}% bundle offer on ${it.title}`;
  if (p.type === 'listing_update') return `Update listing · ${it.title}`;
  return p.id;
}
const TYPE_LABEL = { price_change: 'Price change', restock: 'Restock', discount_offer: 'Discount mandate', listing_update: 'Listing update' };

/* =========================================================================
   Toasts, modal
   ========================================================================= */
function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = esc(msg);
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3600);
}
function openModal(html) { const m = $('#modal'); m.innerHTML = `<div class="modal">${html}</div>`; m.classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }

/* =========================================================================
   Icons (inline SVG)
   ========================================================================= */
const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  agents: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M8 12h.01M16 12h.01M9 16h6"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1.5 2h5L16 13h5"/>',
  conversations: '<path d="M4 5h16v11H9l-5 4V5z"/>',
  sales: '<path d="M3 20h18M6 16V9M11 16V4M16 16v-6M21 16v-3"/>',
  insights: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.5 1 2.5h6c0-1 .4-1.9 1-2.5A6 6 0 0 0 12 3z"/>',
  mandates: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
  audit: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  integrations: '<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0V7zM12 16v5"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16v4zM13 7l4 4"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;

/* =========================================================================
   Small chart helpers (inline SVG)
   ========================================================================= */
function spark(values, { w = 120, h = 32, color = '#0c6b63' } = {}) {
  if (!values || values.length < 2) return '';
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 3 - ((v - min) / span) * (h - 6)}`).join(' ');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts}"/></svg>`;
}
function surfaceBars(rows) {
  const max = Math.max(...rows.map((r) => r.total)) || 1;
  return `<div class="bars">${rows.map((r) => `
    <div class="bar-row">
      <div title="${esc(r.label)}">${esc(r.label)}</div>
      <div class="track" style="width:${Math.max(6, (r.total / max) * 100)}%">
        ${['claude', 'chatgpt', 'gemini'].map((s) => `<div class="seg ${s}" style="width:${(r.by[s] / r.total) * 100}%" title="${SURFACES[s].name}: ${r.by[s]}"></div>`).join('')}
      </div>
      <div class="v">${esc(r.value)}</div>
    </div>`).join('')}</div>`;
}
const surfaceChip = (s) => `<span class="chip surface"><span class="dot ${s}"></span>${SURFACES[s].name}</span>`;
const statusChip = (st) => ({ pending: '<span class="chip warn"><span class="dot"></span>Awaiting approval</span>', blocked: '<span class="chip bad"><span class="dot"></span>Auto-blocked</span>', approved: '<span class="chip info"><span class="dot"></span>Dispatching…</span>', confirmed: '<span class="chip ok"><span class="dot"></span>Live on Amazon</span>', declined: '<span class="chip"><span class="dot"></span>Declined</span>', dismissed: '<span class="chip"><span class="dot"></span>Dismissed</span>' }[st] || st);

/* =========================================================================
   Views
   ========================================================================= */
const VIEWS = {
  overview: { label: 'Overview', sub: 'What your agents did, what is waiting on you' },
  agents: { label: 'Agent roster', sub: 'Pricing · Listing · Restock · Storefront · Ads' },
  inbox: { label: 'Proposal inbox', sub: 'Approve · Edit · Decline — nothing writes to Amazon without you' },
  conversations: { label: 'Customer conversations', sub: 'How the Storefront Agent is talking to shoppers in Claude, ChatGPT and Gemini' },
  sales: { label: 'Sales & payments', sub: 'What the agents are selling, by surface, and how it is getting paid' },
  insights: { label: 'What works · what doesn\'t', sub: 'Patterns across conversations, proposals and outcomes' },
  mandates: { label: 'Mandates', sub: 'The policy engine every proposal passes through' },
  audit: { label: 'Audit log', sub: 'Every agent action, gate decision and human approval' },
  integrations: { label: 'Integrations', sub: 'Where your agents are published and what they can touch' },
  architecture: { label: 'Architecture', sub: 'How the pieces fit together' },
};

function counts() {
  return {
    pending: S.proposals.filter((p) => p.status === 'pending').length,
    blocked: S.proposals.filter((p) => p.status === 'blocked').length,
    escalated: S.conversations.filter((c) => c.outcome === 'escalated').length,
  };
}

function renderNav() {
  const c = counts();
  const item = (v, badge = '') => `<button data-action="goto" data-view="${v}" class="${S.ui.view === v ? 'active' : ''}">${icon(v)}<span>${VIEWS[v].label}</span>${badge}</button>`;
  $('#nav').innerHTML = `
    <div class="nav-label">Console</div>
    ${item('overview')}
    ${item('agents')}
    ${item('inbox', c.pending + c.blocked ? `<span class="count ${c.blocked ? 'bad' : 'warn'}">${c.pending + c.blocked}</span>` : '')}
    ${item('conversations', c.escalated ? `<span class="count warn">${c.escalated}</span>` : '')}
    <div class="nav-label">Performance</div>
    ${item('sales')}
    ${item('insights')}
    <div class="nav-label">Control</div>
    ${item('mandates')}
    ${item('audit')}
    ${item('integrations')}
  `;
}

function render() {
  renderNav();
  const v = S.ui.view;
  $('#crumb').innerHTML = `<h1>${esc(VIEWS[v].label)}</h1><span class="sub">${esc(VIEWS[v].sub)}</span>`;
  const fn = { overview: viewOverview, agents: viewAgents, inbox: viewInbox, conversations: viewConversations, sales: viewSales, insights: viewInsights, mandates: viewMandates, audit: viewAudit, integrations: viewIntegrations, architecture: viewArchitecture }[v];
  $('#view').innerHTML = fn();
  renderCopilot();
  save();
}

/* ---------- Overview ---------- */
function viewOverview() {
  const c = counts();
  const gmv = S.agents.find((a) => a.id === 'storefront').metrics.gmv7d;
  const pay = S.integrations.meridian;
  const pending = S.proposals.filter((p) => p.status === 'pending' || p.status === 'blocked').slice(0, 4);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `
    <div class="row between">
      <div>
        <h2 class="serif" style="font-size:28px">${greet}, ${esc(S.merchant.owner)}.</h2>
        <div class="muted">${c.pending} proposal${c.pending === 1 ? '' : 's'} waiting on you · ${c.blocked} auto-blocked by the Mandate Gate · ${c.escalated} shopper conversation${c.escalated === 1 ? '' : 's'} escalated</div>
      </div>
      <div class="row">
        <button class="btn" data-action="goto" data-view="inbox">Open inbox</button>
        <button class="btn primary" data-action="approveAllInMandate">Approve all in-mandate (${c.pending})</button>
      </div>
    </div>

    <div class="grid c5">
      <div class="card kpi"><div class="label">Agent-attributed GMV · 7d</div><div class="value">${gbp(gmv)} <span class="delta up">+12%</span></div><div class="foot"><span>212 orders via agentic checkout</span>${spark([9, 11, 12, 10, 13, 14, 15], { w: 70, h: 22 })}</div></div>
      <div class="card kpi"><div class="label">Shopper sessions · 7d</div><div class="value">486 <span class="delta up">+9%</span></div><div class="foot"><span>43.6% converted</span>${spark([52, 60, 66, 70, 74, 80, 84], { w: 70, h: 22, color: '#3b7bea' })}</div></div>
      <div class="card kpi"><div class="label">Payment auth rate</div><div class="value">${pay.authRate}% <small>${pay.auth7d} auths</small></div><div class="foot"><span>${pay.disputes} disputes · avg ${gbp(pay.avgTicket)}</span><span class="chip ok">Meridian Pay</span></div></div>
      <div class="card kpi"><div class="label">Featured Offer win rate</div><div class="value">84% <span class="delta up">+6pt</span></div><div class="foot"><span>Pricing Agent · 31 writes</span>${spark(agentOf('pricing').trend, { w: 70, h: 22 })}</div></div>
      <div class="card kpi"><div class="label">Mandate Gate · 7d</div><div class="value">${S.proposals.filter((p) => p.status === 'blocked').length + 3} <small>blocked</small></div><div class="foot"><span>0 out-of-mandate writes reached Amazon</span><span class="chip ok">Enforcing</span></div></div>
    </div>

    <div class="grid split">
      <div class="card">
        <div class="card-head"><div><h3>Agent roster</h3><div class="sub">${S.agents.filter((a) => a.status === 'active').length} active · ${S.agents.filter((a) => a.status === 'paused').length} paused</div></div><button class="btn sm" data-action="goto" data-view="agents">Manage</button></div>
        <div class="card-body tight">
          <table class="table">
            <thead><tr><th>Agent</th><th>Published to</th><th>Last run</th><th class="num">7-day</th><th></th></tr></thead>
            <tbody>${S.agents.map((a) => {
              const tpl = AGENT_TEMPLATES[a.tpl];
              const m = a.metrics;
              const kpi = a.id === 'storefront' ? `${m.conversions7d} orders` : a.status === 'not-installed' ? '—' : `${m.approved}/${m.proposals7d} approved`;
              return `<tr class="clickable" data-action="goto" data-view="agents">
                <td><div class="row"><span class="status-dot ${a.status}"></span><div><div style="font-weight:500">${esc(a.name || tpl.name)}</div><div class="small muted">${esc(tpl.role)}</div></div></div></td>
                <td><div class="row wrap">${a.surfaces.map(surfaceChip).join('') || '<span class="muted small">Not installed</span>'}</div></td>
                <td class="muted small">${a.lastRun ? rel(a.lastRun) : '—'}</td>
                <td class="num">${kpi}</td>
                <td>${a.trend.length ? spark(a.trend, { w: 60, h: 20 }) : ''}</td></tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Mandates in force</h3><div class="sub">Every proposal is checked against these</div></div><button class="btn sm" data-action="goto" data-view="mandates">Edit</button></div>
        <div class="card-body">
          <div class="row wrap" style="gap:8px">
            <span class="chip accent">Max cut ${S.mandate.maxCutPct}%</span>
            <span class="chip accent">Max rise ${S.mandate.maxRisePct}%</span>
            <span class="chip accent">${S.mandate.neverBelowCost ? 'Never below cost' : 'Below cost allowed'}</span>
            <span class="chip accent">Stock floor ${S.mandate.stockFloor}</span>
            <span class="chip accent">Inbound cap ${gbp(S.mandate.maxInboundSpend)}</span>
            <span class="chip accent">Discretionary ≤ ${S.mandate.maxDiscretionaryPct}%</span>
            <span class="chip accent">Locked: ${S.mandate.lockedFields.join(', ')}</span>
          </div>
          <div class="hr"></div>
          <div class="small muted">In-mandate proposals queue for your approval. Out-of-mandate proposals are blocked before they reach the inbox and logged to the audit trail. Approved writes go to Amazon through the Selling Partner plugin (MCP) or Seller Assistant workflows.</div>
        </div>
      </div>
    </div>

    <div class="grid split">
      <div class="card">
        <div class="card-head"><div><h3>Proposal inbox</h3><div class="sub">${c.pending} awaiting approval · ${c.blocked} blocked</div></div><div class="row"><button class="btn sm" data-action="simulate">Simulate</button><button class="btn sm" data-action="goto" data-view="inbox">Open inbox</button></div></div>
        <div class="card-body tight">
          ${pending.length ? pending.map((p) => renderProposalRow(p)).join('') : '<div class="empty">Inbox clear. Nothing waiting on you.</div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Activity feed</h3><div class="sub">Live from the audit log</div></div><button class="btn sm" data-action="goto" data-view="audit">All activity</button></div>
        <div class="card-body tight list">
          ${S.audit.slice(0, 8).map((e) => `<div class="list-item"><div class="time">${rel(e.ts)}</div><div class="body"><div class="title"><span class="chip ${e.outcome} sm" style="margin-right:6px">${esc(e.action)}</span>${esc(e.actor)}</div><div class="desc">${esc(e.detail)}</div></div></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="grid split">
      <div class="card">
        <div class="card-head"><div><h3>Selling by surface · 7d</h3><div class="sub">Units sold via each assistant</div></div><div class="legend"><span class="claude">Claude</span><span class="chatgpt">ChatGPT</span><span class="gemini">Gemini</span></div></div>
        <div class="card-body">${surfaceBars(S.catalog.map((c) => ({ label: c.title, by: c.by, total: c.sold7d, value: `${c.sold7d} · ${gbp(c.sold7d * c.price, 0)}` })))}</div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>What's working · what isn't</h3></div><button class="btn sm" data-action="goto" data-view="insights">All insights</button></div>
        <div class="card-body tight list">
          ${[S.insights[0], S.insights[3]].map((i) => `<div class="list-item"><div class="body"><div class="row between"><span class="title">${esc(i.title)}</span><b class="${i.kind === 'works' ? 'chip ok' : 'chip bad'}">${esc(i.metric)}</b></div><div class="desc">${esc(i.evidence.split('. ')[0])}.</div><div style="margin-top:8px"><button class="btn sm" data-action="runInsight" data-id="${i.id}">${esc(i.action.label)}</button></div></div></div>`).join('')}
        </div>
      </div>
    </div>`;
}

function renderProposalRow(p) {
  const it = itemOf(p.sku);
  const a = agentOf(p.agentId);
  let change = '';
  if (p.type === 'price_change') { const d = ((p.proposed.price - it.price) / it.price) * 100; change = `${gbp(it.price)} → <b>${gbp(p.proposed.price)}</b> <span class="${d < 0 ? 'chip bad' : 'chip ok'}">${pct(d, 0)}</span>`; }
  if (p.type === 'restock') change = `<b>${p.proposed.units} units</b> · ${gbp(p.proposed.units * it.cost, 0)} at cost`;
  if (p.type === 'discount_offer') change = `<b>${p.proposed.pct}% off</b> when bundled with ${esc(itemOf(p.proposed.bundleWith).title)}`;
  if (p.type === 'listing_update') change = esc(p.summary);
  return `<div class="list-item" style="align-items:center">
    <div class="agent-avatar ${a.tpl}" style="width:32px;height:32px;border-radius:9px;font-size:12px">${esc(agentName(p.agentId).slice(0, 2).toUpperCase())}</div>
    <div class="body"><div class="title">${esc(proposalTitle(p))} <span class="sku">${esc(p.sku)}</span></div><div class="desc">${change}</div></div>
    <div class="row">
      ${p.status === 'blocked' ? statusChip('blocked') : `<button class="btn ok sm" data-action="approve" data-id="${p.id}">${icon('check')} Approve</button><button class="btn sm" data-action="gotoEdit" data-id="${p.id}">Edit</button><button class="btn danger sm" data-action="decline" data-id="${p.id}">Decline</button>`}
    </div>
  </div>`;
}

/* ---------- Agents ---------- */
function viewAgents() {
  return `
    <div class="row between">
      <div class="muted">Each agent is a plugin published to the assistants you choose. Seller-facing agents propose; the Mandate Gate decides what reaches you; you approve. Shopper-facing agents sell within the same mandates.</div>
      <button class="btn primary" data-action="newAgent">+ New agent</button>
    </div>
    <div class="grid c2">${S.agents.map(renderAgentCard).join('')}</div>`;
}
function renderAgentCard(a) {
  const tpl = AGENT_TEMPLATES[a.tpl];
  const name = a.name || tpl.name;
  if (a.status === 'not-installed') {
    return `<div class="card agent-card" style="border-style:dashed;box-shadow:none">
      <div class="card-body">
        <div class="agent-head"><div class="agent-avatar ${a.tpl}">${esc(name.slice(0, 2).toUpperCase())}</div><div><div class="name">${esc(name)} <span class="chip">Optional</span></div><div class="role">${esc(tpl.role)}</div></div></div>
        <div class="agent-goal">Not installed. Ads spend has its own budget mandate and audit trail, so it runs in a separate console once installed. Install here to add it to the roster with a daily budget cap.</div>
      </div>
      <div class="agent-foot"><span class="small muted">Tools: ${tpl.tools.join(' · ')}</span><button class="btn" data-action="newAgent" data-tpl="ads">Install Ads Agent</button></div>
    </div>`;
  }
  const m = a.metrics;
  const metrics = a.id === 'storefront'
    ? [[m.sessions7d, 'sessions · 7d'], [m.conversions7d, 'orders'], [gbp(m.gmv7d, 0), 'GMV']]
    : a.tpl === 'pricing' ? [[m.proposals7d, 'proposals · 7d'], [m.approved, 'approved'], [`${m.foWin}%`, 'FO win rate']]
    : a.tpl === 'listing' ? [[m.proposals7d, 'proposals · 7d'], [m.approved, 'approved'], [`${m.quality}`, 'listing quality']]
    : a.tpl === 'restock' ? [[m.proposals7d, 'proposals · 7d'], [m.approved, 'approved'], [m.stockouts, 'stock-outs']]
    : [[m.proposals7d ?? 0, 'proposals · 7d'], [m.approved ?? 0, 'approved'], [m.blocked ?? 0, 'blocked']];
  const open = S.proposals.filter((p) => p.agentId === a.id && (p.status === 'pending' || p.status === 'blocked'));
  return `<div class="card agent-card">
    <div class="card-body">
      <div class="row between">
        <div class="agent-head"><div class="agent-avatar ${a.tpl}">${esc(name.slice(0, 2).toUpperCase())}</div><div><div class="name">${esc(name)}</div><div class="role">${esc(tpl.role)}</div></div></div>
        <span class="chip ${a.status === 'active' ? 'ok' : 'warn'}"><span class="dot"></span>${a.status === 'active' ? 'Active' : 'Paused'}</span>
      </div>
      <div class="row wrap" style="margin-top:12px;gap:6px">
        <span class="chip">${tpl.facing === 'shopper' ? 'Shopper-facing' : 'Seller-facing'}</span>
        <span class="chip mono">${esc(a.runtime)}</span>
        ${a.surfaces.map(surfaceChip).join('')}
      </div>
      <div class="agent-goal"><b>Goal.</b> ${esc(a.goal)}</div>
      <div class="agent-metrics">${metrics.map(([v, l]) => `<div class="m"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>
      <div class="row between" style="margin-top:12px">
        <span class="small muted">Tools: ${tpl.tools.join(' · ')}</span>
        ${a.trend.length ? spark(a.trend, { w: 90, h: 24 }) : ''}
      </div>
    </div>
    <div class="agent-foot">
      <span class="small muted">Last run ${a.lastRun ? rel(a.lastRun) : '—'} · ${open.length} open proposal${open.length === 1 ? '' : 's'}</span>
      <div class="row">
        <button class="btn sm" data-action="editAgent" data-id="${a.id}">${icon('edit')} Edit goal</button>
        <button class="btn sm" data-action="goto" data-view="audit" data-filter="${esc(name)}">Activity</button>
        ${a.status === 'active' ? `<button class="btn sm" data-action="pauseAgent" data-id="${a.id}">Pause</button>` : `<button class="btn ok sm" data-action="resumeAgent" data-id="${a.id}">Resume</button>`}
      </div>
    </div>
  </div>`;
}

/* ---------- Inbox ---------- */
function viewInbox() {
  const tabs = [['pending', 'Awaiting approval'], ['blocked', 'Auto-blocked'], ['done', 'Decided'], ['all', 'All']];
  const n = (t) => t === 'all' ? S.proposals.length : t === 'done' ? S.proposals.filter((p) => ['approved', 'confirmed', 'declined', 'dismissed'].includes(p.status)).length : S.proposals.filter((p) => p.status === t).length;
  const list = S.proposals.filter((p) => S.ui.inboxTab === 'all' || (S.ui.inboxTab === 'done' ? ['approved', 'confirmed', 'declined', 'dismissed'].includes(p.status) : p.status === S.ui.inboxTab));
  return `
    <div class="row between">
      <div class="tabs">${tabs.map(([t, l]) => `<button class="${S.ui.inboxTab === t ? 'active' : ''}" data-action="inboxTab" data-tab="${t}">${l}<span class="n">${n(t)}</span></button>`).join('')}</div>
      <div class="row">
        <button class="btn" data-action="simulate">${icon('bolt')} Simulate agent proposal</button>
        ${S.ui.inboxTab === 'pending' && n('pending') ? `<button class="btn primary" data-action="approveAllInMandate">Approve all (${n('pending')})</button>` : ''}
      </div>
    </div>
    ${list.length ? list.map(renderProposal).join('') : `<div class="card"><div class="empty">Nothing here.</div></div>`}`;
}

function renderProposal(p) {
  const it = itemOf(p.sku);
  const a = agentOf(p.agentId);
  const editing = S.ui.editing === p.id;
  let change = '';
  if (p.type === 'price_change') {
    const d = ((p.proposed.price - it.price) / it.price) * 100;
    change = `<div class="delta-box"><span class="from">${gbp(it.price)}</span><span class="arrow">→</span><span class="to">${gbp(p.proposed.price)}</span><span class="pct ${d < 0 ? 'down' : 'up'}">${pct(d, 1)}</span><span class="chip">margin ${(((p.proposed.price - it.cost) / p.proposed.price) * 100).toFixed(0)}%</span></div>`;
  } else if (p.type === 'restock') {
    change = `<div class="delta-box"><span class="from" style="text-decoration:none">${it.stock} in stock</span><span class="arrow">→</span><span class="to">+${p.proposed.units} units</span><span class="chip">${gbp(p.proposed.units * it.cost, 0)} inbound at cost</span>${it.stock < S.mandate.stockFloor ? `<span class="chip bad">below floor ${S.mandate.stockFloor}</span>` : ''}</div>`;
  } else if (p.type === 'discount_offer') {
    change = `<div class="delta-box"><span class="to">${p.proposed.pct}% off</span><span class="muted">when bundled with ${esc(itemOf(p.proposed.bundleWith).title)}</span><span class="chip">${gbp(it.price)} → ${gbp(it.price * (1 - p.proposed.pct / 100))}</span></div>`;
  } else if (p.type === 'listing_update') {
    change = `<div class="delta-box"><span class="to" style="font-size:16px">${esc(p.summary)}</span></div><div class="row wrap" style="gap:6px">${p.proposed.fields.map((f) => `<span class="chip mono">${esc(f)}</span>`).join('')}</div>`;
  }
  const gate = p.gate || evaluateProposal(p, S.mandate, S.catalog);
  const gateHtml = `<div class="gate ${gate.verdict === 'blocked' ? 'bad' : 'ok'}">
    <div class="gate-title">${icon(gate.verdict === 'blocked' ? 'x' : 'check')} Mandate Gate · ${gate.verdict === 'blocked' ? 'out of mandate' : 'in mandate'}</div>
    ${gate.checks.map((c) => `<div class="check"><span>${c.ok ? '✓' : '✕'} ${esc(c.rule)}</span><span class="mono">${esc(c.note)}</span></div>`).join('')}
    ${gate.verdict === 'blocked' ? `<div style="margin-top:8px;font-size:12px">Blocked before reaching the inbox and logged to the audit trail. Edit it to fit the mandate, or change the mandate itself.</div>` : ''}
  </div>`;
  const decided = ['approved', 'confirmed', 'declined', 'dismissed'].includes(p.status);
  const actions = decided
    ? `<span class="small muted">${p.status === 'declined' || p.status === 'dismissed' ? 'Decided' : 'Approved'} by ${esc(p.decidedBy || S.merchant.owner)} · ${p.decidedAt ? clock(p.decidedAt) : ''}${p.note ? ` · "${esc(p.note)}"` : ''}</span><span class="spacer"></span>${p.status === 'confirmed' ? '<span class="chip ok">pricing:write · SP-API · confirmed</span>' : p.status === 'approved' ? '<span class="chip info">Writing via Selling Partner plugin…</span>' : ''}`
    : p.status === 'blocked'
      ? `<span class="small muted">Out of mandate — the agent cannot act on this.</span><span class="spacer"></span><button class="btn sm" data-action="gotoEdit" data-id="${p.id}">${icon('edit')} Edit to fit mandate</button><button class="btn sm" data-action="goto" data-view="mandates">Change mandate</button><button class="btn ghost sm" data-action="dismiss" data-id="${p.id}">Dismiss</button>`
      : `<button class="btn ok" data-action="approve" data-id="${p.id}">${icon('check')} Approve & write</button><button class="btn" data-action="gotoEdit" data-id="${p.id}">${icon('edit')} Edit</button><button class="btn danger" data-action="decline" data-id="${p.id}">Decline</button><span class="spacer"></span><span class="small muted">Approved writes go through the Selling Partner plugin (MCP) with role-scoped OAuth.</span>`;

  return `<div class="proposal ${p.status === 'blocked' ? 'blocked' : ''}" id="prop-${p.id}">
    <div class="proposal-head">
      <div class="row"><div class="agent-avatar ${a.tpl}" style="width:30px;height:30px;border-radius:8px;font-size:11px">${esc(agentName(p.agentId).slice(0, 2).toUpperCase())}</div><div><b>${esc(agentName(p.agentId))}</b> <span class="muted">· ${TYPE_LABEL[p.type]} · ${rel(p.createdAt)}</span></div></div>
      <div class="row">${statusChip(p.status)}<span class="chip mono">${p.id}</span></div>
    </div>
    <div class="proposal-body">
      <div>
        <div class="proposal-title">${esc(proposalTitle(p))}</div>
        <div class="sku">${esc(p.sku)} · stock ${it.stock} · cost ${gbp(it.cost)}</div>
        ${change}
        <div class="rationale"><b>Why the agent proposes this.</b> ${esc(p.rationale)}</div>
        ${editing ? renderEditForm(p) : ''}
      </div>
      <div>${gateHtml}</div>
    </div>
    <div class="proposal-actions">${actions}</div>
  </div>`;
}

function renderEditForm(p) {
  const d = S.ui.draft;
  const it = itemOf(p.sku);
  const trial = { ...p, proposed: { ...p.proposed, ...d } };
  const g = evaluateProposal(trial, S.mandate, S.catalog);
  let fields = '';
  if (p.type === 'price_change') fields = `<label>New price (£)<input type="number" step="0.01" data-draft="price" value="${trial.proposed.price}"></label><label>Floor<input disabled value="${gbp(Math.max(it.cost, it.price * (1 - S.mandate.maxCutPct / 100)))} (mandate)"></label>`;
  if (p.type === 'restock') fields = `<label>Units<input type="number" step="1" data-draft="units" value="${trial.proposed.units}"></label><label>Inbound spend<input disabled value="${gbp(trial.proposed.units * it.cost, 0)} of ${gbp(S.mandate.maxInboundSpend)} cap"></label>`;
  if (p.type === 'discount_offer') fields = `<label>Discount %<input type="number" step="1" data-draft="pct" value="${trial.proposed.pct}"></label><label>Bundle with<select data-draft="bundleWith">${S.catalog.filter((c) => c.sku !== p.sku).map((c) => `<option value="${c.sku}" ${c.sku === trial.proposed.bundleWith ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></label>`;
  if (p.type === 'listing_update') fields = `<label>Summary<textarea data-draft="summary">${esc(d.summary ?? p.summary)}</textarea></label>`;
  return `<div class="edit-form">
    <div class="row between"><b>Edit proposal</b><span class="chip ${g.verdict === 'blocked' ? 'bad' : 'ok'}">${g.verdict === 'blocked' ? 'Still out of mandate' : 'Fits mandate'}</span></div>
    <div class="inline">${fields}</div>
    ${g.verdict === 'blocked' ? `<div class="small" style="color:var(--bad)">${g.reasons.map(esc).join(' · ')}</div>` : ''}
    <div class="row"><button class="btn ok sm" data-action="saveEdit" data-id="${p.id}" ${g.verdict === 'blocked' ? 'disabled' : ''}>Save & approve</button><button class="btn sm" data-action="saveEditOnly" data-id="${p.id}" ${g.verdict === 'blocked' ? 'disabled' : ''}>Save, keep pending</button><button class="btn ghost sm" data-action="cancelEdit">Cancel</button></div>
  </div>`;
}

/* ---------- Conversations ---------- */
function viewConversations() {
  const sel = S.conversations.find((c) => c.id === S.ui.convo) || S.conversations[0];
  const outcomeChip = { converted: 'ok', browsing: 'info', escalated: 'warn', abandoned: 'bad', declined: '' };
  const byOutcome = (o) => S.conversations.filter((c) => c.outcome === o).length;
  return `
    <div class="grid c4">
      <div class="card kpi"><div class="label">Sessions · 7d</div><div class="value">486</div><div class="foot"><span>Claude 212 · ChatGPT 171 · Gemini 103</span></div></div>
      <div class="card kpi"><div class="label">Conversion by surface</div><div class="value">55% <small>Claude</small></div><div class="foot"><span>ChatGPT 44% · Gemini 31%</span></div></div>
      <div class="card kpi"><div class="label">Escalated to human</div><div class="value">${byOutcome('escalated')} <small>open</small></div><div class="foot"><span>11 this week · median reply 1h 40m</span></div></div>
      <div class="card kpi"><div class="label">Refused by design</div><div class="value">${byOutcome('declined')} <small>today</small></div><div class="foot"><span>Safety / unsupported use</span></div></div>
    </div>
    <div class="convo-layout">
      <div class="card">
        <div class="card-head"><h3>Recent conversations</h3><span class="small muted">${S.conversations.length} shown</span></div>
        <div class="card-body tight">${S.conversations.map((c) => `<div class="convo-item ${c.id === sel.id ? 'active' : ''}" data-action="selectConvo" data-id="${c.id}">
          <div class="row between">${surfaceChip(c.surface)}<span class="small muted">${rel(c.startedAt)}</span></div>
          <div class="q">“${esc(c.question)}”</div>
          <div class="row between"><span class="chip ${outcomeChip[c.outcome]}">${c.outcome}${c.value ? ` · ${gbp(c.value)}` : ''}</span><span class="small muted">${esc(c.shopper)}</span></div>
        </div>`).join('')}</div>
      </div>
      <div class="card">
        <div class="card-head">
          <div><h3>${esc(sel.id)} · ${esc(sel.shopper)}</h3><div class="sub">Storefront Agent on ${SURFACES[sel.surface].name} · ${clock(sel.startedAt)} · ${sel.products.map((s) => itemOf(s).title).join(', ')}</div></div>
          <div class="row"><span class="chip ${outcomeChip[sel.outcome]}">${sel.outcome}</span>${sel.outcome === 'escalated' ? `<button class="btn primary sm" data-action="resolveEscalation" data-id="${sel.id}">Mark resolved</button>` : ''}<button class="btn sm" data-action="flagConvo" data-id="${sel.id}">Flag for review</button></div>
        </div>
        <div class="transcript">${sel.transcript.map(([who, text]) => `<div class="bubble ${who}"><span class="who">${who === 'agent' ? 'Storefront Agent' : who}</span>${esc(text)}</div>`).join('')}</div>
      </div>
    </div>`;
}

/* ---------- Sales ---------- */
function viewSales() {
  const pay = S.integrations.meridian;
  const totalGmv = S.catalog.reduce((s, c) => s + c.sold7d * c.price, 0);
  const bySurface = ['claude', 'chatgpt', 'gemini'].map((s) => ({ s, units: S.catalog.reduce((n, c) => n + c.by[s], 0), gmv: S.catalog.reduce((n, c) => n + c.by[s] * c.price, 0) }));
  return `
    <div class="grid c4">
      ${bySurface.map((b) => `<div class="card kpi"><div class="label row">${surfaceChip(b.s)} <span class="muted">${SURFACES[b.s].kind}</span></div><div class="value">${gbp(b.gmv, 0)}</div><div class="foot"><span>${b.units} units · ${((b.gmv / totalGmv) * 100).toFixed(0)}% of GMV</span></div></div>`).join('')}
      <div class="card kpi"><div class="label">Meridian Pay · agentic checkout</div><div class="value">${pay.authRate}%</div><div class="foot"><span>${pay.auth7d} auths · ${pay.disputes} disputes</span><span class="chip ok">${pay.mode}</span></div></div>
    </div>
    <div class="card">
      <div class="card-head"><div><h3>Catalog performance · 7d</h3><div class="sub">Agent-attributed sales, Featured Offer status and stock vs floor</div></div><div class="legend"><span class="claude">Claude</span><span class="chatgpt">ChatGPT</span><span class="gemini">Gemini</span></div></div>
      <div class="card-body tight"><table class="table">
        <thead><tr><th>Product</th><th>Price</th><th class="num">Margin</th><th class="num">Stock</th><th>Featured Offer</th><th>By surface</th><th class="num">Units</th><th class="num">GMV</th><th>Trend</th></tr></thead>
        <tbody>${S.catalog.map((c) => `<tr>
          <td><div style="font-weight:500">${esc(c.title)}</div><div class="sku">${c.sku}</div></td>
          <td>${gbp(c.price)}</td>
          <td class="num">${(((c.price - c.cost) / c.price) * 100).toFixed(0)}%</td>
          <td class="num">${c.stock < S.mandate.stockFloor ? `<span class="chip bad">${c.stock} · below floor</span>` : c.stock}</td>
          <td>${c.foWin ? '<span class="chip ok">Winning</span>' : '<span class="chip warn">Lost</span>'}</td>
          <td style="min-width:140px"><div class="track" style="height:8px;background:var(--line-2);border-radius:99px;overflow:hidden;display:flex">${['claude', 'chatgpt', 'gemini'].map((s) => `<div class="seg ${s}" style="height:100%;width:${(c.by[s] / c.sold7d) * 100}%;background:var(--${s})"></div>`).join('')}</div></td>
          <td class="num">${c.sold7d}</td>
          <td class="num">${gbp(c.sold7d * c.price, 0)}</td>
          <td>${spark(c.trend, { w: 70, h: 20 })}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div class="grid c2">
      <div class="card">
        <div class="card-head"><div><h3>Payments</h3><div class="sub">How agent-initiated checkouts are authorised</div></div></div>
        <div class="card-body stack">
          <div class="row between"><span>Protocols</span><span class="row wrap">${pay.protocols.map((p) => `<span class="chip">${p}</span>`).join('')}</span></div>
          <div class="row between"><span>Mandate-signed checkouts (AP2)</span><b>187 / 212</b></div>
          <div class="row between"><span>Guest checkouts (ACP)</span><b>25</b></div>
          <div class="row between"><span>Average ticket</span><b>${gbp(pay.avgTicket)}</b></div>
          <div class="row between"><span>Auth declines</span><b>8 · mostly 3DS step-up abandoned</b></div>
          <div class="row between"><span>Disputes</span><b>0</b></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Orders by hour · today</h3><div class="sub">Agent conversations convert late evening</div></div></div>
        <div class="card-body">${spark([1, 0, 0, 0, 1, 2, 3, 5, 6, 5, 7, 8, 7, 6, 8, 9, 7, 10, 12, 14, 11, 8, 4, 2], { w: 520, h: 90, color: '#2457b3' })}<div class="row between small muted"><span>00:00</span><span>12:00</span><span>23:00</span></div></div>
      </div>
    </div>`;
}

/* ---------- Insights ---------- */
function viewInsights() {
  const block = (kind, title) => `<div class="card">
    <div class="card-head"><h3>${title}</h3></div>
    <div class="card-body tight">${S.insights.filter((i) => i.kind === kind).map((i) => `<div class="insight" style="border-bottom:1px solid var(--line-2)">
      <div class="row between"><b>${esc(i.title)}</b><span class="metric ${kind === 'works' ? 'ok' : 'bad'}">${esc(i.metric)}</span></div>
      <div class="evidence">${esc(i.evidence)}</div>
      <div><button class="btn sm" data-action="runInsight" data-id="${i.id}">${esc(i.action.label)}</button></div>
    </div>`).join('')}</div>
  </div>`;
  return `<div class="grid c2">${block('works', 'What\'s working')}${block('not', 'What isn\'t')}</div>`;
}

/* ---------- Mandates ---------- */
function viewMandates() {
  const d = S.ui.mandateDraft || { ...S.mandate };
  const impact = mandateImpact(d);
  const rule = (name, why, applies, ctrl) => `<div class="rule"><div><div class="name">${name}</div><div class="why">${why}</div><div class="applies">${applies.map((a) => `<span class="chip">${a}</span>`).join('')}</div></div><div class="ctrl">${ctrl}</div></div>`;
  return `
    <div class="grid split">
      <div class="card">
        <div class="card-head"><div><h3>Policy engine</h3><div class="sub">Changes re-evaluate every open proposal immediately</div></div><div class="row"><button class="btn ghost sm" data-action="mandateReset">Discard</button><button class="btn primary sm" data-action="mandateSave">Save mandates</button></div></div>
        <div class="card-body tight">
          ${rule('Maximum price cut', 'Largest single reduction an agent may propose, as a % of current price.', ['Pricing Agent'], `<input type="range" min="0" max="40" step="1" data-mandate="maxCutPct" value="${d.maxCutPct}"><span class="val">${d.maxCutPct}%</span>`)}
          ${rule('Maximum price rise', 'Protects against runaway repricing when competitors go out of stock.', ['Pricing Agent'], `<input type="range" min="0" max="50" step="1" data-mandate="maxRisePct" value="${d.maxRisePct}"><span class="val">${d.maxRisePct}%</span>`)}
          ${rule('Never below unit cost', 'Hard floor. No price or discount may land under landed cost.', ['Pricing Agent', 'Storefront Agent'], `<button class="switch ${d.neverBelowCost ? 'on' : ''}" data-mandate="neverBelowCost" aria-label="Never below cost"></button>`)}
          ${rule('Stock floor', 'Restock Agent proposes inbound when stock falls under this. Pricing Agent may not discount items under it.', ['Restock Agent', 'Pricing Agent'], `<input type="number" min="0" step="1" data-mandate="stockFloor" value="${d.stockFloor}"><span class="val">units</span>`)}
          ${rule('No discounts under stock floor', 'Do not accelerate a stock-out with a price cut.', ['Pricing Agent', 'Storefront Agent'], `<button class="switch ${d.noDiscountBelowFloor ? 'on' : ''}" data-mandate="noDiscountBelowFloor" aria-label="No discounts under floor"></button>`)}
          ${rule('Inbound spend cap', 'Maximum cost of a single FBA inbound shipment proposal.', ['Restock Agent'], `<input type="number" min="0" step="500" data-mandate="maxInboundSpend" value="${d.maxInboundSpend}"><span class="val">£</span>`)}
          ${rule('Discretionary discount', 'Largest offer the Storefront Agent may make to a shopper without asking you.', ['Storefront Agent'], `<input type="range" min="0" max="20" step="1" data-mandate="maxDiscretionaryPct" value="${d.maxDiscretionaryPct}"><span class="val">${d.maxDiscretionaryPct}%</span>`)}
          ${rule('Locked listing fields', 'Fields no agent may propose changes to.', ['Listing Agent'], `<span class="row wrap">${d.lockedFields.map((f) => `<span class="chip mono">${f}</span>`).join('')}</span>`)}
        </div>
      </div>
      <div class="stack" style="align-content:start">
        <div class="card"><div class="card-head"><h3>Impact preview</h3></div><div class="card-body">
          <div class="impact">${impact.html}</div>
        </div></div>
        <div class="card"><div class="card-head"><h3>How the gate works</h3></div><div class="card-body small muted stack">
          <div>1. An agent proposes a change (price, listing, inbound, offer).</div>
          <div>2. The gate runs every applicable rule. All pass → <span class="chip warn">queued for approval</span>. Any fail → <span class="chip bad">auto-blocked</span> and written to the audit log; it never reaches the inbox as actionable.</div>
          <div>3. You approve, edit or decline. Only approved writes go to Amazon, via the Selling Partner plugin (MCP) or a Seller Assistant workflow, with role-scoped OAuth.</div>
          <div>4. Outcomes flow back from SP-API and are stitched to the proposal in the audit log.</div>
        </div></div>
      </div>
    </div>`;
}
function mandateImpact(d) {
  const open = S.proposals.filter((p) => p.status === 'pending' || p.status === 'blocked');
  let release = [], block = [];
  for (const p of open) {
    const g = evaluateProposal(p, d, S.catalog);
    if (p.status === 'blocked' && g.verdict === 'in-mandate') release.push(p);
    if (p.status === 'pending' && g.verdict === 'blocked') block.push(p);
  }
  if (!release.length && !block.length) return { release, block, html: `No open proposal changes state under these mandates. <b>${open.length}</b> open proposals re-checked.` };
  return { release, block, html: `${release.length ? `<b>${release.length}</b> blocked proposal${release.length === 1 ? '' : 's'} would be released to the inbox: ${release.map((p) => esc(proposalTitle(p))).join(', ')}. ` : ''}${block.length ? `<b>${block.length}</b> pending proposal${block.length === 1 ? '' : 's'} would be blocked: ${block.map((p) => esc(proposalTitle(p))).join(', ')}.` : ''}` };
}

/* ---------- Audit ---------- */
function viewAudit() {
  const q = S.ui.auditSearch.toLowerCase();
  const f = S.ui.auditFilter;
  const rows = S.audit.filter((e) => (!f || e.outcome === f) && (!q || `${e.actor} ${e.action} ${e.detail} ${e.via}`.toLowerCase().includes(q)));
  return `
    <div class="row between">
      <div class="row">
        <input class="search" placeholder="Search actor, action, detail…" data-action-input="auditSearch" value="${esc(S.ui.auditSearch)}">
        <select class="select" data-action-input="auditFilter"><option value="">All outcomes</option>${['ok', 'info', 'warn', 'bad'].map((o) => `<option value="${o}" ${f === o ? 'selected' : ''}>${{ ok: 'Succeeded', info: 'Info', warn: 'Needs attention', bad: 'Blocked' }[o]}</option>`).join('')}</select>
        <span class="small muted">${rows.length} of ${S.audit.length} entries</span>
      </div>
      <button class="btn" data-action="exportAudit">Export CSV</button>
    </div>
    <div class="card"><div class="card-body tight"><table class="table">
      <thead><tr><th>When</th><th>Actor</th><th>Via</th><th>Action</th><th>Detail</th></tr></thead>
      <tbody>${rows.map((e) => `<tr><td class="muted small" style="white-space:nowrap">${clock(e.ts)}</td><td style="font-weight:500">${esc(e.actor)}</td><td class="muted small">${esc(e.via)}</td><td><span class="chip ${e.outcome}">${esc(e.action)}</span></td><td>${esc(e.detail)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No matching entries.</td></tr>'}</tbody>
    </table></div></div>`;
}

/* ---------- Integrations ---------- */
function viewIntegrations() {
  const I = S.integrations;
  const surf = (s) => {
    const i = I[s]; const m = SURFACES[s];
    return `<div class="card integration">
      <div class="card-head"><div class="row"><div class="int-logo" style="background:${m.color}">${m.initials}</div><div><h3>${m.name} <span class="muted" style="font-weight:400">· ${m.vendor}</span></h3><div class="sub">${m.kind}</div></div></div><span class="chip ${i.connected ? 'ok' : ''}"><span class="dot"></span>${i.connected ? 'Connected' : 'Disconnected'}</span></div>
      <div class="card-body stack">
        <div class="small muted">Agents published as a plugin on this surface:</div>
        <div class="row wrap">${S.agents.filter((a) => a.surfaces.includes(s)).map((a) => `<span class="chip">${esc(agentName(a.id))} <span class="muted">· ${AGENT_TEMPLATES[a.tpl].facing}</span></span>`).join('') || '<span class="muted small">None</span>'}</div>
        <div class="small muted">Install link <span class="mono">${m.install}</span></div>
      </div>
      <div class="agent-foot"><span class="small muted">${i.connected ? `Since ${clock(i.since)}` : 'Shoppers and sellers cannot reach agents here'}</span><div class="row"><button class="btn sm" data-action="copyLink" data-link="${m.install}">Copy install link</button><button class="btn sm ${i.connected ? 'danger' : 'ok'}" data-action="toggleIntegration" data-id="${s}">${i.connected ? 'Disconnect' : 'Connect'}</button></div></div>
    </div>`;
  };
  return `
    <h3>Assistant surfaces</h3>
    <div class="grid c3">${['claude', 'chatgpt', 'gemini'].map(surf).join('')}</div>
    <h3 style="margin-top:28px">Commerce & payments</h3>
    <div class="grid c3">
      <div class="card integration">
        <div class="card-head"><div class="row"><div class="int-logo" style="background:#ff9900;color:#111">a</div><div><h3>Selling Partner plugin</h3><div class="sub">MCP · ${I.amazon.endpoint}</div></div></div><span class="chip ${I.amazon.connected ? 'ok' : ''}"><span class="dot"></span>${I.amazon.connected ? 'Connected' : 'Disconnected'}</span></div>
        <div class="card-body"><div class="small muted">OAuth · role-scoped tools. Writes only fire on approved proposals.</div><div class="scopes">${I.amazon.scopes.map((sc) => `<span class="chip mono ${sc.includes('write') || sc.includes('inbound') ? 'warn' : ''}">${sc}</span>`).join('')}</div></div>
        <div class="agent-foot"><span class="small muted">Catalog · Inventory · Pricing · Orders</span><button class="btn sm ${I.amazon.connected ? 'danger' : 'ok'}" data-action="toggleIntegration" data-id="amazon">${I.amazon.connected ? 'Disconnect' : 'Connect'}</button></div>
      </div>
      <div class="card integration">
        <div class="card-head"><div class="row"><div class="int-logo" style="background:#232f3e">SA</div><div><h3>Seller Assistant</h3><div class="sub">Workflows + Memory · Seller Central</div></div></div><span class="chip ok"><span class="dot"></span>${I.sellerAssistant.workflows} workflows</span></div>
        <div class="card-body stack small">
          <div class="row between"><span>Approved-write workflow</span><span class="chip ok">active</span></div>
          <div class="row between"><span>Signals → Audit (orders, FO changes, stock)</span><span class="chip ok">active</span></div>
          <div class="row between"><span>Weekly outcomes digest</span><span class="chip ok">active</span></div>
          <div class="row between"><span>Memory shared with agents</span><span class="chip ${I.sellerAssistant.memory ? 'ok' : ''}">${I.sellerAssistant.memory ? 'on' : 'off'}</span></div>
        </div>
        <div class="agent-foot"><span class="small muted">Status & outcomes feed the activity log</span><button class="btn sm" data-action="toggleMemory">${I.sellerAssistant.memory ? 'Turn memory off' : 'Turn memory on'}</button></div>
      </div>
      <div class="card integration">
        <div class="card-head"><div class="row"><div class="brand-mark">M</div><div><h3>Meridian Pay</h3><div class="sub">Agentic checkout · ${I.meridian.mode}</div></div></div><span class="chip ok"><span class="dot"></span>Live</span></div>
        <div class="card-body stack small">
          <div class="row wrap">${I.meridian.protocols.map((p) => `<span class="chip">${p}</span>`).join('')}</div>
          <div class="row between"><span>Agents allowed to create checkouts</span><b>Storefront Agent</b></div>
          <div class="row between"><span>Per-checkout cap</span><b>£500</b></div>
          <div class="row between"><span>Payout</span><b>Daily · GBP</b></div>
        </div>
        <div class="agent-foot"><span class="small muted">Managed by your PSP</span><button class="btn sm" data-action="goto" data-view="sales">View payments</button></div>
      </div>
    </div>`;
}

/* ---------- Architecture (embedded) ---------- */
function viewArchitecture() {
  return `<div class="card"><div class="card-head"><div><h3>Architecture</h3><div class="sub">Opens the full diagram page</div></div><a class="btn" href="architecture.html">Open architecture.html</a></div>
    <div class="card-body">
      <iframe src="architecture.html" style="width:100%;height:calc(100vh - 220px);border:0;border-radius:10px;background:#fff" title="Architecture"></iframe>
    </div></div>`;
}

/* =========================================================================
   Actions — every data-action in the DOM resolves here
   ========================================================================= */
function approve(id, via = 'Console') {
  const p = S.proposals.find((x) => x.id === id);
  if (!p || p.status !== 'pending') return false;
  const gate = applyGate(p, S);
  if (gate.verdict === 'blocked') { toast(`${id} is now out of mandate — blocked instead`, 'bad'); log('Mandate Gate', 'Policy engine', 'Auto-blocked proposal', `${id} · ${gate.reasons.join('; ')}`, 'bad'); return false; }
  p.status = 'approved'; p.decidedBy = `${S.merchant.owner} (owner)`; p.decidedAt = Date.now();
  log(`${S.merchant.owner} (owner)`, via, 'Approved proposal', `${id} · ${proposalTitle(p)}`, 'ok');
  // Dispatch to Amazon via the SP plugin; confirm asynchronously.
  setTimeout(() => {
    const it = itemOf(p.sku);
    if (p.type === 'price_change') { p.from = it.price; it.price = Number(p.proposed.price); it.foWin = true; }
    if (p.type === 'restock') it.stock += Number(p.proposed.units);
    if (p.type === 'discount_offer') { S.mandate.maxDiscretionaryPct = Math.max(S.mandate.maxDiscretionaryPct, Number(p.proposed.pct)); }
    p.status = 'confirmed';
    const tool = { price_change: 'pricing:write', restock: 'fba:inbound', listing_update: 'listings:write', discount_offer: 'storefront mandate' }[p.type];
    log('Selling Partner plugin', 'SP-API (MCP)', 'Write confirmed', `${id} · ${tool} · ${proposalTitle(p)}`, 'ok');
    toast(`${id} confirmed on Amazon (${tool})`, 'ok');
    render();
  }, 1600);
  toast(`${id} approved · writing via Selling Partner plugin…`, 'ok');
  return true;
}
function decline(id, via = 'Console', note) {
  const p = S.proposals.find((x) => x.id === id);
  if (!p || p.status !== 'pending') return false;
  p.status = 'declined'; p.decidedBy = `${S.merchant.owner} (owner)`; p.decidedAt = Date.now(); if (note) p.note = note;
  log(`${S.merchant.owner} (owner)`, via, 'Declined proposal', `${id} · ${proposalTitle(p)}${note ? ` · "${note}"` : ''}`, 'warn');
  toast(`${id} declined`, 'warn');
  return true;
}
function setAgentStatus(id, status, via = 'Console') {
  const a = agentOf(id); if (!a || a.status === 'not-installed') return false;
  a.status = status;
  log(`${S.merchant.owner} (owner)`, via, status === 'paused' ? 'Paused agent' : 'Resumed agent', agentName(id), status === 'paused' ? 'warn' : 'ok');
  toast(`${agentName(id)} ${status}`, status === 'paused' ? 'warn' : 'ok');
  return true;
}
function saveMandate(next, via = 'Console') {
  const before = { ...S.mandate };
  const changes = Object.keys(next).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(before[k])).map((k) => `${k} ${JSON.stringify(before[k])} → ${JSON.stringify(next[k])}`);
  S.mandate = { ...S.mandate, ...next };
  S.ui.mandateDraft = null;
  if (!changes.length) { toast('No mandate changes', 'warn'); return { released: [], blocked: [] }; }
  log(`${S.merchant.owner} (owner)`, via, 'Mandate changed', changes.join(' · '), 'info');
  const released = [], blocked = [];
  for (const p of S.proposals) {
    if (p.status !== 'pending' && p.status !== 'blocked') continue;
    const was = p.status; applyGate(p, S);
    if (was === 'blocked' && p.status === 'pending') { released.push(p); log('Mandate Gate', 'Policy engine', 'Proposal released', `${p.id} now in mandate · ${proposalTitle(p)}`, 'info'); }
    if (was === 'pending' && p.status === 'blocked') { blocked.push(p); log('Mandate Gate', 'Policy engine', 'Auto-blocked proposal', `${p.id} · ${p.gate.reasons.join('; ')}`, 'bad'); }
  }
  toast(`Mandates saved · ${released.length} released, ${blocked.length} blocked`, 'ok');
  return { released, blocked };
}

function simulateProposal() {
  const active = S.agents.filter((a) => a.status === 'active' && ['pricing', 'restock', 'listing', 'storefront'].includes(a.tpl));
  if (!active.length) { toast('No active agents to simulate', 'warn'); return null; }
  const a = active[Math.floor(Math.random() * active.length)];
  const it = S.catalog[Math.floor(Math.random() * S.catalog.length)];
  const id = uid('P');
  let p;
  if (a.tpl === 'pricing') {
    const cut = [3, 5, 7, 9, 12, 18, 25][Math.floor(Math.random() * 7)];
    p = { id, agentId: a.id, type: 'price_change', sku: it.sku, proposed: { price: Math.round(it.price * (1 - cut / 100) * 100) / 100 }, from: it.price, rationale: `Competitor undercut by ${cut - 1}%. Projected +${cut * 2}% units over 72h.` };
  } else if (a.tpl === 'restock') {
    const units = [60, 120, 200, 400, 800][Math.floor(Math.random() * 5)];
    p = { id, agentId: a.id, type: 'restock', sku: it.sku, proposed: { units }, rationale: `Cover ${Math.round(it.stock / Math.max(1, it.sold7d / 7))} days at current velocity; lead time 9 days.` };
  } else if (a.tpl === 'listing') {
    const pick = Math.random() < 0.3 ? ['title', 'brand'] : ['bullets', 'images'];
    p = { id, agentId: a.id, type: 'listing_update', sku: it.sku, proposed: { fields: pick }, summary: pick.includes('brand') ? 'Rename brand to “NHG Marine” for search' : 'Add care instructions and a second lifestyle image', rationale: 'Top unanswered shopper question this week.' };
  } else {
    const d = [3, 5, 8, 12][Math.floor(Math.random() * 4)];
    const other = S.catalog.find((c) => c.sku !== it.sku);
    p = { id, agentId: a.id, type: 'discount_offer', sku: it.sku, proposed: { pct: d, bundleWith: other.sku }, rationale: `Shoppers asking for a deal on ${it.title} abandon at 58%.` };
  }
  p.createdAt = Date.now(); p.status = 'pending';
  const gate = applyGate(p, S);
  S.proposals.unshift(p);
  if (gate.verdict === 'blocked') {
    log('Mandate Gate', 'Policy engine', 'Auto-blocked proposal', `${id} · ${proposalTitle(p)} · ${gate.reasons.join('; ')}`, 'bad');
    toast(`${agentName(a.id)} proposed ${proposalTitle(p)} — auto-blocked: ${gate.reasons[0]}`, 'bad');
  } else {
    log(agentName(a.id), 'Mandate Gate', 'Proposal queued', `${id} · ${proposalTitle(p)} · in-mandate`, 'info');
    toast(`${agentName(a.id)} proposed ${proposalTitle(p)} — queued for approval`, 'ok');
  }
  a.lastRun = Date.now();
  return p;
}

function exportAudit() {
  const rows = [['when', 'actor', 'via', 'action', 'detail', 'outcome'], ...S.audit.map((e) => [new Date(e.ts).toISOString(), e.actor, e.via, e.action, e.detail, e.outcome])];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `nhg-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  toast('Audit log exported', 'ok');
}

function runInsight(id) {
  const i = S.insights.find((x) => x.id === id); if (!i) return;
  const [kind, view, arg] = i.action.run.split(':');
  if (kind === 'goto') {
    S.ui.view = view;
    if (view === 'inbox' && arg) { const p = S.proposals.find((x) => x.id === arg); S.ui.inboxTab = p ? (p.status === 'blocked' ? 'blocked' : ['pending'].includes(p.status) ? 'pending' : 'done') : 'all'; render(); setTimeout(() => $(`#prop-${arg}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); return; }
    if (view === 'audit' && arg) S.ui.auditSearch = arg;
    render();
  } else if (kind === 'copilot') {
    openCopilot(); submitCopilot(i.action.run.slice('copilot:'.length));
  }
}

/* ---------- New agent wizard ---------- */
const wizard = { step: 1, tpl: 'pricing', surfaces: ['claude'], goal: '', runtime: 'Claude' };
function openWizard(tpl) {
  wizard.step = 1; wizard.tpl = tpl || 'pricing'; wizard.surfaces = ['claude']; wizard.goal = ''; wizard.runtime = 'Claude';
  renderWizard();
}
function renderWizard() {
  const t = AGENT_TEMPLATES[wizard.tpl];
  const steps = `<div class="steps">${['Template', 'Surfaces', 'Goal & mandate'].map((s, i) => `<span class="${wizard.step === i + 1 ? 'on' : ''}">${i + 1}. ${s}</span>`).join('')}</div>`;
  let body = '';
  if (wizard.step === 1) body = `<div class="option-grid">${Object.entries(AGENT_TEMPLATES).map(([k, v]) => `<div class="option ${wizard.tpl === k ? 'on' : ''}" data-wiz="tpl" data-val="${k}"><b>${v.name}</b><span>${v.role}</span></div>`).join('')}</div>`;
  if (wizard.step === 2) body = `<div class="small muted">Where should this agent be published as a plugin? ${t.facing === 'shopper' ? 'Shoppers will reach it from these assistants.' : 'You (and your team) will be able to talk to it from these assistants.'}</div><div class="option-grid">${Object.entries(SURFACES).map(([k, v]) => `<div class="option ${wizard.surfaces.includes(k) ? 'on' : ''}" data-wiz="surface" data-val="${k}"><b>${v.name}</b><span>${v.kind}</span></div>`).join('')}</div>
    <div class="field"><label>Runtime model</label><select data-wiz="runtime">${['Claude', 'GPT', 'Gemini'].map((r) => `<option ${wizard.runtime === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>`;
  if (wizard.step === 3) body = `<div class="field"><label>Goal (plain English — the agent reads this)</label><textarea data-wiz="goal" placeholder="e.g. Keep Sponsored Products ACoS under 25%; never exceed £80/day.">${esc(wizard.goal)}</textarea></div>
    <div class="impact">This agent inherits the account mandates: max cut ${S.mandate.maxCutPct}%, never below cost, stock floor ${S.mandate.stockFloor}, inbound cap ${gbp(S.mandate.maxInboundSpend)}. Every proposal it makes goes through the Mandate Gate and needs your approval. Tools: ${t.tools.join(' · ')}.</div>`;
  openModal(`<div class="modal-head"><h3>New agent · ${t.name}</h3><button class="btn ghost sm" data-action="closeModal">✕</button></div>
    <div class="modal-body">${steps}${body}</div>
    <div class="modal-foot"><button class="btn ghost" data-action="wizBack" ${wizard.step === 1 ? 'disabled' : ''}>Back</button>${wizard.step < 3 ? `<button class="btn primary" data-action="wizNext" ${wizard.step === 2 && !wizard.surfaces.length ? 'disabled' : ''}>Next</button>` : `<button class="btn primary" data-action="wizCreate">Create agent (paused)</button>`}</div>`);
}
function createAgentFromWizard() {
  const t = AGENT_TEMPLATES[wizard.tpl];
  const existing = agentOf(wizard.tpl);
  const reuse = !!(existing && existing.status === 'not-installed');
  const agent = reuse ? existing : { id: `${wizard.tpl}-${Date.now().toString(36)}`, tpl: wizard.tpl, metrics: { proposals7d: 0, approved: 0, blocked: 0 }, trend: [] };
  Object.assign(agent, { status: 'paused', surfaces: [...wizard.surfaces], runtime: wizard.runtime, goal: wizard.goal.trim() || `${t.role}.`, lastRun: null });
  if (!reuse) { const adsIdx = S.agents.findIndex((a) => a.status === 'not-installed'); S.agents.splice(adsIdx === -1 ? S.agents.length : adsIdx, 0, agent); }
  for (const s of wizard.surfaces) if (!S.integrations[s].agents.includes(agent.id)) S.integrations[s].agents.push(agent.id);
  log(`${S.merchant.owner} (owner)`, 'Console', 'Created agent', `${t.name} · ${wizard.surfaces.map((s) => SURFACES[s].name).join(', ')} · paused until resumed`, 'info');
  closeModal(); S.ui.view = 'agents'; render();
  toast(`${t.name} created (paused). Resume it when you're ready.`, 'ok');
}

/* ---------- Edit agent modal ---------- */
function openEditAgent(id) {
  const a = agentOf(id); if (!a) return;
  openModal(`<div class="modal-head"><h3>Edit ${esc(agentName(id))}</h3><button class="btn ghost sm" data-action="closeModal">✕</button></div>
    <div class="modal-body">
      <div class="field"><label>Goal</label><textarea id="ea-goal">${esc(a.goal)}</textarea></div>
      <div class="field"><label>Runtime</label><select id="ea-runtime">${['Claude', 'GPT', 'Gemini'].map((r) => `<option ${a.runtime === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="field"><label>Published to</label><div class="option-grid">${Object.entries(SURFACES).map(([k, v]) => `<label class="option ${a.surfaces.includes(k) ? 'on' : ''}"><input type="checkbox" class="ea-surface" value="${k}" ${a.surfaces.includes(k) ? 'checked' : ''} style="display:none"><b>${v.name}</b><span>${v.kind}</span></label>`).join('')}</div></div>
    </div>
    <div class="modal-foot"><span class="small muted">Changes are audited</span><button class="btn primary" data-action="saveAgent" data-id="${id}">Save</button></div>`);
  $('#modal').querySelectorAll('.ea-surface').forEach((cb) => cb.addEventListener('change', () => cb.closest('.option').classList.toggle('on', cb.checked)));
}

/* =========================================================================
   Event wiring
   ========================================================================= */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action], [data-wiz], [data-mandate]');
  if (!el) return;
  const act = el.dataset.action;
  const id = el.dataset.id;

  if (el.dataset.wiz) {
    const k = el.dataset.wiz, v = el.dataset.val;
    if (k === 'tpl') wizard.tpl = v;
    if (k === 'surface') wizard.surfaces = wizard.surfaces.includes(v) ? wizard.surfaces.filter((s) => s !== v) : [...wizard.surfaces, v];
    if (k === 'tpl' || k === 'surface') renderWizard();
    return;
  }
  if (el.dataset.mandate && el.classList.contains('switch')) {
    const d = S.ui.mandateDraft || { ...S.mandate };
    d[el.dataset.mandate] = !d[el.dataset.mandate];
    S.ui.mandateDraft = d; render(); return;
  }
  if (!act) return;

  switch (act) {
    case 'goto':
      S.ui.view = el.dataset.view;
      if (el.dataset.filter !== undefined) S.ui.auditSearch = el.dataset.filter;
      S.ui.editing = null; render(); break;
    case 'inboxTab': S.ui.inboxTab = el.dataset.tab; S.ui.editing = null; render(); break;
    case 'approve': approve(id); render(); break;
    case 'decline': {
      const note = window.prompt('Reason (optional) — recorded in the audit log:', '') ?? null;
      if (note === null) break;
      decline(id, 'Console', note.trim()); render(); break;
    }
    case 'dismiss': {
      const p = S.proposals.find((x) => x.id === id); if (!p) break;
      p.status = 'dismissed'; p.decidedBy = `${S.merchant.owner} (owner)`; p.decidedAt = Date.now();
      log(`${S.merchant.owner} (owner)`, 'Console', 'Dismissed blocked proposal', `${id} · ${proposalTitle(p)}`, 'info'); render(); break;
    }
    case 'gotoEdit': {
      const p = S.proposals.find((x) => x.id === id);
      S.ui.view = 'inbox'; S.ui.inboxTab = p.status === 'blocked' ? 'blocked' : 'pending'; S.ui.editing = id; S.ui.draft = {};
      render(); setTimeout(() => $(`#prop-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); break;
    }
    case 'cancelEdit': S.ui.editing = null; S.ui.draft = {}; render(); break;
    case 'saveEdit': case 'saveEditOnly': {
      const p = S.proposals.find((x) => x.id === id); if (!p) break;
      const before = JSON.stringify(p.proposed);
      if (S.ui.draft.summary !== undefined) p.summary = S.ui.draft.summary;
      p.proposed = { ...p.proposed, ...Object.fromEntries(Object.entries(S.ui.draft).filter(([k]) => k !== 'summary').map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)])) };
      const was = p.status; p.status = 'pending'; const g = applyGate(p, S);
      if (g.verdict === 'blocked') { p.status = was; toast('Still out of mandate', 'bad'); break; }
      log(`${S.merchant.owner} (owner)`, 'Console', 'Edited proposal', `${id} · ${before} → ${JSON.stringify(p.proposed)}${was === 'blocked' ? ' · brought into mandate' : ''}`, 'info');
      S.ui.editing = null; S.ui.draft = {};
      if (act === 'saveEdit') approve(id); else toast(`${id} updated · awaiting approval`, 'ok');
      S.ui.inboxTab = 'pending'; render(); break;
    }
    case 'approveAllInMandate': {
      const ids = S.proposals.filter((p) => p.status === 'pending').map((p) => p.id);
      let n = 0; for (const pid of ids) if (approve(pid)) n++;
      if (!n) toast('Nothing pending', 'warn'); render(); break;
    }
    case 'pauseAgent': setAgentStatus(id, 'paused'); render(); break;
    case 'resumeAgent': setAgentStatus(id, 'active'); render(); break;
    case 'editAgent': openEditAgent(id); break;
    case 'saveAgent': {
      const a = agentOf(id); if (!a) break;
      const goal = $('#ea-goal').value.trim(); const runtime = $('#ea-runtime').value;
      const surfaces = [...$('#modal').querySelectorAll('.ea-surface:checked')].map((c) => c.value);
      const diff = [a.goal !== goal && 'goal', a.runtime !== runtime && `runtime → ${runtime}`, JSON.stringify(a.surfaces) !== JSON.stringify(surfaces) && `surfaces → ${surfaces.map((s) => SURFACES[s].name).join(', ') || 'none'}`].filter(Boolean);
      Object.assign(a, { goal, runtime, surfaces });
      if (diff.length) log(`${S.merchant.owner} (owner)`, 'Console', 'Edited agent', `${agentName(id)} · ${diff.join(' · ')}`, 'info');
      closeModal(); render(); toast(diff.length ? `${agentName(id)} updated` : 'No changes', diff.length ? 'ok' : 'warn'); break;
    }
    case 'newAgent': openWizard(el.dataset.tpl); break;
    case 'wizBack': wizard.step = Math.max(1, wizard.step - 1); renderWizard(); break;
    case 'wizNext': wizard.step = Math.min(3, wizard.step + 1); renderWizard(); break;
    case 'wizCreate': createAgentFromWizard(); break;
    case 'closeModal': closeModal(); break;
    case 'simulate': simulateProposal(); if (S.ui.view !== 'inbox') S.ui.view = 'inbox'; S.ui.inboxTab = S.proposals[0].status === 'blocked' ? 'blocked' : 'pending'; render(); break;
    case 'selectConvo': S.ui.convo = id; render(); break;
    case 'resolveEscalation': {
      const c = S.conversations.find((x) => x.id === id); if (!c) break;
      c.outcome = 'browsing'; c.transcript.push(['system', `Resolved by ${S.merchant.owner} · ${clock(Date.now())}`]);
      log(`${S.merchant.owner} (owner)`, 'Console', 'Resolved escalation', `${id} · ${c.question}`, 'ok'); render(); toast(`${id} resolved`, 'ok'); break;
    }
    case 'flagConvo': {
      const c = S.conversations.find((x) => x.id === id); if (!c) break;
      log(`${S.merchant.owner} (owner)`, 'Console', 'Flagged conversation', `${id} · for QA review`, 'warn'); toast(`${id} flagged for review`, 'warn'); render(); break;
    }
    case 'runInsight': runInsight(id); break;
    case 'mandateSave': saveMandate(S.ui.mandateDraft || S.mandate); render(); break;
    case 'mandateReset': S.ui.mandateDraft = null; render(); break;
    case 'exportAudit': exportAudit(); break;
    case 'toggleIntegration': {
      const i = S.integrations[id]; i.connected = !i.connected; if (i.connected) i.since = Date.now();
      const name = SURFACES[id]?.name || 'Selling Partner plugin';
      log(`${S.merchant.owner} (owner)`, 'Console', i.connected ? 'Connected integration' : 'Disconnected integration', name, i.connected ? 'ok' : 'warn');
      toast(`${name} ${i.connected ? 'connected' : 'disconnected'}`, i.connected ? 'ok' : 'warn'); render(); break;
    }
    case 'toggleMemory': S.integrations.sellerAssistant.memory = !S.integrations.sellerAssistant.memory; log(`${S.merchant.owner} (owner)`, 'Console', 'Seller Assistant memory', S.integrations.sellerAssistant.memory ? 'on' : 'off', 'info'); render(); break;
    case 'copyLink': navigator.clipboard?.writeText(el.dataset.link).then(() => toast('Install link copied', 'ok'), () => toast(el.dataset.link, 'ok')); break;
    case 'toggleCopilot': $('#app').classList.toggle('copilot-open'); if ($('#app').classList.contains('copilot-open')) $('#copilotInput').focus(); break;
    case 'copilotSuggest': submitCopilot(el.dataset.text); break;
    case 'resetDemo': if (confirm('Reset the demo to seed data? Local changes will be lost.')) { localStorage.removeItem(STORE_KEY); S = seed(); render(); toast('Demo reset', 'ok'); } break;
    default: break;
  }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.draft) { S.ui.draft[el.dataset.draft] = el.value; const p = S.proposals.find((x) => x.id === S.ui.editing); if (p) { const wrap = el.closest('.edit-form'); const html = renderEditForm(p); const tmp = document.createElement('div'); tmp.innerHTML = html; const focus = el.dataset.draft; wrap.replaceWith(tmp.firstElementChild); const again = $(`[data-draft="${focus}"]`); if (again && again.tagName !== 'SELECT') { again.focus(); again.setSelectionRange?.(again.value.length, again.value.length); } } return; }
  if (el.dataset.mandate) {
    const d = S.ui.mandateDraft || { ...S.mandate };
    d[el.dataset.mandate] = Number(el.value);
    S.ui.mandateDraft = d;
    // Update value labels and impact preview without losing slider focus.
    const v = el.parentElement.querySelector('.val'); if (v && el.type === 'range') v.textContent = `${d[el.dataset.mandate]}%`;
    const imp = $('.impact'); if (imp) imp.innerHTML = mandateImpact(d).html;
    save(); return;
  }
  if (el.dataset.actionInput === 'auditSearch') { S.ui.auditSearch = el.value; const tbl = $('#view .card'); const tmp = document.createElement('div'); tmp.innerHTML = viewAudit(); tbl.replaceWith(tmp.querySelector('.card')); $('#view .small.muted').textContent = tmp.querySelector('.row .small.muted').textContent; return; }
  if (el.dataset.wiz === 'goal') wizard.goal = el.value;
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.actionInput === 'auditFilter') { S.ui.auditFilter = el.value; render(); }
  if (el.dataset.wiz === 'runtime') wizard.runtime = el.value;
  if (el.dataset.draft && el.tagName === 'SELECT') { S.ui.draft[el.dataset.draft] = el.value; render(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
$('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) closeModal(); });

/* =========================================================================
   Copilot — chat + voice control. Intents mutate the same state the buttons do.
   ========================================================================= */
const SUGGESTIONS = ['What\'s blocked?', 'Approve all in-mandate proposals', 'Set max cut to 8%', 'Pause the pricing agent', 'What sold best this week?', 'How are the agents doing?'];

function openCopilot() { $('#app').classList.add('copilot-open'); }
function pushMsg(role, text, actions) { S.copilot.messages.push({ role, text, actions, ts: Date.now() }); }
function renderCopilot() {
  const logEl = $('#copilotLog');
  if (!S.copilot.messages.length) pushMsg('bot', `Hi ${S.merchant.owner}. I can manage your agents, change mandates, and approve or decline proposals — by text or voice. Everything I do is written to the audit log as you.`);
  logEl.innerHTML = S.copilot.messages.map((m) => `<div class="msg ${m.role}">${esc(m.text)}${m.actions?.length ? `<div class="act">${m.actions.map((a) => `<button class="btn sm" data-action="${a.action}" ${Object.entries(a.data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${esc(a.label)}</button>`).join('')}</div>` : ''}<span class="meta">${new Date(m.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></div>`).join('');
  logEl.scrollTop = logEl.scrollHeight;
  $('#copilotSuggest').innerHTML = SUGGESTIONS.map((s) => `<button data-action="copilotSuggest" data-text="${esc(s)}">${esc(s)}</button>`).join('');
  $('#ttsToggle').checked = !!S.copilot.tts;
}

function submitCopilot(text) {
  text = (text || '').trim(); if (!text) return;
  pushMsg('user', text);
  const { reply, actions } = handleCommand(text);
  pushMsg('bot', reply, actions);
  render();
  if (S.copilot.tts && 'speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(reply.replace(/[•·→]/g, ',')); u.lang = 'en-GB'; speechSynthesis.cancel(); speechSynthesis.speak(u); }
}

function findAgentIn(text) {
  const t = text.toLowerCase();
  return S.agents.find((a) => a.status !== 'not-installed' && (t.includes(a.tpl) || t.includes(agentName(a.id).toLowerCase())));
}

function handleCommand(raw) {
  // Compound commands: "set max cut to 8% and pause the pricing agent". Each clause must
  // resolve to a real intent on its own; otherwise fall back to treating the whole string as one.
  const clauses = raw.split(/\s*(?:;|,\s+|\bthen\b|\band then\b|\band\b)\s*/i).map((c) => c.trim()).filter(Boolean);
  if (clauses.length > 1) {
    const results = clauses.map(handleOne);
    const good = results.filter((r) => !r.fallback);
    if (good.length === clauses.length) return { reply: good.map((r) => r.reply).join('\n\n'), actions: good.flatMap((r) => r.actions || []).filter((a, i, arr) => arr.findIndex((b) => b.label === a.label) === i).slice(0, 3) };
  }
  return handleOne(raw);
}

function handleOne(raw) {
  const t = raw.toLowerCase().replace(/[?.!]/g, '').trim();
  const via = 'Copilot';
  let m;

  // Pause / resume
  if ((m = t.match(/\b(pause|stop|disable)\b/))) {
    const a = findAgentIn(t);
    if (t.includes('all')) { let n = 0; for (const x of S.agents) if (x.status === 'active') { setAgentStatus(x.id, 'paused', via); n++; } return { reply: `Paused ${n} agents. Shopper conversations will fall back to a static storefront until you resume.`, actions: [{ label: 'Open roster', action: 'goto', data: { view: 'agents' } }] }; }
    if (!a) return { reply: 'Which agent? I have ' + S.agents.filter((x) => x.status !== 'not-installed').map((x) => agentName(x.id)).join(', ') + '.' };
    if (a.status === 'paused') return { reply: `${agentName(a.id)} is already paused.` };
    setAgentStatus(a.id, 'paused', via);
    return { reply: `${agentName(a.id)} paused. Its ${S.proposals.filter((p) => p.agentId === a.id && p.status === 'pending').length} pending proposals stay in the inbox; it won't create new ones.`, actions: [{ label: 'Resume', action: 'resumeAgent', data: { id: a.id } }] };
  }
  if ((m = t.match(/\b(resume|start|enable|unpause|turn on)\b/)) && !t.includes('memory')) {
    const a = findAgentIn(t);
    if (!a) return { reply: 'Which agent should I resume?' };
    if (a.status === 'active') return { reply: `${agentName(a.id)} is already active.` };
    setAgentStatus(a.id, 'active', via);
    return { reply: `${agentName(a.id)} is active again.` };
  }

  // Mandate changes
  if ((m = t.match(/(?:max(?:imum)? (?:price )?cut|cut)\D*(\d+)\s*%?/))) {
    const r = saveMandate({ maxCutPct: Number(m[1]) }, via);
    return { reply: `Max cut is now ${m[1]}%. ${r.released.length} blocked proposal${r.released.length === 1 ? '' : 's'} released to the inbox, ${r.blocked.length} newly blocked.`, actions: [{ label: 'Open inbox', action: 'goto', data: { view: 'inbox' } }, { label: 'Mandates', action: 'goto', data: { view: 'mandates' } }] };
  }
  if ((m = t.match(/stock floor\D*(\d+)/))) {
    const r = saveMandate({ stockFloor: Number(m[1]) }, via);
    const low = S.catalog.filter((c) => c.stock < Number(m[1]));
    return { reply: `Stock floor is now ${m[1]} units. ${low.length} product${low.length === 1 ? ' is' : 's are'} under it${low.length ? `: ${low.map((c) => c.title).join(', ')}` : ''}. ${r.released.length} released, ${r.blocked.length} blocked.` };
  }
  if ((m = t.match(/(\d+)\s*%\s*(?:discretionary|discount)|(?:discretionary|discount)\D*?(\d+)\s*%/))) {
    const v = Number(m[1] ?? m[2]);
    const r = saveMandate({ maxDiscretionaryPct: v }, via);
    return { reply: `Storefront Agent may now offer up to ${v}% without asking. ${r.released.length} released, ${r.blocked.length} blocked.` };
  }
  if ((m = t.match(/inbound (?:cap|spend)\D*(\d[\d,]*)/))) {
    const v = Number(m[1].replace(/,/g, '')); const r = saveMandate({ maxInboundSpend: v }, via);
    return { reply: `Inbound spend cap is now ${gbp(v)}. ${r.released.length} released, ${r.blocked.length} blocked.` };
  }
  if (/below cost/.test(t) && /(allow|permit|off)/.test(t)) { saveMandate({ neverBelowCost: false }, via); return { reply: 'Below-cost pricing is now allowed. I\'d keep an eye on the Pricing Agent — this removes the hard floor.' }; }
  if (/below cost/.test(t) && /(never|forbid|block|on)/.test(t)) { const r = saveMandate({ neverBelowCost: true }, via); return { reply: `Never-below-cost is enforced. ${r.blocked.length} newly blocked.` }; }

  // Approvals
  if (/\bapprove\b/.test(t)) {
    const idm = t.match(/p-?\s?(\d{4})/);
    if (idm) { const id = `P-${idm[1]}`; const p = S.proposals.find((x) => x.id === id); if (!p) return { reply: `I can't find ${id}.` }; if (p.status === 'blocked') return { reply: `${id} is out of mandate (${p.gate.reasons.join('; ')}). I can't approve it as-is — edit it or change the mandate.`, actions: [{ label: 'Edit to fit', action: 'gotoEdit', data: { id } }] }; if (p.status !== 'pending') return { reply: `${id} was already ${p.status}.` }; approve(id, via); return { reply: `Approved ${id} — ${proposalTitle(p)}. Writing to Amazon via the Selling Partner plugin now.` }; }
    const a = findAgentIn(t);
    const list = S.proposals.filter((p) => p.status === 'pending' && (!a || p.agentId === a.id));
    if (!list.length) return { reply: a ? `Nothing pending from ${agentName(a.id)}.` : 'Nothing pending. The inbox is clear.' };
    for (const p of list) approve(p.id, via);
    return { reply: `Approved ${list.length} in-mandate proposal${list.length === 1 ? '' : 's'}${a ? ` from ${agentName(a.id)}` : ''}: ${list.map((p) => proposalTitle(p)).join('; ')}. Blocked proposals were not touched — they can't be approved without editing.`, actions: [{ label: 'View inbox', action: 'goto', data: { view: 'inbox' } }] };
  }
  if (/\b(decline|reject)\b/.test(t)) {
    const idm = t.match(/p-?\s?(\d{4})/);
    if (idm) { const id = `P-${idm[1]}`; if (decline(id, via, 'via Copilot')) return { reply: `Declined ${id}.` }; return { reply: `${id} isn't pending.` }; }
    const a = findAgentIn(t);
    const list = S.proposals.filter((p) => p.status === 'pending' && (!a || p.agentId === a.id));
    if (!list.length) return { reply: 'Nothing pending to decline.' };
    for (const p of list) decline(p.id, via, 'via Copilot');
    return { reply: `Declined ${list.length} proposal${list.length === 1 ? '' : 's'}${a ? ` from ${agentName(a.id)}` : ''}.` };
  }

  // Queries
  if (/blocked|out of mandate/.test(t)) {
    const b = S.proposals.filter((p) => p.status === 'blocked');
    if (!b.length) return { reply: 'Nothing is blocked right now.' };
    return { reply: `${b.length} proposal${b.length === 1 ? '' : 's'} auto-blocked by the Mandate Gate:\n` + b.map((p) => `• ${p.id} ${proposalTitle(p)} — ${p.gate.reasons.join('; ')}`).join('\n'), actions: [{ label: 'Open blocked', action: 'goto', data: { view: 'inbox' } }, { label: 'Change mandate', action: 'goto', data: { view: 'mandates' } }] };
  }
  if (/pending|waiting|inbox|need(s)? (my )?approval/.test(t)) {
    const p = S.proposals.filter((x) => x.status === 'pending');
    if (!p.length) return { reply: 'Inbox is clear.' };
    return { reply: `${p.length} awaiting your approval:\n` + p.map((x) => `• ${x.id} ${proposalTitle(x)} (${agentName(x.agentId)})`).join('\n'), actions: [{ label: 'Approve all', action: 'approveAllInMandate' }, { label: 'Open inbox', action: 'goto', data: { view: 'inbox' } }] };
  }
  if (/sold|sales|selling|best ?seller|revenue|gmv/.test(t)) {
    const top = [...S.catalog].sort((a, b) => b.sold7d * b.price - a.sold7d * a.price).slice(0, 3);
    const gmv = S.catalog.reduce((s, c) => s + c.sold7d * c.price, 0);
    return { reply: `Agents sold ${gbp(gmv, 0)} across ${S.catalog.reduce((s, c) => s + c.sold7d, 0)} units this week. Top by revenue:\n` + top.map((c) => `• ${c.title} — ${c.sold7d} units, ${gbp(c.sold7d * c.price, 0)} (Claude ${c.by.claude} · ChatGPT ${c.by.chatgpt} · Gemini ${c.by.gemini})`).join('\n'), actions: [{ label: 'Sales view', action: 'goto', data: { view: 'sales' } }] };
  }
  if (/escalat|human|handoff/.test(t)) {
    const e = S.conversations.filter((c) => c.outcome === 'escalated');
    return { reply: e.length ? `${e.length} conversation${e.length === 1 ? '' : 's'} waiting for a human:\n` + e.map((c) => `• ${c.id} on ${SURFACES[c.surface].name}: “${c.question}”`).join('\n') : 'No open escalations.', actions: e.length ? [{ label: 'Open conversations', action: 'goto', data: { view: 'conversations' } }] : [] };
  }
  if (/stock|inventory|restock|source|junior lifejacket/.test(t)) {
    if (/source|junior lifejacket/.test(t)) {
      const id = uid('P');
      S.proposals.unshift({ id, agentId: 'restock', type: 'listing_update', sku: 'NHG-LFJ-02', proposed: { fields: ['variation'] }, summary: 'Add a junior 100N lifejacket variation (sourcing request to supplier).', rationale: 'Owner request via Copilot: 9 shopper requests for a child\'s lifejacket this week with nothing to sell.', createdAt: Date.now(), status: 'pending' });
      applyGate(S.proposals[0], S);
      log('Restock Agent', 'Copilot', 'Proposal queued', `${id} · junior lifejacket sourcing · in-mandate`, 'info');
      return { reply: `Asked the Restock Agent. It queued ${id}: add a junior 100N lifejacket variation and raise a sourcing request. It's in your inbox.`, actions: [{ label: 'Open inbox', action: 'goto', data: { view: 'inbox' } }] };
    }
    const low = S.catalog.filter((c) => c.stock < S.mandate.stockFloor);
    return { reply: low.length ? `${low.length} product${low.length === 1 ? '' : 's'} under the stock floor (${S.mandate.stockFloor}): ${low.map((c) => `${c.title} (${c.stock})`).join(', ')}. ${S.proposals.filter((p) => p.type === 'restock' && p.status === 'pending').length} restock proposal${S.proposals.filter((p) => p.type === 'restock' && p.status === 'pending').length === 1 ? '' : 's'} pending.` : `Everything is above the stock floor of ${S.mandate.stockFloor}.` };
  }
  if (/how (are|is)|status|doing|summary|report|overview/.test(t)) {
    const c = counts();
    const act = S.agents.filter((a) => a.status === 'active').map((a) => agentName(a.id));
    const paused = S.agents.filter((a) => a.status === 'paused').map((a) => agentName(a.id));
    return { reply: `${act.length} active (${act.join(', ')})${paused.length ? `, ${paused.length} paused (${paused.join(', ')})` : ''}. Storefront Agent: 486 sessions, 212 orders, ${gbp(agentOf('storefront').metrics.gmv7d, 0)} this week, 55% conversion on Claude. Pricing Agent lifted Featured Offer win rate to 84%. ${c.pending} proposals waiting on you, ${c.blocked} auto-blocked, ${c.escalated} escalation${c.escalated === 1 ? '' : 's'} open.`, actions: [{ label: 'Inbox', action: 'goto', data: { view: 'inbox' } }, { label: 'Insights', action: 'goto', data: { view: 'insights' } }] };
  }
  if (/mandate|guardrail|polic|rules/.test(t)) {
    const md = S.mandate;
    return { reply: `Current mandates: max cut ${md.maxCutPct}%, max rise ${md.maxRisePct}%, ${md.neverBelowCost ? 'never below cost' : 'below cost allowed'}, stock floor ${md.stockFloor}, ${md.noDiscountBelowFloor ? 'no discounts under floor' : 'discounts under floor allowed'}, inbound cap ${gbp(md.maxInboundSpend)}, discretionary discount ≤ ${md.maxDiscretionaryPct}%, locked fields ${md.lockedFields.join(', ')}. Say e.g. "set max cut to 8%" to change one.`, actions: [{ label: 'Open mandates', action: 'goto', data: { view: 'mandates' } }] };
  }
  if (/what('?s| is) (not )?working|insight|learn/.test(t)) {
    return { reply: 'Working: ' + S.insights.filter((i) => i.kind === 'works').map((i) => `${i.title} (${i.metric})`).join('; ') + '.\nNot working: ' + S.insights.filter((i) => i.kind === 'not').map((i) => `${i.title} (${i.metric})`).join('; ') + '.', actions: [{ label: 'Open insights', action: 'goto', data: { view: 'insights' } }] };
  }
  if (/simulate|generate|test proposal/.test(t)) { const p = simulateProposal(); return p ? { reply: `${agentName(p.agentId)} proposed: ${proposalTitle(p)} — ${p.status === 'blocked' ? 'auto-blocked (' + p.gate.reasons.join('; ') + ')' : 'in mandate, queued for approval'}.`, actions: [{ label: 'Open inbox', action: 'goto', data: { view: 'inbox' } }] } : { reply: 'No active agents to simulate.' }; }
  if ((m = t.match(/\b(show|open|go to|take me to)\b.*\b(overview|agents?|roster|inbox|proposals?|conversations?|sales|payments|insights?|mandates?|audit|integrations?|architecture)\b/))) {
    const map = { overview: 'overview', agent: 'agents', agents: 'agents', roster: 'agents', inbox: 'inbox', proposal: 'inbox', proposals: 'inbox', conversation: 'conversations', conversations: 'conversations', sales: 'sales', payments: 'sales', insight: 'insights', insights: 'insights', mandate: 'mandates', mandates: 'mandates', audit: 'audit', integration: 'integrations', integrations: 'integrations', architecture: 'architecture' };
    S.ui.view = map[m[2]]; return { reply: `Opening ${VIEWS[S.ui.view].label}.` };
  }
  if (/help|what can you do/.test(t)) return { reply: 'Try:\n• "pause the pricing agent" / "resume restock"\n• "set max cut to 8%" / "set stock floor to 30" / "allow 7% discount"\n• "approve all" / "approve P-1042" / "decline P-1036"\n• "what\'s blocked" / "what\'s pending" / "what sold best"\n• "how are the agents doing" / "what\'s working"\n• "show conversations" / "simulate a proposal"' };

  return { fallback: true, reply: `I didn't catch an action in that. I can pause/resume agents, change mandates, approve or decline proposals, or report on sales, stock, escalations and insights. Say "help" for examples.` };
}

$('#copilotForm').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#copilotInput'); submitCopilot(i.value); i.value = ''; });
$('#copilotInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const i = $('#copilotInput'); submitCopilot(i.value); i.value = ''; } });
$('#ttsToggle').addEventListener('change', (e) => { S.copilot.tts = e.target.checked; save(); if (!S.copilot.tts && 'speechSynthesis' in window) speechSynthesis.cancel(); });

/* Voice input — Web Speech API (Chrome/Edge/Safari). */
(function voice() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('#micBtn');
  if (!Rec) { btn.title = 'Voice input not supported in this browser'; btn.addEventListener('click', () => toast('Voice input needs Chrome, Edge or Safari', 'warn')); return; }
  const rec = new Rec(); rec.lang = 'en-GB'; rec.interimResults = true; rec.continuous = false;
  let listening = false;
  rec.onresult = (e) => { const txt = [...e.results].map((r) => r[0].transcript).join(''); $('#copilotInput').value = txt; if (e.results[e.results.length - 1].isFinal) { submitCopilot(txt); $('#copilotInput').value = ''; } };
  rec.onend = () => { listening = false; btn.classList.remove('listening'); };
  rec.onerror = (e) => { listening = false; btn.classList.remove('listening'); if (e.error !== 'aborted') toast(`Voice: ${e.error}`, 'warn'); };
  btn.addEventListener('click', () => { if (listening) { rec.stop(); return; } openCopilot(); listening = true; btn.classList.add('listening'); try { rec.start(); } catch (_) { listening = false; btn.classList.remove('listening'); } });
})();

/* =========================================================================
   Boot
   ========================================================================= */
render();
// Tick relative timestamps once a minute.
setInterval(() => { if (!S.ui.editing && $('#modal').classList.contains('hidden')) render(); }, 60000);
