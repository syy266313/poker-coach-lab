const RANKS = "23456789TJQKA";
const SUITS = "CDHS";
const rank = (code) => RANKS.indexOf(code[0]) + 2;
const suit = (code) => code[1];
const deck = () => { const result = []; for (const r of RANKS) for (const s of SUITS) result.push(`${r}${s}`); return result; };
const compare = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i += 1) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
function eval5(cards) {
  const values = cards.map(rank).sort((a, b) => b - a);
  const counts = new Map(); values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((c) => suit(c) === suit(cards[0]));
  const unique = [...new Set(values)];
  let straight = 0;
  if (unique.length === 5 && unique[0] - unique[4] === 4) straight = unique[0];
  if (unique.join(",") === "14,5,4,3,2") straight = 5;
  if (flush && straight) return [8, straight];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...values];
  if (straight) return [4, straight];
  if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map((x) => x[0]).sort((a, b) => b - a)];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0]), groups[2][0]];
  if (groups[0][1] === 2) return [1, groups[0][0], ...groups.slice(1).map((x) => x[0]).sort((a, b) => b - a)];
  return [0, ...values];
}
function eval7(cards) {
  let best = null;
  for (let a = 0; a < cards.length - 4; a += 1) for (let b = a + 1; b < cards.length - 3; b += 1) for (let c = b + 1; c < cards.length - 2; c += 1) for (let d = c + 1; d < cards.length - 1; d += 1) for (let e = d + 1; e < cards.length; e += 1) {
    const current = eval5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
    if (!best || compare(current, best) > 0) best = current;
  }
  return best;
}
function shuffle(values) { for (let i = values.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; } return values; }
function run(message) {
  const hero = message.hero || [];
  const board = message.board || [];
  const opponents = Math.max(0, Number(message.opponents) || 0);
  const simulations = Math.max(200, Math.min(1500, Number(message.simulations) || 1000));
  if (opponents === 0) return { equity: 100, simulations, wins: simulations, ties: 0 };
  const known = new Set([...hero, ...board]);
  const baseDeck = deck().filter((card) => !known.has(card));
  let equity = 0;
  for (let iteration = 0; iteration < simulations; iteration += 1) {
    const cards = shuffle(baseDeck.slice());
    let cursor = 0;
    const simulatedBoard = board.slice();
    while (simulatedBoard.length < 5) simulatedBoard.push(cards[cursor++]);
    const heroScore = eval7([...hero, ...simulatedBoard]);
    let bestOpponent = null;
    let tiedOpponents = 0;
    for (let opponent = 0; opponent < opponents; opponent += 1) {
      const hand = [cards[cursor++], cards[cursor++]];
      const score = eval7([...hand, ...simulatedBoard]);
      const comparison = bestOpponent ? compare(score, bestOpponent) : 1;
      if (!bestOpponent || comparison > 0) { bestOpponent = score; tiedOpponents = 1; }
      else if (comparison === 0) tiedOpponents += 1;
    }
    const comparison = compare(heroScore, bestOpponent);
    if (comparison > 0) equity += 1;
    else if (comparison === 0) equity += 1 / (tiedOpponents + 1);
  }
  return { equity: (equity / simulations) * 100, simulations };
}
self.onmessage = (event) => {
  const { id, key, ...message } = event.data || {};
  try { self.postMessage({ id, key, ...run(message) }); }
  catch (error) { self.postMessage({ id, key, error: String(error?.message || error) }); }
};
