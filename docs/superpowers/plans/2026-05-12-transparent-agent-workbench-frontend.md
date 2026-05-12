# Transparent Agent Workbench Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current pricing-meeting process console with a transparent, command-driven Agent workbench.

**Architecture:** Add a small frontend workbench model that parses composer commands and adapts existing API responses into timeline blocks. Refactor `App.tsx` to render left run navigation, a central multi-agent timeline, and a right inspector while preserving the current backend API.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, lucide-react, react-markdown.

---

### Task 1: Workbench Model

**Files:**
- Create: `frontend/src/workbench.ts`
- Create: `frontend/src/workbench.test.ts`

- [ ] Write tests for slash commands, target replies, fallback commands, and API response timeline adaptation.
- [ ] Run `npm.cmd test -- workbench.test.ts` and verify the tests fail because `workbench.ts` does not exist.
- [ ] Implement `parseWorkbenchCommand`, `buildTimelineFromBatch`, and `buildArtifactBlocks`.
- [ ] Run `npm.cmd test -- workbench.test.ts` and verify the tests pass.

### Task 2: Workbench UI Refactor

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`

- [ ] Replace the three-panel process console with left rail, timeline, composer, and inspector regions.
- [ ] Route composer submissions through existing `executePricingMeetingAgent` calls.
- [ ] Convert responses into timeline blocks using `workbench.ts`.
- [ ] Keep meeting context, targets, trace, artifacts, and raw JSON in the inspector.
- [ ] Preserve interview replies through active target or `@target` command.

### Task 3: Verification

**Files:**
- Verify: `frontend/src/workbench.test.ts`
- Verify: `frontend/src/api.test.ts`
- Verify: `frontend/src/App.tsx`

- [ ] Run `npm.cmd test`.
- [ ] Run `npm.cmd run build`.
- [ ] Review `git diff -- frontend/src/App.tsx frontend/src/styles.css frontend/src/workbench.ts frontend/src/workbench.test.ts`.

