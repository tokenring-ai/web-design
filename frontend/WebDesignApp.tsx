import Editor from "@monaco-editor/react";
import AgentSessionBar from "@tokenring-ai/one-frontend/components/AgentSessionBar.tsx";
import AgentSessionList from "@tokenring-ai/one-frontend/components/AgentSessionList.tsx";
import ChatDock from "@tokenring-ai/one-frontend/components/chat/ChatDock.tsx";
import type { ExtraChatAttachment } from "@tokenring-ai/one-frontend/components/chat/ChatFooter.tsx";
import NavigationSidebarHeader from "@tokenring-ai/one-frontend/components/layout/NavigationSidebarHeader.tsx";
import WorkspaceShell from "@tokenring-ai/one-frontend/components/layout/WorkspaceShell.tsx";
import AppPageHeader from "@tokenring-ai/one-frontend/components/ui/AppPageHeader.tsx";
import ConfirmModal from "@tokenring-ai/one-frontend/components/ui/ConfirmModal.tsx";
import CreateItemModal from "@tokenring-ai/one-frontend/components/ui/CreateItemModal.tsx";
import EditorSaveBar from "@tokenring-ai/one-frontend/components/ui/EditorSaveBar.tsx";
import EmptyStateWithPrompt from "@tokenring-ai/one-frontend/components/ui/EmptyStateWithPrompt.tsx";
import ListItemWithActions from "@tokenring-ai/one-frontend/components/ui/ListItemWithActions.tsx";
import ResizableSplit from "@tokenring-ai/one-frontend/components/ui/ResizableSplit.tsx";
import SaveAsModal from "@tokenring-ai/one-frontend/components/ui/SaveAsModal.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import ViewModeToggle from "@tokenring-ai/one-frontend/components/ui/ViewModeToggle.tsx";
import { useAppAgentSession } from "@tokenring-ai/one-frontend/hooks/useAppAgentSession.tsx";
import { useAutoExpandTree } from "@tokenring-ai/one-frontend/hooks/useAutoExpandTree.ts";
import { useDebounce } from "@tokenring-ai/one-frontend/hooks/useDebounce.ts";
import { useEntityDelete } from "@tokenring-ai/one-frontend/hooks/useEntityDelete.ts";
import { useFileUpload } from "@tokenring-ai/one-frontend/hooks/useFileUpload.ts";
import { useKeyboardShortcuts } from "@tokenring-ai/one-frontend/hooks/useKeyboardShortcuts.ts";
import { useNavigationStatePayload } from "@tokenring-ai/one-frontend/hooks/useNavigationStatePayload.ts";
import { usePendingAction } from "@tokenring-ai/one-frontend/hooks/usePendingAction.tsx";
import { useRefSync } from "@tokenring-ai/one-frontend/hooks/useRefSync.ts";
import { useRemoteChangeDetection } from "@tokenring-ai/one-frontend/hooks/useRemoteChangeDetection.ts";
import { useTheme } from "@tokenring-ai/one-frontend/hooks/useTheme.ts";
import type { RunningAgent } from "@tokenring-ai/one-frontend/lib/agentSessions.ts";
import { runOrConfirm } from "@tokenring-ai/one-frontend/lib/uiPreferences.ts";
import { workspaceFileUrl } from "@tokenring-ai/one-frontend/lib/workspaceFileUrl.ts";
import { agentRPCClient, useDesigns, useFlows, useWebDesignConfiguration, webDesignRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Code2,
  Columns2,
  ExternalLink,
  Eye,
  FileCode2,
  FileUp,
  Frame,
  History,
  Loader2,
  Paperclip,
  PenLine,
  Play,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react";
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnnotationList, AnnotationPins } from "./components/AnnotationOverlay.tsx";
import DeviceToolbar, { effectivePreviewWidth, useDeviceSelection } from "./components/DeviceToolbar.tsx";
import HistoryPanel from "./components/HistoryPanel.tsx";
import { BRIDGE_ANNOTATE, BRIDGE_PICK, BRIDGE_RECTS, BRIDGE_TRACK, type BridgeRect, buildAnnotationBridgeScript } from "./lib/annotationBridge.ts";
import {
  appendAnnotationReply,
  type DesignAnnotation,
  deleteAnnotation as deleteAnnotationFromSource,
  type ElementTarget,
  elementTargetAfterAnnotation,
  injectScript,
  insertAnnotation,
  parseAnnotations,
  setAnnotationResolved,
} from "./lib/designAnnotations.ts";

const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Design</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: system-ui, -apple-system, sans-serif;
      background: #ffffff;
      color: #1a1a1a;
    }
    h1 { color: #7c3aed; margin-bottom: 8px; }
    p { color: #6b7280; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>Hello, Design!</h1>
  <p>Start editing the code on the left, or launch an agent below to build something amazing.</p>
</body>
</html>`;

const FLOW_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
// Design file names may be nested ("assets/logo.png"); each segment follows the classic rules.
const FILE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*(\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/;

const WEB_DESIGN_ROOT = "/web-design";
/**
 * Fallback working-directory-relative path for `/api/fs` preview URLs while the
 * configuration RPC loads. Matches the service default `webDesignDirectory`.
 */
const DEFAULT_WEB_DESIGN_SERVE_DIRECTORY = "web-design";
/** Fallback filesystem provider used in preview URLs while the configuration RPC loads. */
const DEFAULT_WEB_DESIGN_FS_PROVIDER = "posix";
const designPath = (flowName: string, designName: string) =>
  `${WEB_DESIGN_ROOT}/${encodeURIComponent(flowName)}/${designName.split("/").map(encodeURIComponent).join("/")}`;
const previewPath = (fsProvider: string, serveDirectory: string, flowName: string, fileName: string) =>
  workspaceFileUrl(fsProvider, `${serveDirectory.replace(/\/+$/, "")}/${flowName}/${fileName}`);
const previewFlowPath = (fsProvider: string, serveDirectory: string, flowName: string) =>
  workspaceFileUrl(fsProvider, `${serveDirectory.replace(/\/+$/, "")}/${flowName}/`);

function copyFileName(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex > 0 ? `${fileName.slice(0, extensionIndex)}-copy${fileName.slice(extensionIndex)}` : `${fileName}-copy.html`;
}

function editorLanguage(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "css") return "css";
  if (extension === "js" || extension === "mjs" || extension === "jsx") return "javascript";
  if (extension === "ts" || extension === "tsx") return "typescript";
  if (extension === "json" || extension === "map") return "json";
  if (extension === "svg" || extension === "xml") return "xml";
  if (extension === "md") return "markdown";
  if (extension === "yaml" || extension === "yml") return "yaml";
  return "html";
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type MonacoEditorInstance = Parameters<NonNullable<ComponentProps<typeof Editor>["onMount"]>>[0];
type MonacoNamespace = Parameters<NonNullable<ComponentProps<typeof Editor>["onMount"]>>[1];

interface FlowSummary {
  name: string;
  designCount: number;
  updatedAt: string;
}

interface SelectedDesign {
  flowName: string;
  name: string;
}

interface FileState {
  fileContent?: string;
}

type ViewMode = "split" | "code" | "preview";

type PendingAction = { type: "select"; flowName: string; name: string } | { type: "new"; presetFlowName: string };

// ─── FlowRow ───────────────────────────────────────────────────────────────────

function FlowRow({
  flow,
  expanded,
  onToggle,
  selected,
  isLoadingSelected,
  onSelectDesign,
  onNewDesign,
  onDesignsUploaded,
  onDeleteDesign,
  onDeleteFlow,
  onAttachDesign,
}: {
  flow: FlowSummary;
  expanded: boolean;
  onToggle: () => void;
  selected: SelectedDesign | null;
  isLoadingSelected: boolean;
  onSelectDesign: (flowName: string, name: string) => void;
  onNewDesign: (flowName: string) => void;
  onDesignsUploaded: (flowName: string, uploaded: number) => void;
  onDeleteDesign: (flowName: string, name: string) => void;
  onDeleteFlow: (flowName: string) => void;
  onAttachDesign: (flowName: string, name: string) => void;
}) {
  // Live stream while expanded so agent-created designs appear without a manual refresh
  const { data: designsData, isLoading: loadingDesigns, error: designsError } = useDesigns(expanded ? flow.name : null);
  const designs = designsData?.designs ?? null;

  const upload = useFileUpload({
    encoding: "base64",
    validateFileName: name => (FILE_NAME_PATTERN.test(name) ? true : `"${name}" has an unsupported file name`),
    uploadFile: async ({ filePath, content, encoding }) => {
      await webDesignRPCClient.createDesign({ flowName: flow.name, name: filePath, content, encoding });
    },
    onSkip: ({ fileName, reason, detail }) => {
      if (reason === "invalid-name" || reason === "size") {
        toastManager.error(detail ?? `"${fileName}" was skipped`, { duration: 5000 });
      }
    },
    onError: ({ error }) => {
      toastManager.error(formatError(error), { duration: 5000 });
    },
    onComplete: ({ uploaded }) => {
      if (uploaded > 0) onDesignsUploaded(flow.name, uploaded);
    },
  });

  useEffect(() => {
    if (designsError) toastManager.error(formatError(designsError), { duration: 4000 });
  }, [designsError]);

  return (
    <div className="border-b border-primary/50">
      <ListItemWithActions
        id={`flow:${flow.name}`}
        onPrimary={onToggle}
        className="gap-1.5 px-2 py-2 rounded-none"
        action={
          <>
            <input ref={upload.inputRef} type="file" multiple className="hidden" onChange={e => void upload.onChange(e)} />
            <button
              type="button"
              onClick={upload.trigger}
              disabled={upload.isUploading}
              title="Upload files to this flow"
              className="p-0.5 text-muted hover:text-primary rounded transition-opacity cursor-pointer disabled:opacity-50"
            >
              {upload.isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileUp className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={() => onNewDesign(flow.name)}
              title="New file in this flow"
              className="p-0.5 text-muted hover:text-primary rounded transition-opacity cursor-pointer"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteFlow(flow.name)}
              title="Delete flow"
              className="p-0.5 text-muted hover:text-red-500 rounded transition-opacity cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        }
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted" />}
          <Workflow className="w-3.5 h-3.5 shrink-0 opacity-70" />
          <span className="flex-1 min-w-0 truncate text-xs font-medium text-primary" title={flow.name}>
            {flow.name}
          </span>
          <span className="text-xs text-muted shrink-0">{flow.designCount}</span>
        </span>
      </ListItemWithActions>

      {expanded && (
        <div className="pl-5">
          {loadingDesigns && designs === null ? (
            <div className="px-2 py-2 text-xs text-muted flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading…
            </div>
          ) : designs && designs.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted">No files yet</p>
          ) : (
            designs?.map(design => {
              const isSelected = !!(selected && selected.flowName === flow.name && selected.name === design.name);
              return (
                <ListItemWithActions
                  key={design.name}
                  id={`design:${flow.name}/${design.name}`}
                  selected={isSelected}
                  onPrimary={() => onSelectDesign(flow.name, design.name)}
                  className={`gap-1.5 px-2 py-1.5 rounded-none ${isSelected ? "bg-accent-muted text-accent" : "text-primary"}`}
                  action={
                    <>
                      <button
                        type="button"
                        onClick={() => onAttachDesign(flow.name, design.name)}
                        title="Attach to agent chat"
                        className="p-0.5 text-muted hover:text-primary rounded transition-opacity cursor-pointer"
                      >
                        <Paperclip className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteDesign(flow.name, design.name)}
                        title="Delete file"
                        className="p-0.5 text-muted hover:text-red-500 rounded transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  }
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <FileCode2 className="w-3 h-3 shrink-0 opacity-70" />
                    <span className="flex-1 min-w-0 truncate text-xs font-mono" title={design.name}>
                      {design.name}
                    </span>
                    {isLoadingSelected && isSelected && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                  </span>
                </ListItemWithActions>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── FlowSidebar ───────────────────────────────────────────────────────────────

function FlowSidebar({
  flows,
  flowsLoading,
  expandedFlows,
  onToggleFlow,
  onExpandAllFlows,
  onCollapseAllFlows,
  selected,
  isLoadingSelected,
  onSelectDesign,
  onNewDesign,
  onDesignsUploaded,
  onDeleteDesign,
  onDeleteFlow,
  onAttachDesign,
  onNewFlow,
  agents,
  agentsLoading,
  selectedAgentId,
  onSelectAgent,
  onCreateAgent,
  onTerminateAgent,
}: {
  flows: FlowSummary[];
  flowsLoading: boolean;
  expandedFlows: Set<string>;
  onToggleFlow: (name: string) => void;
  onExpandAllFlows: () => void;
  onCollapseAllFlows: () => void;
  selected: SelectedDesign | null;
  isLoadingSelected: boolean;
  onSelectDesign: (flowName: string, name: string) => void;
  onNewDesign: (flowName: string) => void;
  onDesignsUploaded: (flowName: string, uploaded: number) => void;
  onDeleteDesign: (flowName: string, name: string) => void;
  onDeleteFlow: (flowName: string) => void;
  onAttachDesign: (flowName: string, name: string) => void;
  onNewFlow: () => void;
  agents: RunningAgent[];
  agentsLoading: boolean;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  onCreateAgent: () => void;
  onTerminateAgent: (agentId: string) => void;
}) {
  return (
    <div className="h-full flex flex-col border-r border-primary bg-secondary/40">
      <NavigationSidebarHeader title="Web Design" />

      <AgentSessionList
        agents={agents}
        selectedAgentId={selectedAgentId}
        isLoading={agentsLoading}
        storageKey="webdesign"
        label="Design agents"
        onSelect={onSelectAgent}
        onCreate={onCreateAgent}
        onTerminate={onTerminateAgent}
      />

      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-primary shrink-0">
        <span className="flex-1 min-w-0 text-xs font-bold text-muted uppercase tracking-widest px-1 truncate">Design Flows</span>
        <button
          type="button"
          onClick={onExpandAllFlows}
          title="Expand all flows"
          aria-label="Expand all flows"
          className="p-0.5 text-muted hover:text-primary rounded transition-colors cursor-pointer focus-ring"
        >
          <ChevronsUpDown className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onCollapseAllFlows}
          title="Collapse all flows"
          aria-label="Collapse all flows"
          className="p-0.5 text-muted hover:text-primary rounded transition-colors cursor-pointer focus-ring"
        >
          <ChevronsDownUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onNewFlow}
          title="New flow"
          aria-label="New flow"
          className="p-0.5 text-muted hover:text-primary rounded transition-colors cursor-pointer focus-ring"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {flows.length === 0 ? (
          flowsLoading ? (
            <div className="px-3 py-4 text-xs text-muted flex items-center justify-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading…
            </div>
          ) : (
            <p className="text-xs text-muted px-3 py-4 text-center">No flows yet</p>
          )
        ) : (
          flows.map(flow => (
            <FlowRow
              key={flow.name}
              flow={flow}
              expanded={expandedFlows.has(flow.name)}
              onToggle={() => onToggleFlow(flow.name)}
              selected={selected}
              isLoadingSelected={isLoadingSelected}
              onSelectDesign={onSelectDesign}
              onNewDesign={onNewDesign}
              onDesignsUploaded={onDesignsUploaded}
              onDeleteDesign={onDeleteDesign}
              onDeleteFlow={onDeleteFlow}
              onAttachDesign={onAttachDesign}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Root component ────────────────────────────────────────────────────────────

export default function WebDesignApp() {
  return <WebDesignWorkspace />;
}

// ─── Workspace ─────────────────────────────────────────────────────────────────

function WebDesignWorkspace() {
  const navigate = useNavigate();
  const { flowName: routeFlowName, designName: routeDesignName } = useParams<{ flowName?: string; designName?: string }>();
  const [theme] = useTheme();
  const { data: flowsData, mutate: refreshFlows, isLoading: flowsLoading, error: flowsError } = useFlows();
  const flows = flowsData?.flows ?? [];
  const configuration = useWebDesignConfiguration();
  const allowedAgentTypes = configuration.data?.agentTypes ?? ["web-design"];
  const serveDirectory = configuration.data?.serveDirectory ?? DEFAULT_WEB_DESIGN_SERVE_DIRECTORY;
  const fsProvider = configuration.data?.fsProvider ?? DEFAULT_WEB_DESIGN_FS_PROVIDER;

  const [htmlContent, setHtmlContent] = useState(DEFAULT_HTML);
  const [previewSource, setPreviewSource] = useState(DEFAULT_HTML);
  const [fileEncoding, setFileEncoding] = useState<"utf8" | "base64">("utf8");
  const [fileMimeType, setFileMimeType] = useState("text/html");
  const [previewRevision, setPreviewRevision] = useState(0);
  const [autoPreview, setAutoPreview] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("split");

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 767px)");
    const avoidMobileSplit = () => {
      if (query.matches) setViewMode(current => (current === "split" ? "code" : current));
    };
    avoidMobileSplit();
    query.addEventListener("change", avoidMobileSplit);
    return () => query.removeEventListener("change", avoidMobileSplit);
  }, []);

  // The open design lives in the URL: /web-design/:flowName/:designName
  const selected: SelectedDesign | null = useMemo(
    () => (routeFlowName && routeDesignName ? { flowName: routeFlowName, name: routeDesignName } : null),
    [routeFlowName, routeDesignName],
  );
  const { data: selectedFlowFilesData } = useDesigns(selected?.flowName ?? null);
  const selectedFlowRevision = selectedFlowFilesData?.designs.map(file => `${file.name}:${file.updatedAt}`).join("|") ?? "";
  const selectedKey = selected ? `${selected.flowName}/${selected.name}` : null;
  // Key of the design whose content is currently in the editor, so we don't show a stale document while loading
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  // An unsaved document handed in from elsewhere (e.g. opening a file from the filesystem app)
  const [isDraft, setIsDraft] = useState(false);
  const [savedContent, setSavedContent] = useState(DEFAULT_HTML);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingDesign, setIsLoadingDesign] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveModal, setSaveModal] = useState<{ mode: "create" | "saveAs"; presetFlowName: string } | null>(null);
  const [newFlowModalOpen, setNewFlowModalOpen] = useState(false);
  const [deleteDesignTarget, setDeleteDesignTarget] = useState<SelectedDesign | null>(null);
  const [deleteFlowTarget, setDeleteFlowTarget] = useState<string | null>(null);
  // Designs the user explicitly attached to the next agent chat message
  const [attachedDesigns, setAttachedDesigns] = useState<ExtraChatAttachment[]>([]);
  // Version history panel visibility; lastSavedAt re-runs the history query after saves
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(0);

  const {
    agentId,
    agent,
    agents,
    isLoading: agentsLoading,
    isCreating: isCreatingAgent,
    selectAgent,
    createAgent,
    terminateAgent,
    TerminateDialog,
  } = useAppAgentSession({ appName: "Web Design app", storageKey: "webdesign", agentTypes: allowedAgentTypes });

  // Auto-expand flows that gain designs while a design agent runs so mockups stream in live
  const {
    expandedKeys: expandedFlows,
    toggle: handleToggleFlow,
    expand: expandFlow,
    collapse: collapseFlow,
  } = useAutoExpandTree({
    items: flows,
    getKey: (f: FlowSummary) => f.name,
    getCount: (f: FlowSummary) => f.designCount,
    agentId,
  });

  const handleExpandAllFlows = useCallback(() => {
    for (const flow of flows) expandFlow(flow.name);
  }, [flows, expandFlow]);

  const handleCollapseAllFlows = useCallback(() => {
    for (const flow of flows) collapseFlow(flow.name);
  }, [flows, collapseFlow]);

  const handleStartDesign = useCallback(
    async (prompt: string): Promise<boolean> => {
      // Reuse the attached agent so a second prompt continues the same conversation.
      const id = agentId ?? (await createAgent());
      if (!id) return false;
      // Route to the visual command when the session runs the screenshot-verifying agent type.
      const command = agent?.agentType === "web-design-visual" ? "design-visual" : "design";
      try {
        await agentRPCClient.sendInput({
          agentId: id,
          input: {
            from: "Web Design app",
            message: `/${command} ${prompt}`,
          },
        });
        return true;
      } catch (error) {
        toastManager.error(formatError(error), { duration: 5000 });
        return false;
      }
    },
    [agentId, agent, createAgent],
  );

  // Ready == the editor holds the document the URL points at (or an unsaved draft)
  const isDocumentReady = selectedKey !== null ? loadedKey === selectedKey : isDraft;
  const isDirty = isDocumentReady && htmlContent !== savedContent;
  const { pendingAction, queueAction, PendingDialog } = usePendingAction<PendingAction>({ isDirty });
  const isDirtyRef = useRefSync(isDirty);
  const selectedRef = useRefSync(selected);
  // Latest poll snapshot so onRemoteChange can apply without a second RPC
  const lastPollDesignRef = useRef<{
    content: string;
    updatedAt: string;
    encoding: "utf8" | "base64";
    mimeType: string;
    flowName: string;
    name: string;
  } | null>(null);
  const markLoadedRef = useRef<(updatedAt: string | null) => void>(() => {});

  // Debounced auto-preview: use a ref so disabling mid-debounce is honored without
  // re-applying a stale debounced value when auto-preview is turned back on
  // (re-enable path sets preview from the latest htmlContent in the checkbox handler).
  const debouncedHtmlContent = useDebounce(htmlContent, 400);
  const autoPreviewRef = useRefSync(autoPreview);
  useEffect(() => {
    if (autoPreviewRef.current) {
      setPreviewSource(debouncedHtmlContent);
    }
  }, [debouncedHtmlContent]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    setHtmlContent(value ?? "");
  }, []);

  // ── Annotation support ────────────────────────────────────────────────────────
  const [annotationRects, setAnnotationRects] = useState<Record<string, BridgeRect>>({});
  const monacoEditorRef = useRef<{ editor: MonacoEditorInstance; monaco: MonacoNamespace } | null>(null);

  /** Applies an annotation-driven source edit (insert/reply/resolve/delete). */
  const applyAnnotationSourceEdit = useCallback(
    (nextHtml: string) => {
      setHtmlContent(nextHtml);
      // Annotation edits always refresh the preview immediately, even with auto-preview off.
      if (!autoPreviewRef.current) setPreviewSource(nextHtml);
    },
    [autoPreviewRef],
  );

  /** Scrolls the editor to the annotation comment and highlights it. */
  const handleRevealAnnotation = useCallback((annotation: DesignAnnotation) => {
    const context = monacoEditorRef.current;
    if (!context) return;
    const { editor, monaco } = context;
    editor.revealLineInCenter(annotation.line);
    editor.setPosition({ lineNumber: annotation.line, column: 1 });
    editor.deltaDecorations(
      [],
      [
        {
          range: new monaco.Range(annotation.line, 1, annotation.line, 1),
          options: { isWholeLine: true, className: "webdesign-annotation-highlight", zIndex: 10 },
        },
      ],
    );
    editor.focus();
  }, []);

  /** Sends one annotation as feedback to the current design agent session. */
  const handleSendAnnotationToAgent = useCallback(
    async (annotation: DesignAnnotation) => {
      if (!selected) return;
      const id = agentId ?? (await createAgent());
      if (!id) return;
      try {
        await agentRPCClient.sendInput({
          agentId: id,
          input: {
            from: "Web Design app",
            message: `Design annotation on "${selected.flowName}/${selected.name}" (line ${annotation.line}): "${annotation.text}" — please apply this feedback to the design and save it.`,
          },
        });
        toastManager.success("Annotation sent to the agent", { duration: 2500 });
      } catch (error) {
        toastManager.error(formatError(error), { duration: 5000 });
      }
    },
    [agentId, createAgent, selected],
  );

  const handleEditorReady = useCallback((editor: MonacoEditorInstance, monaco: MonacoNamespace) => {
    monacoEditorRef.current = { editor, monaco };
  }, []);

  /** Close whatever is open and fall back to the empty state. */
  const closeDocument = useCallback(() => {
    setHtmlContent(DEFAULT_HTML);
    setPreviewSource(DEFAULT_HTML);
    setSavedContent(DEFAULT_HTML);
    setFileEncoding("utf8");
    setFileMimeType("text/html");
    setLoadedKey(null);
    setIsDraft(false);
    setLoadError(null);
    setIsLoadingDesign(false);
    void navigate(WEB_DESIGN_ROOT);
  }, [navigate]);

  /** Apply HTML handed in from Files (or another app) as an unsaved draft. */
  const applyImportedContent = useCallback((content: string) => {
    setHtmlContent(content);
    setPreviewSource(content);
    setSavedContent(content);
    setFileEncoding("utf8");
    setFileMimeType("text/html");
    setLoadedKey(null);
    setIsDraft(true);
    setLoadError(null);
    setIsLoadingDesign(false);
  }, []);

  // Load HTML from FilesApp navigation state whenever a new file payload arrives
  useNavigationStatePayload<FileState>({
    onPayload: state => {
      if (state.fileContent === undefined) return;
      applyImportedContent(state.fileContent);
    },
    // One-shot payload: land on root as a draft and clear state so later navigations don't re-import
    clearAfterConsume: true,
    navigate,
    clearNavigateTo: WEB_DESIGN_ROOT,
  });

  /** New designs always live inside a flow, so ask where to put it before opening the editor. */
  const openCreateModal = useCallback(
    (presetFlowName = "") => {
      closeDocument();
      setSaveModal({ mode: "create", presetFlowName });
    },
    [closeDocument],
  );

  const handleNew = useCallback(
    (presetFlowName = "") => {
      if (queueAction({ type: "new", presetFlowName })) return;
      openCreateModal(presetFlowName);
    },
    [queueAction, openCreateModal],
  );

  // Selecting a design just changes the URL; the effect below loads whatever the URL points at.
  const handleSelectDesign = useCallback(
    (flowName: string, name: string) => {
      const nextKey = `${flowName}/${name}`;
      if (selectedKey !== nextKey && queueAction({ type: "select", flowName, name })) return;
      void navigate(designPath(flowName, name));
    },
    [queueAction, selectedKey, navigate],
  );

  const runPendingAction = useCallback(
    (action: PendingAction) => {
      if (action.type === "select") {
        void navigate(designPath(action.flowName, action.name));
        return;
      }
      openCreateModal(action.presetFlowName);
    },
    [navigate, openCreateModal],
  );

  /** Maps a design MIME type onto a chat-attachable one (mirrors the agent attachment rules). */
  const chatAttachmentMimeType = (mimeType: string, isText: boolean): string | null => {
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
  };

  /** Adds (or refreshes) an explicit design attachment chip for the next chat message. */
  const updateAttachedDesign = useCallback(
    (flowName: string, name: string, content: string, encoding: "utf8" | "base64", mimeType: string, announce: boolean) => {
      const attachmentMime = chatAttachmentMimeType(mimeType, encoding === "utf8");
      const id = `${flowName}/${name}`;
      if (!attachmentMime) {
        if (announce) toastManager.error(`"${id}" cannot be attached (unsupported file type)`, { duration: 4000 });
        return;
      }
      setAttachedDesigns(previous => [
        ...previous.filter(extra => extra.id !== id),
        {
          id,
          label: id,
          attachment: {
            name: id,
            description: "Design file attached from the Web Design app.",
            encoding: encoding === "utf8" ? "text" : "base64",
            mimeType: attachmentMime as ExtraChatAttachment["attachment"]["mimeType"],
            body: content,
          },
        },
      ]);
      if (announce) toastManager.success(`Attached ${id} to agent chat`, { duration: 2000 });
    },
    [],
  );

  /** Attach the design currently open in the editor, snapshotting its live content. */
  const handleAttachCurrentDesign = useCallback(() => {
    if (!selected || !isDocumentReady) return;
    updateAttachedDesign(selected.flowName, selected.name, htmlContent, fileEncoding, fileMimeType, true);
  }, [selected, isDocumentReady, htmlContent, fileEncoding, fileMimeType, updateAttachedDesign]);

  /** Attach any design from any flow by name (fetches saved content from disk). */
  const handleAttachDesign = useCallback(
    (flowName: string, name: string) => {
      void webDesignRPCClient
        .getDesign({ flowName, name })
        .then(({ design }) => {
          if (!design) {
            toastManager.error(`File "${name}" not found in flow "${flowName}"`, { duration: 4000 });
            return;
          }
          updateAttachedDesign(design.flowName, design.name, design.content, design.encoding, design.mimeType, true);
        })
        .catch((e: unknown) => toastManager.error(formatError(e), { duration: 4000 }));
    },
    [updateAttachedDesign],
  );

  const handleRemoveAttachedDesign = useCallback((id: string) => {
    setAttachedDesigns(previous => previous.filter(extra => extra.id !== id));
  }, []);

  useEffect(() => {
    if (!routeFlowName || !routeDesignName) return;
    const key = `${routeFlowName}/${routeDesignName}`;
    if (key === loadedKey) return;

    let cancelled = false;
    setIsLoadingDesign(true);
    setLoadError(null);
    webDesignRPCClient
      .getDesign({ flowName: routeFlowName, name: routeDesignName })
      .then(({ design }) => {
        if (cancelled) return;
        if (!design) {
          const message = `File "${routeDesignName}" not found in flow "${routeFlowName}"`;
          toastManager.error(message, { duration: 4000 });
          setLoadError(message);
          return;
        }
        setHtmlContent(design.content);
        setPreviewSource(design.content);
        setSavedContent(design.content);
        setFileEncoding(design.encoding);
        setFileMimeType(design.mimeType);
        setLoadedKey(`${design.flowName}/${design.name}`);
        setPreviewRevision(Date.now());
        setIsDraft(false);
        markLoadedRef.current(design.updatedAt);
        if (design.name !== routeDesignName) {
          void navigate(designPath(design.flowName, design.name), { replace: true });
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        toastManager.error(formatError(e), { duration: 4000 });
        setLoadError(formatError(e));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDesign(false);
      });
    return () => {
      cancelled = true;
    };
  }, [routeFlowName, routeDesignName, loadedKey, navigate]);

  // Reveal the design that the URL points at
  useEffect(() => {
    if (!routeFlowName) return;
    expandFlow(routeFlowName);
  }, [routeFlowName, expandFlow]);

  useEffect(() => {
    if (flowsError) toastManager.error(formatError(flowsError), { duration: 4000 });
  }, [flowsError]);

  const handleSave = useCallback(async () => {
    if (!isDocumentReady) return;
    if (!selected) {
      setSaveModal({ mode: "create", presetFlowName: "" });
      return;
    }
    setIsSaving(true);
    try {
      const { design } = await webDesignRPCClient.updateDesign({
        flowName: selected.flowName,
        name: selected.name,
        content: htmlContent,
        encoding: fileEncoding,
      });
      setSavedContent(design.content);
      setPreviewRevision(Date.now());
      markLoadedRef.current(design.updatedAt);
      // Keep an attached chip for this design in sync with the saved content
      updateAttachedDesign(selected.flowName, selected.name, design.content, design.encoding, design.mimeType, false);
      setLastSavedAt(Date.now());
      void refreshFlows();
      toastManager.success("Saved", { duration: 2000 });
    } catch (e: unknown) {
      toastManager.error(formatError(e), { duration: 4000 });
    } finally {
      setIsSaving(false);
    }
  }, [isDocumentReady, selected, htmlContent, fileEncoding, refreshFlows, updateAttachedDesign]);

  const handleSaveModalSubmit = useCallback(
    async (flowName: string, designName: string) => {
      try {
        const { design } = await webDesignRPCClient.createDesign({ flowName, name: designName, content: htmlContent });
        // Content is already in the editor, so mark it loaded before navigating to avoid a redundant fetch
        setSavedContent(design.content);
        setHtmlContent(design.content);
        setPreviewSource(design.content);
        setFileEncoding(design.encoding);
        setFileMimeType(design.mimeType);
        setPreviewRevision(Date.now());
        setLoadedKey(`${design.flowName}/${design.name}`);
        setIsDraft(false);
        markLoadedRef.current(design.updatedAt);
        setSaveModal(null);
        expandFlow(flowName);
        void navigate(designPath(design.flowName, design.name));
        void refreshFlows();
        toastManager.success("Saved", { duration: 2000 });
      } catch (e: unknown) {
        toastManager.error(formatError(e), { duration: 4000 });
      }
    },
    [htmlContent, navigate, refreshFlows, expandFlow],
  );

  const handleNewDesignInFlow = useCallback(
    (flowName: string) => {
      handleNew(flowName);
    },
    [handleNew],
  );

  const handleDesignsUploaded = useCallback(
    (flowName: string, uploaded: number) => {
      expandFlow(flowName);
      void refreshFlows();
      toastManager.success(`Uploaded ${uploaded} file${uploaded === 1 ? "" : "s"}`, { duration: 2500 });
    },
    [refreshFlows, expandFlow],
  );

  const designDelete = useEntityDelete({
    currentRouteId: selectedKey,
    navigateToOverview: closeDocument,
    refreshList: () => void refreshFlows(),
    successMessage: () => "Deleted",
    successDuration: 2000,
    errorDuration: 4000,
  });

  const flowDelete = useEntityDelete({
    currentRouteId: selected?.flowName ?? null,
    navigateToOverview: closeDocument,
    refreshList: () => void refreshFlows(),
    clearLocalState: collapseFlow,
    successMessage: () => "Flow deleted",
    successDuration: 2000,
    errorDuration: 4000,
  });

  const handleDeleteDesign = useCallback(
    async (flowName: string, name: string) => {
      setDeleteDesignTarget(null);
      const id = `${flowName}/${name}`;
      await designDelete.deleteEntity(id, name, async () => {
        const { success } = await webDesignRPCClient.deleteDesign({ flowName, name });
        if (!success) throw new Error(`File "${name}" could not be deleted from flow "${flowName}"`);
      });
    },
    [designDelete],
  );

  const handleCreateFlow = useCallback(
    async (name: string) => {
      try {
        await webDesignRPCClient.createFlow({ name });
        setNewFlowModalOpen(false);
        expandFlow(name);
        void refreshFlows();
        toastManager.success("Flow created", { duration: 2000 });
      } catch (e: unknown) {
        toastManager.error(formatError(e), { duration: 4000 });
      }
    },
    [refreshFlows, expandFlow],
  );

  const handleDeleteFlow = useCallback(
    async (flowName: string) => {
      setDeleteFlowTarget(null);
      await flowDelete.deleteEntity(flowName, flowName, async () => {
        const { success } = await webDesignRPCClient.deleteFlow({ name: flowName });
        if (!success) throw new Error(`Flow "${flowName}" could not be deleted`);
      });
    },
    [flowDelete],
  );

  // Ctrl/Cmd+S shortcut
  useKeyboardShortcuts([{ key: "s", handler: () => void handleSave() }]);

  // When an agent (or another client) updates the open design on disk, pull it in
  // if the user has no local unsaved edits so the preview stays current.
  const { markLoaded } = useRemoteChangeDetection({
    documentKey: isDraft ? null : selectedKey,
    isDocumentReady: isDocumentReady && !isDraft,
    isDirty,
    strategy: {
      type: "polling",
      poll: async () => {
        const sel = selectedRef.current;
        if (!sel) return null;
        const { design } = await webDesignRPCClient.getDesign({
          flowName: sel.flowName,
          name: sel.name,
        });
        if (!design) return null;
        lastPollDesignRef.current = {
          content: design.content,
          updatedAt: design.updatedAt,
          encoding: design.encoding,
          mimeType: design.mimeType,
          flowName: design.flowName,
          name: design.name,
        };
        return { content: design.content, updatedAt: design.updatedAt };
      },
      intervalMs: 3000,
    },
    onRemoteChange: () => {
      const design = lastPollDesignRef.current;
      if (!design) return;
      // Race with typing mid-flight
      if (isDirtyRef.current) return;
      setHtmlContent(design.content);
      setPreviewSource(design.content);
      setSavedContent(design.content);
      setFileEncoding(design.encoding);
      setFileMimeType(design.mimeType);
      setPreviewRevision(Date.now());
      markLoadedRef.current(design.updatedAt);
    },
  });
  markLoadedRef.current = markLoaded;

  const runPreview = useCallback(() => setPreviewSource(htmlContent), [htmlContent]);

  const isTextFile = fileEncoding === "utf8";
  const isHtmlFile = isTextFile && fileMimeType === "text/html";
  const hostedPreviewUrl = selected
    ? `${previewPath(fsProvider, serveDirectory, selected.flowName, selected.name)}?v=${encodeURIComponent(`${previewRevision}:${selectedFlowRevision}`)}`
    : null;
  // Design HTML renders exactly as authored; isolation comes from the sandboxed
  // iframe (opaque origin), not from rewriting the content. A <base> tag keeps
  // sibling links (styles.css, other pages) resolving against the hosted flow.
  const previewHtml = useMemo(() => {
    if (!selected) return previewSource;
    const baseTag = `<base href="${previewFlowPath(fsProvider, serveDirectory, selected.flowName)}">`;
    return /<head(\s[^>]*)?>/i.test(previewSource) ? previewSource.replace(/<head(\s[^>]*)?>/i, match => `${match}${baseTag}`) : `${baseTag}${previewSource}`;
  }, [previewSource, selected, fsProvider, serveDirectory]);
  // Binary assets preview from the hosted URL; text/HTML always mirrors the editor content.
  const useHostedPreview = !!hostedPreviewUrl && !isTextFile;

  const subtitle = selected ? `${selected.flowName} / ${selected.name}` : isDraft ? "Untitled" : "No design open";

  // Annotations parse straight out of the editor source; bridge targets resolve to the anchored elements.
  const annotations = useMemo(() => (isHtmlFile ? parseAnnotations(htmlContent) : []), [isHtmlFile, htmlContent]);
  const annotationTargets = useMemo(
    () =>
      annotations
        .map(annotation => ({ id: annotation.id, target: elementTargetAfterAnnotation(htmlContent, annotation) }))
        .filter((entry): entry is { id: string; target: ElementTarget } => entry.target !== null),
    [annotations, htmlContent],
  );

  /** Preview-bridge reported element positions for annotation pins. */
  const handleAnnotationRects = useCallback((rects: Record<string, BridgeRect>) => {
    setAnnotationRects(rects);
  }, []);

  /** Inserts an annotation comment into the source before the picked element. */
  const handleInsertAnnotation = useCallback(
    (target: ElementTarget, text: string): boolean => {
      const id = `ann-${Date.now().toString(36)}`;
      const result = insertAnnotation(htmlContent, target, id, text);
      if (!result) {
        toastManager.error("Could not locate that element in the source", { duration: 4000 });
        return false;
      }
      applyAnnotationSourceEdit(result.html);
      return true;
    },
    [htmlContent, applyAnnotationSourceEdit],
  );

  const handleAnnotationReply = useCallback(
    (annotationId: string, reply: string) => {
      applyAnnotationSourceEdit(appendAnnotationReply(htmlContent, annotationId, reply));
    },
    [htmlContent, applyAnnotationSourceEdit],
  );

  const handleAnnotationResolve = useCallback(
    (annotationId: string, resolved: boolean) => {
      applyAnnotationSourceEdit(setAnnotationResolved(htmlContent, annotationId, resolved));
    },
    [htmlContent, applyAnnotationSourceEdit],
  );

  const handleAnnotationDelete = useCallback(
    (annotationId: string) => {
      applyAnnotationSourceEdit(deleteAnnotationFromSource(htmlContent, annotationId));
      setAnnotationRects(previous => {
        const next = { ...previous };
        delete next[annotationId];
        return next;
      });
    },
    [htmlContent, applyAnnotationSourceEdit],
  );

  /** Restores a snapshot as unsaved edits on the currently open design. */
  const handleRestoreVersion = useCallback(
    (content: string) => {
      if (!selected) return;
      setHtmlContent(content);
      setPreviewSource(content);
      setPreviewRevision(Date.now());
      setLoadedKey(`${selected.flowName}/${selected.name}`);
      setIsDraft(false);
      setLoadError(null);
    },
    [selected],
  );

  const mainPane = isDocumentReady ? (
    <div className="h-full relative">
      <EditorPreviewPane
        fileName={selected?.name ?? "index.html"}
        htmlContent={htmlContent}
        hostedPreviewUrl={hostedPreviewUrl}
        previewHtml={previewHtml}
        previewRevision={previewRevision}
        useHostedPreview={useHostedPreview}
        isTextFile={isTextFile}
        isHtmlFile={isHtmlFile}
        mimeType={fileMimeType}
        theme={theme}
        viewMode={viewMode}
        annotations={annotations}
        annotationTargets={annotationTargets}
        annotationRects={annotationRects}
        onAnnotationRects={handleAnnotationRects}
        onInsertAnnotation={handleInsertAnnotation}
        onAnnotationReply={handleAnnotationReply}
        onAnnotationResolve={handleAnnotationResolve}
        onAnnotationDelete={handleAnnotationDelete}
        onRevealAnnotation={handleRevealAnnotation}
        onSendAnnotationToAgent={handleSendAnnotationToAgent}
        onEditorReady={handleEditorReady}
        onChange={handleEditorChange}
      />
      {historyOpen && selected && (
        <HistoryPanel
          flowName={selected.flowName}
          designName={selected.name}
          currentContent={htmlContent}
          language={editorLanguage(selected.name)}
          theme={theme}
          lastSavedAt={lastSavedAt}
          onRestore={handleRestoreVersion}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  ) : selected && loadError ? (
    <div className="h-full flex flex-col items-center justify-center gap-3 p-6 bg-primary text-center">
      <p className="text-xs text-red-500 max-w-md">{loadError}</p>
      <button
        type="button"
        onClick={closeDocument}
        className="px-3 py-1.5 border border-primary text-muted hover:text-primary hover:bg-hover text-xs font-medium rounded-lg transition-colors focus-ring cursor-pointer"
      >
        Back to designs
      </button>
    </div>
  ) : selected || isLoadingDesign ? (
    <div className="h-full flex items-center justify-center gap-2 bg-primary text-xs text-muted">
      <Loader2 className="w-4 h-4 animate-spin" />
      Loading {selected ? `${selected.flowName} / ${selected.name}` : "…"}…
    </div>
  ) : flowsLoading && flows.length === 0 ? (
    <div className="h-full flex items-center justify-center gap-2 bg-primary text-xs text-muted">
      <Loader2 className="w-4 h-4 animate-spin" />
      Loading flows…
    </div>
  ) : (
    <EmptyStateWithPrompt
      icon={Frame}
      iconGradient="from-purple-500 to-violet-600"
      title="Design with agents"
      descriptionWithContent={
        <>
          Open a mockup from the <span className="font-medium text-secondary">Flows</span> panel, edit HTML live, or describe screens below and a design agent
          will write mockups into flows for you.
        </>
      }
      descriptionEmpty={
        <>
          Describe the product area and screens you need. A design agent will create a flow and save self-contained HTML mockups you can preview and refine
          here.
        </>
      }
      hasContent={flows.length > 0}
      agentRunningMessage="A design agent is running in the chat panel below. Designs it writes appear in the Flows sidebar — select one to open the editor and live preview."
      hasAgent={!!agentId}
      promptLabel="Design prompt"
      promptPlaceholder="e.g. Onboarding for a notes app: welcome, sign-up, empty state, first note"
      submitLabel="Start design"
      submitAriaLabel="Start design agent"
      buttonVariant="violet"
      onSubmit={handleStartDesign}
      secondaryActions={
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setNewFlowModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-primary text-muted hover:text-primary hover:bg-hover text-xs font-medium rounded-lg transition-colors focus-ring cursor-pointer"
          >
            <Workflow className="w-3.5 h-3.5" />
            New Flow
          </button>
          <button
            type="button"
            onClick={() => handleNew()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-muted hover:bg-accent-muted-hover text-accent text-xs font-medium rounded-lg transition-colors focus-ring cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Design
          </button>
        </div>
      }
    />
  );

  return (
    <div className="w-full h-full flex flex-col bg-primary overflow-hidden">
      {saveModal && (
        <SaveAsModal
          title={saveModal.mode === "create" ? "Save File" : "Save As"}
          containerField={{
            label: "Flow",
            placeholder: "onboarding",
            initialValue: saveModal.presetFlowName || selected?.flowName || "",
            pattern: FLOW_NAME_PATTERN,
            validationError: "Use letters, numbers, hyphens, and underscores only, starting with a letter or number.",
            options: flows.map(flow => ({ value: flow.name })),
          }}
          itemField={{
            label: "File name",
            placeholder: "index.html",
            initialValue: saveModal.mode === "saveAs" && selected ? copyFileName(selected.name) : "index.html",
            pattern: FILE_NAME_PATTERN,
            validationError: "Use letters, numbers, dots, hyphens, and underscores only; subfolders are allowed (assets/logo.png).",
            options: [],
            autoFocus: true,
            selectOnFocus: true,
          }}
          onSave={handleSaveModalSubmit}
          onClose={() => setSaveModal(null)}
        />
      )}
      {newFlowModalOpen && (
        <CreateItemModal
          title="New Flow"
          placeholder="onboarding"
          pattern={FLOW_NAME_PATTERN}
          validationError="Use letters, numbers, hyphens, and underscores only, starting with a letter or number."
          onCreate={handleCreateFlow}
          onClose={() => setNewFlowModalOpen(false)}
        />
      )}
      {deleteDesignTarget && (
        <ConfirmModal
          title="Delete file?"
          message={`This will permanently delete "${deleteDesignTarget.name}" from flow "${deleteDesignTarget.flowName}".`}
          onConfirm={() => handleDeleteDesign(deleteDesignTarget.flowName, deleteDesignTarget.name)}
          onClose={() => setDeleteDesignTarget(null)}
        />
      )}
      {deleteFlowTarget && (
        <ConfirmModal
          title="Delete flow?"
          message={`This will permanently delete the flow "${deleteFlowTarget}" and all of its files.`}
          onConfirm={() => handleDeleteFlow(deleteFlowTarget)}
          onClose={() => setDeleteFlowTarget(null)}
        />
      )}
      {pendingAction && (
        <PendingDialog
          title="Discard unsaved changes?"
          message="You have unsaved edits. Leave this design and lose those changes?"
          confirmLabel="Discard"
          onConfirm={runPendingAction}
        />
      )}
      <TerminateDialog />

      <AppPageHeader title="Web Design" subtitle={subtitle} icon={<Frame className="w-4 h-4" />} iconGradient="from-purple-500 to-violet-600" size="compact">
        {isDocumentReady && (
          <>
            <ViewModeToggle
              aria-label="Code and preview view"
              value={viewMode}
              onChange={setViewMode}
              options={[
                {
                  value: "split",
                  label: "Split",
                  title: "Show code and preview",
                  icon: Columns2,
                  hiddenClassname: "hidden md:flex",
                },
                { value: "code", label: "Code", title: "Show code only", icon: Code2 },
                { value: "preview", label: "Preview", title: "Show preview only", icon: Eye },
              ]}
            />

            {isTextFile && (
              <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={autoPreview}
                  onChange={e => {
                    const enabled = e.target.checked;
                    setAutoPreview(enabled);
                    // Catch up the preview when re-enabling after manual edits
                    if (enabled) setPreviewSource(htmlContent);
                  }}
                  className="w-3.5 h-3.5 accent-control cursor-pointer"
                />
                <span className="text-xs text-muted select-none">Auto-preview</span>
              </label>
            )}

            {/* Manual run button (shown when auto-preview is off) */}
            {isTextFile && !autoPreview && (
              <button
                type="button"
                onClick={runPreview}
                title="Run preview"
                className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-500 dark:text-emerald-400 text-xs font-medium rounded-lg transition-colors cursor-pointer focus-ring shrink-0"
              >
                <Play className="w-3 h-3" />
                Run
              </button>
            )}

            {/* Save controls — drafts can be saved even if content is unchanged */}
            <EditorSaveBar
              isDirty={isDirty}
              isSaving={isSaving}
              hasItem={!!selected}
              onSave={handleSave}
              onSaveAs={selected && isTextFile ? () => setSaveModal({ mode: "saveAs", presetFlowName: selected.flowName }) : undefined}
              disabled={!isTextFile}
            />

            {isTextFile && selected && (
              <button
                type="button"
                onClick={handleAttachCurrentDesign}
                title="Attach this design to the agent chat"
                aria-label="Attach this design to the agent chat"
                className="p-1.5 text-muted hover:text-primary hover:bg-hover rounded-lg transition-colors focus-ring shrink-0"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>
            )}

            {isTextFile && selected && (
              <button
                type="button"
                onClick={() => setHistoryOpen(previous => !previous)}
                title="Version history"
                aria-label="Version history"
                aria-pressed={historyOpen}
                className={`p-1.5 rounded-lg transition-colors focus-ring shrink-0 ${
                  historyOpen ? "bg-accent-muted text-accent" : "text-muted hover:text-primary hover:bg-hover"
                }`}
              >
                <History className="w-3.5 h-3.5" />
              </button>
            )}

            {hostedPreviewUrl && (
              <a
                href={hostedPreviewUrl}
                target="_blank"
                rel="noreferrer"
                title="Open hosted preview in a new tab"
                className="p-1.5 text-muted hover:text-primary hover:bg-hover rounded-lg transition-colors focus-ring shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="sr-only">Open hosted preview in a new tab</span>
              </a>
            )}

            <div className="w-px h-5 bg-primary/70 mx-0.5 shrink-0" aria-hidden="true" />
          </>
        )}

        {/* New file button */}
        <button
          type="button"
          onClick={() => handleNew()}
          title="New file"
          className="flex items-center gap-1.5 px-2.5 py-1 bg-accent-muted hover:bg-accent-muted-hover text-accent text-xs font-medium rounded-lg transition-colors cursor-pointer focus-ring shrink-0"
        >
          <Plus className="w-3 h-3" />
          New File
        </button>

        <div className="w-px h-5 bg-primary/70 mx-0.5 shrink-0" aria-hidden="true" />

        {/* Agent session */}
        <AgentSessionBar
          agentTypes={allowedAgentTypes}
          currentAgent={agent}
          busy={isCreatingAgent}
          buttonClassName="bg-violet-600 hover:bg-violet-500 text-white shadow-button-primary"
          onCreate={agentType => void createAgent(agentType)}
          onTerminate={() => void terminateAgent()}
        />
      </AppPageHeader>

      <WorkspaceShell
        appId="web-design"
        title="Web Design"
        navigationLabel="Design flows and files"
        hasSelection={selected !== null}
        className="flex-1"
        navigation={
          <FlowSidebar
            flows={flows}
            flowsLoading={flowsLoading}
            expandedFlows={expandedFlows}
            onToggleFlow={handleToggleFlow}
            onExpandAllFlows={handleExpandAllFlows}
            onCollapseAllFlows={handleCollapseAllFlows}
            selected={selected}
            isLoadingSelected={isLoadingDesign}
            onSelectDesign={handleSelectDesign}
            onNewDesign={handleNewDesignInFlow}
            onDesignsUploaded={handleDesignsUploaded}
            onDeleteDesign={(flowName, name) =>
              runOrConfirm(
                "Delete file?",
                () => setDeleteDesignTarget({ flowName, name }),
                () => void handleDeleteDesign(flowName, name),
              )
            }
            onDeleteFlow={name =>
              runOrConfirm(
                "Delete flow?",
                () => setDeleteFlowTarget(name),
                () => void handleDeleteFlow(name),
              )
            }
            onAttachDesign={handleAttachDesign}
            onNewFlow={() => setNewFlowModalOpen(true)}
            agents={agents}
            agentsLoading={agentsLoading}
            selectedAgentId={agentId}
            onSelectAgent={selectAgent}
            onCreateAgent={() => void createAgent()}
            onTerminateAgent={id => void terminateAgent(id)}
          />
        }
      >
        <ChatDock
          agentId={agentId}
          storageKey="webdesign"
          initialRatio={0.65}
          headerTitle={agent?.displayName ?? "Design Agent"}
          extraAttachments={attachedDesigns}
          onRemoveExtraAttachment={handleRemoveAttachedDesign}
        >
          {mainPane}
        </ChatDock>
      </WorkspaceShell>
    </div>
  );
}

// ─── EditorPreviewPane ─────────────────────────────────────────────────────────

const DESIGN_IFRAME_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals";

function EditorPreviewPane({
  fileName,
  htmlContent,
  hostedPreviewUrl,
  previewHtml,
  previewRevision,
  useHostedPreview,
  isTextFile,
  isHtmlFile,
  mimeType,
  theme,
  viewMode,
  onChange,
  annotations,
  annotationTargets,
  annotationRects,
  onAnnotationRects,
  onInsertAnnotation,
  onAnnotationReply,
  onAnnotationResolve,
  onAnnotationDelete,
  onRevealAnnotation,
  onSendAnnotationToAgent,
  onEditorReady,
  className = "h-full",
}: {
  fileName: string;
  htmlContent: string;
  hostedPreviewUrl: string | null;
  previewHtml: string;
  previewRevision: number;
  useHostedPreview: boolean;
  isTextFile: boolean;
  isHtmlFile: boolean;
  mimeType: string;
  theme: string;
  viewMode: ViewMode;
  onChange: (value: string | undefined) => void;
  annotations: DesignAnnotation[];
  annotationTargets: { id: string; target: ElementTarget }[];
  annotationRects: Record<string, BridgeRect>;
  onAnnotationRects: (rects: Record<string, BridgeRect>) => void;
  onInsertAnnotation: (target: ElementTarget, text: string) => boolean;
  onAnnotationReply: (annotationId: string, reply: string) => void;
  onAnnotationResolve: (annotationId: string, resolved: boolean) => void;
  onAnnotationDelete: (annotationId: string) => void;
  onRevealAnnotation: (annotation: DesignAnnotation) => void;
  onSendAnnotationToAgent: (annotation: DesignAnnotation) => void;
  onEditorReady: (editor: MonacoEditorInstance, monaco: MonacoNamespace) => void;
  className?: string;
}) {
  const [annotateMode, setAnnotateMode] = useState(false);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [pendingPick, setPendingPick] = useState<{ target: ElementTarget; rect: BridgeRect } | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [device, setDevice] = useDeviceSelection();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameLoadedRef = useRef(false);

  // Reset transient annotation UI whenever the document identity changes.
  useEffect(() => {
    setActiveAnnotationId(null);
    setPendingPick(null);
    setAnnotateMode(false);
    onAnnotationRects({});
  }, [fileName, onAnnotationRects]);

  const postToFrame = useCallback((message: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  // Keep the bridge in sync with annotate mode, tracked elements, and iframe reloads.
  useEffect(() => {
    if (!frameLoadedRef.current) return;
    postToFrame({ type: BRIDGE_ANNOTATE, enabled: annotateMode });
  }, [annotateMode, postToFrame, previewRevision]);

  useEffect(() => {
    if (!frameLoadedRef.current) return;
    postToFrame({ type: BRIDGE_TRACK, targets: annotationTargets });
  }, [annotationTargets, postToFrame, previewRevision]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: string; rects?: Record<string, BridgeRect>; target?: ElementTarget; rect?: BridgeRect };
      if (!data || typeof data.type !== "string") return;
      if (data.type === BRIDGE_RECTS && data.rects) {
        onAnnotationRects(data.rects);
      } else if (data.type === BRIDGE_PICK && data.target && data.rect) {
        setPendingPick({ target: data.target, rect: data.rect });
        setAnnotationDraft("");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onAnnotationRects]);

  const handleFrameLoad = useCallback(() => {
    frameLoadedRef.current = true;
    postToFrame({ type: BRIDGE_ANNOTATE, enabled: annotateMode });
    postToFrame({ type: BRIDGE_TRACK, targets: annotationTargets });
  }, [annotateMode, annotationTargets, postToFrame]);

  const submitPendingAnnotation = useCallback(() => {
    if (!pendingPick || !annotationDraft.trim()) return;
    if (onInsertAnnotation(pendingPick.target, annotationDraft.trim())) {
      setPendingPick(null);
      setAnnotationDraft("");
    }
  }, [pendingPick, annotationDraft, onInsertAnnotation]);

  const codePane = (
    <div className="h-full min-w-0 flex flex-col">
      <div className="shrink-0 px-3 py-1.5 bg-tertiary/60 border-b border-primary flex items-center gap-2">
        <span className="text-xs font-mono font-semibold text-muted uppercase tracking-wider">{fileName}</span>
      </div>
      <div className="flex-1 overflow-hidden">
        {isTextFile ? (
          <Editor
            height="100%"
            language={editorLanguage(fileName)}
            value={htmlContent}
            onChange={onChange}
            theme={theme === "light" ? "vs-light" : "vs-dark"}
            onMount={onEditorReady}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: "on",
              padding: { top: 8 },
            }}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center bg-primary">
            <FileCode2 className="w-8 h-8 text-muted/60" />
            <p className="text-xs font-medium text-primary">Binary asset</p>
            <p className="text-xs text-muted">{mimeType} files can be previewed or replaced by uploading a new file.</p>
          </div>
        )}
      </div>
    </div>
  );

  // The bridge script rides along with HTML previews (srcDoc), powering annotation
  // picking and live pin positions; it stays idle until the parent sends a message.
  const frameHtml = useMemo(() => (isHtmlFile ? injectScript(previewHtml, buildAnnotationBridgeScript()) : previewHtml), [isHtmlFile, previewHtml]);

  const previewWidth = effectivePreviewWidth(device);

  const previewSurface = useHostedPreview ? (
    <iframe
      key={`hosted:${hostedPreviewUrl}`}
      ref={frameRef}
      className="flex-1 w-full bg-white border-0"
      src={hostedPreviewUrl ?? undefined}
      referrerPolicy="no-referrer"
      title="Design preview"
    />
  ) : (
    <iframe
      key={`srcdoc:${previewRevision}`}
      ref={frameRef}
      className="flex-1 w-full bg-white border-0"
      srcDoc={frameHtml}
      sandbox={DESIGN_IFRAME_SANDBOX}
      referrerPolicy="no-referrer"
      title="Design preview"
      onLoad={handleFrameLoad}
    />
  );

  const previewPane = (
    <div className="h-full min-w-0 flex flex-col">
      <div className="shrink-0 px-3 py-1.5 bg-tertiary/60 border-b border-primary flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono font-semibold text-muted uppercase tracking-wider">Preview</span>
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 shrink-0" />
        {isTextFile && <DeviceToolbar value={device} onChange={setDevice} />}
        {isHtmlFile && (
          <button
            type="button"
            onClick={() => setAnnotateMode(previous => !previous)}
            title="Annotate: click an element to leave a comment in the code"
            aria-pressed={annotateMode}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-lg transition-colors cursor-pointer focus-ring shrink-0 ${
              annotateMode ? "bg-violet-600 text-white" : "border border-primary text-muted hover:text-primary hover:bg-hover"
            }`}
          >
            <PenLine className="w-3 h-3" />
            Annotate
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto bg-tertiary/40 flex justify-center">
        <div className="relative flex flex-col w-full" style={previewWidth !== null ? { width: previewWidth, maxWidth: "100%", flex: "none" } : undefined}>
          {previewSurface}
          {!useHostedPreview && (
            <>
              <AnnotationPins
                annotations={annotations}
                rects={annotationRects}
                activeId={activeAnnotationId}
                onActivate={setActiveAnnotationId}
                onResolve={onAnnotationResolve}
                onReply={onAnnotationReply}
                onDelete={onAnnotationDelete}
                onRevealInEditor={annotation => {
                  setActiveAnnotationId(null);
                  onRevealAnnotation(annotation);
                }}
                onSendToAgent={annotation => onSendAnnotationToAgent(annotation)}
              />
              {pendingPick?.rect && (
                <div
                  className="absolute z-30 w-64 bg-primary border border-primary rounded-lg shadow-card p-3"
                  style={{ left: Math.max(8, pendingPick.rect.x - 128), top: pendingPick.rect.y + 24 }}
                >
                  <div className="text-xs text-muted mb-2 truncate">
                    {pendingPick.target.tag}
                    {pendingPick.target.id ? `#${pendingPick.target.id}` : ""}
                    {pendingPick.target.classes.length > 0 ? `.${pendingPick.target.classes.join(".")}` : ""}
                  </div>
                  <textarea
                    autoFocus
                    value={annotationDraft}
                    onChange={event => setAnnotationDraft(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submitPendingAnnotation();
                      }
                      if (event.key === "Escape") setPendingPick(null);
                    }}
                    placeholder="Leave a comment on this element…"
                    aria-label="Annotation comment"
                    rows={3}
                    className="w-full px-2 py-1.5 bg-transparent border border-primary rounded text-xs text-primary focus-ring resize-none"
                  />
                  <div className="flex items-center gap-1.5 mt-2">
                    <button
                      type="button"
                      onClick={submitPendingAnnotation}
                      disabled={!annotationDraft.trim()}
                      className="px-2 py-0.5 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors cursor-pointer focus-ring disabled:opacity-50"
                    >
                      Add annotation
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingPick(null)}
                      className="px-2 py-0.5 text-xs border border-primary text-muted hover:text-primary hover:bg-hover rounded-lg transition-colors cursor-pointer focus-ring"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {!useHostedPreview && (
        <AnnotationList
          annotations={annotations}
          activeId={activeAnnotationId}
          onActivate={setActiveAnnotationId}
          onRevealInEditor={annotation => {
            setActiveAnnotationId(null);
            onRevealAnnotation(annotation);
          }}
        />
      )}
    </div>
  );

  if (viewMode === "code") {
    return <div className={className}>{codePane}</div>;
  }

  if (viewMode === "preview") {
    return <div className={className}>{previewPane}</div>;
  }

  return (
    <ResizableSplit direction="horizontal" initialRatio={0.5} minFirst={160} minSecond={160} className={className}>
      <div className="h-full border-r border-primary">{codePane}</div>
      {previewPane}
    </ResizableSplit>
  );
}
