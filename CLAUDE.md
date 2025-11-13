# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CLI tool that generates AI-powered Git commit messages using LM Studio (or any OpenAI-compatible API endpoint). It analyzes staged git changes and generates conventional commit messages through a local AI model.

## Architecture

**Single-file Design**: The entire application logic is contained in `src/index.js` - a Node.js CLI script that:
1. Reads staged git changes using `git diff --cached`
2. Sends the diff to an LM Studio API endpoint (OpenAI-compatible)
3. Generates a commit message using the AI model
4. Prompts for user confirmation (with timeout)
5. Executes the commit using secure spawn methods

**Key Functions**:
- `getStagedDiff()`: Retrieves staged changes, includes git repository validation
- `promptConfirmation()`: Interactive TTY prompt with 30s timeout for non-interactive environments
- `executeGitCommit()`: Uses `spawnSync` with array arguments to prevent command injection
- `main()`: Orchestrates the entire flow with error handling

## Environment Configuration

The tool requires environment variables for configuration:
- `LMSTUDIO_MODEL`: (Required) Model ID for the AI model
- `LMSTUDIO_BASE_URL`: API endpoint (default: http://localhost:1234/v1)
- `LMSTUDIO_API_KEY`: API key (default: lm-studio)
- `COMMIT_TEMPERATURE`: Generation temperature (default: 0.3)

These are typically stored in a `.env` file (gitignored).

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

1. **Security**: Uses `spawnSync` with array arguments instead of string interpolation to prevent command injection (see `executeGitCommit()`)

2. **Environment Validation**: Checks for required `LMSTUDIO_MODEL` and provides clear error messages if missing

3. **Prompt Engineering**: The system prompt is hardcoded in `main()` and follows Conventional Commits conventions (feat, fix, refactor, etc.)

4. **Error Handling**: All major functions have try-catch blocks with specific error messages for debugging

5. **Non-interactive Support**: Detects TTY availability and aborts gracefully in non-interactive environments

6. **Module System**: Uses ES modules (`"type": "module"` in package.json), so all imports use `import` syntax

## Node Version

Requires Node.js >= 18.0.0 (specified in `engines` field)
