import { redactText } from "../redact.js";
import type { CheckStatus, DiagnosticReport } from "../types.js";

const ANSI = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  dim: "\u001B[2m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  red: "\u001B[31m",
  cyan: "\u001B[36m",
  gray: "\u001B[90m",
} as const;

export function renderHuman(report: DiagnosticReport, useColor: boolean): string {
  const paint = createPainter(useColor);
  const lines = [
    paint(`${ANSI.bold}${ANSI.cyan}`, "NetDoctor"),
    paint(
      ANSI.dim,
      `${report.targets.length} target(s) · ${report.options.timeoutMs} ms timeout · ${report.durationMs} ms total`,
    ),
    "",
  ];

  for (const check of report.checks) {
    const symbol = statusSymbol(check.status);
    const color = statusColor(check.status);
    const status = check.status.toUpperCase().padEnd(4);
    const category = check.category.toUpperCase().padEnd(5);
    lines.push(
      `${paint(color, `${symbol} ${status}`)}  ${paint(ANSI.bold, category)}  ${redactText(check.summary)} ${paint(ANSI.gray, `(${check.durationMs} ms)`)}`,
    );
    lines.push(paint(ANSI.dim, `           ${redactText(check.target)}`));
    if (check.recommendation !== undefined && check.status !== "pass") {
      lines.push(paint(ANSI.yellow, `           ↳ ${redactText(check.recommendation)}`));
    }
  }

  lines.push(
    "",
    `${paint(ANSI.green, `${report.summary.pass} passed`)} · ${paint(ANSI.yellow, `${report.summary.warn} warning(s)`)} · ${paint(ANSI.red, `${report.summary.fail} failed`)} · ${report.summary.skip} skipped`,
  );
  if (report.exitCode === 0) {
    lines.push(paint(ANSI.green, "Network diagnostics completed without blocking failures."));
  } else if (report.options.strict && report.summary.fail === 0) {
    lines.push(paint(ANSI.yellow, "Strict mode treats warnings as failures."));
  } else {
    lines.push(paint(ANSI.red, "One or more blocking network checks failed."));
  }
  return `${lines.join("\n")}\n`;
}

function createPainter(enabled: boolean): (color: string, text: string) => string {
  return enabled ? (color, text) => `${color}${text}${ANSI.reset}` : (_color, text) => text;
}

function statusColor(status: CheckStatus): string {
  switch (status) {
    case "pass":
      return ANSI.green;
    case "warn":
      return ANSI.yellow;
    case "fail":
      return ANSI.red;
    case "skip":
      return ANSI.gray;
  }
}

function statusSymbol(status: CheckStatus): string {
  switch (status) {
    case "pass":
      return "✓";
    case "warn":
      return "!";
    case "fail":
      return "✗";
    case "skip":
      return "-";
  }
}
