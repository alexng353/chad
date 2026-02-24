import { ansi, splitAtWidth, stripAnsi, wrapLine } from "./ansi";

export type ChinTag = { label: string; style?: (s: string) => string };

/**
 * Logical model for the status box.
 *
 * Owns the three constrained regions (title, content, chin) and all
 * drawing state, so the caller just sets data and calls draw().
 *
 * Wrapped visual lines for committed content are cached. Only the
 * in-progress line is re-wrapped each frame, making render() amortized
 * O(1) instead of O(total lines).
 */
export class BoxModel {
	lines: string[] = [];
	current: string | null = null;

	/** Title shown centered in the top border. */
	title = "claude";

	/** Structured chin tags rendered below the bottom border. */
	chinTags: ChinTag[] = [];

	private configuredBoxLines: number;
	private drawn = false;

	/** Cached wrapped visual lines for committed content. */
	private wrappedCache: string[] = [];
	/** The column width the cache was built at. */
	private cachedCols = 0;

	constructor(boxLines: number) {
		this.configuredBoxLines = boxLines;
	}

	/** Effective content lines, clamped to fit the terminal. */
	private get boxLines(): number {
		const rows = process.stdout.rows || 0;
		if (rows === 0) return this.configuredBoxLines;
		// Reserve 3 for top border + bottom border + chin, plus 2 for shell context
		const max = Math.max(1, rows - 5);
		return Math.min(this.configuredBoxLines, max);
	}

	/** Total lines this box occupies on screen (top + content + bottom + chin). */
	get totalHeight(): number {
		return this.boxLines + 3;
	}

	/** Commit current (if any), then push `text` as a committed line. */
	addLine(text: string) {
		if (this.current !== null) {
			this.commitCurrent();
		}
		this.lines.push(text);
		this.appendToCache(text);
	}

	/** Replace the in-progress line wholesale. */
	updateCurrent(text: string) {
		this.current = text;
	}

	/** Commit the in-progress line to the committed list. */
	finishCurrent() {
		if (this.current !== null) {
			this.commitCurrent();
		}
	}

	/** Clear all state (content, chin, drawn flag, cache). */
	reset() {
		this.lines = [];
		this.current = null;
		this.chinTags = [];
		this.drawn = false;
		this.wrappedCache = [];
		this.cachedCols = 0;
	}

	/** Replace the chin tag list. */
	setChin(tags: ChinTag[]) {
		this.chinTags = tags;
	}

	/** Return the last `boxLines` wrapped visual lines from the model. */
	getVisualLines(cols: number): string[] {
		this.ensureCache(cols);

		if (this.current !== null) {
			const inner = cols - 4;
			const currentWrapped = wrapLine(this.current, inner);
			const all = this.wrappedCache.concat(currentWrapped);
			return all.slice(-this.boxLines);
		}

		return this.wrappedCache.slice(-this.boxLines);
	}

	/** Render + cursor control: overwrites previous draw if needed. */
	draw(cols: number) {
		let out = "";
		if (this.drawn) {
			out += `\x1b[${this.totalHeight}A`;
		}
		out += this.render(cols);
		process.stdout.write(out);
		this.drawn = true;
	}

	/** Erase the drawn box, print final lines as plain text. */
	flush(cols: number) {
		if (this.drawn) {
			process.stdout.write(`\x1b[${this.totalHeight}A\x1b[J`);
			const finalLines = this.getVisualLines(cols);
			for (const line of finalLines) {
				process.stdout.write(`${line}\n`);
			}
			this.drawn = false;
		}
	}

	/** Stateless render: rebuild visual lines from the model and return the box string. */
	render(cols: number): string {
		const visualLines = this.getVisualLines(cols);
		const inner = cols - 4;
		let out = "";

		// Disable line wrapping
		out += "\x1b[?7l";

		// Top border with title
		const titleText = ` ${this.title} `;
		const dashTotal = inner + 2 - titleText.length;
		const left = Math.floor(dashTotal / 2);
		const right = dashTotal - left;
		out += `${ansi.dim(`\u250c${"\u2500".repeat(left)}`)}${ansi.bold(ansi.cyan(titleText))}${ansi.dim(`${"\u2500".repeat(right)}\u2510`)}\n`;

		// Content rows
		for (let i = 0; i < this.boxLines; i++) {
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

		// Chin bar from tags
		if (this.chinTags.length > 0) {
			const chin = this.renderChin();
			const chinVis = stripAnsi(chin).length;
			const padded =
				chinVis < inner + 4 ? chin + " ".repeat(inner + 4 - chinVis) : chin;
			out += `${padded}\n`;
		}

		// Re-enable line wrapping
		out += "\x1b[?7h";

		return out;
	}

	/** Render chin tags as:  tag1  ·  tag2  ·  tag3 */
	private renderChin(): string {
		const sep = `  ${ansi.dim("\u00b7")}  `;
		const parts = this.chinTags.map((tag) => {
			const style = tag.style ?? ansi.dim;
			return style(tag.label);
		});
		return `  ${parts.join(sep)}`;
	}

	/** Move current into lines and append its wrapped output to the cache. */
	private commitCurrent() {
		if (this.current === null) return;
		const text = this.current;
		this.lines.push(text);
		this.current = null;
		this.appendToCache(text);
	}

	/** Wrap a single line and append to the cache (if cols are known). */
	private appendToCache(text: string) {
		if (this.cachedCols === 0) return;
		const inner = this.cachedCols - 4;
		for (const v of wrapLine(text, inner)) {
			this.wrappedCache.push(v);
		}
	}

	/** Rebuild the cache if cols changed or cache is empty. */
	private ensureCache(cols: number) {
		if (cols === this.cachedCols) return;
		this.cachedCols = cols;
		const inner = cols - 4;
		this.wrappedCache = [];
		for (const line of this.lines) {
			for (const v of wrapLine(line, inner)) {
				this.wrappedCache.push(v);
			}
		}
	}
}
