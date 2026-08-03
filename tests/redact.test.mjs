import test from "node:test";
import assert from "node:assert/strict";
import { redactText, redactUrl, redactValue, stripControlCharacters } from "../dist/redact.js";
import { renderHuman } from "../dist/reporters/human.js";
import { renderJson } from "../dist/reporters/json.js";
import { renderMarkdown } from "../dist/reporters/markdown.js";

test("redactUrl removes URL userinfo and sensitive query values", () => {
  const input =
    "https://alice:s3cr%40t@example.com/path?token=abc123&safe=yes&api_key=k&webhook_secret=w&monkey=banana";
  const output = redactUrl(input);

  assert.match(output, /\*\*\*:\*\*\*@example\.com/);
  assert.match(output, /token=\*\*\*/);
  assert.match(output, /api_key=\*\*\*/);
  assert.match(output, /webhook_secret=\*\*\*/);
  assert.match(output, /safe=yes/);
  assert.match(output, /monkey=banana/);
  assert.doesNotMatch(output, /alice|s3cr|abc123|api_key=k|webhook_secret=w/);
});

test("redactText scrubs embedded URLs, authorization, cookies, and assignments", () => {
  const input = [
    "GET https://bob:hunter2@example.test/a?access_token=verysecret",
    "Authorization: Bearer ey.secret.token",
    "Proxy-Authorization: Negotiate arbitrary-value with-spaces",
    "Cookie: session=sensitive",
    "password=letmein",
  ].join("\n");
  const output = redactText(input);

  for (const secret of [
    "bob",
    "hunter2",
    "verysecret",
    "ey.secret.token",
    "arbitrary-value",
    "with-spaces",
    "sensitive",
    "letmein",
  ]) {
    assert.equal(output.includes(secret), false, `leaked ${secret}`);
  }
});

test("redactText scrubs folded authorization headers and common secret assignments", () => {
  const corpus = [
    "Authorization: Bearer FIRST\r\n SECOND",
    "Proxy-Authorization: Basic PROXY-FIRST\r\n\tPROXY-SECOND",
    "refresh_token=refresh-value",
    "sessionToken: session-value",
    "private-key=private-value",
    "passwd=passwd-value",
    "credentials=credential-value",
    "github_token=github-value",
    "webhookSecret=webhook-value",
    "signing.key=signing-value",
    "safe=value&refresh_token=query-value",
  ].join("\r\n");
  const output = redactText(corpus);

  for (const secret of [
    "FIRST",
    "SECOND",
    "PROXY-FIRST",
    "PROXY-SECOND",
    "refresh-value",
    "session-value",
    "private-value",
    "passwd-value",
    "credential-value",
    "github-value",
    "webhook-value",
    "signing-value",
    "query-value",
  ]) {
    assert.equal(output.includes(secret), false, `leaked ${secret}`);
  }
});

test("redaction does not confuse ordinary words ending in key with sensitive keys", () => {
  const input = "monkey=banana donkey=carrot hockey=puck";
  assert.equal(redactText(input), input);
  assert.deepEqual(redactValue({ monkey: "banana", donkey: "carrot", hockey: "puck" }), {
    monkey: "banana",
    donkey: "carrot",
    hockey: "puck",
  });
});

test("redactValue recursively sanitizes report-like objects", () => {
  const output = redactValue({
    proxy: "http://proxy-user:proxy-pass@proxy.example:8080",
    nested: ["https://example.test/?signature=raw-signature"],
    headers: {
      Authorization: "Digest opaque-secret",
      "Proxy-Authorization": "NTLM proxy-secret",
      Cookie: "session=cookie-secret",
    },
    client_secret: "client-secret-value",
    refresh_token: "refresh-token-value",
    sessionToken: "session-token-value",
    private_key: "private-key-value",
    passwd: "passwd-value",
    credentials: "credentials-value",
    webhookSecret: "webhook-secret-value",
    signing_key: "signing-key-value",
    credential: "credential-value",
    oauth: { code: "oauth-code-value" },
    code: "ECONNREFUSED",
  });
  const serialized = JSON.stringify(output);
  assert.doesNotMatch(
    serialized,
    /proxy-user|proxy-pass|raw-signature|opaque-secret|proxy-secret|cookie-secret|client-secret-value|refresh-token-value|session-token-value|private-key-value|passwd-value|credentials-value|webhook-secret-value|signing-key-value|credential-value|oauth-code-value/,
  );
  assert.equal(output.code, "ECONNREFUSED");
  assert.equal(output.oauth.code, "[REDACTED]");
});

test("control characters and terminal escape sequences are removed from untrusted text", () => {
  const unsafe = "before\u001B[31mred\u001B[0m\u0007\u0000\u009B32mgreen\nnext";
  const safe = redactText(unsafe);
  assert.equal(/[\u0000-\u001F\u007F-\u009F]/.test(safe), false);
  assert.equal(safe.includes("[31m"), false);
  assert.match(stripControlCharacters("a\u0000b"), /^a b$/);
});

test("all report formats neutralize injected terminal and Markdown control text", () => {
  const injected = "\u001B]8;;https://evil.test\u0007[click](https://evil.test)\u001B]8;;\u0007|tail";
  const report = {
    schemaVersion: 1,
    tool: "netdoctor",
    toolVersion: "0.1.0",
    generatedAt: "2026-08-03T00:00:00.000Z",
    durationMs: 1,
    options: { timeoutMs: 1000, maxRedirects: 1, strict: false },
    targets: [],
    checks: [
      {
        category: "http",
        target: injected,
        status: "warn",
        summary: injected,
        durationMs: 1,
        details: { Authorization: "Custom raw-secret" },
      },
    ],
    summary: { pass: 0, warn: 1, fail: 0, skip: 0, total: 1 },
    exitCode: 0,
  };
  const outputs = [renderHuman(report, false), renderJson(report), renderMarkdown(report)];
  for (const output of outputs) {
    assert.equal(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(output), false);
    assert.equal(output.includes("raw-secret"), false);
  }
  assert.match(outputs[2], /\\\[click\\\]/);
  assert.match(outputs[2], /\\\|tail/);
});
