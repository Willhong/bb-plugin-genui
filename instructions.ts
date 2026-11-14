// What agents are told about ```ui blocks. Sessions whose replies a person
// reads get two sections (see server.ts); BB appends tool sections before
// configure sections, so:
// - UI_REFERENCE (the check_ui tool's instructions) comes first: the syntax,
//   the signatures of the components replies use most (CORE_COMPONENTS), and
//   every other component by name only, generated from the catalog so the
//   prompt cannot drift from what the parser accepts.
// - AGENT_INSTRUCTIONS (bb.agents.configure) comes last, closest to the
//   conversation: when to write UI, which component fits which content
//   (including tool output after code work), questions, and worked examples.
//   Examples here are the strongest lever on what models write; moved to the
//   earlier section, the same calculator example stopped being followed.
// Everything else is pulled on demand from ui_examples: a named component's
// signature, notes, save command and gallery examples; ["all"] returns
// FULL_REFERENCE (every signature, the icon names); ["app"] the ```app
// contract. Until 0.3.2 all of it rode on every session, in four sections
// (16,060 characters with BB's headers); the two now take about 7,800.
// BB refuses a tool whose instructions pass 4096 characters and truncates the
// configure section there; instructions.test.ts holds both.
import { ACTIONS, callSignature, COMPONENTS, componentSignature, type ComponentGroup, type ComponentName, type ComponentSpec } from "./core/catalog";

/**
 * Components whose signatures every session gets: the ones replies use most
 * (counted over 179 replies with UI in a month of real threads: Card, Table,
 * Badge, FollowUps, Image, Steps, KeyValue, Row, Metric, Text, Button and
 * Diagram lead) plus the inputs a question or calculator needs. The rest are
 * listed by name; an agent reads their signature with ui_examples first.
 * Agents seldom do (Claude Code loads plugin tools lazily), so a component
 * only named gets picked less often than one whose signature is shown: in
 * the comparison that kept this split, SegmentedBar went back on this list
 * for that reason, and the shape list gives a few others short call forms.
 */
export const CORE_COMPONENTS: readonly ComponentName[] = [
  "Card", "Row", "Tabs",
  "Text", "Callout", "Metric", "Badge", "KeyValue", "List", "Image", "File", "Sources",
  "Table", "Chart", "SegmentedBar", "Steps", "Timeline", "Diagram", "Code", "Snippet",
  "Button", "FollowUps", "Form", "Slider", "Choice", "Radio", "Select", "Checklist", "Toggle",
];

/**
 * Groups too big to list in full even in FULL_REFERENCE: their required params
 * only, with the full API in the ui_examples notes (examples.ts NOTES).
 */
const BRIEF_GROUPS: Partial<Record<ComponentGroup, string>> = { "3D": "3D (ui_examples first: full API)" };

const GROUP_ORDER: readonly ComponentGroup[] = ["Layout", "Content", "Data", "Project", "Inputs", "Widgets", "Media", "Dev", "Manage", "Evidence", "3D"];

function namesOf(group: ComponentGroup): ComponentName[] {
  return (Object.keys(COMPONENTS) as ComponentName[]).filter((name) => COMPONENTS[name].group === group);
}

/** One line per group: `Group: Sig: summary · Sig · …`. */
function componentLines(groups: readonly ComponentGroup[]): string {
  return groups
    .map((group) => {
      const entries = namesOf(group).map((name) => {
        const spec: ComponentSpec = COMPONENTS[name];
        return Object.hasOwn(BRIEF_GROUPS, group)
          ? `${name}(${spec.params.filter((param) => !param.optional).map((param) => param.name).join(", ")}, …): ${spec.summary}`
          : componentSignature(name);
      });
      return `${BRIEF_GROUPS[group] ?? group}: ${entries.join(" · ")}`;
    })
    .join("\n");
}

/**
 * Shorter summaries for the session list where the catalog's run long; the
 * full ones are in FULL_REFERENCE and each component's ui_examples answer.
 */
const BRIEF_SUMMARIES: Partial<Record<ComponentName, string>> = {
  Button: "no action: a choice, its label the answer; primary: the main action; icon: lucide name",
  Image: "path or https URL; the only way the user sees an image",
};

const core = new Set<ComponentName>(CORE_COMPONENTS);
const coreSignatures = CORE_COMPONENTS.map((name) =>
  BRIEF_SUMMARIES[name] === undefined ? componentSignature(name) : `${callSignature(name, COMPONENTS[name])}: ${BRIEF_SUMMARIES[name]}`,
).join(" · ");
/** Every component outside the core, by group, names only. */
const otherNames = GROUP_ORDER.map((group) => namesOf(group).filter((name) => !core.has(name)))
  .filter((names) => names.length > 0)
  .map((names) => names.join(" "))
  .join(" · ");

const actionList = Object.entries(ACTIONS)
  .map(([name, spec]) => callSignature(name, spec))
  .join(" ");

export const UI_REFERENCE = `# Inline UI reference
Syntax: one statement per line. \`$x = 8\` is state inputs bind to; \`name = expr\` names a value and \`f = (a, b) => expr\` a function; each bare expression renders. JS expressions incl. ** ?: ?? \`\${x}\` [lists] {objects} x.y map/filter/find/join/length, plus round(x, d), fmt(x, d), sum, min, max, abs, entries, Load(path), sqrt floor ceil clamp range(a, b, step?). Named args go last: Slider($n, 0, 10, label: "N").
Components (? optional; tone: neutral|good|warn|bad|info if meaningful):
${coreSignatures}
Others, by name: call ui_examples([names]) for the signature and an example before you first write one (["all"]: every signature):
${otherNames}
Actions: ${actionList}; a list runs in order; a picked Send puts its text in the user's message.
Data: Load("path") reads JSON/CSV/TSV/JSONL from the workspace, "$BB_THREAD_STORAGE/x.json" or /tmp into lists and objects, and other files (a log, tsc output) as text; never retype values a file or command output holds. Snippet and Image read files the same way; copy external screenshots there first. A Table, Chart or Metric not from Load takes source: "illustrative"|"user-provided"|URL (never Card).
Games, simulations, custom visuals: \`\`\`app, a self-contained HTML page; read its contract with ui_examples(["app"]) first and check it with check_ui(spec, language: "app").`;

/** What ui_examples(["all"]) returns: every signature, the actions and the icon names. */
export const FULL_REFERENCE = `## Every component (? optional; tone: neutral|good|warn|bad|info)
${componentLines(GROUP_ORDER)}
Actions: ${actionList}
Icon names: Check X Plus Copy Trash2 Download ExternalLink Play Search Settings FileText AlertTriangle Info Lock Bug GitBranch.`;

const MAP_LINE = "- places or a route → Map; what no file shows → ImageSearch";

/**
 * When to write UI, where, and how questions work, tuned on a 64-prompt
 * component-fit battery run headless through omp the way BB injects these
 * sections, on Haiku 5.5 and Sonnet 5.5, then in real BB. What moved models:
 * - The opening says what the user wants shown (things better seen or used
 *   than read) and that markdown tables, numbered steps, pasted code and
 *   ASCII diagrams are the wrong form for it. Without that line, markdown
 *   tables came back in a fifth of Haiku's replies.
 * - The prose-only exemption is about the reply's content (a few sentences
 *   with nothing to see), not the question: worded as "short or conceptual
 *   questions", Haiku filed recommendations, calculations and histories under
 *   it and answered half the prompts that call for UI in prose. "In doubt,
 *   add the block" settles the rest.
 * - "Read in BB, not a terminal" answers Claude Code's own system prompt,
 *   which says replies are shown as markdown in a terminal.
 * - The shape list names a component for every kind of content; components
 *   named or shown here are the ones agents reach for.
 * The code-work lines were their own section until 0.3.2, with a save
 * command per kind of output; the commands now come with each component's
 * ui_examples answer. They say the reply after a task is prose about what was
 * done, not "the worse answer": with that line, replies shrank to one
 * sentence plus UI.
 */
export const AGENT_INSTRUCTIONS = `# Inline UI
This chat renders \`\`\`ui and \`\`\`app blocks as live UI; your reply is read in BB, not a terminal. The user wants a block wherever part of a reply is better seen or used than read: numbers, comparisons, flows, code, tool output, dates, places, steps to follow, choices. Write that part as its component, not as a markdown table, a numbered list of steps, pasted code or output, or an ASCII diagram. Tell the rest in prose: the answer, why, and what to do next. Prose says what the block means and leaves its numbers, rows and steps to it: no recap, no lone sentence over a card, no paragraphs in Text or Callout.
Skip the block only when the whole reply is a few sentences with nothing to see: a definition, a yes/no, a short status, tests or a build that fully passed, or when the user asks for brevity. Simple is not a reason for prose: a recommendation still shows its options, a calculation its live calculator, a history its Timeline. In doubt, add the block.
Only the message that ends your turn may hold a block: progress notes, thinking, files, commits, PR text and tool input are plain text; don't ask the user to decide anything mid-turn.
Pick the component the content calls for:
- a series → Chart; shares of a whole → SegmentedBar; a level against a limit → Gauge or Progress; key figures → Metric
- a calculation or what-if → Slider or Stepper for the user's numbers, a result that recomputes live; items with amounts → EditableTable
- options against criteria → Decision(options, criteria); work to approve first → Plan(steps); items on several attributes → Table; products, places, people → Entity cards in a Grid
- a flow, lifecycle or architecture → Diagram, details on key nodes; steps to follow → Walkthrough or Steps; dated events → Timeline; phases → Roadmap
- code → Snippet(path, from, to), never pasted; a change → Changes or Diff; a file tree → Tree; JSON → Json; fields → KeyValue
${MAP_LINE}; an image → Image, Compare for before/after; pages you read → Sources
After a task, say in prose what you did, found and left. Show tool output by Loading the file it saved to $BB_THREAD_STORAGE, never pasted: tests → Tests(Load(report)); a build or command log → Logs; a stack → StackTrace(text); lint, type errors, a review → Findings(Load(report) or [{severity, title, file, line, fix}]); what you checked → Acceptance([{name, status: passed|failed|blocked|untested}]); timings → Benchmark([{name, before, after}], unit).
Questions: only when you stop and wait. When the user asks to pick, or your next step needs their choice, give controls, not questions in prose: for one either/or, Buttons with no action (the label is the answer); otherwise every question in one Form of labeled inputs (Choice, Radio, Checklist, Select, Slider, Toggle). Picks go into the user's message as "label: answer" lines: no submit label, no Send() text for an answer, no "anything else?" field. A Plan or Decision is already the question. If next steps are questions the user may ask, end with FollowUps.
Wrap each block in one Card. Examples:
\`\`\`ui
$seats = 10
$plan = "Pro"
price = $plan == "Pro" ? 29 : 12
Card("Estimate", [
  Row([Choice($plan, ["Basic", "Pro"]), Slider($seats, 1, 50, label: "Seats")]),
  Metric("Total a month", "$" + fmt(price * $seats))
])
\`\`\`
\`\`\`ui
Card("How a login is handled", [Diagram("flowchart LR\\n  B[Browser] -->|POST /login| A[loginHandler]\\n  A --> V{password ok?}\\n  V -->|no| E[401]\\n  V -->|yes| S[create session]", {A: Snippet("src/auth/login.ts", 12, 34), S: "httpOnly cookie, 30 days (session.ts:8)"})])
\`\`\`
\`\`\`ui
$formats = []
Card("Before I plan the export", [Form([Checklist($formats, ["CSV", "JSON", "XLSX"], label: "Which formats?")])])
\`\`\`
\`\`\`ui
Card("Caching", [Button("Use in memory"), Button("Use Redis")])
\`\`\`
\`\`\`ui
Card("npm run build fails", [Logs(Load("$BB_THREAD_STORAGE/build.log"), "npm run build", 2)])
\`\`\`
Before you send: each table, series, flow, code excerpt, set of dates or places, and choice is a block.`;

/** While the webLookups setting is off, the Map line gives way to this one. */
export const WEB_LOOKUPS_OFF =
  "- web lookups are off: no ImageSearch, Map, Gallery {query} or https images";

export const AGENT_INSTRUCTIONS_WEB_OFF = AGENT_INSTRUCTIONS.replace(MAP_LINE, WEB_LOOKUPS_OFF);
