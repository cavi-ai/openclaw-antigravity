import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import {
  assertAgySession,
  assertReconnectProjection,
  buildGatewayCallArgs,
  commandOutput,
  withTemporaryRoot,
} from "../scripts/check-host-integration.mjs";

test("external commands are terminated at their process timeout", () => {
  assert.throws(
    () => commandOutput(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], { timeout: 25 }),
    /timed out after 25ms/i,
  );
});

test("temporary host state is removed when setup fails", async () => {
  let createdRoot;
  await assert.rejects(
    withTemporaryRoot(async (root) => {
      createdRoot = root;
      throw new Error("port reservation failed");
    }),
    /port reservation failed/,
  );
  await assert.rejects(access(createdRoot), { code: "ENOENT" });
});

test("isolated gateway calls carry their ephemeral token", () => {
  assert.deepEqual(
    buildGatewayCallArgs("models.authStatus", "ws://127.0.0.1:23456", "test-token", 1000),
    [
      "gateway",
      "call",
      "models.authStatus",
      "--url",
      "ws://127.0.0.1:23456",
      "--token",
      "test-token",
      "--json",
      "--timeout",
      "1000",
    ],
  );
});

test("live agy models and guided discovery project only Reconnect", () => {
  assert.deepEqual(
    assertAgySession(
      "Fetching available models...\ngemini-3.1-pro-high\tGemini 3.1 Pro High\n",
    ),
    ["gemini-3.1-pro-high"],
  );

  assert.deepEqual(
    assertReconnectProjection({
      providerCapabilities: [
        {
          provider: "antigravity-cli",
          apiKeySupported: false,
          quickApiKeySetup: false,
          setupActions: [
            {
              choiceId: "antigravity-cli",
              label: "Antigravity CLI",
              actionLabel: "Reconnect",
            },
          ],
        },
      ],
    }),
    {
      choiceId: "antigravity-cli",
      actionLabel: "Reconnect",
    },
  );
});

test("credential-only Connect exposure fails the host check", () => {
  assert.throws(
    () =>
      assertReconnectProjection({
        providerCapabilities: [
          {
            provider: "antigravity-cli",
            setupActions: [
              {
                choiceId: "antigravity-cli",
                label: "Antigravity CLI",
                actionLabel: "Reconnect",
              },
            ],
            loginOptions: [
              {
                id: "antigravity/antigravity-cli",
                label: "Antigravity CLI",
                kind: "custom",
              },
            ],
          },
        ],
      }),
    /credential-only Connect/i,
  );
});

test("missing live agy models fails the host check", () => {
  assert.throws(() => assertAgySession("Fetching available models...\n"), /live `agy` session/i);
});
