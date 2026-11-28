# Crew daemon

Runs the AI executives on this computer, using your Claude login (no API keys, no cloud routine, no network allowlist).

How it works: every 15 seconds it asks the Crew gateway, with the CFO's key, whether any task is waiting. A task is waiting when you wrote to an
executive, an executive wrote to a colleague, something happened that concerns them (new expenses or invoices, missing receipts, a payment batch),
or it is the daily stand-up or the weekly self-review. For each task it starts one short headless Claude Code session as that executive, with only
that executive's key, which can only run `curl` and read files and only talks to the gateway. Nothing runs when nothing is waiting, and nothing runs
when this PC is off or you are offline (the system only queues event tasks while you are online in KDOps).

## Set up (once)

1. In KDOps open **Crew > Team** and click **Download keys for the PC**. It saves `crew-daemon.env` (one key per executive). Put it in this folder.
   The file is private: never commit it, never send it. (It is already ignored by git.)
2. Make sure `claude` works in a terminal (Claude Code, signed in) and Node 20 or newer is installed.
3. Test: `node crew-daemon.mjs`. Write to an executive in KDOps; within about 15 seconds the log shows `start ...`.
4. Start with Windows: `powershell -ExecutionPolicy Bypass -File install-startup.ps1`.

## Settings in `crew-daemon.env` (all optional)

`POLL_SECONDS=15`, `MAX_PARALLEL=2`, `TASK_TIMEOUT_SECONDS=600`, `MODEL_CFO=claude-opus-4-8`, `MODEL_TEAM=claude-sonnet-5-5`, `CLAUDE_BIN=claude`.
