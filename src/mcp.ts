#!/usr/bin/env bun
/**
 * Minimal MCP stdio server exposing `completeStep` and `escapeHatch` tools.
 * When called, writes a signal file so chad knows what to do next.
 */
import { appendFileSync } from "node:fs";

const MCP_LOG = "/tmp/chad-mcp.log";
function mcpLog(msg: string) {
	appendFileSync(MCP_LOG, `[${new Date().toISOString()}] ${msg}\n`);
}

function send(msg: Record<string, unknown>) {
	const json = JSON.stringify(msg);
	mcpLog(`send: ${json.slice(0, 200)}`);
	process.stdout.write(`${json}\n`);
}

function handle(signalFile: string, msg: Record<string, unknown>) {
	mcpLog(`recv: ${msg.method}`);
	const id = msg.id;
	switch (msg.method) {
		case "initialize":
			send({
				jsonrpc: "2.0",
				id,
				result: {
					protocolVersion: "2024-11-05",
					capabilities: { tools: {} },
					serverInfo: { name: "chad-escape", version: "1.0.0" },
				},
			});
			break;
		case "notifications/initialized":
			// no response needed
			break;
		case "tools/list":
			send({
				jsonrpc: "2.0",
				id,
				result: {
					tools: [
						{
							name: "completeStep",
							description:
								"Mark the current step as complete. Call this when you have finished executing the current step and validated your work. Chad will mark the checkbox for you.",
							inputSchema: {
								type: "object",
								properties: {},
							},
						},
						{
							name: "escapeHatch",
							description:
								'Stop the chad loop runner. Use type "failure" when the current step is impossible, blocked, or requires human intervention. Use type "success" only when the ENTIRE plan is complete and there is no more work to do.',
							inputSchema: {
								type: "object",
								properties: {
									type: {
										type: "string",
										enum: ["success", "failure"],
										description:
											'"success" if the entire plan is complete, "failure" if blocked or impossible',
									},
									message: {
										type: "string",
										description:
											"Why the plan is complete (success) or why it cannot continue (failure)",
									},
								},
								required: ["type", "message"],
							},
						},
					],
				},
			});
			break;
		case "tools/call": {
			const params = msg.params as Record<string, unknown>;
			const toolName = params.name as string;
			const args = (params.arguments ?? {}) as Record<string, string>;

			if (toolName === "completeStep") {
				appendFileSync(
					signalFile,
					`${JSON.stringify({ type: "step_complete" })}\n`,
				);
				send({
					jsonrpc: "2.0",
					id,
					result: {
						content: [
							{
								type: "text",
								text: "Step marked complete. Chad will advance to the next step.",
							},
						],
					},
				});
			} else if (toolName === "escapeHatch") {
				const escapeType = args.type ?? "failure";
				const message = args.message ?? "no message given";
				if (escapeType === "success") {
					appendFileSync(
						signalFile,
						`${JSON.stringify({ type: "done", message })}\n`,
					);
					send({
						jsonrpc: "2.0",
						id,
						result: {
							content: [
								{
									type: "text",
									text: `chad will stop — plan complete. ${message}`,
								},
							],
						},
					});
				} else {
					appendFileSync(
						signalFile,
						`${JSON.stringify({ type: "escape", message })}\n`,
					);
					send({
						jsonrpc: "2.0",
						id,
						result: {
							content: [
								{
									type: "text",
									text: `chad will stop after this iteration. Reason: ${message}`,
								},
							],
						},
					});
				}
			} else {
				send({
					jsonrpc: "2.0",
					id,
					error: { code: -32601, message: `Unknown tool: ${toolName}` },
				});
			}
			break;
		}
		default:
			if (id !== undefined) {
				send({
					jsonrpc: "2.0",
					id,
					error: { code: -32601, message: "Method not found" },
				});
			}
	}
}

/**
 * Run the MCP server. Reads JSON-RPC from stdin, writes to stdout.
 * This function never returns — it keeps the process alive via stdin listener.
 */
export function runMcpServer(): void {
	const signalFile = process.env.CHAD_SIGNAL_FILE;
	if (!signalFile) {
		mcpLog("CHAD_SIGNAL_FILE not set, exiting");
		process.stderr.write("mcp: CHAD_SIGNAL_FILE not set\n");
		process.exit(1);
	}
	mcpLog(`started (signal=${signalFile}, pid=${process.pid})`);

	// --- Read JSON-RPC messages from stdin ---
	// Claude Code sends bare JSON (one object per chunk), not Content-Length framed.
	let inputBuf = "";
	process.stdin.setEncoding("utf8");
	process.stdin.on("data", (chunk: string) => {
		inputBuf += chunk;
		// Try to parse complete JSON objects separated by newlines
		const lines = inputBuf.split("\n");
		inputBuf = lines.pop() ?? "";
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				handle(signalFile, JSON.parse(trimmed));
			} catch {
				// not valid JSON, skip
			}
		}
		// Also try parsing the remaining buffer as a complete JSON object
		const trimmed = inputBuf.trim();
		if (trimmed) {
			try {
				handle(signalFile, JSON.parse(trimmed));
				inputBuf = "";
			} catch {
				// incomplete, wait for more data
			}
		}
	});
}

// --- Direct execution (source mode: `bun run mcp.ts`) ---
// In compiled mode this module is always imported — never run directly.
// Only auto-start when run as a standalone script via bun.
if (!Bun.main.startsWith("/$bunfs/root/") && Bun.main.endsWith("/mcp.ts")) {
	runMcpServer();
}
