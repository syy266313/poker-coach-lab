/* ---------------------------------------------------------------------------
 * Feltwise career store
 * Collects lifetime stats and per-hand records for the career page and for
 * exporting hands to an AI for review. Stored locally, never uploaded.
 * ------------------------------------------------------------------------- */
(function () {
	"use strict";

	var STORAGE_KEY = "feltwise:career:v1";
	var MAX_HANDS = 800;

	var emptyStats = function () {
		return {
			hands: 0, handsWon: 0,
			vpipHands: 0, pfrHands: 0,
			flopsSeen: 0, flopsWon: 0,
			showdowns: 0, showdownsWon: 0,
			allIns: 0, allInWon: 0,
			calls: 0, raises: 0, checks: 0, folds: 0,
			foldsPreflop: 0, foldsPostflop: 0,
			netBB: 0, netChips: 0, biggestPot: 0
		};
	};

	function load() {
		try {
			var raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return { version: 1, stats: emptyStats(), hands: [] };
			var parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== "object") return { version: 1, stats: emptyStats(), hands: [] };
			if (!parsed.stats) parsed.stats = emptyStats();
			if (!Array.isArray(parsed.hands)) parsed.hands = [];
			return parsed;
		} catch (error) {
			return { version: 1, stats: emptyStats(), hands: [] };
		}
	}

	var data = load();
	var pending = null;
	var saveTimer = null;

	function save(immediate) {
		if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
		var write = function () {
			try {
				if (data.hands.length > MAX_HANDS) data.hands = data.hands.slice(-MAX_HANDS);
				localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
			} catch (error) {
				// Storage full or blocked: drop the oldest records and retry once.
				try {
					data.hands = data.hands.slice(-Math.floor(MAX_HANDS / 2));
					localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
				} catch (inner) { /* give up silently */ }
			}
		};
		if (immediate) write(); else saveTimer = setTimeout(write, 400);
	}

	function getState() {
		return (typeof globalThis !== "undefined" && globalThis.poker && globalThis.poker.state) || null;
	}

	function getHero(state) {
		if (!state) return null;
		var list = state.allPlayers || state.players || [];
		for (var index = 0; index < list.length; index += 1) {
			if (!list[index].isBot) return list[index];
		}
		return null;
	}

	function heroActions(state, handId) {
		var history = (state && state.actionHistory) || [];
		var result = [];
		for (var index = 0; index < history.length; index += 1) {
			var item = history[index];
			if (item && item.isHuman && item.handId === handId) result.push(item);
		}
		return result;
	}

	function beginHand(state, hero) {
		pending = {
			handId: state.handId,
			startedAt: Date.now(),
			startStack: (hero.chips || 0) + (hero.roundBet || 0),
			bigBlind: state.bigBlind || 20,
			smallBlind: state.smallBlind || 10,
			holeCards: (hero.holeCards || []).slice(0, 2),
			position: hero.dealer ? "BTN" : hero.smallBlind ? "SB" : hero.bigBlind ? "BB" : "",
			players: (state.players || []).length,
			board: [],
			actions: [],
			vpip: false, pfr: false, sawFlop: false, sawTurn: false,
			wentShowdown: false, allIn: false, folded: false,
			maxPhase: 0
		};
	}

	function updateHand(state, hero) {
		if (!pending || state.handId !== pending.handId) return;
		var actions = heroActions(state, pending.handId);
		pending.actions = actions.map(function (item) {
			return {
				phase: item.phase, action: item.action, amount: item.amount || 0,
				needToCall: item.needToCall || 0,
				potOdds: Math.round((item.potOdds || 0) * 1000) / 10
			};
		});
		for (var index = 0; index < actions.length; index += 1) {
			var act = actions[index];
			if (act.phase === "preflop") {
				if (act.action === "call" || act.action === "raise" || act.action === "allin") pending.vpip = true;
				if (act.action === "raise" || act.action === "allin") pending.pfr = true;
			}
			if (act.action === "allin") pending.allIn = true;
			if (act.action === "fold") {
				pending.folded = true;
				if (act.phase === "preflop") data.stats.foldsPreflop += 0; else data.stats.foldsPostflop += 0;
			}
		}
		var phase = state.currentPhaseIndex || 0;
		if (phase > pending.maxPhase) pending.maxPhase = phase;
		if (phase >= 1 && !pending.folded) pending.sawFlop = true;
		if (phase >= 2 && !pending.folded) pending.sawTurn = true;
		if (phase >= 4) pending.wentShowdown = true;
		pending.board = (state.communityCards || []).slice();
		pending.pot = state.pot || 0;
	}

	function finishHand(state, hero) {
		if (!pending) return;
		var record = pending;
		pending = null;

		var endStack = (hero && hero.chips) || 0;
		var netChips = endStack - record.startStack;
		var netBB = record.bigBlind ? netChips / record.bigBlind : 0;
		var cardCount = record.holeCards.filter(Boolean).length;

		var hand = {
			id: record.handId,
			at: new Date(record.startedAt).toISOString(),
			holeCards: record.holeCards,
			board: record.board,
			position: record.position,
			players: record.players,
			blinds: record.smallBlind + "/" + record.bigBlind,
			actions: record.actions,
			pot: record.pot || 0,
			netBB: Math.round(netBB * 100) / 100,
			netChips: netChips,
			vpip: record.vpip, pfr: record.pfr,
			sawFlop: record.sawFlop, wentShowdown: record.wentShowdown,
			allIn: record.allIn, folded: record.folded,
			won: netChips > 0,
			favorite: false
		};

		if (!cardCount) return;

		data.hands.push(hand);

		var stats = data.stats;
		stats.hands += 1;
		stats.netChips += netChips;
		stats.netBB += netBB;
		if (hand.won) stats.handsWon += 1;
		if (record.vpip) stats.vpipHands += 1;
		if (record.pfr) stats.pfrHands += 1;
		if (record.sawFlop) { stats.flopsSeen += 1; if (hand.won) stats.flopsWon += 1; }
		if (record.wentShowdown) { stats.showdowns += 1; if (hand.won) stats.showdownsWon += 1; }
		if (record.allIn) { stats.allIns += 1; if (hand.won) stats.allInWon += 1; }
		if (record.folded) { stats.folds += 1; if (record.maxPhase === 0) stats.foldsPreflop += 1; else stats.foldsPostflop += 1; }
		for (var index = 0; index < record.actions.length; index += 1) {
			var action = record.actions[index].action;
			if (action === "call") stats.calls += 1;
			else if (action === "raise" || action === "allin") stats.raises += 1;
			else if (action === "check") stats.checks += 1;
		}
		if (record.pot > stats.biggestPot) stats.biggestPot = record.pot;

		save(false);
		globalThis.dispatchEvent(new CustomEvent("feltwise:careerchange"));
	}

	function tick() {
		var state = getState();
		if (!state) return;
		var hero = getHero(state);
		if (!hero || !state.handInProgress) {
			if (pending && state && !state.handInProgress && getHero(state)) finishHand(state, getHero(state));
			return;
		}
		var hasCards = (hero.holeCards || []).filter(Boolean).length === 2;
		if (!hasCards) return;

		if (!pending) { beginHand(state, hero); updateHand(state, hero); return; }
		if (pending.handId !== state.handId) {
			finishHand(state, hero);
			beginHand(state, hero);
			updateHand(state, hero);
			return;
		}
		updateHand(state, hero);
	}

	/* ----------------------------- export helpers ----------------------------- */

	function percent(part, total) {
		return total ? Math.round((part / total) * 1000) / 10 : 0;
	}

	function buildSummary() {
		var stats = data.stats;
		var hands = stats.hands || 0;
		return {
			hands: hands,
			bbPer100: hands ? Math.round((stats.netBB / hands) * 100 * 10) / 10 : 0,
			vpip: percent(stats.vpipHands, hands),
			pfr: percent(stats.pfrHands, hands),
			aggression: stats.calls ? Math.round((stats.raises / stats.calls) * 100) / 100 : stats.raises,
			wonAtShowdown: percent(stats.showdownsWon, stats.showdowns),
			showdownRate: percent(stats.showdowns, hands),
			flopRate: percent(stats.flopsSeen, hands),
			flopWin: percent(stats.flopsWon, stats.flopsSeen),
			allInWin: percent(stats.allInWon, stats.allIns),
			netBB: Math.round(stats.netBB * 100) / 100,
			netChips: stats.netChips,
			biggestPot: stats.biggestPot,
			handsWon: stats.handsWon,
			handsWonRate: percent(stats.handsWon, hands)
		};
	}

	function cardText(card) {
		if (!card) return "??";
		var suits = { C: "♣", D: "♦", H: "♥", S: "♠" };
		return String(card[0]) + (suits[card[1]] || card[1]);
	}

	function exportJSON(options) {
		var settings = options || {};
		var hands = settings.favoritesOnly ? data.hands.filter(function (hand) { return hand.favorite; }) : data.hands;
		if (settings.limit) hands = hands.slice(-settings.limit);
		return JSON.stringify({
			app: "Feltwise",
			exportedAt: new Date().toISOString(),
			summary: buildSummary(),
			handCount: hands.length,
			hands: hands
		}, null, 2);
	}

	function exportMarkdown(options) {
		var settings = options || {};
		var summary = buildSummary();
		var hands = settings.favoritesOnly ? data.hands.filter(function (hand) { return hand.favorite; }) : data.hands;
		if (settings.limit) hands = hands.slice(-settings.limit);

		var lines = [];
		lines.push("# Feltwise 德州扑克复盘导出");
		lines.push("");
		lines.push("请作为德州扑克教练，分析下面的牌局记录：");
		lines.push("");
		lines.push("1. 指出重复出现的技术漏洞，并按影响大小排序。");
		lines.push("2. 针对每一手标记为关键的牌局，给出更优的替代打法与理由。");
		lines.push("3. 结合底池赔率、位置和牌力，说明哪些决定是 -EV。");
		lines.push("4. 给出下一阶段最值得练习的三个具体方向。");
		lines.push("");
		lines.push("## 总览数据");
		lines.push("");
		lines.push("| 指标 | 数值 |");
		lines.push("| --- | --- |");
		lines.push("| 总手数 | " + summary.hands + " |");
		lines.push("| 每百手 bb | " + summary.bbPer100 + " |");
		lines.push("| VPIP 入池率 | " + summary.vpip + "% |");
		lines.push("| PFR 翻前加分 | " + summary.pfr + "% |");
		lines.push("| 激进度 | " + summary.aggression + " |");
		lines.push("| 翻牌率 | " + summary.flopRate + "% |");
		lines.push("| 摊牌率 | " + summary.showdownRate + "% |");
		lines.push("| 摊牌胜率 | " + summary.wonAtShowdown + "% |");
		lines.push("| All-in 胜率 | " + summary.allInWin + "% |");
		lines.push("| 净盈亏 | " + summary.netBB + " bb |");
		lines.push("");
		lines.push("## 牌局记录（" + hands.length + " 手）");
		lines.push("");
		hands.forEach(function (hand, index) {
			lines.push("### 第 " + (index + 1) + " 手 · " + hand.at);
			lines.push("");
			lines.push("- 位置：" + (hand.position || "未知") + " · 人数：" + hand.players + " · 盲注：" + hand.blinds);
			lines.push("- 手牌：" + hand.holeCards.map(cardText).join(" "));
			lines.push("- 公共牌：" + (hand.board && hand.board.length ? hand.board.map(cardText).join(" ") : "未发"));
			var actionText = (hand.actions || []).map(function (action) {
				return action.phase + " " + action.action + (action.amount ? " " + action.amount : "") + "（赔率 " + action.potOdds + "%）";
			}).join(" → ");
			lines.push("- 行动：" + (actionText || "无记录"));
			lines.push("- 结果：" + (hand.won ? "盈利" : "亏损") + " " + hand.netBB + " bb · 底池 " + hand.pot);
			lines.push("- 标记：VPIP=" + hand.vpip + " PFR=" + hand.pfr + " 看翻牌=" + hand.sawFlop + " 摊牌=" + hand.wentShowdown + " All-in=" + hand.allIn);
			if (hand.favorite) lines.push("- ⭐ 已收藏（重点分析）");
			lines.push("");
		});
		return lines.join("\n");
	}

	function exportPrompt() {
		return [
			"请以德州扑克教练的身份，基于我导出的 Feltwise 牌局数据做一次系统性复盘。",
			"",
			"要求：",
			"1. 按漏洞影响大小排序，最多指出 5 个问题。",
			"2. 每个问题给出至少 2 手证据牌局。",
			"3. 针对 -EV 跟注，用底池赔率说明应该弃牌的理由。",
			"4. 输出一份下一阶段的训练计划，包含 3 个可量化目标。",
			"",
			"下面是我粘贴的牌局数据："
		].join("\n");
	}

	globalThis.feltwiseCareer = {
		getData: function () { return data; },
		getSummary: buildSummary,
		toggleFavorite: function (handId) {
			for (var index = data.hands.length - 1; index >= 0; index -= 1) {
				if (data.hands[index].id === handId) {
					data.hands[index].favorite = !data.hands[index].favorite;
					save(true);
					globalThis.dispatchEvent(new CustomEvent("feltwise:careerchange"));
					return data.hands[index].favorite;
				}
			}
			return null;
		},
		exportJSON: exportJSON,
		exportMarkdown: exportMarkdown,
		exportPrompt: exportPrompt,
		clear: function () {
			data = { version: 1, stats: emptyStats(), hands: [] };
			pending = null;
			save(true);
			globalThis.dispatchEvent(new CustomEvent("feltwise:careerchange"));
		}
	};

	function start() {
		globalThis.addEventListener("poker:statechange", tick);
		globalThis.addEventListener("poker:ready", tick);
		setInterval(tick, 1000);
		tick();
	}

	if (typeof globalThis.poker !== "undefined") start();
	else globalThis.addEventListener("poker:ready", start, { once: true });
})();
