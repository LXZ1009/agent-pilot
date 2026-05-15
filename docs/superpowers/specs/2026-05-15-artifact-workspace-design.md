# Artifact Workspace Design

## Purpose

This document defines the next design for the right-panel `Artifacts` tab.
The tab should become an Artifact Workspace: a run-scoped place for users to
inspect, verify, and reuse deliverables produced by the current interaction.

The feature must stay platform-level. It must not hard-code business agent
names, tool names, fixed file names, or scenario-specific artifact schemas.

## Official DeepAgents Alignment

The design follows these DeepAgents patterns:

- DeepAgents provide filesystem tools such as `ls`, `read_file`, `write_file`,
  `edit_file`, `glob`, and `grep` through a pluggable backend.
- The default DeepAgents filesystem is thread-scoped state. Files written by a
  subagent remain visible to the supervisor and other subagents in the same
  thread.
- The official frontend sandbox pattern exposes files through a backend API and
  renders an IDE-like file browser, viewer, and diff surface.
- DeepAgents streaming exposes messages, values, tool calls, subagents, and
  final outputs. UI should be built from typed projections rather than parsing
  chat text.

References:

- https://docs.langchain.com/oss/python/deepagents/backends
- https://docs.langchain.com/oss/python/deepagents/frontend/sandbox
- https://docs.langchain.com/oss/python/deepagents/event-streaming
- https://docs.langchain.com/oss/python/deepagents/frontend/overview

## Functional Positioning

The `Artifacts` tab is not a generic technical log and not a duplicate of the
main workspace answer.

Responsibilities:

- Show deliverables that the user can inspect, reuse, save, hand off, or use as
  the next-step input.
- Show where each deliverable is stored and which run produced it.
- Render common artifact content shapes such as Markdown, JSON, table-like data,
  HTML previews, and links.
- Connect each artifact back to the producing trace node when that relationship
  is available.

Non-responsibilities:

- Do not show ordinary tool outputs by default.
- Do not show SQL query results unless they are explicitly promoted as a
  deliverable.
- Do not show debug events, chain logs, transient Agent thoughts, or raw
  execution snapshots.
- Do not become a full sandbox IDE in this iteration.
- Do not expose local absolute paths to the frontend.

Boundary with other right-panel tabs:

- Main workspace: user-facing natural-language answer.
- Progress: current plan, async task state, and live execution progress.
- Trace: Agent, tool, task, input, output, error, SQL, table, and raw evidence
  used to understand execution.
- Citations: mappings from final claims to process evidence.
- Artifacts: reusable deliverables only.

Short rule:

> Main workspace says it. Trace proves how it happened. Artifacts are what the
> user can take away.

## MVP Scope

The MVP supports two artifact sources only:

1. `inline`
   - Content is carried in a declared artifact event.
   - Used for small deliverables, short Markdown, compact JSON, table-like data,
     or preview payloads.
   - Inline content enters the artifact tab only when it is explicitly declared
     as a deliverable artifact.

2. `workspace`
   - Content lives in a backend-controlled workspace path.
   - Used for async agent outputs and larger generated files.
   - Frontend reads content through a backend artifact API, never by local path.

Deferred sources:

- `deepagents-state-fs`
- `sandbox-fs`
- `persistent-store`
- `external-object-store`

These sources are intentionally not implemented in the MVP. Future support
should extend the source registry and backend resolver without changing the
frontend artifact workspace contract.

## Artifact Admission Rules

Only declared deliverables enter the `Artifacts` tab.

Allowed:

- `artifact.created` or `artifact.updated` events whose artifact role is
  `deliverable`, `workspace_file`, `preview`, or `manifest`.
- Workspace files returned by the backend artifact API for the selected
  interaction run.
- Tool outputs that explicitly declare artifact metadata such as `artifact_id`,
  `artifact: true`, `uri`, `mime_type`, `schema_ref`, or an equivalent generic
  artifact envelope.
- Generic manifest files that describe a bundle of deliverables through an
  `artifacts` array or equivalent platform-neutral manifest shape.

Not allowed by default:

- Ordinary tool result JSON.
- Ordinary SQL/table outputs.
- Agent intermediate notes.
- Debug records.
- Raw protocol events.
- Natural-language assistant responses already shown in the main workspace.

This rule prevents the artifact tab from becoming a mixed log of process
evidence and final deliverables.

## Artifact Model

Use one small platform model for the MVP.

```ts
export type ArtifactSource = 'inline' | 'workspace';

export type ArtifactRole =
  | 'deliverable'
  | 'workspace_file'
  | 'manifest'
  | 'preview';

export type ArtifactKind =
  | 'document'
  | 'data'
  | 'table'
  | 'preview'
  | 'bundle'
  | 'link'
  | 'unknown';

export interface ArtifactDescriptor {
  id: string;
  runId: string;
  title: string;
  kind: ArtifactKind;
  role: ArtifactRole;
  source: ArtifactSource;
  uri?: string;
  mimeType?: string;
  schemaRef?: string;
  summary?: string;
  content?: unknown;
  producerNodeId?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}
```

Field meanings:

- `id`: stable artifact identifier, generated by the backend or projection
  layer.
- `runId`: interaction run that owns the artifact.
- `title`: user-facing artifact name.
- `kind`: content shape used to choose renderer.
- `role`: why this item belongs in the artifact tab.
- `source`: where the content is resolved from in the MVP.
- `uri`: virtual path or logical URI. It must not be a local absolute path.
- `mimeType`: renderer hint.
- `schemaRef`: optional structured-output schema reference.
- `producerNodeId`: trace node that generated or registered the artifact.
- `content`: inline content only. Workspace content should be lazy-loaded.

Do not add business fields such as `meetingId`, `customerList`, or
`assetIndexType` to this interface.

## Storage and URI Rules

The MVP uses a simplified storage model.

`inline`:

- The descriptor may include `content`.
- The backend evidence archive is enough to replay the artifact.
- Use only for small content.

`workspace`:

- The descriptor includes a virtual `uri`.
- The backend maps the virtual URI to an allowed workspace root.
- The frontend calls the backend artifact content API to load the content.
- The frontend must never receive or construct local absolute filesystem paths.

URI rules:

- URI should be stable within a thread and run.
- URI should be relative or virtual, for example
  `/artifacts/<bundle>/<file>.md`.
- Backend owns path normalization and traversal protection.
- If an existing generator writes to a local workspace, the backend translates
  that path into a virtual URI before sending it to the frontend.

## Backend API Contract

Add a small artifact API. Keep it independent from business scenarios.

```txt
GET /api/threads/{thread_id}/artifacts?run_id={run_id}
```

Returns artifact descriptors for the selected thread and optional run.

```json
{
  "thread_id": "thread_123",
  "run_id": "run_456",
  "artifacts": [
    {
      "id": "artifact_1",
      "runId": "run_456",
      "title": "Run report",
      "kind": "document",
      "role": "deliverable",
      "source": "workspace",
      "uri": "/artifacts/run_456/report.md",
      "mimeType": "text/markdown",
      "producerNodeId": "task:task_1"
    }
  ]
}
```

```txt
GET /api/threads/{thread_id}/artifacts/{artifact_id}
```

Returns one descriptor plus content if the artifact is readable.

```json
{
  "artifact": {
    "id": "artifact_1",
    "title": "Run report",
    "kind": "document",
    "source": "workspace",
    "uri": "/artifacts/run_456/report.md",
    "mimeType": "text/markdown"
  },
  "content": "# Report\n..."
}
```

Backend responsibilities:

- Merge declared inline artifacts from evidence events with workspace artifacts
  discovered for the run.
- Resolve content through source-specific resolvers.
- Enforce allowed workspace roots.
- Normalize paths and block traversal such as `..`, `~`, drive roots, or
  absolute local paths from frontend input.
- Return clear errors for missing, unreadable, too-large, or unsupported
  artifacts.

Do not require the frontend to know whether a workspace artifact originally came
from an async agent, a local workspace folder, or a later persistent backend.

## Projection Rules

Frontend projection from events should remain conservative.

`artifact.created` / `artifact.updated`:

- Project into `ArtifactDescriptor` only when the event contains an artifact
  envelope.
- If `artifact.role` is absent, default to `deliverable` only for explicit
  artifact events, not for generic tool messages.
- Infer `kind` from `mimeType`, URI extension, or content shape.
- Attach `producerNodeId` from namespace, tool call ID, task ID, or event
  metadata when available.

`values.files`:

- Treat as workspace candidates only when the backend or event metadata marks
  them as artifact files.
- Do not blindly convert every file in state into a deliverable.

Tool outputs:

- Do not project ordinary output into artifacts.
- Project only when the tool result contains explicit artifact metadata.
- Otherwise, keep the output under Trace evidence.

Manifests:

- If an artifact has role `manifest`, render it as a bundle index.
- If the manifest contains a generic `artifacts` array, expand its children into
  descriptors.
- Expansion must use generic fields such as `id`, `title`, `uri`, `mimeType`,
  `kind`, `role`, `schemaRef`, and `summary`.
- Do not special-case file names like `asset_index.json`.

## Frontend UX

The `Artifacts` tab has three areas.

1. Artifact list

- Shows artifact title, kind, role, source, and status.
- Groups by role in this order: `deliverable`, `preview`, `manifest`,
  `workspace_file`.
- Highlights the first final deliverable by default.
- Empty state says that no reusable deliverables have been produced yet.

2. Artifact preview

Renderer selection:

- `document` + Markdown MIME: render Markdown.
- `data`: render formatted JSON with collapsible sections later if needed.
- `table`: render tabular preview.
- `preview` + HTML MIME: render sanitized preview or source fallback.
- `link`: show link with metadata.
- `unknown`: show metadata and unsupported content message.

3. Artifact metadata

Always show:

- source label: `inline` or `workspace`;
- role;
- MIME type or kind;
- virtual URI when present;
- producing trace node when present;
- created/updated time when present.

User-facing labels:

- `inline`: "事件内联"
- `workspace`: "后端工作区"
- `deliverable`: "可交付"
- `workspace_file`: "工作区文件"
- `manifest`: "产物清单"
- `preview`: "预览"

The UI should remain compact because it lives inside the right panel. It should
not become a full-width IDE layout.

## Error Handling

List-level failures:

- If the artifact API fails, keep any event-projected artifacts visible and show
  a small warning in the tab.

Content-level failures:

- Missing artifact: show "产物不存在或已被清理".
- Permission/path error: show "产物路径不可访问".
- Unsupported MIME: show metadata and virtual URI.
- Too large: show size metadata and ask the user to open/download later when
  that capability exists.

Errors should not break the rest of the right panel.

## Security and Governance

- Never expose absolute local paths to the frontend.
- Never let frontend query arbitrary filesystem paths.
- All workspace reads go through artifact ID or backend-issued virtual URI.
- Backend must validate artifact ownership by `thread_id` and optional `run_id`.
- Artifact descriptors should not include secrets or raw environment paths.
- HTML preview must be sanitized or sandboxed. If that is not available in the
  MVP, render HTML as source text instead.

## Testing Requirements

Projection tests in `frontend/src/workspaceView.test.ts`:

- Explicit `artifact.created` projects into an artifact descriptor.
- Ordinary tool JSON output does not project into artifacts.
- Tool output with explicit artifact metadata does project.
- Manifest artifact can expand generic child descriptors.
- URI-only workspace artifact is represented without inline content.
- Artifact kind inference covers Markdown, JSON, table shape, HTML preview, and
  unknown fallback.

Backend tests:

- Artifact list API returns descriptors for a thread/run.
- Artifact content API reads only backend-issued workspace artifacts.
- Path traversal attempts fail.
- Missing artifact returns a clear error.
- Absolute local paths are not returned in API payloads.

Frontend component tests or focused interaction tests:

- Empty state appears when no artifacts exist.
- Selecting an artifact updates the preview.
- Markdown, JSON, table, and unsupported content render correctly.
- Content load failure does not crash the panel.

## Implementation Phases

Phase 1: Contract and conservative projection

- Extend `ArtifactDescriptor` with `role` and `source`.
- Tighten projection rules so ordinary tool outputs are excluded.
- Add tests for admission and exclusion rules.
- Update the current `ArtifactsTab` to show role/source metadata.

Phase 2: Backend artifact API

- Add thread/run artifact list endpoint.
- Add artifact content endpoint.
- Implement workspace resolver with virtual URI mapping.
- Keep event-inline artifacts available without content fetch.

Phase 3: Viewer polish

- Lazy-load workspace content when selected.
- Add renderer states for loading, unavailable, unsupported, and too large.
- Add manifest/bundle presentation without business-specific file names.

Deferred:

- Full file tree.
- Diff view.
- Sandbox filesystem API.
- Persistent artifact store.
- Download/share actions.
- Artifact mutation or approval workflow.

## Acceptance Criteria

- A user can open the `Artifacts` tab and see only reusable deliverables for the
  selected interaction run.
- The tab does not show ordinary tool outputs, SQL tables, or debug records as
  artifacts unless they are explicitly promoted.
- Each artifact shows where it is stored: `inline` or `workspace`.
- Workspace artifact content loads through backend API, not direct local paths.
- Markdown, JSON, table-like data, preview payloads, and unknown content have
  clear renderers or fallbacks.
- The implementation remains generic and contains no branches for concrete
  business agent names, concrete tool names, or fixed artifact file names.

## Developer Notes

- Keep the projection layer pure and testable.
- Prefer adding small helpers such as `isArtifactEnvelope`,
  `inferArtifactKind`, `normalizeArtifactRole`, and `normalizeArtifactSource`.
- Do not parse assistant natural language to discover artifacts.
- Do not classify by file names. A file name can be displayed, but not used as
  platform logic.
- Keep raw evidence available in Trace and Diagnostics so artifact admission can
  stay strict.
