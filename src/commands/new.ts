import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { ansi } from "../ansi";
import { BRAINSTORM_SYSTEM_PROMPT } from "../brainstorm";
import type { RouteContext } from "../router";

export function newHandler(ctx: RouteContext): void {
	const name = ctx.positional[0];
	if (!name) {
		console.error("Usage: chad new NAME");
		process.exit(1);
	}
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	mkdirSync(ctx.chadDir, { recursive: true });
	const outPath = resolve(ctx.chadDir, `${slug}.md`);
	if (existsSync(outPath)) {
		console.error(`error: ${outPath} already exists`);
		process.exit(1);
	}

	console.log(`${ansi.bold("plan:")} ${outPath}`);
	console.log();

	const initialPrompt = `I'm creating a new chad plan called "${name}".

The plan file will be written to: \`${outPath}\`

**What I can do:**
- Help you design a step-by-step execution plan for any coding task
- Read your codebase (CLAUDE.md, project structure, existing code) to understand conventions
- Write the complete plan file with Agent Instructions, Reference, and Steps sections
- Each step will have validation commands so the autonomous agent can verify its work

**What happens next:**
1. Tell me what you want to build, migrate, or refactor
2. I'll explore your codebase and ask clarifying questions
3. I'll write the plan to \`${outPath}\`
4. You can run it with \`chad ${outPath}\`

What would you like to plan?`;

	const claudeArgs = [
		"--system-prompt",
		BRAINSTORM_SYSTEM_PROMPT,
		initialPrompt,
	];
	const { status } = spawnSync("claude", claudeArgs, { stdio: "inherit" });
	process.exit(status ?? 0);
}
