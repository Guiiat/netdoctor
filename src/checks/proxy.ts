import { promises as dns } from "node:dns";
import { performance } from "node:perf_hooks";
import { errorMessage, redactUrl } from "../redact.js";
import type { DiagnosticCheck, CheckStatus } from "../types.js";
import { probeTcp } from "./tcp.js";

const PROXY_NAMES = ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY"] as const;

interface ProxyVariable {
  readonly name: string;
  readonly rawValue: string;
}

interface ProxyEndpoint {
  readonly variable: string;
  readonly url: string;
  readonly protocol?: string;
  readonly reachable: boolean;
  readonly latencyMs?: number;
  readonly addresses?: readonly string[];
  readonly error?: string;
}

export async function checkProxyEnvironment(
  timeoutMs: number,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<DiagnosticCheck> {
  const startedAt = performance.now();
  const variables = readProxyVariables(environment);
  const noProxy = readEnvironmentValue(environment, "NO_PROXY");
  if (variables.length === 0) {
    const hasNoProxy = noProxy !== undefined && noProxy !== "";
    return {
      category: "proxy",
      target: "environment",
      status: hasNoProxy ? "warn" : "pass",
      summary: hasNoProxy
        ? "NO_PROXY is set, but no HTTP proxy variable is configured."
        : "No proxy environment variables are set; direct connections are expected.",
      durationMs: elapsed(startedAt),
      details: {
        variables: {},
        noProxyEntries: splitNoProxy(noProxy),
      },
      ...(hasNoProxy
        ? { recommendation: "Remove stale NO_PROXY configuration or set the intended HTTP(S) proxy." }
        : {}),
    };
  }

  const endpoints = await Promise.all(
    variables.map((variable) => inspectProxy(variable, timeoutMs)),
  );
  const invalidOrUnreachable = endpoints.some((endpoint) => !endpoint.reachable);
  const unsupported = endpoints.some(
    (endpoint) =>
      endpoint.protocol !== undefined &&
      endpoint.protocol !== "http:" &&
      endpoint.protocol !== "https:",
  );
  const conflicts = conflictingVariables(environment);
  const status: CheckStatus = invalidOrUnreachable
    ? "fail"
    : unsupported || conflicts.length > 0
      ? "warn"
      : "pass";
  const safeVariables = Object.fromEntries(
    variables.map((variable) => [variable.name, redactUrl(variable.rawValue)]),
  );

  return {
    category: "proxy",
    target: "environment",
    status,
    summary:
      status === "fail"
        ? "At least one configured proxy endpoint is invalid or unreachable."
        : status === "warn"
          ? "Proxy settings are reachable but may be interpreted differently by applications."
          : `Validated ${endpoints.length} configured proxy endpoint${endpoints.length === 1 ? "" : "s"}.`,
    durationMs: elapsed(startedAt),
    details: {
      variables: safeVariables,
      noProxyEntries: splitNoProxy(noProxy),
      endpoints,
      ...(conflicts.length === 0 ? {} : { conflictingVariables: conflicts }),
      note: "DNS, TCP, TLS, and HTTP target probes are direct; this check validates proxy configuration and endpoint reachability.",
    },
    ...(status === "pass"
      ? {}
      : {
          recommendation: invalidOrUnreachable
            ? "Fix or remove the failing proxy variable; verify its host, port, credentials, VPN, and firewall."
            : "Confirm that each tool supports this proxy scheme and reconcile conflicting uppercase/lowercase variables.",
        }),
  };
}

async function inspectProxy(
  variable: ProxyVariable,
  timeoutMs: number,
): Promise<ProxyEndpoint> {
  const safeUrl = redactUrl(variable.rawValue);
  let parsed: URL;
  try {
    parsed = new URL(variable.rawValue);
  } catch (error) {
    return {
      variable: variable.name,
      url: safeUrl,
      reachable: false,
      error: errorMessage(error, [variable.rawValue]),
    };
  }
  const port = parseProxyPort(parsed);
  if (parsed.hostname === "" || port === undefined) {
    return {
      variable: variable.name,
      url: safeUrl,
      protocol: parsed.protocol,
      reachable: false,
      error: "Proxy URL has no valid hostname or port.",
    };
  }
  try {
    const [addresses, tcp] = await Promise.all([
      withTimeout(
        dns.lookup(parsed.hostname, { all: true, verbatim: true }),
        timeoutMs,
        `Proxy DNS lookup timed out after ${timeoutMs} ms.`,
      ),
      probeTcp(parsed.hostname, port, timeoutMs),
    ]);
    return {
      variable: variable.name,
      url: safeUrl,
      protocol: parsed.protocol,
      reachable: true,
      latencyMs: tcp.latencyMs,
      addresses: addresses.map((address) => address.address),
    };
  } catch (error) {
    return {
      variable: variable.name,
      url: safeUrl,
      protocol: parsed.protocol,
      reachable: false,
      error: errorMessage(error, [variable.rawValue]),
    };
  }
}

function readProxyVariables(environment: NodeJS.ProcessEnv): ProxyVariable[] {
  const variables: ProxyVariable[] = [];
  for (const name of PROXY_NAMES) {
    const entry = findEnvironmentEntry(environment, name);
    if (entry !== undefined && entry[1] !== "") {
      variables.push({ name: entry[0], rawValue: entry[1] });
    }
  }
  return variables;
}

function readEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  return findEnvironmentEntry(environment, name)?.[1];
}

function findEnvironmentEntry(
  environment: NodeJS.ProcessEnv,
  name: string,
): readonly [string, string] | undefined {
  const lowercaseName = name.toLowerCase();
  const lowercase = environment[lowercaseName];
  if (lowercase !== undefined) return [lowercaseName, lowercase];
  const exact = environment[name];
  if (exact !== undefined) return [name, exact];
  const entry = Object.entries(environment).find(
    ([key, value]) => key.toUpperCase() === name && value !== undefined,
  );
  return entry === undefined || entry[1] === undefined ? undefined : [entry[0], entry[1]];
}

function conflictingVariables(environment: NodeJS.ProcessEnv): string[] {
  const conflicts: string[] = [];
  for (const name of PROXY_NAMES) {
    const values = Object.entries(environment)
      .filter(([key, value]) => key.toUpperCase() === name && value !== undefined && value !== "")
      .map(([, value]) => value as string);
    if (new Set(values).size > 1) conflicts.push(name);
  }
  return conflicts;
}

function parseProxyPort(url: URL): number | undefined {
  if (url.port !== "") {
    const port = Number(url.port);
    return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : undefined;
  }
  switch (url.protocol) {
    case "http:":
      return 80;
    case "https:":
      return 443;
    case "socks:":
    case "socks5:":
    case "socks5h:":
      return 1080;
    default:
      return undefined;
  }
}

function splitNoProxy(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error(message);
          Object.assign(error, { code: "ETIMEDOUT" });
          reject(error);
        }, timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function elapsed(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
