import { performance } from "node:perf_hooks";
import { checkDns } from "./checks/dns.js";
import { checkHttp } from "./checks/http.js";
import { checkProxyEnvironment } from "./checks/proxy.js";
import { checkTcp } from "./checks/tcp.js";
import { checkTls } from "./checks/tls.js";
import { redactValue } from "./redact.js";
import { publicTarget } from "./targets.js";
import type {
  CheckStatus,
  DiagnosticCheck,
  DiagnosticOptions,
  DiagnosticReport,
  DiagnosticSummary,
  TargetDefinition,
} from "./types.js";
import { VERSION } from "./version.js";

export async function diagnose(
  targets: readonly TargetDefinition[],
  options: DiagnosticOptions,
): Promise<DiagnosticReport> {
  const startedAt = performance.now();
  const strict = options.strict ?? false;
  const proxyPromise = safeCheck(() =>
    checkProxyEnvironment(options.timeoutMs, options.environment ?? process.env),
  "proxy", "environment");
  const targetPromises = targets.map(async (target) =>
    await Promise.all([
      safeCheck(() => checkDns(target, options.timeoutMs), "dns", target.label),
      safeCheck(() => checkTcp(target, options.timeoutMs), "tcp", target.label),
      safeCheck(() => checkTls(target, options.timeoutMs), "tls", target.label),
      safeCheck(
        () => checkHttp(target, options.timeoutMs, options.maxRedirects),
        "http",
        target.label,
      ),
    ]),
  );
  const [proxy, targetChecks] = await Promise.all([
    proxyPromise,
    Promise.all(targetPromises),
  ]);
  const checks = sanitizeChecks([proxy, ...targetChecks.flat()]);
  const summary = summarize(checks);
  const hasFailure = summary.fail > 0 || (strict && summary.warn > 0);

  return {
    schemaVersion: 1,
    tool: "netdoctor",
    toolVersion: VERSION,
    generatedAt: new Date().toISOString(),
    durationMs: elapsed(startedAt),
    options: {
      timeoutMs: options.timeoutMs,
      maxRedirects: options.maxRedirects,
      strict,
    },
    targets: targets.map(publicTarget),
    checks,
    summary,
    exitCode: hasFailure ? 1 : 0,
  };
}

export function summarize(checks: readonly DiagnosticCheck[]): DiagnosticSummary {
  const counts: Record<CheckStatus, number> = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const check of checks) counts[check.status] += 1;
  return {
    ...counts,
    total: checks.length,
  };
}

async function safeCheck(
  operation: () => Promise<DiagnosticCheck>,
  category: DiagnosticCheck["category"],
  target: string,
): Promise<DiagnosticCheck> {
  try {
    return await operation();
  } catch (error) {
    return {
      category,
      target,
      status: "fail",
      summary: `Unexpected diagnostic error: ${
        error instanceof Error ? error.message : String(error)
      }`,
      durationMs: 0,
      recommendation: "Run again with --json and report the sanitized result as a bug.",
    };
  }
}

function sanitizeChecks(checks: readonly DiagnosticCheck[]): DiagnosticCheck[] {
  return checks.map((check) => redactValue(check) as DiagnosticCheck);
}

function elapsed(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
