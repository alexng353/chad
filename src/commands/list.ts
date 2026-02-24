import { mkdirSync } from "node:fs";
import { ansi } from "../ansi";
import { listPlans } from "../plan";
import type { RouteContext } from "../router";

export function listHandler(ctx: RouteContext): void {
	mkdirSync(ctx.chadDir, { recursive: true });
	const plans = listPlans(ctx.chadDir);
	if (plans.length === 0) {
		console.log("no plans found in ~/.chad/");
		process.exit(0);
	}
	for (const p of plans) {
		const barWidth = 20;
		const filled =
			p.total > 0 ? Math.round((p.checked / p.total) * barWidth) : 0;
		const bar = `${"\u2588".repeat(filled)}${"\u2591".repeat(barWidth - filled)}`;
		const status = p.complete
			? ansi.dim(`${ansi.green(bar)} ${p.checked}/${p.total}`)
			: `${ansi.green(bar)} ${p.checked}/${p.total}`;
		const name = p.complete ? ansi.dim(p.name) : p.name;
		console.log(`  ${name}  ${status}`);
	}
	process.exit(0);
}
