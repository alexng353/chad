#!/usr/bin/env bun
/**
 * Minimal MCP stdio server exposing an `escapeHatch` tool.
 * When called, writes a signal file so chad knows to stop.
 */
import { appendFileSync, writeFileSync } from "node:fs";

const MCP_LOG = "/tmp/chad-mcp.log";
function mcpLog(msg: string) {
	appendFileSync(MCP_LOG, `[${new Date().toISOString()}] ${msg}\n`);
}

const SIGNAL_FILE = process.env.CHAD_SIGNAL_FILE;
if (!SIGNAL_FILE) {
	mcpLog("CHAD_SIGNAL_FILE not set, exiting");
	process.stderr.write("mcp: CHAD_SIGNAL_FILE not set\n");
	process.exit(1);
}
mcpLog(`started (signal=${SIGNAL_FILE}, pid=${process.pid})`);

function send(msg: Record<string, unknown>) {
	const json = JSON.stringify(msg);
	mcpLog(`send: ${json.slice(0, 200)}`);
	process.stdout.write(`${json}\n`);
}

function handle(msg: Record<string, unknown>) {
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
							name: "escapeHatch",
							description:
								"Stop the chad loop runner. Call this when the current step is impossible, blocked, or requires human intervention. Provide a clear reason.",
							inputSchema: {
								type: "object",
								properties: {
									reason: {
										type: "string",
										description: "Why this step cannot be completed",
									},
								},
								required: ["reason"],
							},
						},
					],
				},
			});
			break;
		case "tools/call": {
			const params = msg.params as Record<string, unknown>;
			const args = (params.arguments ?? {}) as Record<string, string>;
			const reason = args.reason ?? "no reason given";
			writeFileSync(SIGNAL_FILE, JSON.stringify({ reason }));
			send({
				jsonrpc: "2.0",
				id,
				result: {
					content: [
						{
							type: "text",
							text: `chad will stop after this iteration. Reason: ${reason}`,
						},
					],
				},
			});
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
			handle(JSON.parse(trimmed));
		} catch {
			// not valid JSON, skip
		}
	}
	// Also try parsing the remaining buffer as a complete JSON object
	const trimmed = inputBuf.trim();
	if (trimmed) {
		try {
			handle(JSON.parse(trimmed));
			inputBuf = "";
		} catch {
			// incomplete, wait for more data
		}
	}
});
