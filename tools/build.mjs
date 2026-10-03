/* ---------------------------------------------------------------------------
 * Feltwise build: transpile modern syntax down to iOS 13 / Safari 13.
 *
 * Why: iPhone 6s on iOS 13.0-13.3 ships Safari without optional chaining (?.) or
 * nullish coalescing (??). The source uses both heavily, so older devices failed
 * to parse the bundle and buttons looked "dead". esbuild rewrites the syntax and
 * the polyfill banner fills in the missing DOM APIs.
 * ------------------------------------------------------------------------- */
import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");

const entries = {
	"app": "js/app.js",
	"inlineAdvisor": "js/inlineAdvisor.js",
	"advisorPage": "js/advisorPage.js",
	"careerStore": "js/careerStore.js",
	"careerPage": "js/careerPage.js",
	"singleView": "js/singleView.js",
	"remoteTable": "js/remoteTable.js",
	"equityWorker": "js/equityWorker.js",
};

const staticFiles = [
	"css", "icons", "cards", "img", "social",
	"index.html", "hole-cards.html", "remoteTable.html", "advisor.html", "career.html",
	"manifest.json", "service-worker.js", "js/compat-polyfills.js", "js/version.js",
	"README.md", "LICENSE.txt", "README_FELTWISE.md", ".nojekyll",
];

const banner = "/* Feltwise iOS13 build */\n";

async function copyStatic() {
	for (const entry of staticFiles) {
		const source = path.join(root, entry);
		const target = path.join(dist, entry);
		try {
			await cp(source, target, { recursive: true });
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	// Pure data modules used at runtime via import inside bundles are handled by
	// esbuild, but keep test-free helper modules that are fetched directly.
	for (const extra of ["js/shared", "js/pokersolver.js", "js/qr-creator.js"]) {
		try {
			await cp(path.join(root, extra), path.join(dist, extra), { recursive: true });
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
}

/* Short content hash so every deploy gets a fresh URL (browsers cache classic
   scripts aggressively once the version query is missing). */
async function contentHash(fileName) {
	const buffer = await readFile(path.join(dist, fileName));
	let hash = 0;
	for (let index = 0; index < buffer.length; index += 1) {
		hash = (hash * 31 + buffer[index]) >>> 0;
	}
	return hash.toString(36).slice(0, 8);
}

async function rewriteHtml(file, stamps) {
	const filePath = path.join(dist, file);
	let html;
	try {
		html = await readFile(filePath, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}

	// Inject the compatibility layer before any bundled script runs.
	if (html.indexOf("compat-polyfills.js") === -1) {
		html = html.replace(
			/<script\b[^>]*src="\.\/js\/(app|inlineAdvisor|advisorPage|careerStore|careerPage|singleView|remoteTable)\.js[^"]*"[^>]*><\/script>/,
			(match) => `<script src="./js/compat-polyfills.js"></script>\n\t${match}`,
		);
	}

	// Bundles are plain classic scripts now: drop type="module" and stamp them
	// with a content hash so a deploy can never serve a stale bundle.
	html = html.replace(
		/<script([^>]*?)src="\.\/js\/(app|inlineAdvisor|advisorPage|careerStore|careerPage|singleView|remoteTable)\.js[^"]*"([^>]*)><\/script>/g,
		(_match, before, name, after) => {
			const cleanedBefore = before.replace(/\s*type="module"/, "").replace(/\s*defer/, "");
			const cleanedAfter = after.replace(/\s*defer/, "");
			const stamp = stamps.scripts[name] || "0";
			return `<script${cleanedBefore}src="./js/${name}.js?v=${stamp}"${cleanedAfter}></script>`;
		},
	);

	if (html.indexOf("compat-polyfills.js") !== -1) {
		const stamp = stamps.scripts.polyfills || "0";
		html = html.replace(/src="\.\/js\/compat-polyfills\.js[^"]*"/, `src="./js/compat-polyfills.js?v=${stamp}"`);
	}

	// Same treatment for stylesheets.
	html = html.replace(/href="(\.\/)?(css\/[a-z-]+\.css)(\?[^"]*)?"/g, (_match, prefix, file2) => {
		const stamp = stamps.styles[file2.replace("css/", "")] || "0";
		return `href="${prefix || ""}${file2}?v=${stamp}"`;
	});

	await writeFile(filePath, html);
}

async function main() {
	await rm(dist, { recursive: true, force: true });
	await mkdir(path.join(dist, "js"), { recursive: true });

	await build({
		entryPoints: Object.fromEntries(Object.entries(entries).map(([name, file]) => [name, path.join(root, file)])),
		outdir: path.join(dist, "js"),
		bundle: true,
		format: "iife",
		target: ["safari13.0", "ios13.0"],
		supported: {
			// iOS 13.0-13.3 Safari lacks these; never leave them in the output.
			"nullish-coalescing": false,
			"optional-chain": false,
			"logical-assignment": false,
			"regexp-lookbehind-assertions": false,
		},
		platform: "browser",
		sourcemap: false,
		minify: true,
		legalComments: "none",
		banner: { js: banner },
		loader: { ".js": "js" },
		logLevel: "warning",
	});

	await copyStatic();

	// Safari 13 can mis-parse `?.5` style ternaries; insert a space so the
	// output never contains the optional-chaining token sequence at all.
	// Must run before hashing so the stamps match the shipped bytes.
	for (const name of Object.keys(entries)) {
		const filePath = path.join(dist, "js", `${name}.js`);
		let code;
		try {
			code = await readFile(filePath, "utf8");
		} catch (error) {
			if (error.code === "ENOENT") continue;
			throw error;
		}
		await writeFile(filePath, code.replace(/\?\.(\d)/g, "? .$1"));
	}

	const stamps = { scripts: {}, styles: {} };
	for (const name of Object.keys(entries)) {
		stamps.scripts[name] = await contentHash(`js/${name}.js`);
	}
	stamps.scripts.polyfills = await contentHash("js/compat-polyfills.js");
	for (const style of ["style.css", "career.css", "advisor.css"]) {
		try {
			stamps.styles[style] = await contentHash(`css/${style}`);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}

	for (const file of ["index.html", "hole-cards.html", "remoteTable.html", "advisor.html", "career.html"]) {
		await rewriteHtml(file, stamps);
	}

	console.log("Feltwise iOS13 build complete -> dist/");
	console.log("asset stamps:", JSON.stringify(stamps));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
