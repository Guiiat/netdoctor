#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { parseArgs, CliUsageError } from "./args.js";
import { diagnose } from "./diagnose.js";
import { PRESETS, PRESET_NAMES } from "./presets.js";
import { errorMessage } from "./redact.js";
import { renderHuman } from "./reporters/human.js";
import { renderJson } from "./reporters/json.js";
import { renderMarkdown } from "./reporters/markdown.js";
import { resolveTargets } from "./targets.js";
import { VERSION } from "./version.js";

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(helpText());
      return 0;
    }
    if (options.version) {
      process.stdout.write(`${VERSION}\n`);
      return 0;
    }
    if (options.listPresets) {
      process.stdout.write(presetText());
      return 0;
    }

    const targets = resolveTargets({
      positional: options.inputs,
      presets: options.presetInputs,
      urls: options.urlInputs,
      hosts: options.hostInputs,
    });
    const report = await diagnose(targets, {
      timeoutMs: options.timeoutMs,
      maxRedirects: options.maxRedirects,
      strict: options.strict,
    });
    const rendered = options.format === "json"
      ? renderJson(report)
      : options.format === "markdown"
        ? renderMarkdown(report)
        : renderHuman(report, options.color && process.stdout.isTTY === true);
    process.stdout.write(rendered);
    return report.exitCode;
  } catch (error) {
    if (error instanceof CliUsageError || isTargetUsageError(error)) {
      process.stderr.write(`netdoctor: ${errorMessage(error)}\nTry 'netdoctor --help' for usage.\n`);
      return 2;
    }
    process.stderr.write(
      `netdoctor: internal error: ${errorMessage(error)}\nPlease report this sanitized message.\n`,
    );
    return 3;
  }
}

function isTargetUsageError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /^(?:Unknown preset|Invalid |Unsupported URL|URL has no hostname|Host cannot|A host target cannot)/.test(
    error.message,
  );
}

export function helpText(): string {
  return `NetDoctor ${VERSION} — cross-platform network diagnostics

Usage:
  netdoctor [preset | URL | host[:port] ...] [options]

Examples:
  netdoctor github npm
  netdoctor --url https://api.example.com/health
  netdoctor --host broker.example.com:8883 --timeout 8000
  netdoctor all --json

Targets:
  github, npm, pypi, docker   Built-in service presets
  all                         All built-in presets (also the default with no target)
  http(s)://...               Custom HTTP(S) URL
  host[:port]                 Custom host; port defaults to 443

Options:
  -p, --preset <name>         Add a preset (repeatable or comma-separated)
  -u, --url <url>             Add a custom URL (repeatable)
  -H, --host <host[:port]>    Add a custom host (repeatable)
  -t, --timeout <ms>          Per-check timeout, 250–60000 (default: 5000)
      --max-redirects <n>     HTTP redirect limit, 0–20 (default: 5)
      --json                  Emit one JSON document to stdout
      --markdown, --md        Emit a Markdown report to stdout
      --strict                Return 1 for warnings as well as failures
      --no-color              Disable ANSI color
      --list-presets          Show built-in presets
  -h, --help                  Show help
  -v, --version               Show version

Exit codes: 0 = no blocking issue, 1 = failed check (or warning with --strict),
            2 = usage error, 3 = internal error.
`;
}

function presetText(): string {
  const lines = PRESET_NAMES.map(
    (name) => `${name.padEnd(8)} ${PRESETS[name]?.description ?? ""}`,
  );
  return `Built-in presets:\n${lines.join("\n")}\n`;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
