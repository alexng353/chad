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
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { ansi, mdToAnsi } from "./ansi";
import { BoxModel } from "./box";
import { runBrainstorm } from "./brainstorm";
import { findNextStep, parseSteps, printStatus, printValidation } from "./plan";
import { runRebase } from "./rebase";

const DEBUG_LOG = "/tmp/chad-debug.log";

// --- CLI args ---
const rawArgs = process.argv.slice(2);

const HELP = `Usage: chad [options] PLAN_FILE
       chad <command> PLAN_FILE

Autonomous plan runner — feeds a markdown checklist to claude
one iteration at a time until all steps are complete.

Commands:
  status      Show plan progress (checked/unchecked steps)
  validate    Check plan file format and structure
  brainstorm  Open interactive claude session to develop the plan
  rebase      Clean up git history with claude's help

Options:
  --tmux        Run inside a new tmux session
  -y            Skip interactive confirmation
  -m, --max N   Max iterations (default: 50)
  --dry-run     Show the next step without running
  -h, --help    Show this help

Keybindings (during execution):
  Ctrl-C    Kill current iteration and exit immediately
  Ctrl-X    Stop after the current iteration finishes`;

if (rawArgs.includes("-h") || rawArgs.includes("--help")) {
	console.log(HELP);
	process.exit(0);
}

// --- Subcommand detection ---
const subcommands = ["status", "validate", "brainstorm", "rebase"];
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
for (let i = 0; i < args.length; i++) {
	if ((args[i] === "-m" || args[i] === "--max") && args[i + 1]) {
		maxIterations = Number.parseInt(args[i + 1], 10);
		if (Number.isNaN(maxIterations) || maxIterations < 1) {
			console.error("error: --max requires a positive integer");
			process.exit(1);
		}
	}
}

const flags = new Set(["--tmux", "-y", "--dry-run", "-m", "--max"]);
const positional: string[] = [];
for (let i = 0; i < args.length; i++) {
	if (args[i] === "-m" || args[i] === "--max") {
		i++; // skip the value
		continue;
	}
	if (!flags.has(args[i])) {
		positional.push(args[i]);
	}
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
	const script = process.argv[1];
	const tmuxArgs = [plan];
	if (skipConfirm) tmuxArgs.push("-y");
	if (maxIterations !== 50) tmuxArgs.push("-m", String(maxIterations));
	const { status } = spawnSync(
		"tmux",
		["new-session", "-s", sessionName, "--", "bun", script, ...tmuxArgs],
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
const BOX_LINES = 10;
const box = new BoxModel();
let boxDrawn = false;

function draw() {
	const cols = process.stdout.columns || 80;
	let out = "";
	if (boxDrawn) {
		out += `\x1b[${BOX_LINES + 2}A`;
	}
	out += box.render(BOX_LINES, cols);
	process.stdout.write(out);
	boxDrawn = true;
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
		case "message_start": {
			const model = ev.message?.model ?? "?";
			box.addLine(`${ansi.dim("model:")} ${ansi.cyan(model)}`);
			draw();
			break;
		}
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
			// Ctrl-X: stop after current iteration
			stopAfterIteration = true;
			box.addLine(ansi.yellow("(Ctrl-X) stopping after this iteration…"));
			draw();
		}
	});
}

for (let i = 1; i <= maxIterations; i++) {
	const content = readFileSync(plan, "utf8");
	if (!content.includes("- [ ]")) {
		console.log(ansi.green(ansi.bold("all steps complete.")));
		process.exit(0);
	}

	console.log(`\n${ansi.bold(`=== iteration ${i} / ${maxIterations} ===`)}\n`);
	writeFileSync(DEBUG_LOG, `=== iteration ${i} ===\n`);
	box.reset();
	boxDrawn = false;

	const exitCode = await new Promise<number>((res) => {
		child = spawn(
			"claude",
			[
				"-p",
				content,
				"--output-format",
				"stream-json",
				"--verbose",
				"--include-partial-messages",
			],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);

		let buf = "";
		child.stdout?.on("data", (chunk: Buffer) => {
			buf += chunk.toString();
			const lines = buf.split("\n");
			buf = lines.pop() ?? "";
			for (const line of lines) processLine(line);
		});

		// Drain stderr to prevent backpressure
		child.stderr?.on("data", () => {});

		child.on("close", (code) => {
			if (buf.trim()) processLine(buf);
			child = null;
			res(code ?? 1);
		});
	});

	// Freeze the box: erase it, then print final content as plain text
	if (boxDrawn) {
		const cols = process.stdout.columns || 80;
		// Erase the drawn box
		process.stdout.write(`\x1b[${BOX_LINES + 2}A\x1b[J`);
		// Print final lines as plain text (reflows naturally on resize)
		const finalLines = box.getVisualLines(BOX_LINES, cols);
		for (const line of finalLines) {
			process.stdout.write(`${line}\n`);
		}
		boxDrawn = false;
	}

	if (exitCode === 130 || interrupted) {
		console.log("\n[chad] stopping.");
		process.exit(130);
	}

	if (stopAfterIteration) {
		console.log("[chad] stopped (Ctrl-X).");
		process.exit(0);
	}

	if (exitCode !== 0) {
		console.log(ansi.red(`claude exited with code ${exitCode}`));
	}
}

console.log(`hit max iterations (${maxIterations})`);
