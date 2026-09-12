globalThis.__feltwiseAdvisorLoaded = (globalThis.__feltwiseAdvisorLoaded || 0) + 1;
const STORAGE_KEY = "poker:saved-game:v1";
const PREFIX = window.location.pathname.endsWith('index.html') ? 'inline-' : '';
const q = (id) => document.querySelector(`#${PREFIX}${id}`) || document.querySelector(`#${id}`);
const el = {
  app: document.querySelector('.app') || document.querySelector('#inline-advisor-shell'),
  potChip: q('pot-chip'),
  phaseChip: q('phase-chip'),
  slots: q('community-slots'),
  grid: q('player-grid'),
  actionRow: q('action-row'),
  playerName: q('player-name'),
  playerMeta: q('player-meta'),
  winrate: q('winrate'),
  winrateBig: q('winrate-big'),
  winbar: q('winbar'),
  equityText: q('equity-text'),
  longWinrate: q('long-winrate'),
  handName: q('hand-name'),
  strategyAction: q('strategy-action'),
  handText: q('hand-text'),
  oddsText: q('odds-text'),
  boardText: q('board-text'),
  confidence: q('confidence-pill'),
  reason: q('reason-text'),
  history: q('history-list'),
  refresh: q('refresh-btn'),
  strategySection: q('strategy-section'),
};
const suits = { C: "♣", D: "♦", H: "♥", S: "♠" };
const rankValue = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
const phaseNames = ["Preflop", "Flop", "Turn", "River", "Showdown"];
const esc = (s) => String(s ?? "").replace(/[&<>\"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':'&quot;', "'":"&#39;" }[c]));
const readSnapshot = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } };
const fmtCards = (cards = []) => cards.filter(Boolean).map((c) => `${c[0]}${suits[c[1]] || c[1]}`).join(" ") || "—";
const score = (cards = []) => { if (cards.length < 2) return 0; const a = rankValue[cards[0][0]] || 0, b = rankValue[cards[1][0]] || 0; const hi = Math.max(a, b), lo = Math.min(a, b), gap = hi - lo; let s = hi + lo / 3; if (a === b) s += 8 + a / 3; if (cards[0][1] === cards[1][1]) s += 2; if (gap <= 2) s += 1.5; if (hi >= 13 && lo >= 10) s += 2; if (hi === 14) s += 1; return s; };
const getActionState = (state, player) => { const needToCall = Math.max(0, (state.currentBet || 0) - (player.roundBet || 0)); const minAmount = state.currentPhaseIndex > 0 && state.currentBet === 0 ? 0 : Math.min(needToCall, player.chips || 0); const maxAmount = player.chips || 0; const minRaise = needToCall + (state.lastRaise || 0); const maxRaiseAmount = Math.min(maxAmount, Math.max(minRaise, 0)); return { needToCall, minAmount, maxAmount, minRaise, maxRaiseAmount, canCheck: needToCall === 0 }; };
const classify = (player) => { const hc = player?.holeCards || []; if (!hc.every(Boolean)) return { label: "等待发牌", strength: 0 }; const s = score(hc); if (hc[0][0] === hc[1][0]) return { label: "口袋对子", strength: Math.min(82, s * 2.5) }; if (s > 38) return { label: "强高张", strength: 68 }; if (s > 31) return { label: "可玩高张", strength: 52 }; if (s > 24) return { label: "投机牌", strength: 35 }; return { label: "弱起手牌", strength: 22 }; };
const analyze = (state, player) => { const a = getActionState(state, player); const call = a.needToCall || 0; const potAfterCall = Math.max(1, (state.pot || 0) + call); const potOdds = call ? call / potAfterCall : 0; const hand = classify(player); const board = state.communityCards || []; let action = a.canCheck ? "Check" : "Fold"; let title = "观察局面"; let reason = "先看位置，再看底池赔率。"; let confidence = "中等"; if (!call && hand.strength >= 68) { action = "Raise / Bet"; title = "主动争取价值"; reason = "你现在有较强的私人牌力，适合用合理尺度让更差的牌付费。"; confidence = "较高"; } else if (!call && hand.strength >= 38) { action = "Check / 小注"; title = "控制底池"; reason = "目前更像是能摊牌的牌，不急着把底池做大。"; } else if (call && hand.strength >= 72) { action = a.maxAmount === a.needToCall ? "All-in" : "Raise"; title = "强牌继续施压"; reason = `当前底池赔率约 ${Math.round(potOdds * 100)}%，你的牌力足够继续加压。`; confidence = "较高"; } else if (call && hand.strength >= 45 && potOdds <= 0.28) { action = "Call"; title = "价格允许防守"; reason = `需要投入 ${call}，价格还可以。`; } else if (call) { action = "Fold"; title = "纪律性弃牌"; reason = `当前需要约 ${Math.round(potOdds * 100)}% 的胜率继续，条件不够。`; confidence = "较高"; } return { action, title, reason, confidence, hand, potOdds, board, a }; };
const playerCards = (player) => { const cards = player?.visibleHoleCards?.some(Boolean) ? player.holeCards : [null, null]; return `<div class="cards">${cards.map((c) => c ? `<div class="card-face">${esc(c[0] + (suits[c[1]] || c[1]))}</div>` : `<div class="card-back"></div>`).join("")}</div>`; };
const actionChipHTML = (label, tone, meta, active = false) => `<div class="action-chip ${tone} ${active ? 'active' : ''}"><div><strong>${esc(label)}</strong><small>${esc(meta)}</small></div><span>→</span></div>`;
const animateNumber = (node, from, to, fmt, duration = 240) => { if (!node) return; if (!Number.isFinite(from) || from === to) { node.textContent = fmt(to); return; } const start = performance.now(); const step = (now) => { const t = Math.min(1, (now - start) / duration); const ease = 1 - Math.pow(1 - t, 3); node.textContent = fmt(from + (to - from) * ease); if (t < 1) requestAnimationFrame(step); else node.textContent = fmt(to); }; requestAnimationFrame(step); };
const source = () => { const live = globalThis.poker?.state; if (live?.handId > 0) return { kind: 'live', state: live, history: live.actionHistory || [] }; const snap = readSnapshot(); return { kind: 'snapshot', state: snap?.gameState || null, history: snap?.actionHistory || snap?.gameState?.actionHistory || [] }; };
const live = { digest: "", eq: null, updateQueued: false };
const digestState = (state, player) => JSON.stringify({ h: state.handId, p: state.currentPhaseIndex, pot: state.pot, bet: state.currentBet, a: state.activeSeatIndex, seat: player?.seatIndex, board: (state.communityCards || []).join('-'), players: (state.players || []).map(p => [p.name,p.chips,p.roundBet,p.folded,p.allIn].join('|')).join('~') });
function render() { const src = source(); const state = src.state; const players = state?.players || []; const p = players.find((x) => !x.isBot && x.seatIndex === state?.activeSeatIndex) || state?.allPlayers?.find((x) => !x.isBot) || null; if (!state || !p) { el.app?.classList.remove('live'); if (el.playerName) el.playerName.textContent = "—"; if (el.playerMeta) el.playerMeta.textContent = "请先回到牌桌并开始一手牌"; if (el.winrate) el.winrate.textContent = "—"; if (el.winrateBig) el.winrateBig.textContent = "—"; if (el.equityText) el.equityText.textContent = "暂无数据"; if (el.history) el.history.innerHTML = `<div class="item">先在牌桌开始一手牌，再回来查看胜率和策略。</div>`; if (el.slots) el.slots.innerHTML = '<div class="slot empty">?</div>'.repeat(5); if (el.grid) el.grid.innerHTML = '<div class="player"><div class="name">我</div><div class="pos">BTN</div><div class="stack">筹码 —</div><div class="bet">下注 —</div></div>'; if (el.actionRow) el.actionRow.innerHTML = ''; return; }
  const digest = digestState(state, p); const changed = digest !== live.digest; if (!changed) return; if (changed) { live.digest = digest; el.app?.classList.add('live'); clearTimeout(render._pulseT); render._pulseT = setTimeout(() => el.app?.classList.remove('live'), 720); }
  const tip = analyze(state, p); const eq = typeof p.winProbability === "number" ? p.winProbability : null; const longWin = p.stats?.hands ? Math.round((p.stats.handsWon / p.stats.hands) * 100) : null; const community = state.communityCards || []; const phase = phaseNames[state.currentPhaseIndex] || "等待开始"; if (el.phaseChip) el.phaseChip.textContent = state.handInProgress ? phase : "等待开始"; if (el.potChip) el.potChip.textContent = `底池 ${state.pot ?? 0}`; if (el.slots) el.slots.innerHTML = Array.from({ length: 5 }, (_, i) => community[i] ? `<div class="slot filled">${esc(community[i][0] + (suits[community[i][1]] || community[i][1]))}</div>` : `<div class="slot empty">?</div>`).join(""); if (el.grid) el.grid.innerHTML = players.map((pl) => { const active = pl.seatIndex === p.seatIndex; const cardText = pl.isBot ? (pl.folded ? "已弃牌" : pl.allIn ? "全下" : pl.roundBet ? `下注 ${pl.roundBet}` : "待行动") : fmtCards(pl.holeCards); return `<div class="player ${active ? 'active' : ''}"><div class="pos">${esc(pl.dealer ? 'BTN' : pl.smallBlind ? 'SB' : pl.bigBlind ? 'BB' : `Seat ${pl.seatIndex + 1}`)}</div><div class="name">${esc(pl.name)}${active ? ' · 你' : ''}</div><div class="stack">筹码 ${pl.chips ?? 0}</div><div class="bet">${esc(cardText)}</div>${playerCards(pl)}</div>`; }).join(""); if (el.playerName) el.playerName.textContent = p.name || "我"; if (el.playerMeta) el.playerMeta.textContent = `${fmtCards(p.holeCards)} · 公共牌 ${fmtCards(state.communityCards)} · ${phase} · 底池 ${state.pot ?? 0}`; animateNumber(el.winrate, live.eq ?? eq ?? 0, eq ?? 0, (v) => `${Math.round(v)}%`); animateNumber(el.winrateBig, live.eq ?? eq ?? 0, eq ?? 0, (v) => `${Math.round(v)}%`); const width = Math.max(4, Math.min(100, eq ?? 4)); requestAnimationFrame(() => { if (el.winbar) el.winbar.style.width = `${width}%`; }); if (el.equityText) el.equityText.textContent = eq == null ? "等待实时胜率" : `当前胜率约 ${Math.round(eq)}%`; if (el.longWinrate) el.longWinrate.textContent = longWin == null ? "—" : `${longWin}%`; if (el.handName) el.handName.textContent = tip.hand.label; if (el.strategyAction) el.strategyAction.textContent = tip.action; if (el.handText) el.handText.textContent = `${fmtCards(p.holeCards)} | ${fmtCards(state.communityCards)}`; if (el.oddsText) el.oddsText.textContent = `${Math.round(tip.potOdds * 100)}% / SPR ${state.pot ? ((p.chips || 0) / state.pot).toFixed(1) : '∞'}`; if (el.boardText) el.boardText.textContent = `位置与牌型会影响你的实际胜率`; if (el.confidence) el.confidence.textContent = tip.confidence; if (el.reason) el.reason.textContent = tip.reason; const chips = [ { label: tip.a.canCheck ? 'Check' : 'Fold', tone: tip.a.canCheck ? 'primary' : 'bad', meta: tip.a.canCheck ? '可免费看牌' : `需跟注 ${tip.a.needToCall}`, active: tip.a.canCheck }, { label: 'Call', tone: 'good', meta: `底池赔率 ${Math.round(tip.potOdds * 100)}%`, active: !tip.a.canCheck && tip.a.needToCall > 0 && tip.potOdds <= 0.28 }, { label: 'Raise', tone: 'primary', meta: '主动建立底池', active: tip.a.maxAmount > tip.a.needToCall }, { label: 'All-in', tone: 'bad', meta: '高压/终局', active: tip.a.maxAmount === tip.a.needToCall && tip.a.maxAmount > 0 } ]; if (el.actionRow) el.actionRow.innerHTML = chips.map((x) => actionChipHTML(x.label, x.tone, x.meta, x.active)).join(""); if (el.history) el.history.innerHTML = src.history.slice(-8).reverse().map((x) => `<div class="item"><b>${esc(x.phase ?? 'hand')}</b> · ${esc(x.action ?? '—')} ${esc(x.amount ?? '')} · 跟注成本 ${x.needToCall ?? 0} · 底池赔率 ${Math.round((x.potOdds ?? 0) * 100)}%</div>`).join("") || '<div class="item">暂无复盘</div>'; }
function scheduleRender(){
	if (live.updateQueued) return;
	live.updateQueued = true;
	requestAnimationFrame(() => {
		live.updateQueued = false;
		render();
	});
}
function boot() {
	el.refresh?.addEventListener('click', scheduleRender);
	render();
	globalThis.addEventListener('poker:statechange', scheduleRender);
	globalThis.addEventListener('poker:ready', scheduleRender);
	if (PREFIX !== 'inline-') {
		setInterval(() => {
			if (!globalThis.poker?.state) scheduleRender();
		}, 1000);
	}
}
boot();
