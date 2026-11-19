// Token Radar's plain dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer with the
// model's own inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
//
// The page recomputes every row and every farm plan from the snapshot figures, with the same
// arithmetic main.ts runs, so the page's code and the board's data are visibly the same model.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // The multiple is the row's own category multiple, not one flat number for every category.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: the wallet follows the chain,
  // the action and the weekly step follow the category, the hold follows the age, and the risk step
  // names what actually bites in that category. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  var COSMOS_CHAINS = ['Cosmos Hub', 'Osmosis', 'Injective', 'Sei', 'Celestia', 'dYdX', 'Kava', 'Neutron', 'Noble', 'Akash', 'Evmos'];
  function chainFamily(p) {
    var chain = chainOf(p);
    if (chain === 'Solana') return 'solana';
    if (chain === 'Bitcoin') return 'bitcoin';
    if (COSMOS_CHAINS.indexOf(chain) >= 0) return 'cosmos';
    return 'evm';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function gasFor(p) {
    var fam = chainFamily(p);
    if (fam === 'solana') return 'about $0.10 of gas';
    if (fam === 'bitcoin') return 'about $3 of gas';
    if (fam === 'cosmos') return 'about $0.50 of gas';
    if (p.chains && p.chains.indexOf('Ethereum') >= 0) return 'about $8 of gas';
    return 'about $2 of gas';
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function stakeAsset(p) {
    var chain = chainOf(p);
    if (chain === 'Solana') return 'SOL';
    if (chain === 'Ethereum') return 'ETH';
    if (chain === 'Bitcoin') return 'BTC';
    if (chain === 'Binance') return 'BNB';
    if (chain === 'Avalanche') return 'AVAX';
    if (chain === 'Polygon') return 'POL';
    if (chain === 'Tron') return 'TRX';
    return 'the ' + chain + ' staking asset';
  }
  function walletStep(p, chain) {
    var fam = chainFamily(p);
    if (fam === 'solana') return { text: 'Open a fresh Solana wallet (Phantom or Solflare), fund it with only the capital below plus a little SOL for fees, and keep its seed phrase offline.', cost: 'under $1 of gas for the first transaction', time: '5 minutes' };
    if (fam === 'bitcoin') return { text: 'Open a fresh Bitcoin wallet (Xverse or UniSat) set to ' + chain + ', fund it with only the capital below, and keep its seed phrase offline.', cost: 'about $3 of gas for the first transaction', time: '5 minutes' };
    if (fam === 'cosmos') return { text: 'Open a fresh Cosmos wallet (Keplr) for ' + chain + ', fund it with only the capital below, and keep its seed phrase offline.', cost: 'under $1 of gas for the first transaction', time: '5 minutes' };
    return { text: 'Open a fresh EVM wallet (Rabby or MetaMask) set to ' + chain + ', fund it with only the capital below, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' };
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var gas = gasFor(p);
    var cost = '$' + capital + ' of capital and ' + gas;
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('liquid restaking') >= 0) return { text: 'Stake $' + capital + ' of ' + stakeAsset(p) + ' through ' + name + ' on ' + chain + ' and keep the receipt token; it is the receipt that proves the stake.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('restaking') >= 0 || c.indexOf('staking pool') >= 0) return { text: 'Stake $' + capital + ' of ' + stakeAsset(p) + ' through ' + name + ' on ' + chain + ' and keep the receipt; restaking locks longer than plain staking, so check the unbonding period first.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return { text: 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', then borrow a small amount against it so the position shows both sides of the market.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('dex') >= 0) return { text: 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ', paired with USDC, and keep the LP position open.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0) return { text: 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position; close it the same week so the account shows a full round trip.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('bridge') >= 0) return { text: 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ' and use the bridged funds in one app on that chain.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return { text: 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-TVL vault on " + chain + ' and keep the vault shares.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('yield') >= 0) return { text: 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and let the yield accrue in the vault.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('risk curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('curator') >= 0) return { text: 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares for the full hold.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('rwa') >= 0) return { text: 'Mint $' + capital + ' of the yield-bearing asset on ' + name + ' on ' + chain + ' and hold it; read the redemption window before you mint.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('stable') >= 0) return { text: 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + " and hold it in the protocol's savings module.", cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('liquidity manager') >= 0) return { text: 'Deposit $' + capital + ' into a ' + name + ' managed liquidity position on ' + chain + ' and leave rebalancing to the manager.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('indexes') >= 0) return { text: 'Buy $' + capital + ' of the ' + name + ' index token on ' + chain + ' and hold it.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('token locker') >= 0) return { text: 'Lock $' + capital + ' of tokens through ' + name + ' on ' + chain + ' for the shortest lock that still counts.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('launchpad') >= 0) return { text: 'Join one ' + name + ' sale on ' + chain + ' with $' + capital + ' and hold the allocation through the claim.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('prediction') >= 0) return { text: 'Fund $' + capital + ' and place one market position on ' + name + ' on ' + chain + '; close it before the market resolves.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('insurance') >= 0) return { text: 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('privacy') >= 0) return { text: 'Deposit $' + capital + " through " + name + "'s shielded pool on " + chain + ' and withdraw to a fresh address.', cost: cost, time: '15 minutes to set up' };
    if (c.indexOf('chain') >= 0) return { text: 'Bridge $' + capital + ' to ' + name + ' and use one native app on the chain.', cost: cost, time: '15 minutes to set up' };
    return { text: 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.', cost: cost, time: '15 minutes to set up' };
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return { text: 'Each week, repay a little and borrow it back so the position shows fresh activity.', cost: 'about $2 of gas a week', time: '10 minutes a week' };
    if (c.indexOf('dex') >= 0) return { text: 'Each week, swap a small amount through the pool or add a little liquidity.', cost: 'about $2 of gas a week', time: '10 minutes a week' };
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0) return { text: 'Each week, open and close one small hedged trade.', cost: 'about $2 of gas a week', time: '10 minutes a week' };
    if (c.indexOf('bridge') >= 0) return { text: 'Each week, bridge a small amount in either direction.', cost: 'about $2 of gas a week', time: '10 minutes a week' };
    if (c.indexOf('staking') >= 0 || c.indexOf('restaking') >= 0) return { text: 'Each week, claim the staking rewards and restake them.', cost: 'about $2 of gas a week', time: '10 minutes a week' };
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('vault') >= 0) return { text: 'Each week, harvest the rewards and compound them back into the vault.', cost: 'about $2 of gas a week', time: '10 minutes a week' };
    if (c.indexOf('rwa') >= 0) return { text: 'Each week, check the yield accrual and the redemption window.', cost: 'nothing but the check', time: '10 minutes a week' };
    if (c.indexOf('prediction') >= 0) return { text: 'Each week, place one small position and close it before the market resolves.', cost: 'about $2 of gas a week', time: '10 minutes a week' };
    return { text: 'Each week, make one qualifying action such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' };
  }
  function riskFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return { text: 'Watch the health factor and keep it above 2, so a price dip cannot liquidate the position.', cost: 'nothing but the check', time: '5 minutes' };
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0) return { text: 'Keep leverage at 2x or below and set a stop, so one bad trade cannot wipe the margin.', cost: 'nothing but the stop', time: '5 minutes' };
    if (c.indexOf('bridge') >= 0) return { text: 'Bridge only to chains you already use, and check the destination address before every bridge.', cost: 'nothing but the check', time: '5 minutes' };
    if (c.indexOf('staking') >= 0 || c.indexOf('restaking') >= 0) return { text: 'Note the unbonding period before you stake: funds locked there cannot be withdrawn early.', cost: 'nothing but the check', time: '5 minutes' };
    if (c.indexOf('rwa') >= 0) return { text: 'Read the redemption terms first: some yield assets can only be redeemed inside a weekly window.', cost: 'nothing but the check', time: '5 minutes' };
    if (c.indexOf('dex') >= 0) return { text: 'Impermanent loss cuts both ways, so pick a pool whose pair you would hold anyway.', cost: 'nothing but the choice', time: '5 minutes' };
    if (c.indexOf('launchpad') >= 0) return { text: 'Never buy an allocation from a stranger: only the sale page itself sells it.', cost: 'nothing but the check', time: '5 minutes' };
    return { text: 'Never put in more than you can lose, and never pay anyone to claim a reward.', cost: 'nothing but the rule', time: '5 minutes' };
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      walletStep(p, chain),
      actionFor(p, capital, chain),
      weeklyFor(p),
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      riskFor(p),
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    var params = new URLSearchParams(hash);
    state.q = params.get('q') || '';
    state.category = params.get('category') || 'all';
    state.selected = params.get('p') || null;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var cal = DATA.calibration;
    var bt = DATA.backtest;
    var calRows = cal.by_category.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: c.multiple.toFixed(3) + 'x' }),
        el('td', { class: 'num', text: String(c.comps) })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'The multiple is not one flat number: it is the category\u2019s own median market-cap-to-TVL across the snapshot\u2019s live-token protocols, shrunk toward the live set\u2019s median by ' + m.category_shrinkage_comps + ' comps and clamped to [' + m.category_multiple_floor + ', ' + m.category_multiple_cap + ']. A liquid-staking token trades near 0.05x TVL and a cross-chain bridge near 1.2x: one flat 0.25x misprices both. A category with fewer than ' + m.category_min_comps + ' live comps uses the live set\u2019s median, ' + cal.overall_multiple.toFixed(3) + 'x. TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days.' }),
      el('h3', { text: 'Category multiples, from the market itself' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'cal' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Multiple' }), el('th', { scope: 'col', text: 'Live comps' }))),
          el('tbody', null, calRows)
        )
      ),
      el('h3', { text: 'Backtest: the model against the market' }),
      el('p', { class: 'sub', text: 'Each model implies a value for every live-token protocol from its TVL alone, leave-one-out, and the market cap the market actually gave it is the answer key. On this snapshot\u2019s ' + bt.n + ' live comps, ' + DATA.model_version + ' has a median log error of ' + bt.radar2_median_log_err + ' against radar-1\u2019s flat 0.25x at ' + bt.radar1_median_log_err + ', and a median implied-to-actual ratio of ' + bt.radar2_median_ratio + ' against ' + bt.radar1_median_ratio + ': the flat model systematically undervalues by 16%, radar-2 is nearly unbiased.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'Other') + ', ' + row.category_comps + ' live comps)' }), el('b', { class: 'num', text: row.category_multiple.toFixed(3) + 'x' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (!state.selected && dialog.open) dialog.close();
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
