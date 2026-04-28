# Chad Improvement Areas

Audit of the chad codebase (v0.8.1, 3,319 lines TypeScript) identifying areas for improvement, grouped by category and estimated effort.

---

## Architecture

### Large: Extract `run.ts` into modules

`executeRun` is a single ~850-line function handling lock acquisition, tmux re-exec, coffee mode, confirmation UI, box model setup, stream JSON parsing, MCP signal handling, re-execution logic, timing stats, and the main iteration loop. Impossible to test any single concern in isolation.

**Decomposition candidates:**
- Lock management -> `src/lock.ts`
- Stream event parsing/handling -> `src/stream.ts`
- MCP signal processing -> extend `src/mcp.ts`
- Prompt construction -> pure function in `src/prompt.ts`
- Timing/stats tracking -> small class or module
- Confirmation UI -> separate function

This is a prerequisite for adding tests.

### Medium: Signal file IPC is fragile

Chad communicates with the MCP server by appending JSON lines to `/tmp/chad-escape-<pid>.json`. This has race conditions:

- `run.ts:800-806` reads the file, then `unlinkSync`s it, then parses. If the MCP server writes between read and unlink, that signal is lost.
- No file locking -- concurrent writes from MCP could produce partial JSON lines.
- If chad crashes between reading and deleting, signals are orphaned.

A named pipe (FIFO), Unix domain socket, or Node's built-in IPC channel (`child_process` with `stdio: 'ipc'`) would be more robust.

### Small: Hardcoded debug paths with no PID isolation

`DEBUG_LOG` at `run.ts:54` is a single shared `/tmp/chad-debug.log`. Two concurrent chad runs (different lock hashes) interleave their debug output in the same file. Other logs (`/tmp/chad-mcp.log`) have the same problem. None are cleaned up automatically.

---

## Testing

### Large: No test suite

Zero tests across 3,319 lines. No test framework configured. Bun has a built-in test runner (`bun test`) so the barrier is low.

**High-value targets (pure functions, trivially testable):**
- `plan.ts` -- `parseSteps`, `extractCurrentStepBlock`, `markCurrentStepComplete`, `validatePlan`
- `router.ts` -- `parseFlags` (numeric coercion, unknown flags, missing values)
- `mcp.ts` -- `handle()` takes a signal file path and message object
- `config.ts` -- `loadConfig()` with various TOML inputs / missing files
- `box.ts` -- `getVisualLines`, wrapping/caching logic
- `ansi.ts` -- `splitAtWidth`, `wrapLine`, `mdToAnsi`

---

## Reliability

### Medium: No retry strategy for Claude failures

When `claude -p` exits non-zero (`run.ts:906-908`), chad prints the error and sends the exact same prompt again next iteration. No backoff/delay, no distinction between transient errors (rate limit, network) and permanent ones (auth failure), no configurable behavior (stop vs retry vs skip).

### Medium: Inconsistent error handling

- Many `catch {}` blocks silently swallow errors (`run.ts:102`, `run.ts:167-174`, `run.ts:882`, `mcp.ts:237`).
- `process.exit()` called in ~20 places, making cleanup unreliable.
- Lock file cleanup relies on `process.on("exit")` but `process.exit()` doesn't guarantee all handlers run in all edge cases.

### Small: No step-level or wall-clock timeout

`--max` caps iterations but there's no wall-clock timeout for the entire run. A stuck Claude instance runs until manually killed. A `--timeout` flag (per-step or per-run) would prevent runaway executions.

---

## Observability

### Medium: No structured run logs

Everything goes to `/tmp/chad-debug.log` as raw stream events. No JSON summary of what ran, what succeeded, what failed. A structured log (iteration number, step name, duration, token counts, exit code, signals received) would make debugging failed runs much easier.

### Small: No cost tracking

Token counts are displayed per-iteration in the box UI but never accumulated or logged. A post-run summary of total input/output tokens (and estimated cost) would be useful for long plans.

---

## Validation

### Medium: Plan validation gaps

- Step numbering (`<phase>.<seq>`) is documented in the README but never validated.
- No check for duplicate step numbers.
- No check that phases are in order.
- `extractCurrentStepBlock` uses simple regex that could be confused by checkboxes inside fenced code blocks.

### Small: Config validation is silent

`config.ts` silently falls back to defaults for invalid values. `max = "fifty"` silently becomes 50. `notifications = "dne"` (typo) silently becomes `"none"`. Should warn on unrecognized values.

---

## Platform Support

### Medium: Notifications are Linux-only

`notify-send` (`run.ts:30`) doesn't exist on macOS. No `osascript` fallback or cross-platform abstraction. Coffee mode (`systemd-inhibit`) is also Linux-only with no macOS `caffeinate` equivalent.

### Small: Shell completions only support zsh

No bash or fish completion generators. Bash is the more common default shell.

---

## Code Quality

### Small: `noExplicitAny` suppressions

Three `biome-ignore lint/suspicious/noExplicitAny` pragmas (`run.ts:421`, `run.ts:520`, `run.ts:578`). Stream events and MCP messages could be properly typed with discriminated unions.

### Small: Tool summary switch statement

`showToolSummary` (`run.ts:521-576`) uses a growing switch statement for each tool name. Could be a `Record<string, (input) => string | null>` registry that's easier to extend.
