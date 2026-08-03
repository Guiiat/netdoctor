import test from "node:test";
import assert from "node:assert/strict";
import { CliUsageError, parseArgs } from "../dist/args.js";

test("parses repeatable targets, strict mode, and JSON output", () => {
  const options = parseArgs([
    "github",
    "--host",
    "localhost:443",
    "--timeout=1200",
    "--max-redirects",
    "2",
    "--strict",
    "--json",
  ]);
  assert.deepEqual(options.inputs, ["github"]);
  assert.deepEqual(options.hostInputs, ["localhost:443"]);
  assert.equal(options.timeoutMs, 1200);
  assert.equal(options.maxRedirects, 2);
  assert.equal(options.strict, true);
  assert.equal(options.format, "json");
});

test("rejects conflicting output formats and unsafe timeout ranges", () => {
  assert.throws(() => parseArgs(["--json", "--markdown"]), CliUsageError);
  assert.throws(() => parseArgs(["--timeout", "10"]), /250/);
  assert.throws(() => parseArgs(["--unknown"]), /Unknown option/);
});
