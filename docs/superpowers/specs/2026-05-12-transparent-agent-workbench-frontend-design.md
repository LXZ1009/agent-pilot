# Transparent Agent Workbench Frontend Design

## Goal

Rebuild the frontend from a pricing-meeting flow console into a transparent, command-driven Agent workbench similar in product posture to Codex or Claude Code.

The core experience is one unified workspace where the user issues tasks, replies to interview questions, inspects multi-agent execution, and reviews generated artifacts through a single conversation timeline. The UI should make multi-agent collaboration visible without forcing users to manually operate every workflow step.

## Product Positioning

The frontend is a developer-tool-style Agent workbench, not a business dashboard and not a hidden assistant chat.

Primary principles:

- One command composer is the only primary action surface.
- One conversation timeline is the main workspace.
- Agent execution is transparent by default and deeply inspectable on demand.
- Interview questions, user replies, structured summaries, material packages, previews, errors, and traces are all rendered as message blocks in the same thread.
- Side panels provide context and debugging support, but they must not become the main workflow.

## Information Architecture

The app should use three stable regions.

### Left Rail: Threads And Runs

The left rail lists recent work sessions, runs, or meetings.

It should show enough state to switch context quickly:

- Thread or meeting title.
- Latest status.
- Last updated time.
- Compact progress signal, such as `2/3 interviewees complete`.

For the first implementation, this can be a static or current-session-only list if the backend does not yet expose persistent thread history.

### Center: Unified Timeline

The center column is the primary workspace.

It contains:

- User commands.
- Agent coordinator messages.
- Sub-agent messages.
- Interview prompts and replies.
- Structured answer blocks.
- Artifact blocks.
- Error and retry blocks.
- Collapsible trace summaries attached to the message that produced them.

The center column should replace the current scattered panels for interviewee list, conversation, material generation chain, material package, and preview card.

### Right Inspector: Context And Execution Detail

The right inspector supports transparency without stealing the main workflow.

It should contain collapsible sections:

- Meeting context.
- Active targets, such as interviewees and their states.
- Active agents and called agents.
- Execution trace.
- Artifacts.
- Raw JSON.

The inspector can be hidden on smaller screens or collapsed by default when space is constrained.

## Command Model

The composer supports three levels of control.

### Natural Language

Example:

```text
帮我准备这场华东大区定价会，先访谈张三和李四，完成后生成会议物料和会前预览
```

The system should route this through `PricingMeetingAgent`, which decides the intent and dispatches sub-agents automatically.

### Semi-Structured Commands

Examples:

```text
/prepare meeting_20260511_001 @张三 @李四
/material 生成会议物料
/preview 生成会前 5 分钟预览
```

These commands clarify user intent and target, but they do not require the user to manually orchestrate sub-agents.

### Precise Interventions

Examples:

```text
@张三 客户主要担心账期拉长和竞品低价
/retry MaterialAssetAgent
/trace last
/skip @李四
```

These controls are for developer-tool transparency, recovery, and debugging.

## Multi-Agent Collaboration

Command-driven input and automatic multi-agent collaboration are not conflicting concepts.

The command composer defines the user's intent. The root agent still owns planning and orchestration.

Expected flow:

```text
User command
  -> PricingMeetingAgent receives the intent
  -> PricingMeetingAgent classifies the task and target
  -> PricingMeetingAgent dispatches sub-agents
  -> Sub-agent outputs stream or append into the unified timeline
  -> Trace and artifacts attach to the corresponding message blocks
```

The UI must avoid making users click through a fixed process such as "start interview, generate material, generate preview". Those can exist as command suggestions, but the root interaction should remain a command plus an automatically coordinated run.

## Interview Conversation Support

Interviewing should be modeled as a multi-target conversation inside the same thread.

Example timeline:

```text
User
/prepare 华东大区定价会 @张三 @李四

PricingMeetingAgent
已创建会前访谈 batch，调度 2 个访谈任务。

PreMeetingInterviewAgent -> 张三
请确认客户对价格调整的主要担忧。

User -> 张三
客户担心账期拉长和竞品低价。

PreMeetingInterviewAgent -> 张三
还需要补充审批例外和价格底线。

InterviewStructuringAgent
张三访谈已结构化，缺口：合同特殊条款。

MaterialAssetAgent
会议物料已生成。
```

The composer should maintain a lightweight target state when needed:

```text
Replying to: 张三 · 当前问题
```

It should also support explicit target commands such as:

```text
@张三 客户愿意接受阶梯价，但要求账期不变
```

This keeps interview handling compatible with multiple concurrent interviewees without splitting the UI into separate workflow panels.

## Message Block Types

The implementation should introduce a frontend timeline model that can render different message block types.

Initial block types:

- `user_command`: user task or command.
- `agent_status`: coordinator status update.
- `agent_message`: sub-agent response.
- `interview_prompt`: question addressed to an interview target.
- `interview_reply`: user reply for a target.
- `structured_summary`: interview or meeting summary.
- `artifact`: generated material, preview payload, or JSON package.
- `trace`: collapsible execution trace summary.
- `error`: failure with retry affordance.

The backend response can initially be adapted into this model on the frontend. A later backend iteration can emit timeline-native events.

## Data Flow

For the first refactor, keep the existing backend entrypoint:

```text
POST /api/pricing-meeting/agent/execute
```

The frontend should add a command parsing layer that maps composer input to:

- `meeting_id`
- `task_type`
- `payload`
- optional `target`
- optional `batch_id`
- optional `session_id`

Existing task types remain usable:

- `start_interview`
- `interview_reply`
- `generate_material`
- `pre_meeting_preview`

The UI should stop exposing these task types as primary buttons. They become implementation details behind commands and suggestions.

## Error Handling

Errors should appear in the timeline as first-class blocks.

Each error block should show:

- Human-readable message.
- Failed agent or step when known.
- Retry action when a retry is meaningful.
- Link or toggle to raw trace details.

Missing `OPENAI_API_KEY` remains a localized frontend error, but it should be displayed as a timeline error instead of a detached form message.

## Visual And Interaction Direction

Visual thesis: a calm, dense, developer-grade command workspace with restrained surfaces, clear typography, and visible execution state.

Interaction thesis:

- The composer anchors the experience and accepts natural language, slash commands, and target mentions.
- Timeline blocks can expand to reveal trace and raw payload details.
- The inspector updates with the selected message or active run.

The design should avoid dashboard-card mosaics. Cards are acceptable only as individual timeline blocks, artifact blocks, or inspector sections.

## Testing And Verification

Frontend tests should cover:

- Command parsing for natural language fallbacks, slash commands, and target mentions.
- Mapping existing API responses into timeline blocks.
- Rendering of interview prompt and reply blocks.
- Artifact and trace block rendering.
- Disabled and loading states for composer submission.

Build verification remains:

```powershell
npm.cmd run build
```

## Initial Implementation Scope

The first implementation should be a single frontend refactor that:

- Replaces the current process-panel layout with the three-region workbench.
- Adds a command composer.
- Adds a timeline adapter over existing backend responses.
- Preserves existing API calls and response types.
- Moves meeting context, trace, artifacts, and raw JSON into the inspector.
- Supports interview replies through `@target` or active reply target state.

It should not require a backend protocol redesign before the frontend becomes useful.

