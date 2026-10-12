import type { ExtraChatAttachment } from "@tokenring-ai/one-frontend/components/chat/ChatFooter.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import { webDesignRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { useSyncExternalStore } from "react";
import { designKey } from "./paths.ts";

/**
 * State the Web Design views share outside React. Each dock panel is its own
 * subtree, so the loaded design, its unsaved edits, the designs attached to
 * chat and the agent the navigator is attached to live here rather than in
 * component state. In memory only.
 */

type Store = [subscribe: (listener: () => void) => () => void, notify: () => void];

function makeStore(): Store {
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  return [subscribe, notify];
}

// ─── Loaded design documents ───────────────────────────────────────────────────

/** One design file as it exists on disk, shared by its editor and preview panels. */
export interface DesignDocument {
  flowName: string;
  name: string;
  /** Saved content; `utf8` documents hold text, `base64` ones the encoded bytes. */
  content: string;
  encoding: "utf8" | "base64";
  mimeType: string;
  updatedAt: string;
}

const documents = new Map<string, DesignDocument>();
const [subscribeDocuments, notifyDocuments] = makeStore();

export function getDesignDocument(key: string): DesignDocument | null {
  return documents.get(key) ?? null;
}

export function setDesignDocument(design: DesignDocument): void {
  documents.set(designKey(design.flowName, design.name), design);
  notifyDocuments();
}

export function useDesignDocument(key: string | null): DesignDocument | null {
  return useSyncExternalStore(
    subscribeDocuments,
    () => (key ? (documents.get(key) ?? null) : null),
    () => null,
  );
}

const inflight = new Map<string, Promise<DesignDocument | null>>();

/**
 * Loads one design, sharing a single request between the editor and preview
 * panels that open together. Resolves `null` when the file no longer exists.
 */
export async function loadDesign(flowName: string, name: string, options?: { force?: boolean }): Promise<DesignDocument | null> {
  const key = designKey(flowName, name);
  if (!options?.force) {
    const cached = documents.get(key);
    if (cached) return cached;
    const pending = inflight.get(key);
    if (pending) return pending;
  }
  const request = webDesignRPCClient
    .getDesign({ flowName, name })
    .then(({ design }) => {
      if (!design) return null;
      const loaded: DesignDocument = {
        flowName: design.flowName,
        name: design.name,
        content: design.content,
        encoding: design.encoding,
        mimeType: design.mimeType,
        updatedAt: design.updatedAt,
      };
      setDesignDocument(loaded);
      return loaded;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, request);
  return request;
}

export function forgetDesignDocument(key: string): void {
  if (!documents.delete(key)) return;
  notifyDocuments();
}

// ─── Unsaved editor drafts ─────────────────────────────────────────────────────

/** Edits not yet written to disk, keyed by `flow/name`, so closing a tab does not lose them. */
const drafts = new Map<string, string>();
const [subscribeDrafts, notifyDrafts] = makeStore();

export function getDesignDraft(key: string): string | null {
  return drafts.get(key) ?? null;
}

export function setDesignDraft(key: string, content: string | null): void {
  if (content === null) {
    if (!drafts.delete(key)) return;
  } else {
    if (drafts.get(key) === content) return;
    drafts.set(key, content);
  }
  notifyDrafts();
}

export function useDesignDraft(key: string | null): string | null {
  return useSyncExternalStore(
    subscribeDrafts,
    () => (key ? (drafts.get(key) ?? null) : null),
    () => null,
  );
}

// ─── Preview revisions ─────────────────────────────────────────────────────────

/**
 * Bumped whenever a design is written or reloaded so hosted previews (which read
 * the file over HTTP rather than mirroring the editor) reload.
 */
const previewRevisions = new Map<string, number>();
const [subscribeRevisions, notifyRevisions] = makeStore();

export function bumpPreviewRevision(key: string): void {
  previewRevisions.set(key, Date.now());
  notifyRevisions();
}

export function usePreviewRevision(key: string | null): number {
  return useSyncExternalStore(
    subscribeRevisions,
    () => (key ? (previewRevisions.get(key) ?? 0) : 0),
    () => 0,
  );
}

// ─── "Reveal in editor" requests from the preview ──────────────────────────────

interface RevealRequest {
  key: string;
  line: number;
  /** Distinguishes repeated requests for the same line. */
  nonce: number;
}

let revealRequest: RevealRequest | null = null;
const [subscribeReveals, notifyReveals] = makeStore();

/** Asks the editor panel for `key` to scroll to (and highlight) a source line. */
export function requestRevealLine(key: string, line: number): void {
  revealRequest = { key, line, nonce: Date.now() };
  notifyReveals();
}

export function useRevealRequest(key: string | null): RevealRequest | null {
  return useSyncExternalStore(
    subscribeReveals,
    () => (key && revealRequest?.key === key ? revealRequest : null),
    () => null,
  );
}

// ─── Designs attached to the agent chat ────────────────────────────────────────

let attachedDesigns: ExtraChatAttachment[] = [];
const [subscribeAttachments, notifyAttachments] = makeStore();

/** Maps a design MIME type onto a chat-attachable one (mirrors the agent attachment rules). */
function chatAttachmentMimeType(mimeType: string, isText: boolean): string | null {
  switch (mimeType) {
    case "image/png":
    case "image/jpeg":
    case "image/webp":
    case "text/plain":
    case "text/markdown":
    case "text/html":
    case "application/json":
      return mimeType;
    default:
      return isText ? "text/plain" : null;
  }
}

/** Adds (or refreshes) an explicit design attachment chip for the next chat message. */
export function attachDesign(
  design: { flowName: string; name: string; content: string; encoding: "utf8" | "base64"; mimeType: string },
  options?: { announce?: boolean },
): void {
  const id = designKey(design.flowName, design.name);
  const attachmentMime = chatAttachmentMimeType(design.mimeType, design.encoding === "utf8");
  if (!attachmentMime) {
    if (options?.announce) toastManager.error(`"${id}" cannot be attached (unsupported file type)`, { duration: 4000 });
    return;
  }
  attachedDesigns = [
    ...attachedDesigns.filter(extra => extra.id !== id),
    {
      id,
      label: id,
      attachment: {
        name: id,
        description: "Design file attached from the Web Design app.",
        encoding: design.encoding === "utf8" ? "text" : "base64",
        mimeType: attachmentMime as ExtraChatAttachment["attachment"]["mimeType"],
        body: design.content,
      },
    },
  ];
  notifyAttachments();
  if (options?.announce) toastManager.success(`Attached ${id} to agent chat`, { duration: 2000 });
}

/** Keeps an already-attached design's body in step with what was just saved. */
export function refreshAttachedDesign(design: { flowName: string; name: string; content: string; encoding: "utf8" | "base64"; mimeType: string }): void {
  if (!attachedDesigns.some(extra => extra.id === designKey(design.flowName, design.name))) return;
  attachDesign(design);
}

export function removeAttachedDesign(id: string): void {
  const next = attachedDesigns.filter(extra => extra.id !== id);
  if (next.length === attachedDesigns.length) return;
  attachedDesigns = next;
  notifyAttachments();
}

export function getAttachedDesigns(): readonly ExtraChatAttachment[] {
  return attachedDesigns;
}

export function useAttachedDesigns(): ExtraChatAttachment[] {
  return useSyncExternalStore(
    subscribeAttachments,
    () => attachedDesigns,
    () => attachedDesigns,
  );
}

// ─── The design agent the navigator is attached to ─────────────────────────────

export interface WebDesignAgentSession {
  agentId: string | null;
  /** Sends a `/design` (or `/design-visual`) prompt, creating an agent when none is attached. */
  start: (prompt: string) => Promise<boolean>;
  /** Sends a plain message to the attached agent, creating one when needed. */
  send: (message: string) => Promise<boolean>;
}

/**
 * Published by the flows navigator (the single owner of `useAppAgentSession`)
 * so the editor, preview and landing panels can drive the same agent without
 * owning a second, competing session.
 */
let session: WebDesignAgentSession | null = null;
const [subscribeSessions, notifySessions] = makeStore();

export function setWebDesignAgentSession(next: WebDesignAgentSession | null): void {
  session = next;
  notifySessions();
}

export function useWebDesignAgentSession(): WebDesignAgentSession | null {
  return useSyncExternalStore(
    subscribeSessions,
    () => session,
    () => null,
  );
}

/**
 * Drops everything held for the designs of a deleted flow: cached documents,
 * unsaved drafts and chat attachments (so a deleted design
 * cannot still be sent to the agent). Keys are `flow/name` and flow names
 * never contain "/", so the prefix matches exactly that flow.
 */
export function forgetFlow(flowName: string): void {
  const prefix = `${flowName}/`;
  const inFlow = (key: string) => key.startsWith(prefix);
  const dropKeys = (map: Map<string, unknown>): boolean => {
    let changed = false;
    for (const key of map.keys()) if (inFlow(key)) changed = map.delete(key) || changed;
    return changed;
  };
  dropKeys(inflight);
  if (dropKeys(documents)) notifyDocuments();
  if (dropKeys(drafts)) notifyDrafts();
  const keptAttachments = attachedDesigns.filter(extra => !inFlow(extra.id));
  if (keptAttachments.length !== attachedDesigns.length) {
    attachedDesigns = keptAttachments;
    notifyAttachments();
  }
}

/**
 * Carries a renamed design's unsaved draft to its new key and drops what was
 * cached under the old one (document, in-flight load, chat attachment). The
 * attachment is not re-added: its label would name a file that moved.
 */
export function renameDesignState(from: { flowName: string; name: string }, to: { flowName: string; name: string }): void {
  const oldKey = designKey(from.flowName, from.name);
  const newKey = designKey(to.flowName, to.name);
  if (oldKey === newKey) return;
  const draft = drafts.get(oldKey);
  if (draft !== undefined) {
    drafts.delete(oldKey);
    drafts.set(newKey, draft);
    notifyDrafts();
  }
  inflight.delete(oldKey);
  forgetDesignDocument(oldKey);
  removeAttachedDesign(oldKey);
}

/** Moves every draft of a renamed flow to the new flow name and drops the old flow's cached state. */
export function renameFlowState(flowName: string, newFlowName: string): void {
  if (flowName === newFlowName) return;
  const prefix = `${flowName}/`;
  const moved: [string, string][] = [];
  for (const [key, draft] of drafts) if (key.startsWith(prefix)) moved.push([key, draft]);
  forgetFlow(flowName);
  if (moved.length === 0) return;
  for (const [key, draft] of moved) drafts.set(`${newFlowName}/${key.slice(prefix.length)}`, draft);
  notifyDrafts();
}

/** Test helper: clears every piece of shared Web Design state. */
export function resetWebDesignStore(): void {
  documents.clear();
  inflight.clear();
  drafts.clear();
  previewRevisions.clear();
  revealRequest = null;
  attachedDesigns = [];
  session = null;
  notifyDocuments();
  notifyDrafts();
  notifyRevisions();
  notifyReveals();
  notifyAttachments();
  notifySessions();
}
