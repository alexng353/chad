import { readdirSync, readFileSync, watch, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ansi, mdToAnsi, splitAtWidth, stripAnsi } from "./ansi";

const BRAILLE_SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Truncate an ANSI string to fit within `width` visible characters, adding ellipsis if needed. */
function truncLine(s: string, width: number): string {
	if (width <= 0 || stripAnsi(s).length <= width) return s;
	const [truncated] = splitAtWidth(s, width - 1);
	return `${truncated}…`;
}

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

/** Mark the first unchecked step as complete. Returns true if a step was marked. */
export function markCurrentStepComplete(planPath: string): boolean {
	const content = readFileSync(planPath, "utf8");
	const idx = content.indexOf("- [ ]");
	if (idx === -1) return false;
	const updated = `${content.slice(0, idx)}- [x]${content.slice(idx + 5)}`;
	writeFileSync(planPath, updated);
	return true;
}

export type PlanSummary = {
	name: string;
	path: string;
	checked: number;
	total: number;
	complete: boolean;
};

/** List all .md plan files in a directory with their step counts. */
export function listPlans(dir: string): PlanSummary[] {
	let files: string[];
	try {
		files = readdirSync(dir)
			.filter((f) => f.endsWith(".md"))
			.sort();
	} catch {
		return [];
	}
	return files.map((f) => {
		const path = resolve(dir, f);
		const steps = parseSteps(path);
		const checked = steps.filter((s) => s.checked).length;
		return {
			name: f.replace(/\.md$/, ""),
			path,
			checked,
			total: steps.length,
			complete: steps.length > 0 && checked === steps.length,
		};
	});
}

/** Render plan status as an array of lines. */
function renderStatusLines(
	steps: Step[],
	planPath: string,
	spinnerFrame?: number,
): string[] {
	const checked = steps.filter((s) => s.checked).length;
	const unchecked = steps.filter((s) => !s.checked).length;
	const total = steps.length;
	const lines: string[] = [];

	lines.push(`${ansi.bold("plan:")} ${planPath}`);
	lines.push(`${ansi.bold("progress:")} ${checked}/${total} steps complete`);
	if (total > 0) {
		const pct = Math.round((checked / total) * 100);
		const barWidth = 30;
		const filled = Math.round((checked / total) * barWidth);
		const bar = `${"█".repeat(filled)}${"░".repeat(barWidth - filled)}`;
		lines.push(`  ${ansi.green(bar)} ${pct}%`);
	}
	lines.push("");

	const nextStep = findNextStep(steps);
	for (const step of steps) {
		if (step.checked) {
			lines.push(`  ${ansi.dim(mdToAnsi(step.line))}`);
		} else if (spinnerFrame !== undefined && step === nextStep) {
			const label = step.line.replace(/^-\s*\[\s*\]\s*/, "");
			lines.push(`  ${ansi.yellow("- [.]")} ${mdToAnsi(label)}`);
		} else {
			lines.push(`  ${mdToAnsi(step.line)}`);
		}
	}

	if (unchecked === 0) {
		lines.push("");
		lines.push(ansi.green(ansi.bold("all steps complete.")));
	} else if (nextStep) {
		lines.push("");
		if (spinnerFrame === undefined) {
			lines.push(`${ansi.bold("next:")} ${mdToAnsi(nextStep.line)}`);
		}
		// In watch mode, the "current:" line is rendered separately so the
		// spinner can animate without a full re-render.
	}

	return lines;
}

/** Print plan status summary (one-shot). */
export function printStatus(planPath: string) {
	const steps = parseSteps(planPath);
	for (const line of renderStatusLines(steps, planPath)) {
		console.log(line);
	}
}

/** Watch a plan file and live-render status with a braille spinner. */
export function watchStatus(planPath: string): void {
	let frame = 0;
	let steps = parseSteps(planPath);
	let statusLineCount = 0;
	let hasSpinner = false;

	// Hide cursor
	process.stdout.write("\x1b[?25l");

	/** Full re-render of status + spinner line. */
	function renderFull() {
		const cols = process.stdout.columns || 80;
		const totalClear = statusLineCount + (hasSpinner ? 2 : 0);
		if (totalClear > 0) {
			process.stdout.write(`\x1b[${totalClear}A\x1b[J`);
		}

		const lines = renderStatusLines(steps, planPath, frame);
		process.stdout.write(
			`${lines.map((l) => truncLine(l, cols)).join("\n")}\n`,
		);
		statusLineCount = lines.length;

		const nextStep = findNextStep(steps);
		if (nextStep) {
			const f = BRAILLE_SPINNER[frame % BRAILLE_SPINNER.length];
			const label = mdToAnsi(nextStep.line);
			const line = `${ansi.bold("current:")} ${ansi.cyan(f)} ${label}`;
			process.stdout.write(`\n${truncLine(line, cols)}\n`);
			hasSpinner = true;
		} else {
			hasSpinner = false;
		}
	}

	/** Only update the spinner line at the bottom. */
	function renderSpinnerOnly() {
		if (!hasSpinner) return;
		const nextStep = findNextStep(steps);
		if (!nextStep) return;
		const cols = process.stdout.columns || 80;
		// Move up 1 line, clear it, write new spinner
		process.stdout.write("\x1b[1A\x1b[2K");
		const f = BRAILLE_SPINNER[frame % BRAILLE_SPINNER.length];
		const label = mdToAnsi(nextStep.line);
		const line = `${ansi.bold("current:")} ${ansi.cyan(f)} ${label}`;
		process.stdout.write(`${truncLine(line, cols)}\n`);
	}

	renderFull();

	// Spinner animation — only redraws the bottom line
	const spinnerInterval = setInterval(() => {
		frame++;
		renderSpinnerOnly();
	}, 80);

	// Re-parse on file change — full re-render
	const watcher = watch(planPath, () => {
		try {
			steps = parseSteps(planPath);
			renderFull();
			if (steps.every((s) => s.checked)) {
				cleanup();
				process.exit(0);
			}
		} catch {
			// file may be mid-write; skip this event
		}
	});

	function cleanup() {
		clearInterval(spinnerInterval);
		watcher.close();
		// Show cursor
		process.stdout.write("\x1b[?25h");
	}

	process.on("SIGINT", () => {
		cleanup();
		process.exit(0);
	});
	process.on("SIGTERM", () => {
		cleanup();
		process.exit(0);
	});
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
			!agentSection.toLowerCase().includes("mark complete") &&
			!agentSection.toLowerCase().includes("completestep")
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
