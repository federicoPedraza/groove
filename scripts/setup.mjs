#!/usr/bin/env node

import { chmodSync, existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const MODE_SETUP = "setup";
const MODE_CHECKER_REPAIR = "checker-repair";
const VALID_MODES = new Set([MODE_SETUP, MODE_CHECKER_REPAIR]);

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

function log(message) {
  process.stdout.write(`[setup] ${message}\n`);
}

function error(message) {
  process.stderr.write(`[setup] error: ${message}\n`);
}

function usage() {
  process.stdout.write(`usage:\n`);
  process.stdout.write(`  npm run setup\n`);
  process.stdout.write(`  npm run setup -- --mode=${MODE_CHECKER_REPAIR}\n`);
  process.stdout.write(`  npm run setup -- ${MODE_CHECKER_REPAIR}\n\n`);
  process.stdout.write(`modes:\n`);
  process.stdout.write(`  ${MODE_SETUP}           run OS-specific setup script\n`);
  process.stdout.write(`  ${MODE_CHECKER_REPAIR} run sidecar checks, attempt safe repair, rerun checks\n`);
}

function parseArgs(argv) {
  let mode;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "-h" || arg === "--help") {
      return { help: true };
    }

    if (arg.startsWith("--mode=")) {
      mode = arg.slice("--mode=".length).trim();
      continue;
    }

    if (arg === "--mode") {
      const value = argv[i + 1];
      if (!value) {
        return { error: "missing value for --mode" };
      }

      mode = value.trim();
      i += 1;
      continue;
    }

    if (!arg.startsWith("-") && !mode) {
      mode = arg.trim();
      continue;
    }

    return { error: `unknown argument: ${arg}` };
  }

  if (!mode) {
    mode = MODE_SETUP;
  }

  if (!VALID_MODES.has(mode)) {
    return { error: `unsupported mode '${mode}'. expected one of: ${[...VALID_MODES].join(", ")}` };
  }

  return { mode };
}

function getPlatformCommands() {
  const platform = process.platform;

  if (platform === "darwin") {
    return {
      setup: ["bash", ["./bash/setup-macos-fast"]],
      check: ["bash", ["./bash/check-macos-sidecars"]]
    };
  }

  if (platform === "linux") {
    return {
      setup: ["bash", ["./bash/setup-linux-fast"]],
      check: ["bash", ["./bash/check-linux-sidecars"]]
    };
  }

  if (platform === "win32") {
    return {
      setup: [
        "powershell",
        ["-ExecutionPolicy", "Bypass", "-File", ".\\powershell\\setup-windows-fast.ps1"]
      ],
      check: [
        "powershell",
        ["-ExecutionPolicy", "Bypass", "-File", ".\\powershell\\check-windows-sidecars.ps1"]
      ]
    };
  }

  return null;
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    error(`failed to start '${command}': ${result.error.message}`);
    return 1;
  }

  return result.status ?? 1;
}

function ensureExecutable(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!existsSync(fullPath)) {
    return { updated: false, missing: true };
  }

  let mode;
  try {
    mode = statSync(fullPath).mode;
  }
  catch {
    return { updated: false, missing: false };
  }

  const executeBits = 0o111;
  if ((mode & executeBits) === executeBits) {
    return { updated: false, missing: false };
  }

  chmodSync(fullPath, mode | executeBits);
  return { updated: true, missing: false };
}

function linuxRequiredSidecarPath() {
  if (process.arch === "arm64") {
    return "src-tauri/binaries/groove-aarch64-unknown-linux-gnu";
  }

  return "src-tauri/binaries/groove-x86_64-unknown-linux-gnu";
}

function attemptCheckerRepair() {
  if (process.platform === "darwin") {
    const required = [
      "src-tauri/binaries/groove-aarch64-apple-darwin",
      "src-tauri/binaries/groove-x86_64-apple-darwin"
    ];
    const missing = [];
    const fixed = [];

    for (const file of required) {
      const outcome = ensureExecutable(file);
      if (outcome.missing) {
        missing.push(file);
      }
      else if (outcome.updated) {
        fixed.push(file);
      }
    }

    if (fixed.length > 0) {
      log(`repaired execute permissions for: ${fixed.join(", ")}`);
    }

    if (missing.length > 0) {
      log(`missing sidecars cannot be auto-repaired: ${missing.join(", ")}`);
      log("add required files to src-tauri/binaries and rerun setup checker-repair mode");
    }

    if (fixed.length === 0 && missing.length === 0) {
      log("no safe automatic repair action was needed");
    }

    return;
  }

  if (process.platform === "linux") {
    const required = linuxRequiredSidecarPath();
    const outcome = ensureExecutable(required);

    if (outcome.updated) {
      log(`repaired execute permissions for: ${required}`);
      return;
    }

    if (outcome.missing) {
      log(`missing sidecar cannot be auto-repaired: ${required}`);
      log("add the expected Linux sidecar file to src-tauri/binaries and rerun checker-repair mode");
      return;
    }

    log("no safe automatic repair action was needed");
    return;
  }

  if (process.platform === "win32") {
    log("no automatic repair is available for missing Windows sidecar binaries");
    log("add one of the expected .exe files in src-tauri/binaries and rerun checker-repair mode");
  }
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    usage();
    return 0;
  }

  if (parsed.error) {
    error(parsed.error);
    usage();
    return 1;
  }

  const platformCommands = getPlatformCommands();
  if (!platformCommands) {
    error(`unsupported platform: ${process.platform}`);
    return 1;
  }

  if (parsed.mode === MODE_SETUP) {
    const [command, args] = platformCommands.setup;
    log(`mode=${MODE_SETUP}: running platform setup for ${process.platform}`);
    return runCommand(command, args);
  }

  const [checkCommand, checkArgs] = platformCommands.check;
  log(`mode=${MODE_CHECKER_REPAIR}: running sidecar check for ${process.platform}`);
  const initialCheck = runCommand(checkCommand, checkArgs);
  if (initialCheck === 0) {
    log("sidecar check passed; nothing to repair");
    return 0;
  }

  log("sidecar check failed; attempting safe repair actions");
  attemptCheckerRepair();

  log("rerunning sidecar check after repair attempt");
  const finalCheck = runCommand(checkCommand, checkArgs);
  if (finalCheck !== 0) {
    error("checker-repair mode failed; sidecar check still failing after repair attempt");
  }

  return finalCheck;
}

process.exit(main());
