const STORAGE_KEY = "poker:saved-game:v1";
const $ = (s) => document.querySelector(s);
const el = {
  potChip: $("#pot-chip"),
  phaseChip: $("#phase-chip"),
  slots: $("#community-slots"),
  grid: $("#player-grid"),
  actionRow: $("#action-row"),
  playerName: $("#player-name"),
  playerMeta: $("#player-meta"),
  winrate: $("#winrate"),
  winrateBig: $("#winrate-big"),
  winbar: $("#winbar"),
  equityText: $("#equity-text"),
  longWinrate: $("#long-winrate"),
  handName: $("#hand-name"),
  strategyAction: $("#strategy-action"),
  handText: $("#hand-text"),
  oddsText: $("#odds-text"),
  boardText: $("#board-text"),
  confidence: $("#confidence-pill"),
  reason: $("#reason-text"),
  history: $("#history-list"),
  refresh: $("#refresh-btn"),
};
const suits = { C: "♣", D: "♦", H: "♥", S: "♠" };
const rankValue = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
const positionLabel = (p) => (p.dealer ? "BTN" : p.smallBlind ? "SB" : p.bigBlind ? "BB" : `Seat ${p.seatIndex + 1}`);
const esc = (s) => String(s ?? "").replace(/[&<>\"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':'&quot;', "'":"&#39;" }[c]));
function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } }
function fmtCards(cards = []) { return cards.filter(Boolean).map((c) => `${c[0]}${suits[c[1]] || c[1]}`).join(" ") || "—"; }
function score(cards = []) { if (cards.length < 2) return 0; const a = rankValue[cards[0][0]] || 0, b = rankValue[cards[1][0]] || 0; const hi = Math.max(a, b), lo = Math.min(a, b), gap = hi - lo; let s = hi + lo / 3; if (a === b) s += 8 + a / 3; if (cards[0][1] === cards[1][1]) s += 2; if (gap <= 2) s += 1.5; if (hi >= 13 && lo >= 10) s += 2; if (hi === 14) s += 1; return s; }
function classify(player) { const hc = player?.holeCards || []; if (!hc.every(Boolean)) return { label: "等待发牌", strength: 0 }; const s = score(hc); if (hc[0][0] === hc[1][0]) return { label: "口袋对子", strength: Math.min(82, s * 2.5) }; if (s > 38) return { label: "强高张", strength: 68 }; if (s > 31) return { label: "可玩高张", strength: 52 }; if (s > 24) return { label: "投机牌", strength: 35 }; return { label: "弱起手牌", strength: 22 }; }
function analyze(state, player) { const a = state ? window.__advisorActionState(state, player) : { needToCall: 0, canCheck: true, maxAmount: 0 }; const call = a.needToCall || 0; const potAfterCall = Math.max(1, (state.pot || 0) + call); const potOdds = call ? call / potAfterCall : 0; const hand = classify(player); const board = state.communityCards || []; let action = a.canCheck ? "Check" : "Fold"; let title = "观察局面"; let reason = "先看位置，再看底池赔率。"; let confidence = "中等"; if (!call && hand.strength >= 68) { action = "Raise / Bet"; title = "主动争取价值"; reason = "你现在有较强的私人牌力，适合用合理尺度让更差的牌付费。"; confidence = "较高"; } else if (!call && hand.strength >= 38) { action = "Check / 小注"; title = "控制底池"; reason = "目前更像是能摊牌的牌，不急着把底池做大。"; } else if (call && hand.strength >= 72) { action = a.maxAmount === a.needToCall ? "All-in" : "Raise"; title = "强牌继续施压"; reason = `当前底池赔率约 ${Math.round(potOdds * 100)}%，你的牌力足够继续加压。`; confidence = "较高"; } else if (call && hand.strength >= 45 && potOdds <= 0.28) { action = "Call"; title = "价格允许防守"; reason = `需要投入 ${call}，价格还可以。`; } else if (call) { action = "Fold"; title = "纪律性弃牌"; reason = `当前需要约 ${Math.round(potOdds * 100)}% 的胜率继续，条件不够。`; confidence = "较高"; } return { action, title, reason, confidence, hand, potOdds, board, a }; }
function playerCards(player) { const cards = player?.visibleHoleCards?.some(Boolean) ? player.holeCards : [null, null]; return `<div class="cards">${cards.map((c, i) => c ? `<div class="card-face">${esc(c[0] + (suits[c[1]] || c[1]))}</div>` : `<div class="card-back"></div>`).join("")}</div>`; }
function render() { const snap = load(); const state = snap?.gameState; const p = state?.players?.find((x) => !x.isBot && x.seatIndex === state.activeSeatIndex) || state?.allPlayers?.find((x) => !x.isBot) || null; if (!state || !p) { el.playerName.textContent = "—"; el.playerMeta.textContent = "请先回到牌桌并开始一手牌"; el.winrate.textContent = "—"; el.winrateBig.textContent = "—"; el.equityText.textContent = "暂无数据"; el.history.innerHTML = `<div class="item">先在牌桌开始一手牌，再回来查看胜率和策略。</div>`; el.slots.innerHTML = '<div class="slot">?</div>'.repeat(5); el.grid.innerHTML = '<div class="player active"><div class="name">我</div><div class="pos">BTN</div><div class="stack">筹码 —</div><div class="bet">下注 —</div></div>'; el.actionRow.innerHTML = ''; return; }
  const tip = analyze(state, p); const eq = typeof p.winProbability === "number" ? p.winProbability : null; const longWin = p.stats?.hands ? Math.round((p.stats.handsWon / p.stats.hands) * 100) : null; const community = state.communityCards || []; const phaseMap = ["Preflop","Flop","Turn","River","Showdown"]; el.phaseChip.textContent = state.handInProgress ? phaseMap[state.currentPhaseIndex] || "进行中" : "等待开始"; el.potChip.textContent = `底池 ${state.pot ?? 0}`; el.slots.innerHTML = Array.from({ length: 5 }, (_, i) => community[i] ? `<div class="slot">${esc(community[i][0] + (suits[community[i][1]] || community[i][1]))}</div>` : `<div class="slot">?</div>`).join(""); el.grid.innerHTML = (state.players || []).map((pl) => { const active = pl.seatIndex === p.seatIndex; const handLabel = pl.isBot ? (pl.folded ? "已弃牌" : pl.allIn ? "全下" : pl.roundBet ? `下注 ${pl.roundBet}` : "待行动") : fmtCards(pl.holeCards); return `<div class="player ${active ? 'active' : ''}"><div class="pos">${esc(positionLabel(pl))}</div><div class="name">${esc(pl.name)}${active ? ' · 你' : ''}</div><div class="stack">筹码 ${pl.chips ?? 0}</div><div class="bet">${esc(handLabel)}</div>${playerCards(pl)}</div>`; }).join(""); el.playerName.textContent = p.name || "我"; el.playerMeta.textContent = `${fmtCards(p.holeCards)} · 公共牌 ${fmtCards(state.communityCards)} · ${positionLabel(p)} · 底池 ${state.pot ?? 0}`; el.winrate.textContent = eq == null ? "—" : `${Math.round(eq)}%`; el.winrateBig.textContent = eq == null ? "—" : `${Math.round(eq)}%`; el.winbar.style.width = `${Math.max(4, Math.min(100, eq ?? 4))}%`; el.equityText.textContent = eq == null ? "等待实时胜率" : `当前胜率约 ${Math.round(eq)}%`; el.longWinrate.textContent = longWin == null ? "—" : `${longWin}%`; el.handName.textContent = tip.hand.label; el.strategyAction.textContent = tip.action; el.handText.textContent = `${fmtCards(p.holeCards)} | ${fmtCards(state.communityCards)}`; el.oddsText.textContent = `${Math.round(tip.potOdds * 100)}% / SPR ${state.pot ? ((p.chips || 0) / state.pot).toFixed(1) : '∞'}`; el.boardText.textContent = `位置与牌型会影响你的实际胜率`; el.confidence.textContent = tip.confidence; el.reason.textContent = tip.reason; const actionState = tip.a; const options = [ { label: actionState.canCheck ? 'Check' : 'Fold', tone: actionState.canCheck ? 'primary' : 'bad', meta: actionState.canCheck ? '可免费看牌' : `需跟注 ${actionState.needToCall}` }, { label: 'Call', tone: 'good', meta: `底池赔率 ${Math.round(tip.potOdds * 100)}%` }, { label: 'Raise', tone: 'primary', meta: '主动建立底池' }, { label: 'All-in', tone: 'bad', meta: '高压/终局' } ]; el.actionRow.innerHTML = options.map((x) => `<div class="action-chip ${x.tone}"><div><strong>${x.label}</strong><small>${x.meta}</small></div><span>→</span></div>`).join(""); el.history.innerHTML = (snap?.actionHistory || []).slice(-8).reverse().map((x) => `<div class="item"><b>${esc(x.phase ?? 'hand')}</b> · ${esc(x.action ?? '—')} ${esc(x.amount ?? '')} · 跟注成本 ${x.needToCall ?? 0} · 底池赔率 ${Math.round((x.potOdds ?? 0) * 100)}%</div>`).join("") || '<div class="item">暂无复盘</div>'; }
function boot(){ window.__advisorActionState = (state, player) => getPlayerActionState(state, player); el.refresh.addEventListener('click', render); render(); setInterval(render, 600); }
boot();
