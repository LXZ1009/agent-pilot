# DeepAgents Execution Detail P0

This document describes the platform-level execution detail model used by the
right-side process panel. It is intentionally generic: business applications may
emit metadata and artifacts, but the platform must not hard-code scenario
schemas such as meeting assets, interview cards, or task tracking payloads.

## Goals

- Project DeepAgents and Agent Streaming Protocol events into stable UI
  sections.
- Keep the process panel useful across domains and agent teams.
- Preserve raw events for debugging while showing a compact operator view first.
- Leave approval, human-in-the-loop review, and filesystem permissions out of
  this phase.

## Event Sources

The backend streams Agent Streaming Protocol events through:

- `messages`
- `tools`
- `tasks`
- `values`
- `updates`
- `custom`
- `debug`
- `lifecycle`

The frontend stores raw events from `/api/threads/{thread_id}/evidence` and
projects them with `buildExecutionDetailModel` in
`frontend/src/workspaceView.ts`.

While a stream is running, the frontend refreshes evidence on a short interval
so the generic execution sections can hydrate before the final run completes.
Scoped subagent message cards still use `useMessages(stream, subagent)` for
message-level real-time projection.

## Generic Sections

The first P0 version rendered flat generic sections:

- `plan`: todo/progress items discovered from `values.todos`, `updates.todos`,
  or custom `plan.*` / `todo.*` events.
- `subagents`: namespace-scoped events that are not already represented as a
  more specific tool/task/artifact event.
- `tools`: normalized tool start, finish, and error events.
- `tasks`: async or long-running task events from the `tasks` channel or custom
  `task.*` events.
- `artifacts`: files, JSON, Markdown, links, or other produced outputs.
- `errors`: lifecycle, message, tool, or custom error events.
- `rawEvents`: fallback summaries for events that the platform does not yet
  understand.

The `technical` tab still shows the full raw JSON event list.

## Trace-First Panel

The process panel now prefers `ExecutionTraceModel` over flat event sections.
This model is platform-level and must not depend on business scenarios, agent
names, or fixed tool-name mappings.

Trace construction rules:

- Build agent nodes from event `namespace` segments.
- Build tool nodes from `tool_call_id`.
- Build task nodes from generic `tasks` channel events or `task.*` custom
  events.
- Build artifact nodes from the generic `artifact.created` /
  `artifact.updated` envelope.
- Attach evidence to the node that produced it.
- Keep raw events in the technical tab for diagnostics.

The UI is organized as:

- execution link view: selectable trace nodes;
- selected node detail: node metrics, downstream nodes, and node-owned
  evidence;
- evidence renderers: SQL, table, JSON/text, artifact, and error.

SQL/table evidence is inferred from content shape rather than hard-coded tool
names. For example, a tool input with `sql`, `query`, or `statement` containing
SQL text is rendered as SQL. A tool output with `rows`, `data`, or `records`
arrays is rendered as a table. Unknown shapes fall back to JSON/text.

## Custom Event Envelope

Agents and middleware should prefer a generic envelope for custom events:

```json
{
  "type": "artifact.created",
  "title": "Run report",
  "summary": "Generated report artifact",
  "artifact": {
    "id": "artifact_1",
    "mime_type": "text/markdown",
    "uri": "/runs/report.md"
  },
  "metadata": {}
}
```

Recommended event type prefixes:

- `artifact.created`
- `artifact.updated`
- `task.started`
- `task.progress`
- `task.completed`
- `task.failed`
- `plan.created`
- `plan.updated`
- `todo.created`
- `todo.updated`
- `error.reported`

Unknown custom event types are shown as raw event summaries.

## Status Mapping

The projection layer maps event words into generic statuses:

- `pending`: open or todo items.
- `running`: started, running, progress, or pending runtime events.
- `complete`: complete, finished, done, or approved events.
- `error`: failed, error, or rejected events.
- `unknown`: recorded but not classified.

## UI Contract

`ExecutionDetailModel` is the stable view model for the right-side process
panel. UI components should read this model rather than parsing raw protocol
events directly.

`ExecutionTraceModel` is the preferred view model for the process panel. The
older `ExecutionDetailModel` remains as a compatibility fallback while the trace
model matures.

New platform features should add projection rules and tests in
`frontend/src/workspaceView.test.ts` before changing UI components.

## Future P1 Hooks

- Add a structured output registry that validates agent-declared schemas without
  embedding business-specific schemas in the platform.
- Add an artifact browser that renders Markdown, JSON, tables, code, and links
  from the generic artifact model.
- Add live event hydration so `technicalEvents` can update while a stream is
  still running, not only after evidence refresh.
