/* Career page: reads the local Feltwise career store and renders stats,
   the hand collection and AI-ready exports. */
(function () {
	"use strict";

	const STORAGE_KEY = "feltwise:career:v1";
	const $ = (selector) => document.querySelector(selector);

	function load() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			const parsed = raw ? JSON.parse(raw) : null;
			if (!parsed || typeof parsed !== "object") return { stats: {}, hands: [] };
			if (!parsed.stats) parsed.stats = {};
			if (!Array.isArray(parsed.hands)) parsed.hands = [];
			return parsed;
		} catch (error) {
			return { stats: {}, hands: [] };
		}
	}

	function save(data) {
		try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (error) { /* ignore */ }
	}

	let data = load();
	let favoritesOnly = false;

	const percent = (part, total) => (total ? Math.round((part / total) * 1000) / 10 : 0);
	const num = (value, fallback) => (Number.isFinite(value) ? value : fallback || 0);

	function summary() {
		const s = data.stats || {};
		const hands = num(s.hands, 0);
		return {
			hands,
			bbPer100: hands ? Math.round((num(s.netBB, 0) / hands) * 100 * 10) / 10 : 0,
			vpip: percent(num(s.vpipHands, 0), hands),
			vpipWin: percent(num(s.handsWon, 0), num(s.vpipHands, 0)),
			pfr: percent(num(s.pfrHands, 0), hands),
			aggression: num(s.calls, 0) ? Math.round((num(s.raises, 0) / s.calls) * 100) / 100 : num(s.raises, 0),
			allInWin: percent(num(s.allInWon, 0), num(s.allIns, 0)),
			preflopWin: percent(num(s.handsWon, 0), hands),
			flopRate: percent(num(s.flopsSeen, 0), hands),
			flopWin: percent(num(s.flopsWon, 0), num(s.flopsSeen, 0)),
			showdownRate: percent(num(s.showdowns, 0), hands),
			showdownWin: percent(num(s.showdownsWon, 0), num(s.showdowns, 0)),
			netBB: Math.round(num(s.netBB, 0) * 100) / 100,
			handsWon: num(s.handsWon, 0),
			biggestPot: num(s.biggestPot, 0),
		};
	}

	const suitMap = { C: "♣", D: "♦", H: "♥", S: "♠" };
	const cardText = (card) => (card ? `${card[0]}${suitMap[card[1]] || card[1]}` : "??");
	const cardsText = (cards) => (cards && cards.length ? cards.filter(Boolean).map(cardText).join(" ") : "—");

	function renderStats() {
		const s = summary();
		const bb = $("#bb-per-100");
		bb.textContent = `${s.bbPer100 > 0 ? "+" : ""}${s.bbPer100}bb`;
		bb.classList.toggle("neg", s.bbPer100 < 0);
		bb.classList.toggle("amber", s.bbPer100 === 0);
		$("#total-hands").textContent = s.hands;
		$("#vpip").textContent = `${s.vpip}%`;
		$("#vpip-win").textContent = `${s.vpipWin}%`;
		$("#aggression").textContent = s.aggression;
		$("#allin-win").textContent = `${s.allInWin}%`;
		$("#pfr").textContent = `${s.pfr}%`;
		$("#preflop-win").textContent = `${s.preflopWin}%`;
		$("#flop-rate").textContent = `${s.flopRate}%`;
		$("#flop-win").textContent = `${s.flopWin}%`;
		$("#showdown-rate").textContent = `${s.showdownRate}%`;
		$("#showdown-win").textContent = `${s.showdownWin}%`;
		$("#net-bb").textContent = `${s.netBB > 0 ? "+" : ""}${s.netBB}`;
		$("#hands-won").textContent = s.handsWon;
		$("#biggest-pot").textContent = s.biggestPot;
	}

	const PHASE_ORDER = ["preflop", "flop", "turn", "river", "showdown"];
	const PHASE_LABEL = { preflop: "翻前", flop: "翻牌", turn: "转牌", river: "河牌", showdown: "摊牌" };

	function actionLine(actions) {
		return actions.map((item) => {
			const name = item.player || (item.isHuman ? "我" : "对手");
			let text = `${name} `;
			switch (item.action) {
				case "fold": text += "弃牌"; break;
				case "check": text += "过牌"; break;
				case "call": text += `跟注 ${item.amount}`; break;
				case "raise": text += `加注到 ${item.amount}`; break;
				case "allin": text += `全下 ${item.amount}`; break;
				default: text += item.action;
			}
			if (item.needToCall > 0 && item.action === "call") text += `（底池赔率 ${item.potOdds}%）`;
			return text;
		}).join(" · ");
	}

	function boardForPhase(phase, actions, finalBoard) {
		const first = (actions || []).find((item) => item.phase === phase);
		if (first && Array.isArray(first.board) && first.board.length) return first.board;
		const need = { flop: 3, turn: 4, river: 5 }[phase];
		if (need && Array.isArray(finalBoard)) return finalBoard.slice(0, need);
		return Array.isArray(finalBoard) ? finalBoard : [];
	}

	function groupByStreet(actions) {
		const groups = {};
		actions.forEach((item) => {
			const phase = PHASE_ORDER.indexOf(item.phase) === -1 ? "preflop" : item.phase;
			if (!groups[phase]) groups[phase] = [];
			groups[phase].push(item);
		});
		return groups;
	}

	function renderHands() {
		const list = $("#hand-list");
		const hands = data.hands.slice().reverse();
		const shown = favoritesOnly ? hands.filter((hand) => hand.favorite) : hands;
		const favCount = data.hands.filter((hand) => hand.favorite).length;
		$("#fav-count").textContent = String(favCount);
		if (!shown.length) {
			list.innerHTML = '<div class="empty">还没有牌局记录。回到牌桌打几手，这里会自动累积。</div>';
			return;
		}
		list.innerHTML = shown.slice(0, 300).map((hand) => {
			const net = hand.netBB > 0 ? `+${hand.netBB}` : `${hand.netBB}`;
			const groups = groupByStreet(hand.actions || []);
			const streets = PHASE_ORDER
				.filter((phase) => groups[phase] && groups[phase].length)
				.map((phase) => `<div class="hand-street"><b>${PHASE_LABEL[phase]}</b>${phase !== "preflop" ? `[${cardsText(boardForPhase(phase, hand.actions, hand.board))}] ` : ""}${actionLine(groups[phase])}</div>`)
				.join("");
			const resultLine = hand.result
				? hand.result
				: hand.folded ? "我弃牌" : (hand.won ? "我赢下底池" : "我输掉底池");
			const shownCards = (hand.shownCards || [])
				.map((entry) => `${entry.name} ${cardsText(entry.holeCards)}`)
				.join(" · ");
			return `<div class="hand-item" data-id="${hand.id}">
				<div class="hand-top">
					<span class="hand-cards">${cardsText(hand.holeCards)}</span>
					<span class="hand-net ${hand.netBB >= 0 ? "pos" : "neg"}">${net} bb</span>
					<button class="star ${hand.favorite ? "on" : ""}" data-fav="${hand.id}" title="收藏">${hand.favorite ? "★" : "☆"}</button>
				</div>
				<div class="hand-meta">${hand.position || "—"} · ${hand.players || 0}人 · 盲注 ${hand.blinds || "—"} · 公共牌 ${cardsText(hand.board)}</div>
				<div class="hand-meta">底池 ${hand.pot || 0}${hand.potWon ? ` · 我赢得 ${hand.potWon}` : ""}</div>
				${streets}
				<div class="hand-meta">结果：${resultLine}</div>
				${shownCards ? `<div class="hand-meta">亮牌：${shownCards}</div>` : ""}
			</div>`;
		}).join("");
	}

	function download(filename, text) {
		try {
			const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = filename;
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			setTimeout(() => URL.revokeObjectURL(url), 1500);
			return true;
		} catch (error) {
			return false;
		}
	}

	function summaryLine() {
		const s = summary();
		return `${data.hands.length} 手 · 每百手 ${s.bbPer100}bb · 入池率 ${s.vpip}%`;
	}

	function markdown(options) {
		const opts = options || {};
		const s = summary();
		const source = opts.favoritesOnly ? data.hands.filter((hand) => hand.favorite) : data.hands;
		const hands = opts.limit ? source.slice(-opts.limit) : source;

		const lines = [];
		lines.push("# Feltwise 德州扑克复盘导出");
		lines.push("");
		lines.push("请作为德州扑克教练分析下面的牌局记录：");
		lines.push("");
		lines.push("1. 指出重复出现的技术漏洞，并按影响大小排序。");
		lines.push("2. 对关键牌局给出更优替代打法和理由。");
		lines.push("3. 结合底池赔率、位置与牌力，说明哪些决定是 -EV。");
		lines.push("4. 指出对手读牌上的错误，以及被我忽略的下注模式。");
		lines.push("5. 给出下一阶段最值得练习的三个方向。");
		lines.push("");
		lines.push("## 总览");
		lines.push("");
		lines.push("| 指标 | 数值 |");
		lines.push("| --- | --- |");
		lines.push(`| 总手数 | ${s.hands} |`);
		lines.push(`| 每百手 bb | ${s.bbPer100} |`);
		lines.push(`| VPIP 入池率 | ${s.vpip}% |`);
		lines.push(`| PFR 翻前加分 | ${s.pfr}% |`);
		lines.push(`| 激进度 | ${s.aggression} |`);
		lines.push(`| 翻牌率 | ${s.flopRate}% |`);
		lines.push(`| 摊牌率 | ${s.showdownRate}% |`);
		lines.push(`| 摊牌胜率 | ${s.showdownWin}% |`);
		lines.push(`| All-in 胜率 | ${s.allInWin}% |`);
		lines.push(`| 净盈亏 | ${s.netBB} bb |`);
		lines.push("");
		lines.push(`## 牌局记录（${hands.length} 手，按时间从早到晚）`);
		lines.push("");

		hands.forEach((hand, index) => {
			const groups = groupByStreet(hand.actions || []);
			const when = (hand.at || "").replace("T", " ").slice(0, 19);
			lines.push(`### 第 ${index + 1} 手 · ${when}${hand.favorite ? " ⭐" : ""}`);
			lines.push("");
			lines.push(`- 位置：${hand.position || "未知"} · ${hand.players || 0} 人桌 · 盲注 ${hand.blinds || "未知"}`);
			if (hand.stacks && hand.stacks.length) lines.push(`- 起始筹码：${hand.stacks.join(" · ")}`);
			lines.push(`- 我的手牌：${cardsText(hand.holeCards)}`);
			PHASE_ORDER.forEach((phase) => {
				if (!groups[phase] || !groups[phase].length) return;
				const boardNow = phase !== "preflop" ? ` [${cardsText(boardForPhase(phase, hand.actions, hand.board))}]` : "";
				lines.push(`- ${PHASE_LABEL[phase]}${boardNow}：${actionLine(groups[phase])}`);
			});
			lines.push(`- 底池：${hand.pot || 0}${hand.potWon ? ` · 我赢得 ${hand.potWon}` : ""}`);
			const resultLine = hand.result || (hand.folded ? "我弃牌" : (hand.won ? "我赢下底池" : "我输掉底池"));
			lines.push(`- 结果：${resultLine}`);
			if (hand.shownCards && hand.shownCards.length) {
				lines.push(`- 亮牌：${hand.shownCards.map((entry) => `${entry.name} ${cardsText(entry.holeCards)}`).join(" · ")}`);
			}
			lines.push(`- 标记：VPIP=${hand.vpip} PFR=${hand.pfr} 看翻牌=${hand.sawFlop} 摊牌=${hand.wentShowdown} All-in=${hand.allIn} 弃牌=${hand.folded}`);
			lines.push("");
		});
		return lines.join("\n");
	}

	function showExport(text, info) {
		$("#export-out").classList.remove("hidden");
		$("#export-text").value = text;
		$("#export-info").textContent = info;
	}

	function copyText(text) {
		try {
			const area = document.createElement("textarea");
			area.value = text;
			area.style.position = "fixed";
			area.style.opacity = "0";
			document.body.appendChild(area);
			area.select();
			area.setSelectionRange(0, text.length);
			const ok = document.execCommand("copy");
			document.body.removeChild(area);
			if (!ok && navigator.clipboard) navigator.clipboard.writeText(text);
		} catch (error) { /* ignore */ }
	}

	function wire() {
		document.querySelectorAll(".tabs button").forEach((button) => {
			button.addEventListener("click", () => {
				const tab = button.dataset.tab;
				document.querySelectorAll(".tabs button").forEach((item) => item.classList.toggle("active", item === button));
				document.querySelectorAll(".pane").forEach((pane) => pane.classList.toggle("hidden", pane.dataset.pane !== tab));
			});
		});

		$("#refresh").addEventListener("click", () => { data = load(); renderStats(); renderHands(); });

		$("#hand-list").addEventListener("click", (event) => {
			const button = event.target.closest("[data-fav]");
			if (!button) return;
			const id = Number(button.dataset.fav);
			data.hands.forEach((hand) => { if (hand.id === id) hand.favorite = !hand.favorite; });
			save(data);
			renderHands();
		});

		$("#fav-only").addEventListener("change", (event) => {
			favoritesOnly = event.target.checked;
			renderHands();
		});

		$("#export-md").addEventListener("click", () => {
			const text = markdown({});
			showExport(text, summaryLine());
			download(`feltwise-hands-${Date.now()}.md`, text);
		});

		$("#export-json").addEventListener("click", () => {
			const text = JSON.stringify({ app: "Feltwise", exportedAt: new Date().toISOString(), summary: summary(), hands: data.hands }, null, 2);
			showExport(text, summaryLine());
			download(`feltwise-hands-${Date.now()}.json`, text);
		});

		$("#export-fav").addEventListener("click", () => {
			const favorites = data.hands.filter((hand) => hand.favorite);
			if (!favorites.length) { showExport("还没有收藏的牌局。在下方点 ☆ 收藏几手后再导出。", "无收藏"); return; }
			const text = markdown({ favoritesOnly: true });
			showExport(text, `${favorites.length} 手收藏`);
			download(`feltwise-favorites-${Date.now()}.md`, text);
		});

		$("#copy-prompt").addEventListener("click", () => {
			const prompt = [
				"请以德州扑克教练的身份，基于我导出的 Feltwise 牌局数据做系统性复盘。",
				"",
				"要求：",
				"1. 按漏洞影响大小排序，最多指出 5 个问题。",
				"2. 每个问题给出至少 2 手证据牌局。",
				"3. 针对 -EV 跟注，用底池赔率说明应该弃牌的理由。",
				"4. 指出对手的下注模式以及我漏掉的读牌信息。",
				"5. 输出下一阶段训练计划，包含 3 个可量化目标。",
				"",
				"下面是我粘贴的牌局数据："
			].join("\n");
			showExport(prompt, "分析提示词");
			copyText(prompt);
		});

		$("#copy-export").addEventListener("click", () => copyText($("#export-text").value));

		$("#clear-data").addEventListener("click", () => {
			if (!confirm("确定清空所有生涯数据和收藏？此操作不可恢复。")) return;
			data = { stats: {}, hands: [] };
			save(data);
			renderStats();
			renderHands();
			$("#export-out").classList.add("hidden");
		});
	}

	wire();
	renderStats();
	renderHands();
	setInterval(() => { data = load(); renderStats(); renderHands(); }, 3000);
})();
