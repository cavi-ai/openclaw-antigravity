#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAntigravityModelIds } from "../src/provider.js";

const PROVIDER_ID = "antigravity-cli";
const CHOICE_ID = "antigravity-cli";
const ACTION_LABEL = "Reconnect";
const MIN_HOST_VERSION = [2026, 7, 0];
const COMMAND_TIMEOUT_MS = 30_000;
const STARTUP_TIMEOUT_MS = 20_000;

function fail(message) {
  throw new Error(`Host integration check failed: ${message}`);
}

export function assertAgySession(output) {
  const modelIds = parseAntigravityModelIds(output);
  if (modelIds.length === 0) {
    fail("no models were returned by a live `agy` session; run `agy models` and sign in if needed");
  }
  return modelIds;
}

export function assertReconnectProjection(status) {
  const capability = status?.providerCapabilities?.find(
    (candidate) => candidate?.provider === PROVIDER_ID,
  );
  if (!capability) {
    fail(`the OpenClaw host did not publish capabilities for ${PROVIDER_ID}`);
  }
  if (capability.loginOptions?.length) {
    fail("credential-only Connect is exposed for Antigravity");
  }
  const reconnect = capability.setupActions?.find(
    (action) => action?.choiceId === CHOICE_ID && action?.actionLabel === ACTION_LABEL,
  );
  if (!reconnect) {
    fail('the Antigravity guided-discovery action is not labeled "Reconnect"');
  }
  return { choiceId: reconnect.choiceId, actionLabel: reconnect.actionLabel };
}

function parseHostVersion(output) {
  const match = String(output).match(/OpenClaw\s+(\d+)\.(\d+)\.(\d+)/u);
  if (!match) {
    fail(`could not parse the installed OpenClaw version from ${JSON.stringify(String(output).trim())}`);
  }
  return match.slice(1, 4).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function commandOutput(command, args, options = {}) {
  const timeout = options.timeout ?? COMMAND_TIMEOUT_MS;
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
      timeout,
    });
  } catch (error) {
    if (error?.code === "ETIMEDOUT") {
      fail(`${command} timed out after ${timeout}ms`);
    }
    throw error;
  }
}

function parseJsonOutput(command, args, options) {
  const output = commandOutput(command, args, options);
  try {
    return JSON.parse(output);
  } catch {
    fail(`${command} returned non-JSON output`);
  }
}

export function buildGatewayCallArgs(method, gatewayUrl, token, timeout = 10_000, params) {
  const args = [
    "gateway",
    "call",
    method,
    "--url",
    gatewayUrl,
    "--token",
    token,
    "--json",
    "--timeout",
    String(timeout),
  ];
  if (params !== undefined) {
    args.push("--params", JSON.stringify(params));
  }
  return args;
}

function findReconnectCandidate(detection) {
  const candidate = detection?.candidates?.find(
    (entry) =>
      entry?.kind === `provider-auto:${CHOICE_ID}` &&
      typeof entry?.modelRef === "string" &&
      entry.modelRef.startsWith(`${PROVIDER_ID}/`),
  );
  if (!candidate) {
    fail("guided discovery did not return an Antigravity Reconnect candidate");
  }
  return candidate;
}

function assertReconnectActivation(result, candidate) {
  if (result?.ok !== true || result?.modelRef !== candidate.modelRef) {
    fail(`Reconnect activation failed: ${result?.error ?? "unexpected host response"}`);
  }
  return { modelRef: result.modelRef, latencyMs: result.latencyMs };
}

export async function createIsolatedAgyHome(tempRoot, sourceHome = homedir()) {
  const sourceGemini = join(sourceHome, ".gemini");
  const isolatedHome = join(tempRoot, "home");
  const isolatedGemini = join(isolatedHome, ".gemini");
  await mkdir(isolatedGemini, { recursive: true });
  for (const entry of await readdir(sourceGemini, { withFileTypes: true })) {
    if (entry.name === "config") continue;
    await symlink(
      join(sourceGemini, entry.name),
      join(isolatedGemini, entry.name),
      entry.isDirectory() ? "dir" : "file",
    );
  }
  await mkdir(join(isolatedGemini, "config"), { recursive: true });
  return isolatedHome;
}

async function reserveLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (!port) fail("could not reserve a loopback port for the isolated host");
  return port;
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForGateway(openclaw, gatewayUrl, token, env, child, diagnostics) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      fail(`the isolated OpenClaw gateway exited early${diagnostics()}`);
    }
    try {
      parseJsonOutput(openclaw, buildGatewayCallArgs("health", gatewayUrl, token, 1_000), {
        env,
        timeout: 2_000,
      });
      return;
    } catch {
      await delay(250);
    }
  }
  fail(`the isolated OpenClaw gateway did not become ready within ${STARTUP_TIMEOUT_MS}ms${diagnostics()}`);
}

async function stopGateway(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(3_000).then(() => child.kill("SIGKILL")),
  ]);
}

function boundedDiagnostics(chunks) {
  const text = chunks.join("").trim();
  return text ? `\nGateway diagnostics:\n${text.slice(-4_000)}` : "";
}

export async function withTemporaryRoot(run) {
  const tempRoot = await mkdtemp(join(tmpdir(), "antigravity-host-check-"));
  try {
    return await run(tempRoot);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function runHostIntegrationCheck({
  openclaw = process.env.OPENCLAW_BIN?.trim() || "openclaw",
  agy = process.env.AGY_BIN?.trim() || "agy",
} = {}) {
  const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const packageJson = JSON.parse(await readFile(join(pluginRoot, "package.json"), "utf8"));
  const hostVersion = parseHostVersion(commandOutput(openclaw, ["--version"]));
  if (compareVersions(hostVersion, MIN_HOST_VERSION) < 0) {
    fail(`OpenClaw ${hostVersion.join(".")} is older than the required ${MIN_HOST_VERSION.join(".")}`);
  }

  const modelIds = assertAgySession(commandOutput(agy, ["models"]));
  return await withTemporaryRoot(async (tempRoot) => {
      const isolatedHome = await createIsolatedAgyHome(tempRoot);
      const stateDir = join(tempRoot, "state");
      const configPath = join(tempRoot, "openclaw.json");
      const port = await reserveLoopbackPort();
      const gatewayUrl = `ws://127.0.0.1:${port}`;
      const gatewayToken = randomBytes(24).toString("hex");
      const env = {
        ...process.env,
        HOME: isolatedHome,
        USERPROFILE: isolatedHome,
        OPENCLAW_CONFIG_PATH: configPath,
        OPENCLAW_STATE_DIR: stateDir,
      };
      const gatewayOutput = [];
      let gateway;

      try {
        await mkdir(stateDir, { recursive: true });
        await writeFile(
          configPath,
          `${JSON.stringify(
            {
              gateway: { mode: "local", bind: "loopback", auth: { mode: "token" } },
              plugins: {
                allow: ["antigravity"],
                load: { paths: [pluginRoot] },
                entries: { antigravity: { enabled: true, config: { command: agy } } },
              },
            },
            null,
            2,
          )}\n`,
          { mode: 0o600 },
        );

        gateway = spawn(
          openclaw,
          [
            "gateway",
            "run",
            "--port",
            String(port),
            "--bind",
            "loopback",
            "--auth",
            "token",
            "--token",
            gatewayToken,
            "--allow-unconfigured",
          ],
          { env, stdio: ["ignore", "pipe", "pipe"] },
        );
        gateway.stdout.on("data", (chunk) => gatewayOutput.push(String(chunk)));
        gateway.stderr.on("data", (chunk) => gatewayOutput.push(String(chunk)));
        const diagnostics = () => boundedDiagnostics(gatewayOutput);

        await waitForGateway(openclaw, gatewayUrl, gatewayToken, env, gateway, diagnostics);
        const status = parseJsonOutput(
          openclaw,
          buildGatewayCallArgs("models.authStatus", gatewayUrl, gatewayToken),
          { env, timeout: 15_000 },
        );
        const action = assertReconnectProjection(status);
        const detection = parseJsonOutput(
          openclaw,
          buildGatewayCallArgs("openclaw.setup.detect", gatewayUrl, gatewayToken, 30_000),
          { env, timeout: 35_000 },
        );
        const candidate = findReconnectCandidate(detection);
        const activation = assertReconnectActivation(
          parseJsonOutput(
            openclaw,
            buildGatewayCallArgs(
              "openclaw.setup.activate",
              gatewayUrl,
              gatewayToken,
              120_000,
              { kind: candidate.kind, modelRef: candidate.modelRef },
            ),
            { env, timeout: 125_000 },
          ),
          candidate,
        );
        return {
          pluginVersion: packageJson.version,
          hostVersion: hostVersion.join("."),
          agyModelCount: modelIds.length,
          action,
          activation,
        };
      } finally {
        if (gateway) await stopGateway(gateway);
      }
    });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runHostIntegrationCheck()
    .then((result) => {
      process.stdout.write(
        [
          `PASS @cavi-ai/antigravity ${result.pluginVersion}`,
          `OpenClaw ${result.hostVersion}`,
          `live agy models: ${result.agyModelCount}`,
          `host action: ${result.action.actionLabel}`,
          `Reconnect activation: ${result.activation.modelRef}`,
          "credential-only Connect: absent",
        ].join("\n") + "\n",
      );
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
