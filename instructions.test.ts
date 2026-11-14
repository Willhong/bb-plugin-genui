import { describe, expect, it } from "vitest";
import { ACTIONS, callSignature, COMPONENTS, componentSignature, type ComponentName } from "./core/catalog";
import { collectLoads, compile, dataKey, evaluate, formatDiagnostics, initialState, type LoadedData } from "./core";
import { examplesReport } from "./examples";
import {
  AGENT_INSTRUCTIONS,
  AGENT_INSTRUCTIONS_WEB_OFF,
  CORE_COMPONENTS,
  FULL_REFERENCE,
  UI_REFERENCE,
  WEB_LOOKUPS_OFF,
} from "./instructions";

describe("agent instructions", () => {
  // BB refuses a tool whose instructions pass 4096 characters (the plugin then
  // fails to load) and truncates the configure section there.
  it("fit BB's 4096-character cap per section", () => {
    expect(AGENT_INSTRUCTIONS.length).toBeLessThanOrEqual(4096);
    expect(AGENT_INSTRUCTIONS_WEB_OFF.length).toBeLessThanOrEqual(4096);
    expect(UI_REFERENCE.length).toBeLessThanOrEqual(4096);
  });

  // The point of the split: what every session pays for stays near half of what the four sections of 0.3.2 cost (15,749 characters).
  it("keep the two session sections under 8,000 characters together", () => {
    expect(UI_REFERENCE.length + AGENT_INSTRUCTIONS.length).toBeLessThanOrEqual(8000);
  });

  // A replace that silently matches nothing would keep teaching Map while lookups are off.
  it("swap the Map line for the off note while web lookups are off", () => {
    expect(AGENT_INSTRUCTIONS_WEB_OFF).toContain(WEB_LOOKUPS_OFF);
    expect(AGENT_INSTRUCTIONS_WEB_OFF).not.toContain("→ Map");
  });

  // Every component is at least named in the session, so an agent knows to ask ui_examples for it.
  it("name every component and give every action's signature", () => {
    for (const name of Object.keys(COMPONENTS)) expect(UI_REFERENCE, name).toMatch(new RegExp(`\\b${name}\\b`));
    for (const name of Object.keys(ACTIONS)) expect(UI_REFERENCE, name).toContain(`${name}(`);
  });

  // Every parameter of a core component is in the session; a few summaries are shortened there.
  it("give the core components' full parameter lists", () => {
    for (const name of CORE_COMPONENTS) expect(UI_REFERENCE, name).toContain(`${callSignature(name, COMPONENTS[name])}`);
  });

  // A component whose signature the session lacks must be one ui_examples call away.
  it("list every component and action the parser accepts in ui_examples([\"all\"])", async () => {
    const { ok, text } = await examplesReport(["all"]);
    expect(ok).toBe(true);
    expect(text).toBe(FULL_REFERENCE);
    for (const name of [...Object.keys(COMPONENTS), ...Object.keys(ACTIONS)]) expect(text, name).toContain(`${name}(`);
  });

  it("return a named component's signature from ui_examples", async () => {
    for (const name of ["Tests", "Decision", "Map"] as ComponentName[]) {
      const { ok, text } = await examplesReport([name]);
      expect(ok).toBe(true);
      expect(text).toContain(componentSignature(name));
    }
  });

  it("carry examples that compile and render without errors", () => {
    const examples = [...AGENT_INSTRUCTIONS.matchAll(/```ui\n([\s\S]*?)\n```/g)].map((match) => match[1]);
    expect(examples.length).toBeGreaterThan(3);
    for (const example of examples) {
      const compiled = compile(example);
      expect(formatDiagnostics(compiled.diagnostics), example).toBe("");
      const program = compiled.program!;
      // Example paths are illustrative: each Load reads as an empty report.
      const data = new Map<string, LoadedData>(collectLoads(program).map((request) => [dataKey(request), { ok: true, value: [] }]));
      const { diagnostics } = evaluate(program, initialState(program, data), data);
      expect(diagnostics, example).toEqual([]);
    }
  });
});
