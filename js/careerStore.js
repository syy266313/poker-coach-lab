/* ---------------------------------------------------------------------------
 * Feltwise career store
 * Collects lifetime stats and complete per-hand histories for the career page
 * and for exporting hands to an AI. Stored locally, never uploaded.
 * ------------------------------------------------------------------------- */
(function () {
	"use strict";

	var STORAGE_KEY = "feltwise:career:v1";
	var MAX_HANDS = 800;
	var MAX_ACTIONS = 400;

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

	/* Position names relative to the dealer, matching standard table naming. */
	var POSITION_TABLES = {
		2: ["BTN/SB", "BB"],
		3: ["BTN", "SB", "BB"],
		4: ["BTN", "SB", "BB", "CO"],
		5: ["BTN", "SB", "BB", "UTG", "CO"],
		6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
		7: ["BTN", "SB", "BB", "UTG", "UTG+1", "HJ", "CO"],
		8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"],
		9: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "MP+1", "HJ", "CO"]
	};

	function positionLabel(state, hero) {
		var players = (state && state.players) || [];
		var count = players.length;
		if (!count) return "";
		var dealerIndex = -1;
		var heroIndex = -1;
		for (var index = 0; index < count; index += 1) {
			if (players[index].dealer) dealerIndex = index;
			if (players[index] === hero || players[index].seatIndex === hero.seatIndex) heroIndex = index;
		}
		if (dealerIndex === -1 || heroIndex === -1) return "";
		var offset = (heroIndex - dealerIndex + count) % count;
		var table = POSITION_TABLES[count] || POSITION_TABLES[8];
		if (offset < table.length) return table[offset];
		return "Seat " + (offset + 1);
	}

	function actionsForHand(state, handId) {
		var history = (state && state.actionHistory) || [];
		var result = [];
		for (var index = 0; index < history.length; index += 1) {
			var item = history[index];
			if (item && item.handId === handId) result.push(item);
		}
		return result;
	}

	function beginHand(state, hero) {
		var heroSeat = (state.players || []).filter(function (player) {
			return player === hero || player.seatIndex === hero.seatIndex;
		})[0] || hero;

		pending = {
			handId: state.handId,
			startedAt: Date.now(),
			startStack: (hero.chips || 0) + (hero.roundBet || 0),
			bigBlind: state.bigBlind || 20,
			smallBlind: state.smallBlind || 10,
			holeCards: (hero.holeCards || []).slice(0, 2),
			position: positionLabel(state, heroSeat),
			players: (state.players || []).length,
			playerNames: (state.players || []).map(function (player) {
				return player.name + (player.isBot ? "" : "(我)");
			}),
			stackAtStart: (state.players || []).map(function (player) {
				return player.name + ":" + (player.chips || 0);
			}),
			board: [],
			actions: [],
			vpip: false, pfr: false, sawFlop: false,
			wentShowdown: false, allIn: false, folded: false,
			maxPhase: 0,
			potAtEnd: 0
		};
	}

	function updateHand(state, hero) {
		if (!pending || state.handId !== pending.handId) return;

		var raw = actionsForHand(state, pending.handId);
		pending.actions = raw.slice(-MAX_ACTIONS).map(function (item) {
			return {
				phase: item.phase,
				player: item.playerName || "",
				action: item.action,
				amount: item.amount || 0,
				needToCall: item.needToCall || 0,
				potOdds: Math.round((item.potOdds || 0) * 1000) / 10,
				isHuman: item.isHuman === true,
				board: (item.board || []).slice(),
				potAfter: item.pot || 0
			};
		});

		var mine = raw.filter(function (item) { return item.isHuman === true; });
		pending.vpip = false;
		pending.pfr = false;
		for (var index = 0; index < mine.length; index += 1) {
			var act = mine[index];
			if (act.phase === "preflop") {
				if (act.action === "call" || act.action === "raise" || act.action === "allin") pending.vpip = true;
				if (act.action === "raise" || act.action === "allin") pending.pfr = true;
			}
			if (act.action === "allin") pending.allIn = true;
			if (act.action === "fold") pending.folded = true;
		}

		var phase = state.currentPhaseIndex || 0;
		if (phase > pending.maxPhase) pending.maxPhase = phase;
		if (phase >= 1 && !pending.folded) pending.sawFlop = true;
		if (phase >= 4) pending.wentShowdown = true;
		pending.board = (state.communityCards || []).slice();
		if (state.pot > 0) pending.potAtEnd = state.pot;
	}

	function finishHand(state, hero) {
		if (!pending) return;
		var record = pending;
		pending = null;

		if (record.holeCards.filter(Boolean).length < 2) return;

		var endStack = (hero && hero.chips) || 0;
		var netChips = endStack - record.startStack;
		var netBB = record.bigBlind ? netChips / record.bigBlind : 0;

		// Prefer the authoritative showdown summary when it belongs to this hand.
		var summary = globalThis.__feltwiseLastShowdown;
		if (summary && summary.handId !== record.handId) summary = null;

		var potWon = 0;
		var shown = [];
		var resultText = "";
		if (summary) {
			for (var index = 0; index < summary.potResults.length; index += 1) {
				var pot = summary.potResults[index];
				if (pot.players.indexOf(hero.name) !== -1) potWon += pot.amount;
			}
			shown = summary.shownCards || [];
			if (summary.uncontestedWinner) {
				resultText = summary.uncontestedWinner + " 赢得底池（无人跟注）";
			} else if (summary.hadShowdown) {
				resultText = summary.potResults.map(function (pot) {
					return pot.players.join(" & ") + " 以 " + (pot.hand || "未知牌型") + " 赢得 " + pot.amount;
				}).join("；");
			}
		}

		var hand = {
			id: record.handId,
			at: new Date(record.startedAt).toISOString(),
			position: record.position,
			players: record.players,
			playerNames: record.playerNames,
			stacks: record.stackAtStart,
			blinds: record.smallBlind + "/" + record.bigBlind,
			holeCards: record.holeCards,
			board: record.board,
			actions: record.actions,
			pot: summary ? summary.totalPot : record.potAtEnd,
			potWon: potWon,
			netChips: netChips,
			netBB: Math.round(netBB * 100) / 100,
			result: resultText,
			shownCards: shown,
			vpip: record.vpip, pfr: record.pfr,
			sawFlop: record.sawFlop, wentShowdown: record.wentShowdown,
			allIn: record.allIn, folded: record.folded,
			won: summary ? potWon > 0 : netChips > 0,
			favorite: false
		};

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
		if (record.folded) {
			stats.folds += 1;
			if (record.maxPhase === 0) stats.foldsPreflop += 1; else stats.foldsPostflop += 1;
		}
		for (var index2 = 0; index2 < record.actions.length; index2 += 1) {
			if (!record.actions[index2].isHuman) continue;
			var action = record.actions[index2].action;
			if (action === "call") stats.calls += 1;
			else if (action === "raise" || action === "allin") stats.raises += 1;
			else if (action === "check") stats.checks += 1;
		}
		if (hand.pot > stats.biggestPot) stats.biggestPot = hand.pot;

		save(false);
		globalThis.dispatchEvent(new CustomEvent("feltwise:careerchange"));
	}

	function tick() {
		var state = getState();
		if (!state) return;
		var hero = getHero(state);

		if (!state.handInProgress) {
			if (pending && hero) finishHand(state, hero);
			else pending = null;
			return;
		}
		if (!hero) return;
		if ((hero.holeCards || []).filter(Boolean).length < 2) return;

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
