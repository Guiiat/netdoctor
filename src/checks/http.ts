import http, { type IncomingHttpHeaders } from "node:http";
import https from "node:https";
import { performance } from "node:perf_hooks";
import { errorCode, errorMessage, redactUrl } from "../redact.js";
import { targetIdentity } from "../targets.js";
import type { DiagnosticCheck, TargetDefinition } from "../types.js";

interface HttpHop {
  readonly url: string;
  readonly status: number;
  readonly durationMs: number;
  readonly location?: string;
}

interface HttpProbeResult {
  readonly status: number;
  readonly finalUrl: string;
  readonly headers: IncomingHttpHeaders;
  readonly hops: readonly HttpHop[];
}

export async function checkHttp(
  target: TargetDefinition,
  timeoutMs: number,
  maxRedirects: number,
): Promise<DiagnosticCheck> {
  const identity = targetIdentity(target);
  const startedAt = performance.now();
  if (target.url === undefined) {
    return {
      category: "http",
      target: identity,
      status: "skip",
      summary: "HTTP probe skipped because this target was supplied as a host.",
      durationMs: elapsed(startedAt),
    };
  }
  try {
    const result = await probeHttp(target.url, timeoutMs, maxRedirects);
    const expected = target.expectedStatuses?.includes(result.status) ?? false;
    const status = expected || (result.status >= 200 && result.status < 400)
      ? "pass"
      : result.status >= 400 && result.status < 500
        ? "warn"
        : "fail";
    const redirectCount = Math.max(0, result.hops.length - 1);
    return {
      category: "http",
      target: identity,
      status,
      summary: `HTTP ${result.status} from ${redactUrl(result.finalUrl)}${
        redirectCount === 0 ? "" : ` after ${redirectCount} redirect(s)`
      }.`,
      durationMs: elapsed(startedAt),
      details: {
        status: result.status,
        finalUrl: redactUrl(result.finalUrl),
        redirects: result.hops,
        server: result.headers.server,
        contentType: result.headers["content-type"],
      },
      ...(status === "pass"
        ? {}
        : {
            recommendation:
              status === "warn"
                ? "The server is reachable but rejected the request; verify the URL and authentication."
                : "The remote server returned an error; retry and check its service status or upstream gateway.",
          }),
    };
  } catch (error) {
    const code = errorCode(error);
    return {
      category: "http",
      target: identity,
      status: "fail",
      summary: `HTTP request failed: ${errorMessage(error, [target.url])}`,
      durationMs: elapsed(startedAt),
      details: { ...(code === undefined ? {} : { code }) },
      recommendation:
        "Compare the DNS, TCP, and TLS results; then check proxy settings, redirects, authentication, and server availability.",
    };
  }
}

export async function probeHttp(
  initialUrl: string,
  timeoutMs: number,
  maxRedirects: number,
): Promise<HttpProbeResult> {
  let currentUrl = new URL(initialUrl);
  const hops: HttpHop[] = [];
  const deadline = performance.now() + timeoutMs;

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const remainingMs = Math.floor(deadline - performance.now());
    if (remainingMs <= 0) throw redirectDeadlineError(timeoutMs);
    let hop: SingleResponse;
    try {
      hop = await requestOnce(currentUrl, remainingMs);
    } catch (error) {
      if (errorCode(error) === "ETIMEDOUT") throw redirectDeadlineError(timeoutMs);
      throw error;
    }
    const safeLocation = hop.location === undefined
      ? undefined
      : redactUrl(new URL(hop.location, currentUrl).toString());
    hops.push({
      url: redactUrl(currentUrl.toString()),
      status: hop.status,
      durationMs: hop.durationMs,
      ...(safeLocation === undefined ? {} : { location: safeLocation }),
    });

    if (!isRedirect(hop.status) || hop.location === undefined) {
      return {
        status: hop.status,
        finalUrl: currentUrl.toString(),
        headers: hop.headers,
        hops,
      };
    }
    if (redirect === maxRedirects) {
      const error = new Error(`Too many redirects (limit: ${maxRedirects}).`);
      Object.assign(error, { code: "ERR_TOO_MANY_REDIRECTS" });
      throw error;
    }
    currentUrl = new URL(hop.location, currentUrl);
    if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
      throw new Error(`Redirected to unsupported protocol: ${currentUrl.protocol}`);
    }
  }
  throw new Error("HTTP redirect loop ended unexpectedly.");
}

function redirectDeadlineError(timeoutMs: number): Error {
  const error = new Error(`HTTP redirect chain timed out after ${timeoutMs} ms.`);
  Object.assign(error, { code: "ETIMEDOUT" });
  return error;
}

interface SingleResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly durationMs: number;
  readonly location?: string;
}

async function requestOnce(url: URL, timeoutMs: number): Promise<SingleResponse> {
  const startedAt = performance.now();
  const client = url.protocol === "https:" ? https : http;
  return await new Promise<SingleResponse>((resolve, reject) => {
    const request = client.get(
      url,
      {
        agent: false,
        headers: {
          accept: "*/*",
          "user-agent": "netdoctor/0.1.0 (+https://github.com/Guiiat/netdoctor)",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const result: SingleResponse = {
          status,
          headers: response.headers,
          durationMs: elapsed(startedAt),
          ...(response.headers.location === undefined
            ? {}
            : { location: response.headers.location }),
        };
        clearTimeout(timer);
        resolve(result);
        response.destroy();
      },
    );
    const timer = setTimeout(() => {
      const error = new Error(`HTTP request timed out after ${timeoutMs} ms.`);
      Object.assign(error, { code: "ETIMEDOUT" });
      request.destroy(error);
    }, timeoutMs);
    timer.unref();
    request.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function elapsed(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
