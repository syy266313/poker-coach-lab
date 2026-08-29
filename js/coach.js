/* Poker Coach — local, explainable learning layer for the table. */
import { getPlayerActionState } from "./shared/actionModel.js";
import { getPlayerSolvedHand } from "./gameEngine.js";

const PROFILE_KEY = "poker:coach:profile:v1";
const profiles = {
  beginner: { label: "新手", tip: "先学会位置、起手牌和底池赔率。", detail: "建议优先选择强起手牌，面对下注先看价格，不要因为已经投入筹码就被迫跟注。" },
  intermediate: { label: "进阶", tip: "关注范围、位置和持续下注。", detail: "把每次决定放进对手范围和有效筹码深度里，而不是只看自己的两张牌。" },
  advanced: { label: "高手", tip: "练习范围与下注尺度。", detail: "把教练当作复盘检查器：关注频率、阻断牌、SPR 和不同牌面下的实现率。" },
};
const rankValue = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function esc(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}
function cardsText(cards = []) {
  const suits = { C: "♣", D: "♦", H: "♥", S: "♠" };
  return cards.filter(Boolean).map((c) => `${c[0]}${suits[c[1]] ?? c[1]}`).join(" ") || "—";
}
function isPair(cards) { return cards.length === 2 && cards[0]?.[0] === cards[1]?.[0]; }
function preflopScore(cards) {
  if (cards.length < 2) return 0;
  const a = rankValue[cards[0][0]] || 0, b = rankValue[cards[1][0]] || 0;
  const hi = Math.max(a, b), lo = Math.min(a, b), gap = hi - lo;
  let score = hi + lo / 3;
  if (a === b) score += 8 + a / 3;
  if (cards[0][1] === cards[1][1]) score += 2;
  if (gap <= 2) score += 1.5;
  if (hi >= 13 && lo >= 10) score += 2;
  if (hi === 14) score += 1;
  return score;
}
function classify(player, board) {
  if (!player?.holeCards?.every(Boolean)) return { label: "等待发牌", strength: 0 };
  if (board.length >= 3) {
    try {
      const solved = getPlayerSolvedHand(player, board);
      if (solved?.name) {
        const map = { "High Card": 18, Pair: 35, "Two Pair": 52, "Three of a Kind": 66, Straight: 78, Flush: 82, "Full House": 92, "Four of a Kind": 98, "Straight Flush": 100 };
        return { label: solved.name, strength: map[solved.name] ?? 25 };
      }
    } catch { /* preflop/partial states are handled below */ }
  }
  const score = preflopScore(player.holeCards);
  if (isPair(player.holeCards)) return { label: score > 25 ? "高口袋对子" : "口袋对子", strength: Math.min(82, score * 2.5) };
  if (score > 38) return { label: "强高张", strength: 68 };
  if (score > 31) return { label: "可玩高张", strength: 52 };
  if (score > 24) return { label: "投机牌", strength: 35 };
  return { label: "弱起手牌", strength: 22 };
}
function currentAdvice(state, player, level) {
  const action = getPlayerActionState(state, player);
  const board = state.communityCards || [];
  const hand = classify(player, board);
  const call = action.needToCall;
  const potAfterCall = Math.max(1, (state.pot || 0) + call);
  const potOdds = call ? call / potAfterCall : 0;
  let title = "观察局面", actionWord = action.canCheck ? "Check" : "Fold";
  let reason = profiles[level].detail;
  let confidence = "中等";

  if (!call && hand.strength >= 68) {
    actionWord = "Raise / Bet"; title = "主动争取价值"; reason = "你有较强的私人牌力，当前没有跟注成本；用合理尺度让更差的牌付费，同时保护自己的范围。"; confidence = "较高";
  } else if (!call && hand.strength >= 38) {
    actionWord = "Check / 小注"; title = "控制底池"; reason = "牌力有一定摊牌价值，但还不值得无条件把底池做大。优先观察对手反应。";
  } else if (call && hand.strength >= 72) {
    actionWord = action.maxAmount === action.needToCall ? "All-in" : "Raise"; title = "强牌继续施压"; reason = `当前底池赔率约 ${Math.round(potOdds * 100)}%，你的牌力明显高于一般继续范围，价值下注或加注优先。`; confidence = "较高";
  } else if (call && hand.strength >= 45 && potOdds <= 0.28) {
    actionWord = "Call"; title = "价格允许防守"; reason = `需要投入 ${call}，跟注后底池约 ${potAfterCall}，门槛约 ${Math.round(potOdds * 100)}%。牌力和价格匹配，可以跟注；注意后续牌面。`;
  } else if (call) {
    actionWord = "Fold"; title = "纪律性弃牌"; reason = `对手要求你用约 ${Math.round(potOdds * 100)}% 的胜率继续，而当前牌力不足。不要因为已经投入筹码就追损。`; confidence = "较高";
  }
  if (level === "beginner") reason += " 口诀：先看位置，再看牌力，最后看价格。";
  if (level === "advanced") reason += " 可进一步检查：你的下注是否代表一个可信的价值/诈唬组合，而不是只在“感觉不错”时下注。";
  return { action, hand, potOdds, title, actionWord, reason, confidence, board };
}

function createPanel() {
  if (document.querySelector("#coach-panel")) return;
  const panel = document.createElement("aside");
  panel.id = "coach-panel";
  panel.innerHTML = `<div class="coach-head"><div><span class="coach-kicker">TABLE COACH</span><h2>牌桌教练</h2></div><button id="coach-close" aria-label="关闭">×</button></div><div class="coach-tabs"><button data-level="beginner">新手</button><button data-level="intermediate">进阶</button><button data-level="advanced">高手</button></div><div id="coach-live"></div><div class="coach-section"><h3>本局复盘</h3><div id="coach-review"></div></div><div class="coach-attribution">本功能为修改版学习模块 · <a href="https://github.com/Tehes/poker" target="_blank" rel="noreferrer">Based on Poker by Tehes</a></div></aside>`;
  document.body.appendChild(panel);
  panel.querySelector("#coach-close").onclick = () => panel.classList.remove("open");
  panel.querySelectorAll("[data-level]").forEach((button) => button.onclick = () => { localStorage.setItem(PROFILE_KEY, button.dataset.level); render(); });
}
function level() { return localStorage.getItem(PROFILE_KEY) || "beginner"; }
function review(history = []) {
  const mine = history.filter((x) => x.isHuman);
  if (!mine.length) return `<p class="coach-muted">开始一手牌后，这里会自动生成复盘。</p>`;
  const mistakes = mine.filter((x) => x.action === "call" && x.needToCall > 0 && x.potOdds > 0.38);
  const aggressive = mine.filter((x) => ["raise", "allin"].includes(x.action));
  const last = mine.slice(-5).reverse();
  return `<div class="coach-metrics"><b>${mine.length}</b><span>次决定</span><b>${aggressive.length}</b><span>次主动进攻</span></div>${mistakes.length ? `<div class="coach-alert">⚠️ ${mistakes.length} 次高价跟注：复盘时重点看听牌赔率和对手范围。</div>` : `<div class="coach-good">✓ 暂未发现明显的高价跟注。</div>`}<div class="coach-history">${last.map((x) => `<div><b>${esc(x.phase)}</b> · ${esc(x.action)} ${x.amount ? x.amount : ""}<small>${esc(cardsText(x.board))}</small></div>`).join("")}</div><p class="coach-muted">教学建议会随你的选择档位变化，不会替你自动操作。</p>`;
}
function render(state = globalThis.poker?.state) {
  const panel = document.querySelector("#coach-panel");
  if (!panel) return;
  const levelKey = level();
  panel.querySelectorAll("[data-level]").forEach((b) => b.classList.toggle("active", b.dataset.level === levelKey));
  const live = panel.querySelector("#coach-live"), player = state?.allPlayers?.find((p) => !p.isBot);
  if (!state?.handInProgress || !player) {
    live.innerHTML = `<div class="coach-empty"><span>♠</span><h3>准备好开始学习了吗？</h3><p>输入你的名字，开始一局 Solo vs Bots。教练会在轮到你时给出解释。</p></div>`;
  } else {
    const a = currentAdvice(state, player, levelKey);
    const turn = state.activeSeatIndex === player.seatIndex;
    live.innerHTML = `<div class="coach-status ${turn ? "your-turn" : ""}">${turn ? "● 轮到你行动" : "● 牌局进行中"}</div><div class="coach-cards"><span>手牌</span><b>${esc(cardsText(player.holeCards))}</b><span>公共牌</span><b>${esc(cardsText(a.board))}</b></div><div class="coach-callout"><span class="coach-label">${esc(a.title)}</span><strong>${esc(a.actionWord)}</strong><p>${esc(a.reason)}</p></div><div class="coach-grid"><div><small>当前牌力</small><b>${esc(a.hand.label)}</b></div><div><small>底池</small><b>${state.pot ?? 0}</b></div><div><small>跟注成本</small><b>${a.action.needToCall}</b></div><div><small>教练把握</small><b>${a.confidence}</b></div></div><p class="coach-tip">${esc(profiles[levelKey].tip)}</p>`;
  }
  panel.querySelector("#coach-review").innerHTML = review(state?.actionHistory || []);
}
async function init() {
  createPanel();
  const toggle = document.createElement("button"); toggle.id = "coach-toggle"; toggle.textContent = "教练"; toggle.onclick = () => { document.querySelector("#coach-panel")?.classList.toggle("open"); render(); }; document.querySelector(".actions")?.appendChild(toggle);
  while (true) { render(); await sleep(700); }
}
init();
