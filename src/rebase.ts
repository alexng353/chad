import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function run(cmd: string): string {
	try {
		return execSync(cmd, { encoding: "utf8" }).trim();
	} catch {
		return "";
	}
}

const SYSTEM_PROMPT = `You are helping the user clean up git history produced by chad (an autonomous plan runner). Chad creates one commit per plan step, which often results in many small "[agent]" commits that should be squashed, reworded, or reorganized before merging.

## Your job

1. Analyze the commits on the current branch vs the base branch
2. Propose a rebase strategy — which commits to squash together, which to reword, which to keep
3. Discuss with the user until they're happy with the plan
4. Execute the rebase

## Rebase techniques

Since \`git rebase -i\` requires an interactive editor, use one of these approaches:

### GIT_SEQUENCE_EDITOR approach
Write a sed/script command that transforms the rebase todo list:
\`\`\`bash
GIT_SEQUENCE_EDITOR="sed -i 's/pick <hash>/squash <hash>/'" git rebase -i <base>
\`\`\`

### Reset + recommit approach (simpler for major squashes)
\`\`\`bash
# Save current state
git branch backup-before-rebase

# Soft reset to base, then recommit in logical groups
git reset --soft <base>
git commit -m "feat: description of all changes"
\`\`\`

### Autosquash approach
\`\`\`bash
# For fixup commits
git commit --fixup=<target-hash>
git rebase -i --autosquash <base>
\`\`\`

## Rules

- ALWAYS create a backup branch before rebasing: \`git branch backup-before-rebase-<timestamp>\`
- Show the user the proposed commit structure before executing
- Preserve co-authorship attributions
- Keep the plan file changes in the final commits
- If something goes wrong, \`git rebase --abort\` or restore from backup`;

export function runRebase(planPath: string) {
	// Gather context
	const branch = run("git rev-parse --abbrev-ref HEAD");
	const mainBranch =
		run("git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null").replace(
			"refs/remotes/origin/",
			"",
		) || "main";
	const mergeBase = run(`git merge-base ${mainBranch} HEAD`);
	const commitLog = run(`git log --oneline ${mergeBase}..HEAD`);
	const commitCount = commitLog ? commitLog.split("\n").length : 0;
	const diffStat = run(`git diff --stat ${mergeBase}..HEAD`);

	if (commitCount === 0) {
		console.error("error: no commits ahead of %s", mainBranch);
		process.exit(1);
	}

	// Build initial prompt with context
	let context = `## Current state

**Branch:** ${branch}
**Base:** ${mainBranch} (merge-base: ${mergeBase.slice(0, 8)})
**Commits ahead:** ${commitCount}

### Commit log
\`\`\`
${commitLog}
\`\`\`

### Diff stat
\`\`\`
${diffStat}
\`\`\``;

	if (existsSync(planPath)) {
		const planContent = readFileSync(planPath, "utf8");
		context += `\n\n### Plan file\n\`\`\`\n${planContent}\n\`\`\``;
	}

	context +=
		"\n\nAnalyze these commits and propose a rebase strategy. Show me what the final commit history would look like.";

	const args = ["--system-prompt", SYSTEM_PROMPT, context];

	const { status } = spawnSync("claude", args, { stdio: "inherit" });
	process.exit(status ?? 0);
}
