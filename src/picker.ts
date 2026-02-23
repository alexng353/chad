import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { ansi } from "./ansi";
import { listPlans, type PlanSummary } from "./plan";

/** Interactive plan picker TUI. Returns selected plan path or null if cancelled. */
export async function pickPlan(): Promise<string | null> {
	const chadDir = resolve(homedir(), ".chad");
	mkdirSync(chadDir, { recursive: true });

	const allPlans = listPlans(chadDir);
	if (allPlans.length === 0) {
		console.log("no plans found in ~/.chad/");
		return null;
	}

	return new Promise<string | null>((res) => {
		let cursor = 0;
		let filter = "";
		let done = false;

		function filtered(): PlanSummary[] {
			if (!filter) return allPlans;
			const lower = filter.toLowerCase();
			return allPlans.filter((p) => p.name.toLowerCase().includes(lower));
		}

		function renderLine(p: PlanSummary, selected: boolean): string {
			const barWidth = 20;
			const filled =
				p.total > 0 ? Math.round((p.checked / p.total) * barWidth) : 0;
			const bar = `${"█".repeat(filled)}${"░".repeat(barWidth - filled)}`;
			const progress = p.complete
				? ansi.dim(`${ansi.green(bar)} ${p.checked}/${p.total}`)
				: `${ansi.green(bar)} ${p.checked}/${p.total}`;
			const name = p.complete ? ansi.dim(p.name) : p.name;
			const pointer = selected ? ansi.cyan("> ") : "  ";
			const highlight = selected ? ansi.bold(name) : name;
			return `${pointer}${highlight}  ${progress}`;
		}

		function draw() {
			const plans = filtered();
			// Clear previous output: header + plans + filter line
			const totalLines = allPlans.length + 2; // max lines we could have drawn
			process.stdout.write(`\x1b[${totalLines}A\x1b[J`);

			const filterDisplay = filter
				? `${ansi.dim("filter:")} ${filter}`
				: ansi.dim("type to filter...");
			process.stdout.write(`${filterDisplay}\n`);

			if (plans.length === 0) {
				process.stdout.write(`${ansi.dim("  no matches")}\n`);
				for (let i = 1; i < allPlans.length; i++) {
					process.stdout.write("\n");
				}
			} else {
				for (let i = 0; i < allPlans.length; i++) {
					if (i < plans.length) {
						process.stdout.write(`${renderLine(plans[i], i === cursor)}\n`);
					} else {
						process.stdout.write("\n");
					}
				}
			}
			process.stdout.write(ansi.dim("↑↓ navigate  enter select  esc cancel\n"));
		}

		// Initial draw: write blank lines first so the cursor-up in draw() works
		process.stdout.write(`${ansi.bold("select a plan:")}\n`);
		for (let i = 0; i < allPlans.length + 2; i++) {
			process.stdout.write("\n");
		}
		draw();

		if (!process.stdin.isTTY) {
			res(null);
			return;
		}

		const prevRaw = process.stdin.isRaw;
		process.stdin.setRawMode(true);
		process.stdin.resume();

		function cleanup() {
			if (done) return;
			done = true;
			process.stdin.setRawMode(prevRaw ?? false);
			process.stdin.pause();
			process.stdin.removeListener("data", onData);
		}

		function onData(data: Buffer) {
			if (done) return;
			const plans = filtered();
			const key = data.toString();

			// Ctrl-C or Escape
			if (data[0] === 0x03 || (data[0] === 0x1b && data.length === 1)) {
				cleanup();
				res(null);
				return;
			}

			// Arrow keys (escape sequences)
			if (data[0] === 0x1b && data[1] === 0x5b) {
				if (data[2] === 0x41) {
					// Up
					cursor = Math.max(0, cursor - 1);
				} else if (data[2] === 0x42) {
					// Down
					cursor = Math.min(plans.length - 1, cursor + 1);
				}
				draw();
				return;
			}

			// Enter
			if (data[0] === 0x0d || data[0] === 0x0a) {
				if (plans.length > 0 && cursor < plans.length) {
					cleanup();
					res(plans[cursor].path);
				}
				return;
			}

			// Backspace
			if (data[0] === 0x7f || data[0] === 0x08) {
				if (filter.length > 0) {
					filter = filter.slice(0, -1);
					cursor = 0;
					draw();
				}
				return;
			}

			// Printable characters
			if (data[0] >= 0x20 && data[0] < 0x7f) {
				filter += key;
				cursor = 0;
				draw();
				return;
			}
		}

		process.stdin.on("data", onData);
	});
}
