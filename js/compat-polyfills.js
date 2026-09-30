/* ---------------------------------------------------------------------------
 * iOS 13 / legacy Safari compatibility layer.
 * Loaded before every bundle so older WebKit never hits a missing API.
 * ------------------------------------------------------------------------- */
(function () {
	"use strict";

	var globalObject = typeof globalThis !== "undefined" ? globalThis
		: typeof window !== "undefined" ? window
		: typeof self !== "undefined" ? self
		: this;

	if (typeof globalObject.globalThis === "undefined") {
		globalObject.globalThis = globalObject;
	}

	// Element.replaceChildren (Safari 14)
	if (typeof Element !== "undefined" && !Element.prototype.replaceChildren) {
		Element.prototype.replaceChildren = function () {
			while (this.firstChild) this.removeChild(this.firstChild);
			for (var index = 0; index < arguments.length; index += 1) {
				var node = arguments[index];
				if (node === null || node === undefined) continue;
				this.appendChild(typeof node === "string" ? document.createTextNode(node) : node);
			}
		};
	}
	if (typeof DocumentFragment !== "undefined" && !DocumentFragment.prototype.replaceChildren) {
		DocumentFragment.prototype.replaceChildren = Element.prototype.replaceChildren;
	}

	// Node.append / prepend (Safari 10+ has append, keep guard anyway)
	if (typeof Element !== "undefined" && !Element.prototype.append) {
		Element.prototype.append = function () {
			for (var index = 0; index < arguments.length; index += 1) {
				var node = arguments[index];
				if (node === null || node === undefined) continue;
				this.appendChild(typeof node === "string" ? document.createTextNode(node) : node);
			}
		};
	}
	if (typeof Element !== "undefined" && !Element.prototype.prepend) {
		Element.prototype.prepend = function () {
			for (var index = arguments.length - 1; index >= 0; index -= 1) {
				var node = arguments[index];
				if (node === null || node === undefined) continue;
				this.insertBefore(typeof node === "string" ? document.createTextNode(node) : node, this.firstChild);
			}
		};
	}

	// Element.closest (Safari 9 has it, guard for safety)
	if (typeof Element !== "undefined" && !Element.prototype.closest) {
		Element.prototype.closest = function (selector) {
			var node = this;
			while (node && node.nodeType === 1) {
				if (node.matches ? node.matches(selector) : node.msMatchesSelector(selector)) return node;
				node = node.parentElement || node.parentNode;
			}
			return null;
		};
	}

	// Array.prototype.at (Safari 15.4)
	if (!Array.prototype.at) {
		Array.prototype.at = function (index) {
			var length = this.length >>> 0;
			if (!length) return undefined;
			var relative = Number(index) || 0;
			var target = relative < 0 ? length + relative : relative;
			return target < 0 || target >= length ? undefined : this[target];
		};
	}

	// String.prototype.replaceAll (Safari 13.1)
	if (!String.prototype.replaceAll) {
		String.prototype.replaceAll = function (search, replacement) {
			if (search instanceof RegExp) return String(this).replace(new RegExp(search.source, search.flags.indexOf("g") === -1 ? search.flags + "g" : search.flags), replacement);
			return String(this).split(String(search)).join(typeof replacement === "function" ? replacement(String(search)) : replacement);
		};
	}

	// Object.fromEntries (Safari 12.1)
	if (!Object.fromEntries) {
		Object.fromEntries = function (entries) {
			var result = {};
			var list = typeof entries[Symbol.iterator] === "function" ? Array.from(entries) : entries;
			for (var index = 0; index < list.length; index += 1) {
				result[list[index][0]] = list[index][1];
			}
			return result;
		};
	}

	// Object.entries fallback is present since Safari 10.1; no action needed.

	// Array.flat / flatMap (Safari 12)
	if (!Array.prototype.flat) {
		Array.prototype.flat = function (depth) {
			var targetDepth = depth === undefined ? 1 : Number(depth);
			return targetDepth < 1 ? Array.prototype.slice.call(this) : Array.prototype.reduce.call(this, function (accumulator, value) {
				return accumulator.concat(Array.isArray(value) ? value.flat(targetDepth - 1) : value);
			}, []);
		};
	}
	if (!Array.prototype.flatMap) {
		Array.prototype.flatMap = function (callback, thisArg) {
			return Array.prototype.map.call(this, callback, thisArg).flat();
		};
	}

	// Promise.allSettled (Safari 13)
	if (typeof Promise !== "undefined" && !Promise.allSettled) {
		Promise.allSettled = function (iterable) {
			return Promise.all(Array.from(iterable).map(function (item) {
				return Promise.resolve(item).then(function (value) {
					return { status: "fulfilled", value: value };
				}, function (reason) {
					return { status: "rejected", reason: reason };
				});
			}));
		};
	}

	// queueMicrotask (Safari 12.1)
	if (typeof globalObject.queueMicrotask !== "function") {
		globalObject.queueMicrotask = function (callback) {
			if (typeof Promise !== "undefined") {
				Promise.resolve().then(callback).catch(function (error) {
					setTimeout(function () { throw error; }, 0);
				});
			} else {
				setTimeout(callback, 0);
			}
		};
	}

	// CustomEvent (Safari 9 has it; guard anyway)
	if (typeof globalObject.CustomEvent !== "function" && typeof document !== "undefined") {
		globalObject.CustomEvent = function (type, options) {
			var event = document.createEvent("CustomEvent");
			event.initCustomEvent(type, Boolean(options && options.bubbles), Boolean(options && options.cancelable), options && options.detail);
			return event;
		};
		globalObject.CustomEvent.prototype = globalObject.Event.prototype;
	}

	// matchMedia guard
	if (typeof globalObject.matchMedia !== "function" && typeof document !== "undefined") {
		globalObject.matchMedia = function () {
			return {
				matches: false,
				addListener: function () {},
				removeListener: function () {},
				addEventListener: function () {},
				removeEventListener: function () {},
			};
		};
	}

	// requestAnimationFrame guard
	if (typeof globalObject.requestAnimationFrame !== "function") {
		globalObject.requestAnimationFrame = function (callback) {
			return globalObject.setTimeout(function () { callback(Date.now()); }, 16);
		};
		globalObject.cancelAnimationFrame = function (handle) {
			globalObject.clearTimeout(handle);
		};
	}

	// Pointer events are missing before iOS 13.4; approximate with touch handling.
	if (!globalObject.PointerEvent && typeof document !== "undefined") {
		var synthesize = function (type, touch) {
			try {
				return new MouseEvent(type, {
					bubbles: true,
					cancelable: true,
					clientX: touch.clientX,
					clientY: touch.clientY,
					screenX: touch.screenX,
					screenY: touch.screenY,
				});
			} catch (error) {
				var fallback = document.createEvent("MouseEvents");
				fallback.initMouseEvent(type, true, true, globalObject, 1, touch.screenX, touch.screenY, touch.clientX, touch.clientY, false, false, false, false, 0, null);
				return fallback;
			}
		};
		document.addEventListener("touchstart", function (event) {
			if (event.touches.length !== 1) return;
			var touch = event.touches[0];
			var target = event.target;
			if (!target || !target.dispatchEvent) return;
			target.dispatchEvent(synthesize("pointerdown", touch));
		}, true);
		document.addEventListener("touchend", function (event) {
			if (!event.changedTouches.length) return;
			var touch = event.changedTouches[0];
			var target = event.target;
			if (!target || !target.dispatchEvent) return;
			target.dispatchEvent(synthesize("pointerup", touch));
			target.dispatchEvent(synthesize("click", touch));
		}, true);
	}
})();
