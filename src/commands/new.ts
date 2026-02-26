import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ansi } from "../ansi";
import { BRAINSTORM_SYSTEM_PROMPT } from "../brainstorm";
import type { RouteContext } from "../router";

const PLAN_TEMPLATE = (title: string) => `# ${title}

## Agent Instructions

1. **Find your step.** Scan the "Steps" section. Find the FIRST \`- [ ]\`. That is your ONE step. Do ONLY that step.
2. **Execute the step.** Read its description carefully. Refer to "Reference" for patterns. Read source files before modifying.
3. **Validate.** Each step has a **Validate** line. Run those checks. Fix issues before proceeding.
4. **Mark complete.** Call the \`completeStep\` tool to mark your step done. Do NOT edit the plan file to check off steps — chad handles that.
5. **Commit and push.** Stage all changed source files, create a NEW commit, push.
   - Format: \`[agent] <imperative description>\`
   - End with: \`Co-Authored-By: Claude <model> <noreply@anthropic.com>\`
   - NEVER amend. Always new commits. NEVER commit secrets.
6. **Discovered work.** Append new \`- [ ]\` steps at the END of the plan file. Don't do them now.
7. **Quality gates.** Run linter + type checker. Fix errors only in files you touched.
8. **Escape hatch.** If a step is impossible, blocked, or needs human intervention, call \`escapeHatch("failure", reason)\`. If the ENTIRE plan is complete, call \`escapeHatch("success", message)\`.
9. **Prohibited.** No plan mode, no interactive tools, no multi-step, no amending, no skipping validation.

---

## Reference

<!-- Project structure, patterns, code examples, links to docs -->

---

## Steps

### Phase 0: Setup
- [ ] **0.1 TODO**
  Description.
  **Validate:** \`echo "TODO"\`

### Phase 1: Core
- [ ] **1.1 TODO**
  Description.
  **Validate:** \`echo "TODO"\`

### Phase 2: Cleanup
- [ ] **2.1 TODO**
  Description.
  **Validate:** \`echo "TODO"\`
`;

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

	if (ctx.flags["template-only"]) {
		writeFileSync(outPath, PLAN_TEMPLATE(name));
		console.log("Template written. Edit the plan, then run:");
		console.log(`  chad ${outPath}`);
		return;
	}

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
