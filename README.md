# chad

Autonomous plan runner for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Feeds a markdown checklist to `claude -p` one iteration at a time until every step is complete.

Each iteration reads the full plan file fresh with no conversation history. Claude finds the first unchecked step (`- [ ]`), executes it, marks it done (`- [x]`), commits, pushes, and exits. Chad loops until the plan is finished.

## Install

Requires the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`claude`).

### Binary (recommended)

Download a prebuilt binary from the [latest release](https://github.com/alexng353/chad/releases/latest) and put it on your PATH:

```bash
# Linux x64
curl -fsSL https://github.com/alexng353/chad/releases/latest/download/chad-linux-x64 -o ~/.local/bin/chad
chmod +x ~/.local/bin/chad

# macOS Apple Silicon
curl -fsSL https://github.com/alexng353/chad/releases/latest/download/chad-darwin-arm64 -o /usr/local/bin/chad
chmod +x /usr/local/bin/chad
```

Update to the latest version at any time:

```bash
chad update
```

### From source

Requires [Bun](https://bun.sh).

```bash
git clone https://github.com/alexng353/chad.git
cd chad
bun install
bun link
```

## Usage

```
chad [options] PLAN_FILE
chad <command> PLAN_FILE
```

### Commands

| Command | Description |
|---------|-------------|
| `new NAME` | Create a plan from template in `~/.chad/` |
| `status [PLAN]` | Show progress (interactive picker if no plan given) |
| `validate PLAN` | Check plan file format and structure |
| `brainstorm PLAN` | Interactive Claude session to develop the plan |
| `rebase PLAN` | Clean up git history with Claude's help |
| `list` | List all plans in `~/.chad/` |
| `next` | Run the first incomplete plan in `~/.chad/` |
| `continue` | Re-run the last plan used in this directory |
| `update` | Update chad to the latest release |
| `completions zsh` | Output zsh completion script |

### Flags

| Flag | Description |
|------|-------------|
| `-y` | Skip confirmation prompt |
| `-m, --max N` | Max iterations (default: 50) |
| `-b N` | Box height in lines (default: 30) |
| `--dry-run` | Show next step without running |
| `--tmux` | Run inside a new tmux session |

### Keybindings

- **Ctrl-C** &mdash; kill current iteration and exit immediately
- **Ctrl-X** &mdash; stop after the current iteration finishes

## Quick start

```bash
# create a new plan
chad new my-feature

# edit the plan
$EDITOR ~/.chad/my-feature.md

# validate it
chad validate ~/.chad/my-feature.md

# run it
chad ~/.chad/my-feature.md
```

## Shell completions

### Zsh

```bash
# Create the completions directory if needed
mkdir -p ~/.zfunc

# Generate the completion script
chad completions zsh > ~/.zfunc/_chad
```

Add to your `~/.zshrc` (if not already present):

```bash
fpath=(~/.zfunc $fpath)
autoload -Uz compinit && compinit
```

## Skills

Chad ships [Claude Code skills](https://docs.anthropic.com/en/docs/claude-code/skills) that let you invoke chad commands directly from Claude Code conversations. Skills are markdown files that teach Claude how to use chad's CLI.

### Install

```bash
# Symlink all skills into ~/.claude/skills/
bash scripts/install-skills.sh

# Preview what would be installed (dry run)
bash scripts/install-skills.sh --dry-run
```

Or manually symlink a single skill:

```bash
ln -s /path/to/chad/.claude/skills/chad-run ~/.claude/skills/chad-run
```

### Available skills

| Skill | Triggers | Description |
|-------|----------|-------------|
| `chad-run` | "run plan", "chad run", "execute plan", "start plan" | Run a chad plan |
| `chad-status` | "plan status", "chad status", "check progress", "how far along" | Check plan progress |
| `chad-validate` | "validate plan", "chad validate", "check plan format" | Validate a plan's format |
| `chad-new` | "new plan", "chad new", "create plan", "start a new chad plan" | Create a new plan from template |
| `chad-brainstorm` | "brainstorm plan", "chad brainstorm", "refine plan", "improve plan" | Refine an existing plan |

### Non-interactive mode

All skills support a `--non-interactive` / `-y` flag. When present in `$ARGUMENTS`, the skill skips confirmations and interactive pickers — useful when another agent calls a skill inside an autonomous loop.

```bash
# Example: run a plan without prompting (from another agent)
/chad-run my-feature --non-interactive
```

## Plan format

Plans are markdown files with three sections:

```markdown
# Title

## Agent Instructions
Rules the agent follows every iteration.

---

## Reference
Project context, architecture notes, links.

---

## Steps

### Phase 0: Setup

- [ ] **0.1 Step title**
  Description of what to do.
  **Validate:** `command that proves the step worked`

- [ ] **0.2 Next step**
  ...
```

Steps must be numbered `<phase>.<seq>` and each unchecked step must have a `**Validate:**` line. Run `chad validate` to check your plan before executing.

## How it works

1. Chad reads the plan file and finds the first unchecked step
2. The full plan (with the current step highlighted) is sent to `claude -p`
3. Claude executes the step, runs validation, marks it `- [x]`, commits, and pushes
4. Chad reads the plan file again and repeats from step 1
5. Loop ends when all steps are checked or max iterations is reached

An MCP escape hatch tool is available to Claude &mdash; if a step is blocked or impossible, the agent calls `escapeHatch` and chad stops so you can intervene.

## License

[GPL-3.0](LICENSE)
