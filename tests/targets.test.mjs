import test from "node:test";
import assert from "node:assert/strict";
import {
  expandPreset,
  parseHostTarget,
  parseUrlTarget,
  resolveTargets,
} from "../dist/targets.js";

test("expands built-in presets and remembers expected HTTP statuses", () => {
  const docker = expandPreset("docker");
  assert.equal(docker.length, 2);
  assert.equal(docker[0].preset, "docker");
  assert.deepEqual(docker[0].expectedStatuses, [401]);
});

test("parses URL and host targets", () => {
  const url = parseUrlTarget("https://example.com:8443/health");
  assert.equal(url.hostname, "example.com");
  assert.equal(url.port, 8443);
  assert.equal(url.protocol, "https");

  const host = parseHostTarget("[::1]:8883");
  assert.equal(host.hostname, "::1");
  assert.equal(host.port, 8883);
});

test("target metadata never keeps URL credentials in public fields", () => {
  const target = parseUrlTarget("https://user:password@example.com/?token=secret");
  assert.equal(target.input.includes("user"), false);
  assert.equal(target.input.includes("password"), false);
  assert.equal(target.input.includes("secret"), false);
  assert.match(target.input, /\*\*\*/);
});

test("deduplicates repeated targets and defaults to all presets", () => {
  const repeated = resolveTargets({
    urls: ["https://example.com/", "https://example.com/"],
  });
  assert.equal(repeated.length, 1);

  const defaults = resolveTargets({});
  assert.ok(defaults.length >= 8);
  assert.deepEqual(new Set(defaults.map((target) => target.preset)), new Set(["github", "npm", "pypi", "docker"]));
});

test("only comma-splits positional presets, not URL query values", () => {
  const presets = resolveTargets({ positional: ["github,npm"] });
  assert.deepEqual(new Set(presets.map((target) => target.preset)), new Set(["github", "npm"]));

  const url = resolveTargets({ positional: ["https://example.com/?items=a,b"] });
  assert.equal(url.length, 1);
  assert.match(url[0].url, /items=a,b/);
});

test("rejects unsupported URL schemes and host userinfo", () => {
  assert.throws(() => parseUrlTarget("ftp://example.com"), /Unsupported/);
  assert.throws(() => parseHostTarget("user:password@example.com"), /username or password/);
});
