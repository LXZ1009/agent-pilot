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
projects them with `buildRunInspectorModel` in `frontend/src/workspaceView.ts`.

While a stream is running, the frontend refreshes evidence on a short interval
so the active interaction run can hydrate before the final run completes.

## Run Inspector

The right panel is a run-scoped task inspector, not a thread-level evidence
category drawer. A thread may contain multiple supervisor lifecycle spans and
repeated `values` snapshots, so the platform projects raw events through these
stages:

1. dedupe by `event_id` for operator views;
2. split events into `InteractionRun` objects;
3. derive progress, trace, artifacts, citations, and diagnostics for the
   selected interaction run;
4. preserve raw events in the Diagnostics tab.

The panel must optimize for "what happened in this user interaction" rather
than global thread statistics. Overall counts are secondary debugging context
and should not occupy the top of the panel.

The UI tabs are:

- `Progress`: current todos, async tasks, live subagents for the active run,
  and active nodes.
- `Trace`: selectable execution graph and node-owned evidence.
- `Artifacts`: run-scoped artifact viewer for Markdown, JSON, tables, previews,
  and links.
- `Citations`: claim-to-evidence mappings when final outputs declare them.
- `Diagnostics`: missing fields, warnings, errors, duplicate event counts, and
  raw protocol events.

## Trace Projection

The process panel now prefers `ExecutionTraceModel` over flat event sections.
This model is platform-level and must not depend on business scenarios, agent
names, or fixed tool-name mappings.

Trace construction rules:

- Build agent nodes from event `namespace` segments.
- Build tool nodes from `tool_call_id`.
- Build task nodes from generic `tasks` channel events or `task.*` custom
  events.
- Also inspect `values.messages` snapshots. Some runtimes expose tool calls only
  through assistant `tool_calls` and `tool` messages rather than separate
  `tools` stream events. The projection must create/update the same generic
  tool node from those message shapes.
- Build async task nodes from `values.async_tasks` when present. These are
  treated as generic task nodes with task/run/thread metadata, not as
  business-specific agent categories.
- Build artifact nodes from the generic `artifact.created` /
  `artifact.updated` envelope.
- Attach evidence to the node that produced it.
- Keep raw events in the Diagnostics tab for debugging.

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

Unknown custom event types are preserved in diagnostics/raw events.

## Status Mapping

The projection layer maps event words into generic statuses:

- `pending`: open or todo items.
- `running`: started, running, progress, or pending runtime events.
- `complete`: complete, finished, done, or approved events.
- `error`: failed, error, or rejected events.
- `unknown`: recorded but not classified.

## UI Contract

`RunInspectorModel` is the stable view model for the right-side panel. UI
components should read this model rather than parsing raw protocol events
directly.

`ExecutionTraceModel` remains the trace submodel under the active interaction
run.

The right panel may use official `@langchain/react` live selectors such as
`stream.subagents` and scoped `useMessages(stream, subagent)` for the currently
active run. Historical or selected earlier runs should use archived protocol
events projected through `RunInspectorModel` so live subagent snapshots do not
appear under the wrong interaction.

New platform features should add projection rules and tests in
`frontend/src/workspaceView.test.ts` before changing UI components.

## Future P1 Hooks

- Add a structured output registry that validates agent-declared schemas without
  embedding business-specific schemas in the platform.
- Extend the artifact browser with a backend artifact-content API for URI-based
  artifacts.
- Add live event hydration so `technicalEvents` can update while a stream is
  still running, not only after evidence refresh.
