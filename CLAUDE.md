# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CLI tool that generates AI-powered Git commit messages using **Ollama** when available, falling back to **LM Studio** (or any OpenAI-compatible API endpoint). It analyzes staged git changes and generates conventional commit messages through a local AI model.

## Architecture

**Modular Design**: The application is organized into focused modules with clear separation of concerns:

```
src/
  ├── index.js              # CLI entry point, orchestrates the flow
  ├── config/
  │   └── env.js            # Environment configuration & validation
  ├── services/
  │   ├── ollama.js         # Ollama availability checks
  │   ├── lmstudio.js       # LM Studio process management
  │   └── ai.js             # AI commit message generation
  └── utils/
      ├── git.js            # Git operations (diff, commit)
      ├── tokens.js         # Token estimation & context size selection
      └── ui.js             # User interaction (prompts, help)
```

**Main Flow** (orchestrated in `src/index.js`):
1. Checks if Ollama is reachable via its OpenAI-compatible API (`services/ollama.js`)
2. If Ollama is available, uses it directly without auto-start
3. If Ollama is not available, ensures LM Studio is running and auto-starts it if needed (`services/lmstudio.js`)
4. Waits for the selected backend API to become accessible (LM Studio: 30s timeout)
5. Reads staged git changes using `git diff --cached` (`utils/git.js`)
6. Sends the diff to the selected backend's API endpoint (`services/ai.js`). Context is sized per request: Ollama sets `num_ctx` on `/api/chat`, and LM Studio reloads the model via `lms` with a larger context if needed
7. Generates a commit message using the AI model
8. Prompts for user confirmation with timeout (`utils/ui.js`)
9. Executes the commit using secure spawn methods (`utils/git.js`)

**Key Modules**:

- `config/env.js`: Loads environment variables via dotenv, exports config object
- `utils/git.js`: `getStagedDiff()`, `executeGitCommit()` with array arguments to prevent command injection
- `utils/ui.js`: `showHelp()`, `promptConfirmation()` with TTY detection and 30s timeout
- `services/lmstudio.js`: `checkLMStudioAccessible()`, `ensureLMStudioRunning()`, platform-specific startup
- `services/ai.js`: `generateCommitMessage()`, `ollamaChat()` (native `/api/chat`), system prompt definition, OpenAI client initialization (LM Studio only)

## Environment Configuration

The tool requires environment variables for configuration:
- `OLLAMA_MODEL`: (Optional) Ollama model ID for commit messages (default: `qwen3:4b`)
- `OLLAMA_BASE_URL`: Ollama endpoint (default: http://127.0.0.1:11434/v1). The availability check uses this `/v1` URL; generation strips a trailing `/v1` and calls native `/api/chat`
- `OLLAMA_API_KEY`: Optional API key, sent as a Bearer header on both the availability check and `/api/chat` (default: `ollama`, which is always sent since it is the fallback; Ollama does not require it)
- `OLLAMA_CONTEXT_STEPS`: Comma-separated `num_ctx` sizes to choose from (default: 4096,8192,16384,32768)
- `OLLAMA_TOKEN_BUFFER`: Tokens reserved on top of the prompt estimate when picking `num_ctx` (default: 350)
- `LMSTUDIO_MODEL`: (Optional) Model ID for the LM Studio AI model (default: `qwen3.5-4b`)
- `LMSTUDIO_BASE_URL`: LM Studio API endpoint (default: http://localhost:1234/v1)
- `LMSTUDIO_API_KEY`: LM Studio API key (default: lm-studio)
- `LMSTUDIO_START_COMMAND`: Command to start LM Studio if not running (platform-specific defaults: `open -a "LM Studio"` on macOS, `start lmstudio` on Windows; set to "false" to disable auto-start)
- `LMSTUDIO_LOAD_MODEL`: Auto-load the model via `lms` (default: true; set to "false" to disable)
- `LMSTUDIO_GPU`: GPU offload for `lms load`: "max", "auto" (LM Studio default), or 0.0-1.0 (default: auto)
- `LMSTUDIO_CONTEXT_LENGTH`: (Optional) Context length passed to `lms load --context-length`
- `LMSTUDIO_MODEL_IDENTIFIER`: (Optional) Custom identifier passed to `lms load --identifier`
- `LMSTUDIO_DEFAULT_CONTEXT`: Context size assumed when LM Studio does not report one (default: 4096)
- `LMSTUDIO_CONTEXT_STEPS`: Comma-separated context sizes LM Studio may be reloaded with (default: 4096,8192,16384,32768)
- `LMSTUDIO_TOKEN_BUFFER`: Tokens reserved on top of the prompt estimate when picking a context size (default: 350)
- `COMMIT_TEMPERATURE`: Generation temperature (default: 0.3)

These are typically stored in a `.env` file (gitignored) loaded from the package root using dotenv.

## CLI Command

The tool is designed to be installed globally or run directly:
```bash
# Run the tool
node src/index.js

# Or if installed globally
ai-commit

# Preview mode (no commit)
ai-commit --no-commit

# Show help
ai-commit --help
```

## Development Commands

**Run the tool**:
```bash
node src/index.js
```

**Install dependencies**:
```bash
npm install
```

**Test locally before installing**:
```bash
# Stage some changes first
git add .
node src/index.js --no-commit
```

## Important Implementation Details

1. **Security**: Uses `spawnSync` with array arguments instead of string interpolation to prevent command injection (see `executeGitCommit()` in `src/utils/git.js`)

2. **LM Studio Auto-Start** (in `src/services/lmstudio.js`):
   - Automatically detects if LM Studio is running by pinging the `/v1/models` endpoint
   - If not running, spawns LM Studio using platform-specific commands (detached process)
   - Waits up to 30 seconds for the API to become accessible with 1-second polling intervals
   - Can be disabled by setting `LMSTUDIO_START_COMMAND=false`

3. **Environment Loading**: dotenv loads `.env` from package root (two directories up from src/config/) in `src/config/env.js`

4. **Prompt Engineering**: The system prompt is defined in `SYSTEM_PROMPT` constant in `src/services/ai.js` and follows Conventional Commits conventions (feat, fix, refactor, etc.)

5. **Error Handling**: All major functions have try-catch blocks with specific error messages for debugging

6. **Non-interactive Support**: Detects TTY availability in `promptConfirmation()` (`src/utils/ui.js`) and aborts gracefully in non-interactive environments

7. **Context Sizing** (in `src/services/ai.js`, helpers in `src/utils/tokens.js`):
   - Ollama: `num_ctx` is picked per request as the smallest `OLLAMA_CONTEXT_STEPS` value that fits the estimated prompt plus `OLLAMA_TOKEN_BUFFER`. If none fits, the tool fails with a "exceeds maximum context" error instead of letting Ollama truncate silently
   - LM Studio: the model is reloaded via `lms` with a larger context when the prompt exceeds the loaded context

8. **Module System**: Uses ES modules (`"type": "module"` in package.json), so all imports use `import` syntax and `.js` extensions

## Node Version

Requires Node.js >= 18.0.0 (specified in `engines` field)
