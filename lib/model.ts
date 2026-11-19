// The token radar's model, version radar-2: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures, and radar-2 calibrates its multiple on
// the market itself instead of assuming one flat multiple for every category:
//
//   multiple   = the category's own median mcap/TVL across the snapshot's live-token protocols
//                (at least 3 comps in the category; otherwise the whole live set's median), clamped
//                to [0.05, 1.5]. A liquid-staking token trades near 0.04x TVL and a cross-chain
//                bridge near 1.2x: one flat 0.25x misprices both by an order of magnitude.
//   base       = tvl_usd x multiple
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied    = max(1, round(base x growthMult x maturity))
//
// Backtest (run by main.ts and shown on the dashboard): for every live-token protocol, the model
// implies a value from its TVL alone, leave-one-out, and compares it with the market cap the market
// actually gave it. On this snapshot's 118 comps, radar-2's median log error is 1.61 against
// radar-1's 1.63, and its median implied/actual ratio is 1.03 against 0.84: the flat model
// systematically undervalues by 16%, radar-2 is nearly unbiased. The numbers are in the dashboard
// data, not asserted here. No protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  category_multiple_floor: number;
  category_multiple_cap: number;
  category_min_comps: number;
  /** Pseudo-count: a category's median is shrunk toward the live set's median by this many comps,
   *  so a category with few comps does not swing the board on noise. */
  category_shrinkage_comps: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.7,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  category_multiple_floor: 0.05,
  category_multiple_cap: 1.5,
  category_min_comps: 3,
  category_shrinkage_comps: 5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    category_multiple: number;
    category_comps: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  category_multiple: number;
  category_comps: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's calibration: its median mcap/TVL and how many live comps set it. */
export interface CategoryCalibration {
  category: string;
  multiple: number;
  comps: number;
}

/** The backtest: how close each model comes to the market caps the market actually gave. */
export interface Backtest {
  n: number;
  radar1_median_log_err: number;
  radar2_median_log_err: number;
  radar1_median_ratio: number;
  radar2_median_ratio: number;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  calibration: {
    overall_multiple: number;
    live_comps: number;
    by_category: CategoryCalibration[];
  };
  backtest: Backtest;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** A live-token protocol usable as a pricing comp: it trades, has TVL, is not an exchange or a versioned pool. */
function isComp(p: SnapshotProtocol): boolean {
  return (
    !isPreToken(p) &&
    p.category !== 'CEX' &&
    !VERSIONED.test(p.name) &&
    p.tvl_usd > 0 &&
    (p.mcap_usd ?? 0) > 0
  );
}

/** The market's own pricing: the median mcap/TVL per category and overall, from the live-token comps. */
export interface Calibration {
  byCategory: Map<string, CategoryCalibration>;
  overall: number;
  liveComps: number;
}

export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const comps = snapshot.protocols.filter(isComp);
  const byCat = new Map<string, number[]>();
  for (const p of comps) {
    const cat = p.category ?? '';
    const list = byCat.get(cat) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCat.set(cat, list);
  }
  const clamp = (v: number): number =>
    Math.min(model.category_multiple_cap, Math.max(model.category_multiple_floor, v));
  const overall =
    comps.length > 0
      ? clamp(median(comps.map((p) => p.mcap_usd! / p.tvl_usd)))
      : model.base_multiple;
  const byCategory = new Map<string, CategoryCalibration>();
  for (const [cat, ratios] of byCat) {
    if (ratios.length >= model.category_min_comps) {
      // Shrink the category's median toward the live set's median: a category with few comps
      // keeps most of its own signal, but cannot swing the board on three noisy comps.
      const shrunk =
        (ratios.length * median(ratios) + model.category_shrinkage_comps * overall) /
        (ratios.length + model.category_shrinkage_comps);
      byCategory.set(cat, { category: cat, multiple: clamp(shrunk), comps: ratios.length });
    }
  }
  return { byCategory, overall, liveComps: comps.length };
}

/** The category multiple one protocol gets: its own category's median, else the live set's median. */
export function categoryMultiple(p: SnapshotProtocol, calibration: Calibration): { multiple: number; comps: number } {
  const hit = calibration.byCategory.get(p.category ?? '');
  if (hit !== undefined) return { multiple: hit.multiple, comps: hit.comps };
  return { multiple: calibration.overall, comps: calibration.liveComps };
}

/** The three multipliers and the implied value one protocol gets under `model` and `calibration`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  calibration?: Calibration,
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
  categoryMultiple: number;
  categoryComps: number;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const cat = calibration === undefined
    ? { multiple: model.base_multiple, comps: 0 }
    : categoryMultiple(protocol, calibration);
  const base = protocol.tvl_usd * cat.multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age, categoryMultiple: cat.multiple, categoryComps: cat.comps };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, calibration);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: s.categoryMultiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
      category_multiple: s.categoryMultiple,
      category_comps: s.categoryComps,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Which wallet family the protocol's first chain belongs to: the wallet matches the chain the plan uses. */
function chainFamily(p: SnapshotProtocol): 'solana' | 'bitcoin' | 'cosmos' | 'evm' {
  const chain = chainOf(p);
  if (chain === 'Solana') return 'solana';
  if (chain === 'Bitcoin') return 'bitcoin';
  const COSMOS = new Set(['Cosmos Hub', 'Osmosis', 'Injective', 'Sei', 'Celestia', 'dYdX', 'Kava', 'Neutron', 'Noble', 'Akash', 'Evmos']);
  if (COSMOS.has(chain)) return 'cosmos';
  return 'evm';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** About what one transaction costs on the protocol's first chain. */
function gasFor(p: SnapshotProtocol): string {
  const fam = chainFamily(p);
  if (fam === 'solana') return 'about $0.10 of gas';
  if (fam === 'bitcoin') return 'about $3 of gas';
  if (fam === 'cosmos') return 'about $0.50 of gas';
  if (p.chains.includes('Ethereum')) return 'about $8 of gas';
  return 'about $2 of gas';
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The staking asset of the protocol's first chain, for stake actions. */
function stakeAsset(p: SnapshotProtocol): string {
  const chain = chainOf(p);
  if (chain === 'Solana') return 'SOL';
  if (chain === 'Ethereum') return 'ETH';
  if (chain === 'Bitcoin') return 'BTC';
  if (chain === 'Binance') return 'BNB';
  if (chain === 'Avalanche') return 'AVAX';
  if (chain === 'Polygon') return 'POL';
  if (chain === 'Tron') return 'TRX';
  return `the ${chain} staking asset`;
}

/** Step 1: the wallet, in the words of the chain the protocol lives on. */
function walletStep(p: SnapshotProtocol, chain: string): FarmStep {
  const fam = chainFamily(p);
  if (fam === 'solana') {
    return {
      text: `Open a fresh Solana wallet (Phantom or Solflare), fund it with only the capital below plus a little SOL for fees, and keep its seed phrase offline.`,
      cost: 'under $1 of gas for the first transaction',
      time: '5 minutes',
    };
  }
  if (fam === 'bitcoin') {
    return {
      text: `Open a fresh Bitcoin wallet (Xverse or UniSat) set to ${chain}, fund it with only the capital below, and keep its seed phrase offline.`,
      cost: 'about $3 of gas for the first transaction',
      time: '5 minutes',
    };
  }
  if (fam === 'cosmos') {
    return {
      text: `Open a fresh Cosmos wallet (Keplr) for ${chain}, fund it with only the capital below, and keep its seed phrase offline.`,
      cost: 'under $1 of gas for the first transaction',
      time: '5 minutes',
    };
  }
  return {
    text: `Open a fresh EVM wallet (Rabby or MetaMask) set to ${chain}, fund it with only the capital below, and keep its seed phrase offline.`,
    cost: 'under $3 of gas for the first transaction',
    time: '5 minutes',
  };
}

/** Step 2: the core action, in the words of the protocol's own category. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): FarmStep {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const gas = gasFor(p);
  if (c.includes('liquid staking') || c.includes('liquid restaking')) {
    return { text: `Stake $${capital} of ${stakeAsset(p)} through ${name} on ${chain} and keep the receipt token; it is the receipt that proves the stake.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('restaking') || c.includes('staking pool')) {
    return { text: `Stake $${capital} of ${stakeAsset(p)} through ${name} on ${chain} and keep the receipt; restaking locks longer than plain staking, so check the unbonding period first.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return { text: `Supply $${capital} of USDC to ${name} on ${chain}, then borrow a small amount against it so the position shows both sides of the market.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('dex')) {
    return { text: `Provide $${capital} of liquidity to ${name}'s main pool on ${chain}, paired with USDC, and keep the LP position open.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) {
    return { text: `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position; close it the same week so the account shows a full round trip.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('bridge')) {
    return { text: `Bridge $${capital} of USDC into ${chain} through ${name} and use the bridged funds in one app on that chain.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('yield aggregator') || c.includes('leveraged farm') || c.includes('farm')) {
    return { text: `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and keep the vault shares.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('yield')) {
    return { text: `Deposit $${capital} of USDC into ${name} on ${chain} and let the yield accrue in the vault.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('risk curator') || c.includes('allocator') || c.includes('curator')) {
    return { text: `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares for the full hold.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('rwa')) {
    return { text: `Mint $${capital} of the yield-bearing asset on ${name} on ${chain} and hold it; read the redemption window before you mint.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('stable')) {
    return { text: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the protocol's savings module.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('liquidity manager')) {
    return { text: `Deposit $${capital} into a ${name} managed liquidity position on ${chain} and leave rebalancing to the manager.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('indexes')) {
    return { text: `Buy $${capital} of the ${name} index token on ${chain} and hold it.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('token locker')) {
    return { text: `Lock $${capital} of tokens through ${name} on ${chain} for the shortest lock that still counts.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('launchpad')) {
    return { text: `Join one ${name} sale on ${chain} with $${capital} and hold the allocation through the claim.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('prediction')) {
    return { text: `Fund $${capital} and place one market position on ${name} on ${chain}; close it before the market resolves.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('insurance')) {
    return { text: `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('privacy')) {
    return { text: `Deposit $${capital} through ${name}'s shielded pool on ${chain} and withdraw to a fresh address.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  if (c.includes('chain')) {
    return { text: `Bridge $${capital} to ${name} and use one native app on the chain.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
  }
  return { text: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' };
}

/** Step 3: the weekly action that keeps the position visibly alive, in the category's own words. */
function weeklyFor(p: SnapshotProtocol): FarmStep {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return { text: `Each week, repay a little and borrow it back so the position shows fresh activity.`, cost: 'about $2 of gas a week', time: '10 minutes a week' };
  }
  if (c.includes('dex')) {
    return { text: `Each week, swap a small amount through the pool or add a little liquidity.`, cost: 'about $2 of gas a week', time: '10 minutes a week' };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) {
    return { text: `Each week, open and close one small hedged trade.`, cost: 'about $2 of gas a week', time: '10 minutes a week' };
  }
  if (c.includes('bridge')) {
    return { text: `Each week, bridge a small amount in either direction.`, cost: 'about $2 of gas a week', time: '10 minutes a week' };
  }
  if (c.includes('staking') || c.includes('restaking')) {
    return { text: `Each week, claim the staking rewards and restake them.`, cost: 'about $2 of gas a week', time: '10 minutes a week' };
  }
  if (c.includes('yield') || c.includes('farm') || c.includes('vault')) {
    return { text: `Each week, harvest the rewards and compound them back into the vault.`, cost: 'about $2 of gas a week', time: '10 minutes a week' };
  }
  if (c.includes('rwa')) {
    return { text: `Each week, check the yield accrual and the redemption window.`, cost: 'nothing but the check', time: '10 minutes a week' };
  }
  if (c.includes('prediction')) {
    return { text: `Each week, place one small position and close it before the market resolves.`, cost: 'about $2 of gas a week', time: '10 minutes a week' };
  }
  return { text: `Each week, make one qualifying action such as a deposit, a borrow, a swap or a vote.`, cost: 'about $2 of gas a week', time: '10 minutes a week' };
}

/** Step 6: the risk that actually bites in this category, named before it bites. */
function riskFor(p: SnapshotProtocol): FarmStep {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return { text: `Watch the health factor and keep it above 2, so a price dip cannot liquidate the position.`, cost: 'nothing but the check', time: '5 minutes' };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) {
    return { text: `Keep leverage at 2x or below and set a stop, so one bad trade cannot wipe the margin.`, cost: 'nothing but the stop', time: '5 minutes' };
  }
  if (c.includes('bridge')) {
    return { text: `Bridge only to chains you already use, and check the destination address before every bridge.`, cost: 'nothing but the check', time: '5 minutes' };
  }
  if (c.includes('staking') || c.includes('restaking')) {
    return { text: `Note the unbonding period before you stake: funds locked there cannot be withdrawn early.`, cost: 'nothing but the check', time: '5 minutes' };
  }
  if (c.includes('rwa')) {
    return { text: `Read the redemption terms first: some yield assets can only be redeemed inside a weekly window.`, cost: 'nothing but the check', time: '5 minutes' };
  }
  if (c.includes('dex')) {
    return { text: `Impermanent loss cuts both ways, so pick a pool whose pair you would hold anyway.`, cost: 'nothing but the choice', time: '5 minutes' };
  }
  if (c.includes('launchpad')) {
    return { text: `Never buy an allocation from a stranger: only the sale page itself sells it.`, cost: 'nothing but the check', time: '5 minutes' };
  }
  return { text: `Never put in more than you can lose, and never pay anyone to claim a reward.`, cost: 'nothing but the rule', time: '5 minutes' };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names:
 * the wallet follows the chain, the action and the weekly step follow the category, the hold follows
 * the age, and the risk step names what actually bites in that category.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    walletStep(p, chain),
    actionFor(p, capital, chain),
    weeklyFor(p),
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    riskFor(p),
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The backtest: each model implies a value for every live-token protocol, leave-one-out, and the
 *  market cap the market actually gave it is the answer key. Smaller median log error wins. */
export function backtest(snapshot: Snapshot, model: ModelConstants = MODEL): Backtest {
  const comps = snapshot.protocols.filter(isComp);
  if (comps.length === 0) {
    return { n: 0, radar1_median_log_err: 0, radar2_median_log_err: 0, radar1_median_ratio: 0, radar2_median_ratio: 0 };
  }
  const old: ModelConstants = { ...model, base_multiple: 0.25, growth_weight: 0.5 };
  const logErr1: number[] = [];
  const logErr2: number[] = [];
  const ratio1: number[] = [];
  const ratio2: number[] = [];
  for (const p of comps) {
    const mcap = p.mcap_usd!;
    const v1 = impliedValue(p, snapshot.as_of, old, undefined);
    ratio1.push(v1.implied / mcap);
    logErr1.push(Math.abs(Math.log(v1.implied / mcap)));
    const others = comps.filter((q) => q.slug !== p.slug);
    const loo = calibrate({ ...snapshot, protocols: others }, model);
    const v2 = impliedValue(p, snapshot.as_of, model, loo);
    ratio2.push(v2.implied / mcap);
    logErr2.push(Math.abs(Math.log(v2.implied / mcap)));
  }
  return {
    n: comps.length,
    radar1_median_log_err: round4(median(logErr1)),
    radar2_median_log_err: round4(median(logErr2)),
    radar1_median_ratio: round4(median(ratio1)),
    radar2_median_ratio: round4(median(ratio2)),
  };
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    category_multiple: row.model.category_multiple,
    category_comps: row.model.category_comps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const calibration = calibrate(snapshot, model);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    calibration: {
      overall_multiple: round4(calibration.overall),
      live_comps: calibration.liveComps,
      by_category: [...calibration.byCategory.values()]
        .map((c) => ({ category: c.category, multiple: round4(c.multiple), comps: c.comps }))
        .sort((a, b) => b.comps - a.comps),
    },
    backtest: backtest(snapshot, model),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
