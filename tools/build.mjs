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

async function rewriteHtml(file) {
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

	// Bundles are plain classic scripts now: drop type="module" and cache-busting queries.
	html = html.replace(
		/<script([^>]*?)src="\.\/js\/(app|inlineAdvisor|advisorPage|careerStore|careerPage|singleView|remoteTable)\.js[^"]*"([^>]*)><\/script>/g,
		(_match, before, name, after) => {
			const cleanedBefore = before.replace(/\s*type="module"/, "").replace(/\s*defer/, "");
			const cleanedAfter = after.replace(/\s*defer/, "");
			return `<script${cleanedBefore}src="./js/${name}.js"${cleanedAfter}></script>`;
		},
	);

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
	for (const file of ["index.html", "hole-cards.html", "remoteTable.html", "advisor.html", "career.html"]) {
		await rewriteHtml(file);
	}
	// Safari 13 can mis-parse `?.5` style ternaries; insert a space so the
	// output never contains the optional-chaining token sequence at all.
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

	console.log("Feltwise iOS13 build complete -> dist/");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
