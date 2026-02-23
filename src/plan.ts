import { readFileSync } from "node:fs";
import { ansi, mdToAnsi } from "./ansi";

export type Step = {
	line: string;
	checked: boolean;
	lineNumber: number;
};

/** Parse all checkbox steps from a plan file. */
export function parseSteps(planPath: string): Step[] {
	const content = readFileSync(planPath, "utf8");
	const lines = content.split("\n");
	const steps: Step[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.match(/^\s*- \[[ x]\]/)) {
			steps.push({
				line: line.trim(),
				checked: line.includes("- [x]"),
				lineNumber: i + 1,
			});
		}
	}
	return steps;
}

/** Find the first unchecked step. */
export function findNextStep(steps: Step[]): Step | undefined {
	return steps.find((s) => !s.checked);
}

/** Extract the full block of text for the first unchecked step (title + description). */
export function extractCurrentStepBlock(content: string): string | null {
	const lines = content.split("\n");
	let startIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].match(/^\s*- \[ \]/)) {
			startIdx = i;
			break;
		}
	}
	if (startIdx === -1) return null;

	// Collect lines until the next step or next section header
	let endIdx = startIdx + 1;
	while (endIdx < lines.length) {
		const line = lines[endIdx];
		// Next checkbox step
		if (line.match(/^\s*- \[[ x]\]/)) break;
		// Next section header
		if (line.match(/^###?\s/)) break;
		endIdx++;
	}
	return lines.slice(startIdx, endIdx).join("\n").trimEnd();
}

/** Count checked steps in content string. */
export function countChecked(content: string): number {
	return (content.match(/^\s*- \[x\]/gm) || []).length;
}

/** Print plan status summary. */
export function printStatus(planPath: string) {
	const steps = parseSteps(planPath);
	const checked = steps.filter((s) => s.checked).length;
	const unchecked = steps.filter((s) => !s.checked).length;
	const total = steps.length;

	console.log(`${ansi.bold("plan:")} ${planPath}`);
	console.log(`${ansi.bold("progress:")} ${checked}/${total} steps complete`);
	if (total > 0) {
		const pct = Math.round((checked / total) * 100);
		const barWidth = 30;
		const filled = Math.round((checked / total) * barWidth);
		const bar = `${"█".repeat(filled)}${"░".repeat(barWidth - filled)}`;
		console.log(`  ${ansi.green(bar)} ${pct}%`);
	}
	console.log();

	for (const step of steps) {
		if (step.checked) {
			console.log(`  ${ansi.dim(mdToAnsi(step.line))}`);
		} else {
			console.log(`  ${mdToAnsi(step.line)}`);
		}
	}

	if (unchecked === 0) {
		console.log(`\n${ansi.green(ansi.bold("all steps complete."))}`);
	} else {
		const next = findNextStep(steps);
		if (next) {
			console.log(`\n${ansi.bold("next:")} ${mdToAnsi(next.line)}`);
		}
	}
}

type ValidationIssue = {
	severity: "error" | "warn";
	message: string;
	lineNumber?: number;
};

/** Validate a plan file's format. Returns issues found. */
export function validatePlan(planPath: string): ValidationIssue[] {
	const content = readFileSync(planPath, "utf8");
	const lines = content.split("\n");
	const issues: ValidationIssue[] = [];
	const steps = parseSteps(planPath);

	if (steps.length === 0) {
		issues.push({
			severity: "error",
			message: "No steps found (no `- [ ]` or `- [x]` lines)",
		});
		return issues;
	}

	// Check for Agent Instructions section
	if (!content.includes("## Agent Instructions")) {
		issues.push({
			severity: "warn",
			message: "Missing `## Agent Instructions` section",
		});
	}

	// Check for Reference section
	if (!content.includes("## Reference")) {
		issues.push({
			severity: "warn",
			message: "Missing `## Reference` section",
		});
	}

	// Check for Steps section
	if (!content.includes("## Steps")) {
		issues.push({ severity: "warn", message: "Missing `## Steps` section" });
	}

	// Check each unchecked step for validation line
	for (const step of steps) {
		if (step.checked) continue;

		// Look ahead from the step's line for a **Validate:** line before the next step
		let hasValidate = false;
		for (let i = step.lineNumber; i < lines.length; i++) {
			const line = lines[i];
			// Hit the next step — stop looking
			if (line.match(/^\s*- \[[ x]\]/) && i + 1 !== step.lineNumber) break;
			if (line.includes("**Validate:**") || line.includes("**Validate**:")) {
				hasValidate = true;
				break;
			}
		}
		if (!hasValidate) {
			issues.push({
				severity: "warn",
				message: `Step missing **Validate:** line`,
				lineNumber: step.lineNumber,
			});
		}
	}

	// Check for prohibited patterns in Agent Instructions
	const agentIdx = lines.findIndex((l) => l.includes("## Agent Instructions"));
	if (agentIdx !== -1) {
		const stepsIdx = lines.findIndex((l) => l.includes("## Steps"));
		const agentSection = lines
			.slice(agentIdx, stepsIdx > agentIdx ? stepsIdx : undefined)
			.join("\n");

		if (
			!agentSection.toLowerCase().includes("prohibited") &&
			!agentSection.toLowerCase().includes("do not")
		) {
			issues.push({
				severity: "warn",
				message: "Agent Instructions has no prohibitions section",
			});
		}
		if (
			!agentSection.includes("- [ ]") &&
			!agentSection.toLowerCase().includes("mark complete")
		) {
			issues.push({
				severity: "warn",
				message: "Agent Instructions doesn't mention marking steps complete",
			});
		}
	}

	return issues;
}

/** Print validation results. Returns true if no errors. */
export function printValidation(planPath: string): boolean {
	const issues = validatePlan(planPath);
	const steps = parseSteps(planPath);
	const unchecked = steps.filter((s) => !s.checked).length;

	console.log(`${ansi.bold("plan:")} ${planPath}`);
	console.log(
		`${ansi.bold("steps:")} ${steps.length} total, ${unchecked} remaining`,
	);
	console.log();

	if (issues.length === 0) {
		console.log(ansi.green(ansi.bold("valid — no issues found.")));
		return true;
	}

	const errors = issues.filter((i) => i.severity === "error");
	const warns = issues.filter((i) => i.severity === "warn");

	for (const issue of errors) {
		const loc = issue.lineNumber ? ` (line ${issue.lineNumber})` : "";
		console.log(`  ${ansi.red("error:")} ${issue.message}${loc}`);
	}
	for (const issue of warns) {
		const loc = issue.lineNumber ? ` (line ${issue.lineNumber})` : "";
		console.log(`  ${ansi.yellow("warn:")}  ${issue.message}${loc}`);
	}

	if (errors.length > 0) {
		console.log(
			`\n${ansi.red(ansi.bold(`${errors.length} error(s), ${warns.length} warning(s)`))}`,
		);
		return false;
	}
	console.log(`\n${ansi.yellow(ansi.bold(`${warns.length} warning(s)`))}`);
	return true;
}
