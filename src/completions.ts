export const ZSH_COMPLETIONS = `

_chad_plan_files() {
  local chad_dir="\${HOME}/.chad"
  local -a incomplete complete
  if [[ -d "$chad_dir" ]]; then
    for f in "\${chad_dir}"/*.md(N); do
      local name="\${f:t}"
      if grep -q '^ *- \\[ \\]' "$f" 2>/dev/null; then
        incomplete+=("$name")
      else
        complete+=("$name")
      fi
    done
    # Show incomplete plans first, then complete ones
    if (( \${#incomplete} )); then
      compadd -Q -p '~/.chad/' -a incomplete
    fi
    if (( \${#complete} )); then
      compadd -Q -p '~/.chad/' -a complete
    fi
  fi
  _files -g '*.md'
}

_chad_first_arg() {
  local -a subcommands
  subcommands=(
    'list:List plans in ~/.chad/'
    'next:Run first incomplete plan in ~/.chad/'
    'continue:Re-run last plan used in this directory'
    'new:Create a new plan from template in ~/.chad/'
    'status:Show plan progress'
    'validate:Check plan file format and structure'
    'brainstorm:Open interactive session to develop the plan'
    'rebase:Clean up git history'
    'update:Update chad to the latest release'
    'completions:Output shell completions'
  )
  _describe 'command' subcommands
  _chad_plan_files
}

_chad_rest_args() {
  case "\${words[2]}" in
    status)
      _arguments -s -S '(-w --watch)'{-w,--watch}'[Watch for changes and re-render]' '*:plan:_chad_plan_files'
      ;;
    validate|brainstorm|rebase)
      _chad_plan_files
      ;;
    completions)
      compadd zsh
      ;;
    new)
      ;;
    *)
      _chad_plan_files
      ;;
  esac
}

_chad() {
  _arguments -s -S \\
    '(- *)'{-h,--help}'[Show help]' \\
    '(- *)'{-V,--version}'[Show version]' \\
    '--tmux[Run inside a new tmux session]' \\
    '-y[Skip interactive confirmation]' \\
    '(-m --max)'{-m,--max}'[Max iterations]:iterations:' \\
    '-b[Box height in lines]:height:' \\
    '--dry-run[Show the next step without running]' \\
    '--resume[Resume with dirty working tree]' \\
    '1:command:_chad_first_arg' \\
    '*::argument:_chad_rest_args'
}

compdef _chad chad
`;
