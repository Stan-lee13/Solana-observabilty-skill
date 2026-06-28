import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExporterConfig,
  classifyError,
  parseProgramIds,
} from "../index.js";

test("parseProgramIds trims and drops empty values", () => {
  assert.deepEqual(parseProgramIds("alpha, beta, , gamma ,, "), [
    "alpha",
    "beta",
    "gamma",
  ]);
});

test("buildExporterConfig falls back to safe defaults", () => {
  const config = buildExporterConfig({});

  assert.equal(config.port, 3001);
  assert.equal(config.cluster, "mainnet-beta");
  assert.equal(config.scrapeIntervalMs, 15_000);
  assert.deepEqual(config.programIds, []);
  assert.equal(config.rpcEndpoints.length, 2);
});

test("classifyError keeps error classes bounded for alerting", () => {
  assert.equal(classifyError(new Error("request timeout while fetching slot")), "timeout");
  assert.equal(classifyError(new Error("rate limit exceeded by provider")), "rate_limited");
  assert.equal(classifyError(new Error("fetch failed for endpoint")), "network");
  assert.equal(classifyError(new Error("unknown rpc failure")), "rpc_error");
});
