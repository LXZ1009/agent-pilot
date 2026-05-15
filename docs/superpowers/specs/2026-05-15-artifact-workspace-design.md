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

### Ownership Model

DeepAgents default filesystem state is thread-scoped, while the Artifact
Workspace is run-scoped from the user's point of view. The platform must keep
those two concepts separate:

- Thread storage answers where files live and who may read them.
- Artifact ownership answers which interaction run registered the deliverable.
- Every backend-issued artifact descriptor must carry a stable `runId`.
- A workspace file may remain readable across the thread, but it must not appear
  in a run's Artifact Workspace unless that run explicitly registered it as an
  artifact.
- If the runtime cannot provide a durable run ID, the gateway must assign one at
  run start and propagate it into lifecycle and artifact events before frontend
  projection.

`inline`:

- The descriptor may include `content`.
- The backend evidence archive is enough to replay the artifact.
- Use only for small content.
- MVP inline limit: up to 64 KiB after UTF-8 serialization.
- Oversized inline payloads must be rejected or converted into workspace-backed
  artifacts before they are exposed to the frontend.

`workspace`:

- The descriptor includes a virtual `uri`.
- The backend maps the virtual URI to an allowed workspace root.
- The frontend calls the backend artifact content API to load the content.
- The frontend must never receive or construct local absolute filesystem paths.
- Workspace artifact content is lazy-loaded only when selected.
- MVP preview limit: return at most 256 KiB through the content API. Larger
  artifacts return metadata plus a `too_large` availability state instead of
  inlining the full content.

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
- Issue or normalize the platform artifact ID before returning descriptors to
  the frontend.
- Resolve content through source-specific resolvers.
- Enforce allowed workspace roots.
- Normalize paths and block traversal such as `..`, `~`, drive roots, or
  absolute local paths from frontend input.
- Return clear errors for missing, unreadable, too-large, or unsupported
  artifacts.
- Treat `artifact_id` as the trusted lookup key. `uri` is descriptive metadata
  and an internal resolver input, not a free-form frontend query surface.

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

## UI UX Pro Design Requirements

The `Artifacts` tab must follow the `ui-ux-pro-max` design standard, not a
generic frontend UX checklist. The product type is a compact SaaS/workbench
side panel, so the design should be quiet, dense, scannable, and operational.
Avoid landing-page styling, decorative panels, oversized headings, and nested
cards.

Design priorities:

1. Accessibility
2. Touch and interaction
3. Performance
4. Style consistency
5. Layout and responsive behavior
6. Typography and color
7. Motion and feedback

### Information Architecture

The tab has three functional areas, ordered by user intent:

1. Artifact list
2. Artifact preview
3. Artifact metadata

This is not a full IDE layout. It is a compact right-panel workspace that lets
the user quickly identify a deliverable, preview it, and understand where it
came from.

### Artifact List

Purpose:

- Let the user scan reusable deliverables for the selected interaction run.
- Make final deliverables easier to find than previews or manifests.
- Avoid mixing ordinary process evidence into the list.

Required content:

- Artifact title.
- Kind: `document`, `data`, `table`, `preview`, `bundle`, `link`, or `unknown`.
- Role: `deliverable`, `preview`, `manifest`, or `workspace_file`.
- Source: `inline` or `workspace`.
- Status or availability: loaded, loading, unavailable, unsupported, or error.

Grouping order:

1. `deliverable`
2. `preview`
3. `manifest`
4. `workspace_file`

Interaction:

- The first available `deliverable` is selected by default.
- If no `deliverable` exists, select the first available artifact.
- Every artifact row is a real button with visible focus state.
- Button hit area must be at least 44px high.
- Rows must use icon + text or text + status badge. Do not use emoji.
- Long titles wrap or truncate with a tooltip/expanded metadata fallback.
- Empty state must be helpful and specific: no reusable deliverables have been
  produced for this interaction yet.

Visual style:

- Use existing product tokens and Lucide icons.
- Use 8px or smaller radius to match the current workbench.
- Use semantic badges sparingly; avoid color-only meaning.
- Keep list density high enough for 8-12 artifacts without feeling cluttered.

### Artifact Preview

Purpose:

- Let the user inspect the selected artifact without leaving the right panel.
- Render by content shape, not by business file name.
- Show graceful fallbacks for unsupported or unavailable content.

Renderer selection:

- `document` + Markdown MIME: render Markdown.
- `data`: render formatted JSON.
- `table`: render tabular preview with stable columns.
- `preview` + HTML MIME: render sanitized/sandboxed preview if available;
  otherwise render source text.
- `bundle` or `manifest`: render a bundle index using generic child descriptors.
- `link`: show the link and metadata.
- `unknown`: show metadata, virtual URI, and unsupported content message.

UI UX Pro requirements:

- Reserve stable preview height to avoid layout shift while content loads.
- Use skeleton or inline loading state if content loading may exceed 300ms.
- Avoid horizontal scroll in the right panel except inside code/table preview
  surfaces where it is expected.
- Tables must not rely on color alone; use headers, labels, and empty states.
- JSON/code surfaces should use monospace, readable contrast, and line wrapping
  controls where practical.
- Markdown should use compact typography; headings inside the panel must not
  look like page-level hero headings.
- HTML preview must be sandboxed or downgraded to source text.

### Artifact Metadata

Purpose:

- Explain where the artifact is stored and how it relates to execution.
- Keep technical details discoverable without overwhelming the main preview.

Always show:

- Source label: `inline` or `workspace`.
- Role.
- MIME type or kind.
- Virtual URI when present.
- Producing trace node when present.
- Created/updated time when present.

User-facing labels:

- `inline`: "事件内联"
- `workspace`: "后端工作区"
- `deliverable`: "可交付"
- `workspace_file`: "工作区文件"
- `manifest`: "产物清单"
- `preview`: "预览"

Interaction:

- Metadata can be displayed as a compact definition list or collapsible details
  block.
- If `producerNodeId` is available, provide a clear affordance to inspect the
  related Trace node in a future iteration.
- Copy actions are optional in the MVP. If added later, use icon buttons with
  aria labels and visible success/error feedback.

### Responsive Behavior

The current artifact workspace lives in a right-side panel around 380-430px
wide. It must remain usable at that width.

Rules:

- Use one-column layout inside the right panel.
- Artifact list appears above the preview or as a compact vertical list.
- Do not introduce a side-by-side file tree + preview layout in the MVP.
- No page-level horizontal scroll.
- Text must fit within buttons, rows, and badges.
- Reserve space for async preview states to avoid cumulative layout shift.

### Accessibility

Required:

- Normal text contrast must meet at least WCAG AA 4.5:1.
- All icon-only buttons need aria labels.
- Keyboard navigation order follows visual order.
- Selected artifact must be announced with `aria-current` or equivalent state.
- Loading, empty, unavailable, and error states must be text-visible.
- Focus rings must remain visible and consistent with the existing design
  system.

### Motion and Feedback

- State changes should be subtle and functional.
- Use 150-300ms transitions for selection, loading completion, and collapsible
  metadata.
- Respect `prefers-reduced-motion`.
- Do not animate width/height in ways that cause reflow; prefer opacity or
  transform.
- Loading and error states should appear close to the affected artifact or
  preview, not only at the top of the panel.

### Performance

- Lazy-load workspace artifact content only when selected.
- Cache loaded content per artifact during the current thread view.
- Avoid rendering very large JSON/table content all at once; use truncation,
  row limits, or virtualization later if needed.
- Do not block the main panel while a single artifact content fetch is pending.

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
- Backend, not the frontend or tool payload, is the authority that signs off the
  stable artifact ID returned by public APIs.
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
