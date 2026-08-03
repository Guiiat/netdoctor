import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { checkHttp } from "../dist/checks/http.js";
import { checkProxyEnvironment } from "../dist/checks/proxy.js";
import { checkTcp } from "../dist/checks/tcp.js";
import { diagnose } from "../dist/diagnose.js";
import { renderJson } from "../dist/reporters/json.js";
import { parseUrlTarget } from "../dist/targets.js";

test("TCP and HTTP checks diagnose a local redirect", async () => {
  const server = http.createServer((request, response) => {
    if (request.url === "/start") {
      response.writeHead(302, { location: "/healthy" });
      response.end();
      return;
    }
    response.writeHead(204, { "x-test": "ok" });
    response.end();
  });
  const port = await listen(server);
  try {
    const target = parseUrlTarget(`http://127.0.0.1:${port}/start`);
    const [tcp, httpResult] = await Promise.all([
      checkTcp(target, 1_000),
      checkHttp(target, 1_000, 3),
    ]);
    assert.equal(tcp.status, "pass");
    assert.equal(httpResult.status, "pass");
    assert.equal(httpResult.details.status, 204);
    assert.equal(httpResult.details.redirects.length, 2);
  } finally {
    await close(server);
  }
});

test("HTTP timeout is one deadline for the full redirect chain", async () => {
  const server = http.createServer((request, response) => {
    const firstHop = request.url === "/first";
    setTimeout(() => {
      if (firstHop) {
        response.writeHead(302, { location: "/second" });
      } else {
        response.writeHead(204);
      }
      response.end();
    }, 80);
  });
  const port = await listen(server);
  try {
    const target = parseUrlTarget(`http://127.0.0.1:${port}/first`);
    const result = await checkHttp(target, 120, 3);
    assert.equal(result.status, "fail");
    assert.equal(result.details.code, "ETIMEDOUT");
    assert.match(result.summary, /redirect chain timed out after 120 ms/);
  } finally {
    await close(server);
  }
});

test("proxy check validates reachability without leaking credentials", async () => {
  const proxy = net.createServer((socket) => socket.end());
  const port = await listen(proxy);
  try {
    const result = await checkProxyEnvironment(1_000, {
      HTTP_PROXY: `http://proxy-user:proxy-password@127.0.0.1:${port}`,
      NO_PROXY: "localhost,127.0.0.1",
    });
    const serialized = JSON.stringify(result);
    assert.equal(result.status, "pass");
    assert.doesNotMatch(serialized, /proxy-user|proxy-password/);
    assert.match(serialized, /\*\*\*/);
  } finally {
    await close(proxy);
  }
});

test("lowercase proxy variables take precedence over conflicting uppercase variants", async () => {
  const proxy = net.createServer((socket) => socket.end());
  const port = await listen(proxy);
  try {
    const result = await checkProxyEnvironment(1_000, {
      HTTP_PROXY: "http://127.0.0.1:1",
      http_proxy: `http://127.0.0.1:${port}`,
    });
    assert.equal(result.status, "warn");
    assert.equal(result.details.endpoints.length, 1);
    assert.equal(result.details.endpoints[0].variable, "http_proxy");
    assert.equal(result.details.endpoints[0].reachable, true);
    assert.equal(result.details.variables.HTTP_PROXY, undefined);
  } finally {
    await close(proxy);
  }
});

test("full diagnosis is concurrent, machine-readable, and non-throwing", async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
  const port = await listen(server);
  try {
    const target = parseUrlTarget(`http://localhost:${port}/health?token=top-secret`);
    const report = await diagnose([target], {
      timeoutMs: 1_000,
      maxRedirects: 2,
      strict: false,
      environment: {},
    });
    assert.equal(report.summary.fail, 0);
    assert.equal(report.exitCode, 0);
    assert.deepEqual(
      report.checks.map((check) => check.category),
      ["proxy", "dns", "tcp", "tls", "http"],
    );
    const json = renderJson(report);
    assert.doesNotMatch(json, /top-secret/);
    assert.equal(JSON.parse(json).tool, "netdoctor");
  } finally {
    await close(server);
  }
});

test("connection failures become report entries instead of exceptions", async () => {
  const unused = net.createServer();
  const port = await listen(unused);
  await close(unused);
  const target = parseUrlTarget(`http://127.0.0.1:${port}/`);
  const report = await diagnose([target], {
    timeoutMs: 500,
    maxRedirects: 0,
    environment: {},
  });
  assert.ok(report.summary.fail >= 1);
  assert.equal(report.exitCode, 1);
});

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  return address.port;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}
