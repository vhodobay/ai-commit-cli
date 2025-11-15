# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CLI tool that generates AI-powered Git commit messages using LM Studio (or any OpenAI-compatible API endpoint). It analyzes staged git changes and generates conventional commit messages through a local AI model.

## Architecture

**Modular Design**: The application is organized into focused modules with clear separation of concerns:

```
src/
  ├── index.js              # CLI entry point, orchestrates the flow
  ├── config/
  │   └── env.js            # Environment configuration & validation
  ├── services/
  │   ├── lmstudio.js       # LM Studio process management
  │   └── ai.js             # AI commit message generation
  └── utils/
      ├── git.js            # Git operations (diff, commit)
      └── ui.js             # User interaction (prompts, help)
```

**Main Flow** (orchestrated in `src/index.js`):
1. Checks if LM Studio is running, auto-starts it if needed (`services/lmstudio.js`)
2. Waits for LM Studio API to become accessible (30s timeout)
3. Reads staged git changes using `git diff --cached` (`utils/git.js`)
4. Sends the diff to an LM Studio API endpoint (`services/ai.js`)
5. Generates a commit message using the AI model
6. Prompts for user confirmation with timeout (`utils/ui.js`)
7. Executes the commit using secure spawn methods (`utils/git.js`)

**Key Modules**:

- `config/env.js`: Loads environment variables via dotenv, exports config object, validates required settings
- `utils/git.js`: `getStagedDiff()`, `executeGitCommit()` with array arguments to prevent command injection
- `utils/ui.js`: `showHelp()`, `promptConfirmation()` with TTY detection and 30s timeout
- `services/lmstudio.js`: `checkLMStudioAccessible()`, `ensureLMStudioRunning()`, platform-specific startup
- `services/ai.js`: `generateCommitMessage()`, system prompt definition, OpenAI client initialization

## Environment Configuration

The tool requires environment variables for configuration:
- `LMSTUDIO_MODEL`: (Required) Model ID for the AI model
- `LMSTUDIO_BASE_URL`: API endpoint (default: http://localhost:1234/v1)
- `LMSTUDIO_API_KEY`: API key (default: lm-studio)
- `LMSTUDIO_START_COMMAND`: Command to start LM Studio if not running (platform-specific defaults: `open -a "LM Studio"` on macOS, `start lmstudio` on Windows; set to "false" to disable auto-start)
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

4. **Environment Validation**: The `validateConfig()` function in `src/config/env.js` checks for required `LMSTUDIO_MODEL` and provides clear error messages if missing

5. **Prompt Engineering**: The system prompt is defined in `SYSTEM_PROMPT` constant in `src/services/ai.js` and follows Conventional Commits conventions (feat, fix, refactor, etc.)

6. **Error Handling**: All major functions have try-catch blocks with specific error messages for debugging

7. **Non-interactive Support**: Detects TTY availability in `promptConfirmation()` (`src/utils/ui.js`) and aborts gracefully in non-interactive environments

8. **Module System**: Uses ES modules (`"type": "module"` in package.json), so all imports use `import` syntax and `.js` extensions

## Node Version

Requires Node.js >= 18.0.0 (specified in `engines` field)
