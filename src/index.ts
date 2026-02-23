#!/usr/bin/env bun
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { ansi, mdToAnsi } from "./ansi";
import { BoxModel } from "./box";
import { BRAINSTORM_SYSTEM_PROMPT, runBrainstorm } from "./brainstorm";
import { runMcpServer } from "./mcp";
import {
	countChecked,
	extractCurrentStepBlock,
	findNextStep,
	parseSteps,
	printStatus,
	printValidation,
} from "./plan";
import { runRebase } from "./rebase";
import { checkForUpdateBackground, runUpdate } from "./update";
import { getVersion, isCompiledBinary } from "./version";

// --- Internal MCP server flag (must be checked before anything else) ---
if (process.argv.includes("--__mcp-server")) {
	runMcpServer();
	// runMcpServer never returns (keeps stdin listener alive)
	// but add an explicit await to prevent the script from falling through
	await new Promise(() => {});
}

const DEBUG_LOG = "/tmp/chad-debug.log";

// --- CLI args ---
const rawArgs = process.argv.slice(2);

const HELP = `Usage: chad [options] PLAN_FILE
       chad <command> PLAN_FILE

Autonomous plan runner — feeds a markdown checklist to claude
one iteration at a time until all steps are complete.

Commands:
  new NAME    Create a new plan from template in ~/.chad/
  status      Show plan progress (checked/unchecked steps)
  validate    Check plan file format and structure
  brainstorm  Open interactive claude session to develop the plan
  rebase      Clean up git history with claude's help
  update      Update chad to the latest release

Options:
  --tmux           Run inside a new tmux session
  -y               Skip interactive confirmation
  -m, --max N      Max iterations (default: 50)
  -b N             Box height in lines (default: 10)
  --dry-run        Show the next step without running
  -V, --version    Show version
  -h, --help       Show this help

Keybindings (during execution):
  Ctrl-C    Kill current iteration and exit immediately
  Ctrl-X    Stop after the current iteration finishes`;

if (rawArgs.includes("-h") || rawArgs.includes("--help")) {
	console.log(HELP);
	process.exit(0);
}

if (rawArgs.includes("-V") || rawArgs.includes("--version")) {
	const mode = isCompiledBinary() ? "compiled" : "source";
	console.log(`chad ${getVersion()} (${mode})`);
	process.exit(0);
}

// --- Subcommand detection ---
const subcommands = [
	"status",
	"validate",
	"brainstorm",
	"rebase",
	"new",
	"update",
];
const subcommand = subcommands.includes(rawArgs[0]) ? rawArgs[0] : null;
const args = subcommand ? rawArgs.slice(1) : rawArgs;

// --- Expand ~ in paths ---
function expandPath(p: string): string {
	return resolve(p.startsWith("~") ? p.replace("~", homedir()) : p);
}

// --- Parse flags ---
const tmuxFlag = args.includes("--tmux");
const skipConfirm = args.includes("-y");
const dryRun = args.includes("--dry-run");

let maxIterations = 50;
let boxHeight = 10;
for (let i = 0; i < args.length; i++) {
	if ((args[i] === "-m" || args[i] === "--max") && args[i + 1]) {
		maxIterations = Number.parseInt(args[i + 1], 10);
		if (Number.isNaN(maxIterations) || maxIterations < 1) {
			console.error("error: --max requires a positive integer");
			process.exit(1);
		}
	}
	if (args[i] === "-b" && args[i + 1]) {
		boxHeight = Number.parseInt(args[i + 1], 10);
		if (Number.isNaN(boxHeight) || boxHeight < 1) {
			console.error("error: -b requires a positive integer");
			process.exit(1);
		}
	}
}

const flags = new Set(["--tmux", "-y", "--dry-run", "-m", "--max", "-b"]);
const positional: string[] = [];
for (let i = 0; i < args.length; i++) {
	if (args[i] === "-m" || args[i] === "--max" || args[i] === "-b") {
		i++; // skip the value
		continue;
	}
	if (!flags.has(args[i])) {
		positional.push(args[i]);
	}
}

// --- `chad new` (before plan path resolution) ---
if (subcommand === "new") {
	const name = positional[0];
	if (!name) {
		console.error("Usage: chad new NAME");
		process.exit(1);
	}
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	const chadDir = resolve(homedir(), ".chad");
	mkdirSync(chadDir, { recursive: true });
	const outPath = resolve(chadDir, `${slug}.md`);
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

// --- `chad update` (before plan path resolution) ---
if (subcommand === "update") {
	await runUpdate();
	process.exit(0);
}

const planPath = positional[0];
if (!planPath) {
	console.log(HELP);
	process.exit(1);
}
const plan = expandPath(planPath);

// --- Subcommands (exit early) ---
if (subcommand === "status") {
	if (!existsSync(plan)) {
		console.error(`error: ${plan} not found`);
		process.exit(1);
	}
	printStatus(plan);
	process.exit(0);
}

if (subcommand === "validate") {
	if (!existsSync(plan)) {
		console.error(`error: ${plan} not found`);
		process.exit(1);
	}
	const ok = printValidation(plan);
	process.exit(ok ? 0 : 1);
}

if (subcommand === "brainstorm") {
	runBrainstorm(plan);
	// runBrainstorm calls process.exit
}

if (subcommand === "rebase") {
	runRebase(plan);
	// runRebase calls process.exit
}

// --- Main run mode ---
if (!existsSync(plan)) {
	console.error(`error: ${plan} not found`);
	process.exit(1);
}

// --- Dry run ---
if (dryRun) {
	const steps = parseSteps(plan);
	const next = findNextStep(steps);
	if (!next) {
		console.log(ansi.green(ansi.bold("all steps complete.")));
	} else {
		console.log(`${ansi.bold("next step:")} ${mdToAnsi(next.line)}`);
	}
	process.exit(0);
}

// --- Lock ---
const LOCK_DIR = resolve(homedir(), ".config/chad/locks");
const lockHash = createHash("sha256").update(plan).digest("hex").slice(0, 12);
const lockPath = resolve(LOCK_DIR, `${lockHash}.lock`);
const planBasename = basename(plan);
const sessionName = `chad-${planBasename.replace(/[.:]/g, "-")}-${lockHash.slice(0, 6)}`;

// --- tmux re-exec ---
if (tmuxFlag) {
	const tmuxArgs = [plan];
	if (skipConfirm) tmuxArgs.push("-y");
	if (maxIterations !== 50) tmuxArgs.push("-m", String(maxIterations));
	if (boxHeight !== 10) tmuxArgs.push("-b", String(boxHeight));

	const cmd = isCompiledBinary()
		? [process.execPath, ...tmuxArgs]
		: ["bun", process.argv[1], ...tmuxArgs];

	const { status } = spawnSync(
		"tmux",
		["new-session", "-s", sessionName, "--", ...cmd],
		{ stdio: "inherit" },
	);
	process.exit(status ?? 0);
}

// Acquire lock (only the worker process, not the tmux outer shell)
mkdirSync(LOCK_DIR, { recursive: true });
if (existsSync(lockPath)) {
	try {
		const lock = JSON.parse(readFileSync(lockPath, "utf8"));
		process.kill(lock.pid, 0); // throws if dead
		console.error(`error: already running (pid ${lock.pid})`);
		console.error(`  cwd:  ${lock.cwd}`);
		console.error(`  plan: ${lock.plan}`);
		console.error(`  lock: ${lockPath}`);
		process.exit(1);
	} catch (err) {
		if (err instanceof Error && "code" in err && err.code === "ESRCH") {
			// PID is dead — stale lock, clean up
		} else if (err instanceof SyntaxError) {
			// Corrupt lock file, clean up
		} else {
			throw err;
		}
	}
}
writeFileSync(
	lockPath,
	JSON.stringify({ pid: process.pid, cwd: process.cwd(), plan }),
);

function releaseLock() {
	try {
		unlinkSync(lockPath);
	} catch {}
}
process.on("exit", releaseLock);

// --- Background update check ---
checkForUpdateBackground();

// --- Clean working tree check ---
{
	const gitStatus = spawnSync("git", ["status", "--porcelain"], {
		encoding: "utf8",
	});
	if (gitStatus.stdout && gitStatus.stdout.trim().length > 0) {
		console.error(ansi.red(ansi.bold("error: working directory is not clean")));
		console.error("commit or stash your changes before running chad.\n");
		const lines = gitStatus.stdout.trim().split("\n");
		for (const line of lines.slice(0, 15)) {
			console.error(`  ${line}`);
		}
		if (lines.length > 15) {
			console.error(ansi.dim(`  … and ${lines.length - 15} more`));
		}
		releaseLock();
		process.exit(1);
	}
}

// --- Interactive confirmation ---
if (!skipConfirm) {
	const content = readFileSync(plan, "utf8");
	const unchecked = content.split("\n").filter((l) => l.match(/^\s*- \[ \]/));

	console.log(`${ansi.bold("cwd:")}  ${process.cwd()}`);
	console.log(`${ansi.bold("plan:")} ${plan}`);
	console.log(
		`${ansi.bold("todo:")} ${unchecked.length} unchecked step${unchecked.length === 1 ? "" : "s"}`,
	);
	if (maxIterations !== 50) {
		console.log(`${ansi.bold("max:")}  ${maxIterations} iterations`);
	}
	console.log();
	for (const line of unchecked.slice(0, 10)) {
		console.log(`  ${mdToAnsi(line.trim())}`);
	}
	if (unchecked.length > 10) {
		console.log(ansi.dim(`  … and ${unchecked.length - 10} more`));
	}
	console.log();

	process.stdout.write(`${ansi.bold("proceed?")} [Y/n] `);
	const answer = await new Promise<string>((res) => {
		if (process.stdin.isTTY) process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.once("data", (data: Buffer) => {
			if (process.stdin.isTTY) process.stdin.setRawMode(false);
			process.stdin.pause();
			const byte = data[0];
			if (byte === 0x03) {
				// Ctrl-C
				process.stdout.write("\n");
				releaseLock();
				process.exit(130);
			}
			const ch = data.toString();
			process.stdout.write(`${ch}\n`);
			res(ch.trim().toLowerCase());
		});
	});

	if (answer === "n") {
		releaseLock();
		process.exit(0);
	}
}

// --- Box model ---
const BOX_LINES = boxHeight;
const BOX_TOTAL = BOX_LINES + 3; // top border + content + bottom border + chin
const box = new BoxModel();
let boxDrawn = false;
let iterationStart = Date.now();
const overallStart = Date.now();
let currentIteration = 0;
const iterationDurations: number[] = [];
let timerInterval: ReturnType<typeof setInterval> | null = null;

function formatElapsed(ms: number): string {
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	const sec = s % 60;
	return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function draw() {
	const cols = process.stdout.columns || 80;
	const iterElapsed = formatElapsed(Date.now() - iterationStart);
	const totalElapsed = formatElapsed(Date.now() - overallStart);
	const stopTag = stopAfterIteration
		? `  ${ansi.yellow("·  C-x stopping")}`
		: "";
	const chin =
		ansi.dim(
			`  iteration ${currentIteration}/${maxIterations}  ·  ${iterElapsed}  ·  total ${totalElapsed}`,
		) + stopTag;

	let out = "";
	if (boxDrawn) {
		out += `\x1b[${BOX_TOTAL}A`;
	}
	out += box.render(BOX_LINES, cols, chin);
	process.stdout.write(out);
	boxDrawn = true;
}

function startTimer() {
	stopTimer();
	timerInterval = setInterval(() => {
		if (boxDrawn) draw();
	}, 1000);
}

function stopTimer() {
	if (timerInterval !== null) {
		clearInterval(timerInterval);
		timerInterval = null;
	}
}

function printTimingStats() {
	if (iterationDurations.length === 0) return;

	const total = Date.now() - overallStart;
	const avg =
		iterationDurations.reduce((a, b) => a + b, 0) / iterationDurations.length;
	const longest = Math.max(...iterationDurations);
	const shortest = Math.min(...iterationDurations);

	console.log();
	console.log(ansi.bold("timing"));
	console.log(`  total:    ${formatElapsed(total)}`);
	console.log(
		`  iters:    ${iterationDurations.length} (avg ${formatElapsed(avg)})`,
	);
	console.log(`  longest:  ${formatElapsed(longest)}`);
	console.log(`  shortest: ${formatElapsed(shortest)}`);
}

// --- Stream event parsing state ---
let toolName = "";
let toolInput = "";
let textBuf = "";
let thinkingBuf = "";

function processLine(raw: string) {
	if (!raw.trim()) return;

	appendFileSync(DEBUG_LOG, `${raw}\n`);

	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(raw);
	} catch {
		box.addLine(ansi.dim(raw.slice(0, 60)));
		draw();
		return;
	}

	// Wrapped streaming events from Claude Code CLI
	if (
		parsed.type === "stream_event" &&
		parsed.event &&
		typeof parsed.event === "object"
	) {
		handleStreamEvent(parsed.event as Record<string, unknown>);
		return;
	}

	// Raw API streaming events (fallback)
	const apiTypes = [
		"message_start",
		"content_block_start",
		"content_block_delta",
		"content_block_stop",
		"message_delta",
		"message_stop",
		"ping",
		"error",
	];
	if (apiTypes.includes(parsed.type as string)) {
		handleStreamEvent(parsed);
		return;
	}

	// Claude Code top-level message types
	handleTopLevel(parsed);
}

// biome-ignore lint/suspicious/noExplicitAny: event shapes are dynamic
function handleStreamEvent(ev: any) {
	switch (ev.type) {
		case "message_start":
			// model already shown by system/init handler
			break;
		case "content_block_start": {
			const b = ev.content_block;
			if (!b) break;
			if (b.type === "tool_use") {
				toolName = b.name ?? "?";
				toolInput = "";
				box.addLine(`${ansi.yellow("\u25b6")} ${ansi.bold(toolName)}`);
				draw();
			} else if (b.type === "text") {
				textBuf = "";
			} else if (b.type === "thinking") {
				thinkingBuf = "";
			}
			break;
		}
		case "content_block_delta": {
			const d = ev.delta;
			if (!d) break;
			if (d.type === "text_delta" && d.text) {
				const parts = d.text.split("\n");
				for (let p = 0; p < parts.length; p++) {
					textBuf += parts[p];
					if (p < parts.length - 1) {
						// Commit the in-progress line, then start fresh
						box.updateCurrent(mdToAnsi(textBuf));
						box.finishCurrent();
						textBuf = "";
					}
				}
				box.updateCurrent(mdToAnsi(textBuf));
				draw();
			} else if (d.type === "input_json_delta" && d.partial_json) {
				toolInput += d.partial_json;
			} else if (d.type === "thinking_delta" && d.thinking) {
				const parts = (d.thinking as string).split("\n");
				for (let p = 0; p < parts.length; p++) {
					thinkingBuf += parts[p];
					if (p < parts.length - 1) {
						box.updateCurrent(ansi.dim(ansi.italic(thinkingBuf)));
						box.finishCurrent();
						thinkingBuf = "";
					}
				}
				box.updateCurrent(ansi.dim(ansi.italic(thinkingBuf)));
				draw();
			}
			break;
		}
		case "content_block_stop": {
			if (toolName) {
				try {
					showToolSummary(toolName, JSON.parse(toolInput));
				} catch {
					// incomplete JSON, ignore
				}
				toolName = "";
				toolInput = "";
			}
			box.finishCurrent();
			draw();
			break;
		}
		case "message_delta": {
			if (ev.usage) {
				const inp = ev.usage.input_tokens ?? 0;
				const out = ev.usage.output_tokens ?? 0;
				box.addLine(ansi.dim(`tokens: ${inp} in / ${out} out`));
			}
			if (ev.delta?.stop_reason) {
				box.addLine(ansi.dim(`stop: ${ev.delta.stop_reason}`));
			}
			draw();
			break;
		}
		case "error": {
			box.addLine(
				ansi.red(`${ansi.bold("error:")} ${ev.error?.message ?? "unknown"}`),
			);
			draw();
			break;
		}
		// ping, message_stop: ignored
	}
}

function todoIcon(status?: string): string {
	if (status === "completed") return ansi.green("\u2713");
	if (status === "in_progress") return ansi.yellow("\u25cf");
	return ansi.dim("\u25cb");
}

// biome-ignore lint/suspicious/noExplicitAny: tool input shapes vary
function showToolSummary(name: string, input: any) {
	const info = (() => {
		switch (name) {
			case "Read":
				return input.file_path;
			case "Edit":
				return input.file_path;
			case "Write":
				return input.file_path;
			case "Bash":
				return `${ansi.dim("$")} ${(input.command ?? "").split("\n")[0]}`;
			case "Glob":
				return input.pattern;
			case "Grep":
				return `/${input.pattern}/${input.path ? ` in ${input.path}` : ""}`;
			case "Task":
				return input.description ?? String(input.prompt ?? "").slice(0, 50);
			case "TodoWrite": {
				const todos = input.todos;
				if (Array.isArray(todos)) {
					for (const todo of todos) {
						box.addLine(`    ${todoIcon(todo.status)} ${todo.content ?? ""}`);
					}
				}
				return null;
			}
			case "TaskCreate":
				return `${todoIcon("pending")} ${input.subject ?? ""}`;
			case "TaskUpdate": {
				const parts = [input.taskId ?? ""];
				if (input.status) parts.push(todoIcon(input.status));
				if (input.subject) parts.push(input.subject);
				return parts.join(" ");
			}
			case "TaskGet":
				return input.taskId ?? "";
			case "TaskList":
				return null;
			default: {
				const k = Object.keys(input)[0];
				if (!k) return "";
				const v = input[k];
				const s = typeof v === "string" ? v : JSON.stringify(v);
				return `${k}: ${s.slice(0, 50)}`;
			}
		}
	})();
	if (info) {
		box.addLine(`${ansi.yellow("  \u25c6")} ${info}`);
	}
}

// biome-ignore lint/suspicious/noExplicitAny: top-level message shapes vary
function handleTopLevel(msg: any) {
	switch (msg.type) {
		case "system":
			if (msg.subtype === "init") {
				box.addLine(`${ansi.dim("session:")} ${msg.session_id ?? "?"}`);
				if (msg.model) {
					box.addLine(`${ansi.dim("model:")} ${ansi.cyan(String(msg.model))}`);
				}
				draw();
			}
			break;
		case "result":
			if (msg.subtype === "success") {
				box.addLine(ansi.green(ansi.bold("\u2713 done")));
			} else {
				box.addLine(ansi.red(`\u2717 ${msg.error ?? "error"}`));
			}
			draw();
			break;
		// "assistant" snapshots ignored — stream events handle everything
	}
}

// --- MCP escape hatch ---
const escapeSignalFile = resolve(tmpdir(), `chad-escape-${process.pid}.json`);
const mcpConfigFile = resolve(tmpdir(), `chad-mcp-${process.pid}.json`);

const mcpServerConfig = isCompiledBinary()
	? { command: process.execPath, args: ["--__mcp-server"] }
	: {
			command: "bun",
			args: ["run", resolve(dirname(process.argv[1]), "mcp.ts")],
		};

if (!isCompiledBinary()) {
	const mcpScript = resolve(dirname(process.argv[1]), "mcp.ts");
	if (!existsSync(mcpScript)) {
		console.error(`error: ${mcpScript} not found`);
		releaseLock();
		process.exit(1);
	}
}

writeFileSync(
	mcpConfigFile,
	JSON.stringify({
		mcpServers: {
			"chad-escape": {
				...mcpServerConfig,
				env: { CHAD_SIGNAL_FILE: escapeSignalFile },
			},
		},
	}),
);

function cleanupMcp() {
	try {
		unlinkSync(mcpConfigFile);
	} catch {}
	try {
		unlinkSync(escapeSignalFile);
	} catch {}
}
process.on("exit", cleanupMcp);

// --- Main loop ---
let child: ReturnType<typeof spawn> | null = null;
let interrupted = false;
let stopAfterIteration = false;

// Raw mode so we get individual keypresses
if (process.stdin.isTTY) {
	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdin.on("data", (data: Buffer) => {
		const byte = data[0];
		if (byte === 0x03) {
			// Ctrl-C: immediate interrupt
			interrupted = true;
			if (child) child.kill("SIGINT");
		} else if (byte === 0x18) {
			// Ctrl-X: toggle stop after current iteration
			stopAfterIteration = !stopAfterIteration;
			draw();
		}
	});
}

for (let i = 1; i <= maxIterations; i++) {
	const content = readFileSync(plan, "utf8");
	if (!content.includes("- [ ]")) {
		console.log(ansi.green(ansi.bold("all steps complete.")));
		printTimingStats();
		process.exit(0);
	}

	// Pre-process: extract current step block, sandwich the prompt
	const stepBlock = extractCurrentStepBlock(content);
	const checkedBefore = countChecked(content);
	const prompt = stepBlock
		? `>>> CURRENT STEP:\n${stepBlock}\n<<<\n\n${content}\n\n>>> CURRENT STEP (reminder):\n${stepBlock}\n<<<`
		: content;

	console.log(`\n${ansi.bold(`=== iteration ${i} / ${maxIterations} ===`)}\n`);
	appendFileSync(DEBUG_LOG, `\n=== iteration ${i} ===\n`);
	box.reset();
	boxDrawn = false;
	currentIteration = i;
	iterationStart = Date.now();
	draw(); // draw initial empty box
	startTimer();

	const claudeDebugLog = resolve(
		tmpdir(),
		`chad-claude-debug-${process.pid}.log`,
	);
	const claudeArgs = [
		"-p",
		prompt,
		"--output-format",
		"stream-json",
		"--verbose",
		"--include-partial-messages",
		"--mcp-config",
		mcpConfigFile,
		"--debug-file",
		claudeDebugLog,
	];

	const exitCode = await new Promise<number>((res) => {
		child = spawn("claude", claudeArgs, {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let buf = "";
		child.stdout?.on("data", (chunk: Buffer) => {
			buf += chunk.toString();
			const lines = buf.split("\n");
			buf = lines.pop() ?? "";
			for (const line of lines) processLine(line);
		});

		child.stderr?.on("data", (chunk: Buffer) => {
			appendFileSync(DEBUG_LOG, `[stderr] ${chunk.toString()}`);
		});

		child.on("close", (code) => {
			if (buf.trim()) processLine(buf);
			child = null;
			res(code ?? 1);
		});
	});

	stopTimer();
	iterationDurations.push(Date.now() - iterationStart);

	const iterDuration = iterationDurations[iterationDurations.length - 1];

	// Freeze the box: erase it, then print final content as plain text
	if (boxDrawn) {
		const cols = process.stdout.columns || 80;
		// Erase the drawn box
		process.stdout.write(`\x1b[${BOX_TOTAL}A\x1b[J`);
		// Print final lines as plain text (reflows naturally on resize)
		const finalLines = box.getVisualLines(BOX_LINES, cols);
		for (const line of finalLines) {
			process.stdout.write(`${line}\n`);
		}
		boxDrawn = false;
	}

	// Per-iteration timing summary
	console.log(
		ansi.dim(
			`  iteration ${i} completed in ${formatElapsed(iterDuration)}  ·  total ${formatElapsed(Date.now() - overallStart)}`,
		),
	);

	// Check multi-step violation
	const contentAfter = readFileSync(plan, "utf8");
	const checkedAfter = countChecked(contentAfter);
	const stepsCompleted = checkedAfter - checkedBefore;
	if (stepsCompleted > 1) {
		console.log(
			ansi.red(
				ansi.bold(
					`warning: agent completed ${stepsCompleted} steps in one iteration (expected 1)`,
				),
			),
		);
	}

	// Check MCP signals (escape hatch / plan done)
	if (existsSync(escapeSignalFile)) {
		try {
			const signal = JSON.parse(readFileSync(escapeSignalFile, "utf8"));
			if (signal.type === "done") {
				unlinkSync(escapeSignalFile);
				console.log(
					ansi.green(ansi.bold("plan complete (agent called planDone).")),
				);
				printTimingStats();
				process.exit(0);
			}
			console.log(`\n${ansi.red(ansi.bold("escape hatch:"))} ${signal.reason}`);
		} catch {
			console.log(`\n${ansi.red(ansi.bold("escape hatch triggered"))}`);
		}
		unlinkSync(escapeSignalFile);
		printTimingStats();
		process.exit(1);
	}

	if (exitCode === 130 || interrupted) {
		console.log("\n[chad] stopping.");
		printTimingStats();
		process.exit(130);
	}

	if (stopAfterIteration) {
		console.log("[chad] stopped (Ctrl-X).");
		printTimingStats();
		process.exit(0);
	}

	if (exitCode !== 0) {
		console.log(ansi.red(`claude exited with code ${exitCode}`));
	}
}

console.log(`hit max iterations (${maxIterations})`);
printTimingStats();
