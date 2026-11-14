import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import plugin from "./server";

describe("the plugin's settings", () => {
  it("lists Animations, on by default, beside Web lookups", async () => {
    const host = createFakePluginHost({ pluginId: "genui" });
    await plugin(host.bb);
    expect(host.harness.registrations.settingsDescriptors).toMatchObject({
      animations: { type: "boolean", label: "Animations", default: true },
      webLookups: { type: "boolean", label: "Web lookups", default: true },
    });
  });
});

describe("the instruction sections", () => {
  const context = (parentThreadId: string | null) => ({
    pluginMetadata: {},
    thread: { id: parentThreadId === null ? "thr_person" : "thr_worker", title: null, parentThreadId, sourceThreadId: null },
    project: { id: "proj", kind: "personal" as const, name: "Personal", gitRemoteUrl: null },
    environment: { id: "env", name: null, path: null, branchName: null, workspaceProvisionType: null },
    host: { id: "h", name: "mac" },
    provider: { id: "claude-code", model: "m", capabilities: { supportsNativeUserQuestion: false } },
    origin: { kind: null, pluginId: null },
  });

  it("go to a thread a person reads: check_ui's reference and the rules; ui_examples adds none", async () => {
    const host = createFakePluginHost({ pluginId: "genui" });
    await plugin(host.bb);
    const resolved = await host.harness.resolveAgentConfiguration(context(null));
    expect(resolved.tools.map((tool) => [tool.name, tool.instructions === null ? null : tool.instructions.split("\n")[0]])).toEqual([
      ["check_ui", "# Inline UI reference"],
      ["ui_examples", null],
    ]);
    expect(resolved.instructions?.split("\n")[0]).toBe("# Inline UI");
    // The code-work lines live in the rules now, not in a contributed section.
    expect(host.harness.registrations.instructionProvider).toBeNull();
  });

  it("skip a thread another agent spawned", async () => {
    const host = createFakePluginHost({ pluginId: "genui" });
    await plugin(host.bb);
    const resolved = await host.harness.resolveAgentConfiguration(context("thr_parent"));
    expect(resolved.tools).toEqual([]);
    expect(resolved.instructions).toBeNull();
  });
});
