import { ansi, splitAtWidth, stripAnsi, wrapLine } from "./ansi";

/**
 * Logical model for the status box.
 *
 * Stores committed lines and a single in-progress line separately.
 * Rendering is stateless — the model is re-rendered from scratch each frame.
 */
export class BoxModel {
	lines: string[] = [];
	current: string | null = null;

	/** Commit current (if any), then push `text` as a committed line. */
	addLine(text: string) {
		if (this.current !== null) {
			this.lines.push(this.current);
			this.current = null;
		}
		this.lines.push(text);
	}

	/** Replace the in-progress line wholesale. */
	updateCurrent(text: string) {
		this.current = text;
	}

	/** Commit the in-progress line to the committed list. */
	finishCurrent() {
		if (this.current !== null) {
			this.lines.push(this.current);
			this.current = null;
		}
	}

	/** Clear all state. */
	reset() {
		this.lines = [];
		this.current = null;
	}

	/** Return the last `boxLines` wrapped visual lines from the model. */
	getVisualLines(boxLines: number, cols: number): string[] {
		const all =
			this.current !== null ? [...this.lines, this.current] : this.lines;
		const inner = cols - 4;

		const visual: string[] = [];
		for (const line of all) {
			for (const v of wrapLine(line, inner)) {
				visual.push(v);
			}
		}

		return visual.slice(-boxLines);
	}

	/** Stateless render: rebuild visual lines from the model and return the box string. */
	render(boxLines: number, cols: number, chin?: string): string {
		return renderBox(this.getVisualLines(boxLines, cols), boxLines, cols, chin);
	}
}

/** Build the complete box string from an array of visual lines. */
export function renderBox(
	visualLines: string[],
	boxLines: number,
	cols: number,
	chin?: string,
): string {
	const inner = cols - 4;
	let out = "";

	// Disable line wrapping
	out += "\x1b[?7l";

	// Top border
	const title = " claude ";
	const dashTotal = inner + 2 - title.length;
	const left = Math.floor(dashTotal / 2);
	const right = dashTotal - left;
	out += `${ansi.dim(`\u250c${"\u2500".repeat(left)}`)}${ansi.bold(ansi.cyan(title))}${ansi.dim(`${"\u2500".repeat(right)}\u2510`)}\n`;

	// Content rows
	for (let i = 0; i < boxLines; i++) {
		const raw = visualLines[i] ?? "";
		const visLen = stripAnsi(raw).length;
		let content: string;
		if (visLen > inner) {
			const [truncated] = splitAtWidth(raw, inner - 1);
			content = `${truncated}\u2026`;
		} else {
			content = raw + " ".repeat(inner - visLen);
		}
		out += `${ansi.dim("\u2502")} ${content} ${ansi.dim("\u2502")}\n`;
	}

	// Bottom border
	out += `${ansi.dim(`\u2514${"\u2500".repeat(inner + 2)}\u2518`)}\n`;

	// Chin bar
	if (chin) {
		const chinVis = stripAnsi(chin).length;
		const padded =
			chinVis < inner + 4 ? chin + " ".repeat(inner + 4 - chinVis) : chin;
		out += `${padded}\n`;
	}

	// Re-enable line wrapping
	out += "\x1b[?7h";

	return out;
}
