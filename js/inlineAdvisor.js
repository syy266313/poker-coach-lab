import { getPlayerActionState } from "./shared/actionModel.js";

const root = document.querySelector("#inline-advisor-shell");
if (!root) {
  throw new Error("Inline advisor root is missing");
}

globalThis.__feltwiseInlineAdvisorLoaded = true;

const $ = (id) => root.querySelector(`#inline-${id}`);
const el = {
  root,
  pot: $("pot-chip"),
  phase: $("phase-chip"),
  name: $("player-name"),
  meta: $("player-meta"),
  winrate: $("winrate"),
  winrateBig: $("winrate-big"),
  winbar: $("winbar"),
  equityText: $("equity-text"),
  longWinrate: $("long-winrate"),
  handName: $("hand-name"),
  strategyAction: $("strategy-action"),
  handText: $("hand-text"),
  odds: $("odds-text"),
  boardText: $("board-text"),
  confidence: $("confidence-pill"),
  reason: $("reason-text"),
  actions: $("action-row"),
  history: $("history-list"),
};

const suits = { C: "♣", D: "♦", H: "♥", S: "♠" };
const rankValue = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};
const phaseNames = ["Preflop", "Flop", "Turn", "River", "Showdown"];
const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[char]));
const cardsText = (cards = []) => cards.filter(Boolean)
  .map((card) => `${card[0]}${suits[card[1]] || card[1]}`)
  .join(" ") || "—";

function getState() {
  return globalThis.poker?.state || null;
}

function getHero(state) {
  if (!state) return null;
  return (state.allPlayers || state.players || []).find((player) => !player.isBot) || null;
}

function handScore(cards = []) {
  if (cards.length < 2) return 0;
  const first = rankValue[cards[0][0]] || 0;
  const second = rankValue[cards[1][0]] || 0;
  const high = Math.max(first, second);
  const low = Math.min(first, second);
  let score = high + low / 3;
  if (first === second) score += 8 + first / 3;
  if (cards[0][1] === cards[1][1]) score += 2;
  if (high - low <= 2) score += 1.5;
  if (high >= 13 && low >= 10) score += 2;
  if (high === 14) score += 1;
  return score;
}

function classifyHand(player, board) {
  const cards = player?.holeCards || [];
  if (!cards.every(Boolean)) return { label: "等待发牌", strength: 0 };

  if (board.length >= 3) {
    const counts = new Map();
    [...cards, ...board].forEach((card) => {
      counts.set(card[0], (counts.get(card[0]) || 0) + 1);
    });
    const values = [...counts.values()].sort((a, b) => b - a);
    const suitsOnBoard = new Map();
    [...cards, ...board].forEach((card) => {
      suitsOnBoard.set(card[1], (suitsOnBoard.get(card[1]) || 0) + 1);
    });
    const flush = [...suitsOnBoard.values()].some((count) => count >= 5);
    const ranks = [...new Set([...cards, ...board].map((card) => rankValue[card[0]]))].sort((a, b) => a - b);
    let straight = false;
    for (let index = 0; index <= ranks.length - 5; index += 1) {
      if (ranks[index + 4] - ranks[index] === 4) straight = true;
    }
    if (ranks.includes(14) && ranks.includes(2) && ranks.includes(3) && ranks.includes(4) && ranks.includes(5)) straight = true;
    if (flush && straight) return { label: "同花顺潜力", strength: 94 };
    if (values[0] >= 4) return { label: "四条", strength: 98 };
    if (values[0] >= 3 && values[1] >= 2) return { label: "葫芦", strength: 92 };
    if (flush) return { label: "同花", strength: 84 };
    if (straight) return { label: "顺子", strength: 80 };
    if (values[0] >= 3) return { label: "三条", strength: 68 };
    if (values[0] >= 2 && values[1] >= 2) return { label: "两对", strength: 56 };
    if (values[0] >= 2) return { label: "一对", strength: 38 };
  }

  const score = handScore(cards);
  if (cards[0][0] === cards[1][0]) return { label: "口袋对子", strength: Math.min(82, score * 2.5) };
  if (score > 38) return { label: "强高张", strength: 68 };
  if (score > 31) return { label: "可玩高张", strength: 52 };
  if (score > 24) return { label: "投机牌", strength: 35 };
  return { label: "弱起手牌", strength: 22 };
}

function getAdvice(state, player) {
  const action = getPlayerActionState(state, player);
  const call = action.needToCall;
  const potAfterCall = Math.max(1, (state.pot || 0) + call);
  const potOdds = call ? call / potAfterCall : 0;
  const hand = classifyHand(player, state.communityCards || []);
  let recommendation = action.canCheck ? "Check" : "Fold";
  let title = "观察局面";
  let reason = "先看位置，再看牌力，最后看底池赔率。";
  let confidence = "中等";

  if (!call && hand.strength >= 68) {
    recommendation = "Raise / Bet";
    title = "主动争取价值";
    reason = "你有较强的私人牌力，适合用合理尺度让更差的牌付费。";
    confidence = "较高";
  } else if (!call && hand.strength >= 38) {
    recommendation = "Check / 小注";
    title = "控制底池";
    reason = "这手牌有一定摊牌价值，不需要无条件把底池做大。";
  } else if (call && hand.strength >= 72) {
    recommendation = action.maxAmount === call ? "All-in" : "Raise";
    title = "强牌继续施压";
    reason = `当前底池赔率约 ${Math.round(potOdds * 100)}%，牌力足够继续加压。`;
    confidence = "较高";
  } else if (call && hand.strength >= 45 && potOdds <= 0.28) {
    recommendation = "Call";
    title = "价格允许防守";
    reason = `需要投入 ${call}，当前价格还可以。`;
  } else if (call) {
    recommendation = "Fold";
    title = "纪律性弃牌";
    reason = `需要约 ${Math.round(potOdds * 100)}% 的胜率继续，当前条件不够。`;
    confidence = "较高";
  }

  return { action, hand, potOdds, recommendation, title, reason, confidence };
}

function quickEquity(state, hero) {
  const opponents = Math.max(1, (state.players || [])
    .filter((player) => !player.folded && player !== hero).length);
  const board = state.communityCards || [];
  const hand = classifyHand(hero, board);
  const boardBoost = board.length >= 3 ? (hand.strength - 20) * 0.18 : 0;
  return Math.max(2, Math.min(96, (18 + handScore(hero.holeCards) * 1.15 + boardBoost) / Math.sqrt(opponents)));
}

function equityKey(state, hero) {
  if (!state || !hero?.holeCards?.every(Boolean)) return "";
  const opponents = (state.players || []).filter((player) => !player.folded && player !== hero).length;
  return [hero.holeCards.join("-"), (state.communityCards || []).join("-"), opponents].join("|");
}

function makeWorker() {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./equityWorker.js", import.meta.url));
  } catch {
    return null;
  }
}

const equity = {
  worker: makeWorker(),
  activeKey: "",
  pendingKey: "",
  resultKey: "",
  value: null,
  fallback: false,
  timer: null,
};
let lastDigest = "";
let scheduled = false;

function scheduleRender() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    try {
      render();
    } catch (error) {
      globalThis.__feltwiseInlineAdvisorError = String(error?.stack || error);
    }
  });
}

function publishEquity(key, value, fallback) {
  if (!key || key !== equity.activeKey) return;
  if (equity.timer) clearTimeout(equity.timer);
  equity.timer = null;
  equity.pendingKey = "";
  equity.resultKey = key;
  equity.value = Number(value);
  equity.fallback = fallback;
  lastDigest = "";
  scheduleRender();
}

function requestEquity(state, hero) {
  const key = equityKey(state, hero);
  if (!key || equity.activeKey === key) return;

  equity.activeKey = key;
  equity.pendingKey = key;
  equity.resultKey = key;
  equity.value = quickEquity(state, hero);
  equity.fallback = true;
  lastDigest = "";
  scheduleRender();

  if (!equity.worker) {
    equity.pendingKey = "";
    return;
  }

  if (equity.timer) clearTimeout(equity.timer);
  equity.timer = setTimeout(() => {
    if (equity.pendingKey === key) {
      equity.pendingKey = "";
      scheduleRender();
    }
  }, 900);

  try {
    equity.worker.postMessage({
      key,
      hero: hero.holeCards,
      board: state.communityCards || [],
      opponents: (state.players || []).filter((player) => !player.folded && player !== hero).length,
      simulations: 450,
    });
  } catch {
    equity.worker?.terminate();
    equity.worker = null;
    equity.pendingKey = "";
  }
}

if (equity.worker) {
  equity.worker.onmessage = (event) => {
    const result = event.data || {};
    if (result.error || result.key !== equity.activeKey) return;
    publishEquity(result.key, result.equity, false);
  };
  equity.worker.onerror = () => {
    equity.worker?.terminate();
    equity.worker = null;
    equity.pendingKey = "";
    scheduleRender();
  };
}

function renderPlaceholder() {
  if (lastDigest === "empty") return;
  lastDigest = "empty";
  root.classList.remove("live");
  if (el.name) el.name.textContent = "—";
  if (el.meta) el.meta.textContent = "开始一手牌后，这里会自动显示实时分析";
  if (el.winrate) el.winrate.textContent = "—";
  if (el.winrateBig) el.winrateBig.textContent = "—";
  if (el.equityText) el.equityText.textContent = "等待局面数据";
  if (el.pot) el.pot.textContent = "底池 0";
  if (el.phase) el.phase.textContent = "等待开始";
  if (el.actions) el.actions.replaceChildren();
  if (el.reason) el.reason.textContent = "开始一手牌后，这里会解释为什么建议这样行动。";
  if (el.history) el.history.innerHTML = '<div class="item">开始一手牌后，这里会自动显示实时分析。</div>';
}

function render() {
  const state = getState();
  const hero = getHero(state);
  if (!state || !hero || !hero.holeCards?.every(Boolean)) {
    renderPlaceholder();
    return;
  }

  const key = equityKey(state, hero);
  const stateEquity = typeof hero.winProbability === "number" && Number.isFinite(hero.winProbability)
    ? hero.winProbability
    : null;
  if (stateEquity !== null) {
    equity.activeKey = key;
    equity.pendingKey = "";
    equity.resultKey = key;
    equity.value = stateEquity;
    equity.fallback = false;
  } else {
    requestEquity(state, hero);
  }

  const equityValue = equity.resultKey === key && Number.isFinite(equity.value)
    ? equity.value
    : null;
  const advice = getAdvice(state, hero);
  const digest = JSON.stringify({
    hand: state.handId,
    phase: state.currentPhaseIndex,
    pot: state.pot,
    bet: state.currentBet,
    active: state.activeSeatIndex,
    board: state.communityCards,
    hero: hero.holeCards,
    chips: hero.chips,
    roundBet: hero.roundBet,
    equity: equityValue == null ? null : Math.round(equityValue * 10) / 10,
    history: (state.actionHistory || []).length,
  });
  if (digest === lastDigest) return;
  lastDigest = digest;
  root.classList.add("live");
  clearTimeout(render.pulseTimer);
  render.pulseTimer = setTimeout(() => root.classList.remove("live"), 500);

  const board = state.communityCards || [];
  const phase = phaseNames[state.currentPhaseIndex] || "等待开始";
  const longWinrate = hero.stats?.hands ? Math.round((hero.stats.handsWon / hero.stats.hands) * 100) : null;
  const shownEquity = equityValue == null ? 0 : equityValue;

  if (el.phase) el.phase.textContent = state.handInProgress ? phase : "等待开始";
  if (el.pot) el.pot.textContent = `底池 ${state.pot ?? 0}`;
  if (el.name) el.name.textContent = hero.name || "我";
  if (el.meta) el.meta.textContent = `${cardsText(hero.holeCards)} · 公共牌 ${cardsText(board)} · ${phase}`;
  if (el.winrate) el.winrate.textContent = equityValue == null ? "分析中…" : `${Math.round(shownEquity)}%`;
  if (el.winrateBig) el.winrateBig.textContent = equityValue == null ? "分析中…" : `${Math.round(shownEquity)}%`;
  if (el.winbar) el.winbar.style.width = `${Math.max(4, Math.min(100, shownEquity || 4))}%`;
  if (el.equityText) el.equityText.textContent = equityValue == null
    ? "正在计算当前牌局胜率…"
    : `当前胜率约 ${Math.round(shownEquity)}%${equity.fallback ? " · 快速估算" : " · 蒙特卡洛"}`;
  if (el.longWinrate) el.longWinrate.textContent = longWinrate == null ? "—" : `${longWinrate}%`;
  if (el.handName) el.handName.textContent = advice.hand.label;
  if (el.strategyAction) el.strategyAction.textContent = advice.recommendation;
  if (el.handText) el.handText.textContent = `${cardsText(hero.holeCards)} | ${cardsText(board)}`;
  if (el.odds) el.odds.textContent = `${Math.round(advice.potOdds * 100)}% / SPR ${state.pot ? ((hero.chips || 0) / state.pot).toFixed(1) : "∞"}`;
  if (el.boardText) el.boardText.textContent = `牌力：${advice.hand.label} · 位置会改变实际胜率`;
  if (el.confidence) el.confidence.textContent = advice.confidence;
  if (el.reason) el.reason.textContent = `${advice.title}：${advice.reason}`;

  const actions = [
    { label: advice.action.canCheck ? "Check" : "Fold", tone: advice.action.canCheck ? "primary" : "bad", meta: advice.action.canCheck ? "可免费看牌" : `需跟注 ${advice.action.needToCall}`, active: advice.recommendation.startsWith("Check") || advice.recommendation === "Fold" },
    { label: "Call", tone: "good", meta: `底池赔率 ${Math.round(advice.potOdds * 100)}%`, active: advice.recommendation === "Call" },
    { label: "Raise", tone: "primary", meta: "主动建立底池", active: advice.recommendation.includes("Raise") },
    { label: "All-in", tone: "bad", meta: "高压/终局", active: advice.recommendation === "All-in" },
  ];
  if (el.actions) el.actions.innerHTML = actions.map((item) => `<div class="action-chip ${item.tone} ${item.active ? "active" : ""}"><div><strong>${item.label}</strong><small>${item.meta}</small></div><span>→</span></div>`).join("");
  if (el.history) el.history.innerHTML = (state.actionHistory || []).slice(-8).reverse().map((item) => `<div class="item"><b>${esc(item.phase || "hand")}</b> · ${esc(item.action || "—")} ${esc(item.amount || "")} · 跟注成本 ${item.needToCall || 0} · 底池赔率 ${Math.round((item.potOdds || 0) * 100)}%</div>`).join("") || '<div class="item">暂无复盘</div>';
}

function monitor() {
  try { render(); } catch (error) { globalThis.__feltwiseInlineAdvisorError = String(error?.stack || error); }
  globalThis.setTimeout(monitor, document.visibilityState === "hidden" ? 1200 : 450);
}

function boot() {
  globalThis.__feltwiseInlineRender = () => {
    try { render(); return true; }
    catch (error) { globalThis.__feltwiseInlineAdvisorError = String(error?.stack || error); return false; }
  };
  globalThis.addEventListener("poker:statechange", globalThis.__feltwiseInlineRender);
  globalThis.addEventListener("poker:ready", globalThis.__feltwiseInlineRender);
  globalThis.addEventListener("poker:equitychange", globalThis.__feltwiseInlineRender);
  globalThis.__feltwiseInlineRender();
  monitor();
}

boot();
