import { BoxModel } from "../src/box";

const COLS = 120;
const BOX_LINES = 30;
const LINE_COUNTS = [50, 200, 500, 1000, 5000];
const ITERATIONS = 10_000;

function fillBox(box: BoxModel, n: number) {
	for (let i = 0; i < n; i++) {
		box.addLine(
			`[${String(i).padStart(4, "0")}] This is a fairly typical log line with some tool output and ANSI content mixed in`,
		);
	}
}

console.log(
	`BoxModel.render() — ${ITERATIONS} calls, ${COLS} cols, ${BOX_LINES} box lines\n`,
);

console.log("Steady-state (no new lines between renders, timer tick case):");
for (const count of LINE_COUNTS) {
	const box = new BoxModel(BOX_LINES);
	fillBox(box, count);

	// Prime the cache
	box.render(COLS);

	// Warmup
	for (let i = 0; i < 100; i++) box.render(COLS);

	const start = performance.now();
	for (let i = 0; i < ITERATIONS; i++) {
		box.render(COLS);
	}
	const elapsed = performance.now() - start;

	const perCall = (elapsed / ITERATIONS) * 1000;
	console.log(
		`  ${String(count).padStart(5)} lines: ${perCall.toFixed(1)}µs/call  (${elapsed.toFixed(1)}ms total)`,
	);
}

console.log("\nWith updateCurrent() each frame (streaming text):");
for (const count of LINE_COUNTS) {
	const box = new BoxModel(BOX_LINES);
	fillBox(box, count);
	box.render(COLS);

	for (let i = 0; i < 100; i++) {
		box.updateCurrent(`streaming token ${i}`);
		box.render(COLS);
	}

	const start = performance.now();
	for (let i = 0; i < ITERATIONS; i++) {
		box.updateCurrent(`streaming token ${i}`);
		box.render(COLS);
	}
	const elapsed = performance.now() - start;

	const perCall = (elapsed / ITERATIONS) * 1000;
	console.log(
		`  ${String(count).padStart(5)} lines: ${perCall.toFixed(1)}µs/call  (${elapsed.toFixed(1)}ms total)`,
	);
}
