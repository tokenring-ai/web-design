import { useAttachedAgentChat } from "@tokenring-ai/one-frontend/apps/chat/useAttachedAgentChat.ts";
import AgentSessionList from "@tokenring-ai/one-frontend/components/AgentSessionList.tsx";
import NavigationSidebarHeader from "@tokenring-ai/one-frontend/components/layout/NavigationSidebarHeader.tsx";
import AsyncListBody from "@tokenring-ai/one-frontend/components/ui/AsyncListBody.tsx";
import ConfirmModal from "@tokenring-ai/one-frontend/components/ui/ConfirmModal.tsx";
import CreateItemModal from "@tokenring-ai/one-frontend/components/ui/CreateItemModal.tsx";
import ListItemWithActions from "@tokenring-ai/one-frontend/components/ui/ListItemWithActions.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { useAppAgentSession } from "@tokenring-ai/one-frontend/hooks/useAppAgentSession.tsx";
import { useAutoExpandTree } from "@tokenring-ai/one-frontend/hooks/useAutoExpandTree.ts";
import { useFileUpload } from "@tokenring-ai/one-frontend/hooks/useFileUpload.ts";
import { useLayoutApi } from "@tokenring-ai/one-frontend/layout/context.ts";
import { runOrConfirm } from "@tokenring-ai/one-frontend/lib/uiPreferences.ts";
import { agentRPCClient, useDesigns, useFlows, webDesignRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { Button } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import type { DesignSummary, FlowSummary } from "@tokenring-ai/web-design/schema";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Download,
  FileCode2,
  FileUp,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DesignSaveAsModal from "../components/DesignSaveAsModal.tsx";
import { DESIGN_EDITOR_VIEW_ID, DESIGN_LANDING_VIEW_ID } from "../ids.ts";
import { useWebDesignHosting } from "../lib/designData.ts";
import { designBlob, downloadBlob } from "../lib/downloadDesign.ts";
import { copyFileName, DEFAULT_HTML, designKey, FILE_NAME_PATTERN, FLOW_NAME_PATTERN } from "../lib/paths.ts";
import { useWebDesignLayoutNavigation } from "../lib/useWebDesignLayoutNavigation.ts";
import {
  attachDesign,
  forgetDesignDocument,
  removeAttachedDesign,
  setDesignDraft,
  setWebDesignAgentSession,
  useAttachedDesigns,
} from "../lib/webDesignStore.ts";

interface Selection {
  flowName: string;
  name: string;
}

/** One flow and, while expanded, the design files inside it (live, so agent writes show up). */
function FlowRow({
  flow,
  expanded,
  onToggle,
  selected,
  onSelectDesign,
  onNewDesign,
  onDesignsUploaded,
  onDeleteDesign,
  onDeleteFlow,
  onAttachDesign,
  onRenameFlow,
  onDuplicateFlow,
  onExportFlow,
  exporting,
  onRenameDesign,
  onDuplicateDesign,
}: {
  flow: FlowSummary;
  expanded: boolean;
  onToggle: () => void;
  selected: Selection | null;
  onSelectDesign: (flowName: string, name: string) => void;
  onNewDesign: (flowName: string) => void;
  onDesignsUploaded: (flowName: string, uploaded: number) => void;
  onDeleteDesign: (flowName: string, name: string) => void;
  onDeleteFlow: (flowName: string) => void;
  onAttachDesign: (flowName: string, name: string) => void;
  onRenameFlow: (flowName: string) => void;
  onDuplicateFlow: (flowName: string) => void;
  onExportFlow: (flowName: string) => void;
  exporting: boolean;
  onRenameDesign: (flowName: string, name: string) => void;
  onDuplicateDesign: (flowName: string, name: string) => void;
}) {
  const { data, isLoading, error } = useDesigns(expanded ? flow.name : null);
  const designs: DesignSummary[] | null = data?.designs ?? null;

  // Files the user agreed to overwrite: those replace via updateDesign, since createDesign refuses existing names.
  const confirmedOverwrites = useRef(new Set<string>());
  const upload = useFileUpload({
    encoding: "base64",
    validateFileName: name => (FILE_NAME_PATTERN.test(name) ? true : `"${name}" has an unsupported file name`),
    checkExists: async ({ filePath }) => {
      const { designs: existing } = await webDesignRPCClient.listDesigns({ flowName: flow.name });
      const exists = existing.some(design => design.name === filePath);
      // useFileUpload only uploads an existing file once the overwrite is confirmed.
      if (exists) confirmedOverwrites.current.add(filePath);
      else confirmedOverwrites.current.delete(filePath);
      return { exists };
    },
    uploadFile: async ({ filePath, content, encoding }) => {
      if (confirmedOverwrites.current.delete(filePath)) {
        await webDesignRPCClient.updateDesign({ flowName: flow.name, name: filePath, content, encoding });
      } else {
        await webDesignRPCClient.createDesign({ flowName: flow.name, name: filePath, content, encoding });
      }
    },
    onSkip: ({ fileName, reason, detail }) => {
      if (reason === "invalid-name" || reason === "size") {
        toastManager.error(detail ?? `"${fileName}" was skipped`, { duration: 5000 });
      }
    },
    onError: ({ error: uploadError }) => {
      toastManager.error(formatError(uploadError), { duration: 5000 });
    },
    onComplete: ({ uploaded }) => {
      if (uploaded > 0) onDesignsUploaded(flow.name, uploaded);
    },
  });

  useEffect(() => {
    if (error) toastManager.error(formatError(error), { duration: 4000 });
  }, [error]);

  return (
    <div className="border-b border-primary/50">
      <ListItemWithActions
        id={`flow:${flow.name}`}
        onPrimary={onToggle}
        primaryProps={{ "aria-label": `${expanded ? "Collapse" : "Expand"} flow ${flow.name}` }}
        className="gap-1.5 px-2 py-2 rounded-none"
        action={
          <>
            <input ref={upload.inputRef} type="file" multiple className="hidden" onChange={e => void upload.onChange(e)} />
            <button
              type="button"
              onClick={upload.trigger}
              disabled={upload.isUploading}
              aria-label={`Upload files to ${flow.name}`}
              className="p-0.5 text-muted hover:text-primary rounded transition-opacity cursor-pointer disabled:opacity-50"
            >
              {upload.isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileUp className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={() => onNewDesign(flow.name)}
              title="New file in this flow"
              aria-label={`New file in ${flow.name}`}
              className="p-0.5 text-muted hover:text-primary rounded transition-opacity cursor-pointer"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onRenameFlow(flow.name)}
              title="Rename flow"
              aria-label={`Rename flow ${flow.name}`}
              className="p-0.5 text-muted hover:text-primary rounded transition-opacity cursor-pointer"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onDuplicateFlow(flow.name)}
              title="Duplicate flow"
              aria-label={`Duplicate flow ${flow.name}`}
              className="p-0.5 text-muted hover:text-primary rounded transition-opacity cursor-pointer"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onExportFlow(flow.name)}
              disabled={exporting}
              title="Download flow as .zip"
              aria-label={`Download flow ${flow.name} as zip`}
              className="p-0.5 text-muted hover:text-primary rounded transition-opacity cursor-pointer disabled:opacity-50"
            >
              {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={() => onDeleteFlow(flow.name)}
              title="Delete flow"
              aria-label={`Delete flow ${flow.name}`}
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
          <AsyncListBody variant="nested" isLoading={isLoading} hasItems={(designs?.length ?? 0) > 0} emptyIcon={FileCode2} emptyTitle="No files yet">
            {designs?.map(design => {
              const isSelected = selected?.flowName === flow.name && selected.name === design.name;
              return (
                <ListItemWithActions
                  key={design.name}
                  id={`design:${flow.name}/${design.name}`}
                  selected={isSelected}
                  onPrimary={() => onSelectDesign(flow.name, design.name)}
                  primaryProps={{ "aria-label": `Open design ${design.name}` }}
                  className={`gap-1.5 px-2 py-1.5 rounded-none ${isSelected ? "bg-accent-muted text-accent" : "text-primary"}`}
                  action={
                    <>
                      <button
                        type="button"
                        onClick={() => onAttachDesign(flow.name, design.name)}
                        title="Attach to agent chat"
                        aria-label={`Attach ${design.name} to agent chat`}
                        className="p-0.5 text-muted hover:text-primary rounded transition-opacity cursor-pointer"
                      >
                        <Paperclip className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRenameDesign(flow.name, design.name)}
                        title="Rename or move file"
                        aria-label={`Rename file ${design.name}`}
                        className="p-0.5 text-muted hover:text-primary rounded transition-opacity cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicateDesign(flow.name, design.name)}
                        title="Duplicate file"
                        aria-label={`Duplicate file ${design.name}`}
                        className="p-0.5 text-muted hover:text-primary rounded transition-opacity cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteDesign(flow.name, design.name)}
                        title="Delete file"
                        aria-label={`Delete file ${design.name}`}
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
                  </span>
                </ListItemWithActions>
              );
            })}
          </AsyncListBody>
        </div>
      )}
    </div>
  );
}

/**
 * The design agents this app can attach to. Owns the only
 * `useAppAgentSession` of the app: it opens the chat panel (carrying the
 * designs attached from the tree and the editor) beside the designs and
 * publishes the session the other panels drive.
 */
function DesignAgentSessions({ onAgentChange, selected }: { onAgentChange: (agentId: string | null) => void; selected: Selection | null }) {
  const { agentTypes } = useWebDesignHosting();
  const { agentId, agent, agents, isLoading, selectAgent, createAgent, terminateAgent, TerminateDialog } = useAppAgentSession({
    appName: "Web Design app",
    storageKey: "webdesign",
    agentTypes,
  });
  const extraAttachments = useAttachedDesigns();
  useAttachedAgentChat({ agentId, extraAttachments, onRemoveExtraAttachment: removeAttachedDesign });

  useEffect(() => {
    onAgentChange(agentId);
  }, [agentId, onAgentChange]);

  // The open design becomes the agent's current design, which its context names
  // so "this page" needs no file name. Best effort: a failure only loses that hint.
  const selectedFlowName = selected?.flowName ?? null;
  const selectedDesignName = selected?.name ?? null;
  useEffect(() => {
    if (!agentId) return;
    webDesignRPCClient.updateWebDesignState({ agentId, selectedFlowName, selectedDesignName }).catch(() => undefined);
  }, [agentId, selectedDesignName, selectedFlowName]);

  const send = useCallback(
    async (message: string): Promise<boolean> => {
      // Reuse the attached agent so a second prompt continues the same conversation.
      const id = agentId ?? (await createAgent());
      if (!id) return false;
      try {
        await agentRPCClient.sendInput({ agentId: id, input: { from: "Web Design app", message } });
        return true;
      } catch (error) {
        toastManager.error(formatError(error), { duration: 5000 });
        return false;
      }
    },
    [agentId, createAgent],
  );

  const start = useCallback(
    (prompt: string): Promise<boolean> => {
      // Route to the visual command when the session runs the screenshot-verifying agent type.
      const command = agent?.agentType === "web-design-visual" ? "design-visual" : "design";
      return send(`/${command} ${prompt}`);
    },
    [agent, send],
  );

  // Published for the editor, preview and landing panels, which must not own competing sessions.
  useEffect(() => {
    setWebDesignAgentSession({ agentId, start, send });
    return () => setWebDesignAgentSession(null);
  }, [agentId, send, start]);

  return (
    <>
      <AgentSessionList
        storageKey="webdesign"
        agents={agents}
        selectedAgentId={agentId}
        isLoading={isLoading}
        label="Design agents"
        onSelect={selectAgent}
        onCreate={() => void createAgent()}
        onTerminate={id => void terminateAgent(id)}
      />
      <TerminateDialog />
    </>
  );
}

/**
 * Navigator for the Web Design app: design flows, the files inside them and the
 * running design agents. Rows open a design's editor and preview.
 */
export default function DesignFlowsPane() {
  const { route } = useLayoutApi();
  // The URL names the open design (editor) or, on the landing tab, just a flow to expand.
  const routeParams = route?.viewId === DESIGN_EDITOR_VIEW_ID || route?.viewId === DESIGN_LANDING_VIEW_ID ? route.params : null;
  const routeFlowName = routeParams?.flowName;
  const routeDesignName = routeParams?.["*"];
  const selected: Selection | null = useMemo(
    () => (routeFlowName && routeDesignName ? { flowName: routeFlowName, name: routeDesignName } : null),
    [routeFlowName, routeDesignName],
  );

  const { data, isLoading, error, mutate } = useFlows();
  const flows: FlowSummary[] = useMemo(() => data?.flows ?? [], [data]);
  const { openDesign, closeDesign, closeFlow, renameDesign, renameFlow } = useWebDesignLayoutNavigation();

  const [agentId, setAgentId] = useState<string | null>(null);
  const [newDesignFlow, setNewDesignFlow] = useState<string | null>(null);
  const [newFlowOpen, setNewFlowOpen] = useState(false);
  const [deleteDesignTarget, setDeleteDesignTarget] = useState<Selection | null>(null);
  const [deleteFlowTarget, setDeleteFlowTarget] = useState<string | null>(null);
  const [flowDialog, setFlowDialog] = useState<{ mode: "rename" | "duplicate"; flowName: string } | null>(null);
  const [designDialog, setDesignDialog] = useState<{ mode: "rename" | "duplicate"; flowName: string; name: string } | null>(null);
  const [exportingFlows, setExportingFlows] = useState<ReadonlySet<string>>(() => new Set());

  // Flows gaining designs while an agent runs open themselves so mockups stream in live.
  const { expandedKeys, toggle, expand, collapse } = useAutoExpandTree({
    items: flows,
    getKey: (flow: FlowSummary) => flow.name,
    getCount: (flow: FlowSummary) => flow.designCount,
    agentId,
  });

  useEffect(() => {
    if (routeFlowName) expand(routeFlowName);
  }, [routeFlowName, expand]);

  useEffect(() => {
    if (error) toastManager.error(formatError(error), { duration: 4000 });
  }, [error]);

  const expandAll = useCallback(() => {
    for (const flow of flows) expand(flow.name);
  }, [expand, flows]);

  const collapseAll = useCallback(() => {
    for (const flow of flows) collapse(flow.name);
  }, [collapse, flows]);

  const handleCreateDesign = useCallback(
    async (flowName: string, name: string) => {
      try {
        const { design } = await webDesignRPCClient.createDesign({ flowName, name, content: DEFAULT_HTML });
        setNewDesignFlow(null);
        expand(design.flowName);
        void mutate();
        openDesign(design.flowName, design.name);
        toastManager.success("Saved", { duration: 2000 });
      } catch (e: unknown) {
        toastManager.error(formatError(e), { duration: 4000 });
      }
    },
    [expand, mutate, openDesign],
  );

  const handleCreateFlow = useCallback(
    async (name: string) => {
      try {
        await webDesignRPCClient.createFlow({ name });
        setNewFlowOpen(false);
        expand(name);
        void mutate();
        toastManager.success("Flow created", { duration: 2000 });
      } catch (e: unknown) {
        toastManager.error(formatError(e), { duration: 4000 });
      }
    },
    [expand, mutate],
  );

  const handleDeleteDesign = useCallback(
    async (flowName: string, name: string) => {
      setDeleteDesignTarget(null);
      try {
        const { success } = await webDesignRPCClient.deleteDesign({ flowName, name });
        if (!success) throw new Error(`File "${name}" could not be deleted from flow "${flowName}"`);
        const key = designKey(flowName, name);
        setDesignDraft(key, null);
        forgetDesignDocument(key);
        removeAttachedDesign(key);
        closeDesign(flowName, name);
        void mutate();
        toastManager.success("Deleted", { duration: 2000 });
      } catch (e: unknown) {
        toastManager.error(formatError(e), { duration: 4000 });
      }
    },
    [closeDesign, mutate],
  );

  const handleDeleteFlow = useCallback(
    async (flowName: string) => {
      setDeleteFlowTarget(null);
      try {
        const { success } = await webDesignRPCClient.deleteFlow({ name: flowName });
        if (!success) throw new Error(`Flow "${flowName}" could not be deleted`);
        collapse(flowName);
        // Every open design of the flow goes, not just the one in the URL.
        closeFlow(flowName);
        void mutate();
        toastManager.success("Flow deleted", { duration: 2000 });
      } catch (e: unknown) {
        toastManager.error(formatError(e), { duration: 4000 });
      }
    },
    [closeFlow, collapse, mutate],
  );

  /** Renames or duplicates a flow; a rename carries open panels, drafts and the URL along. */
  const handleFlowDialog = useCallback(
    async (newName: string) => {
      if (!flowDialog) return;
      const { mode, flowName } = flowDialog;
      // Errors propagate so the dialog stays open and shows them.
      if (mode === "rename") {
        await webDesignRPCClient.renameFlow({ name: flowName, newName });
        collapse(flowName);
        renameFlow(flowName, newName);
        toastManager.success(`Renamed to ${newName}`, { duration: 2000 });
      } else {
        await webDesignRPCClient.duplicateFlow({ name: flowName, newName });
        toastManager.success(`Duplicated as ${newName}`, { duration: 2000 });
      }
      setFlowDialog(null);
      expand(newName);
      void mutate();
    },
    [collapse, expand, flowDialog, mutate, renameFlow],
  );

  /** Renames (moves) or duplicates a design, possibly into another flow. */
  const handleDesignDialog = useCallback(
    async (newFlowName: string, newName: string) => {
      if (!designDialog) return;
      const { mode, flowName, name } = designDialog;
      if (mode === "rename") {
        const { design } = await webDesignRPCClient.renameDesign({ flowName, name, newFlowName, newName });
        renameDesign({ flowName, name }, { flowName: design.flowName, name: design.name });
        toastManager.success(`Renamed to ${designKey(design.flowName, design.name)}`, { duration: 2000 });
      } else {
        const { design } = await webDesignRPCClient.duplicateDesign({ flowName, name, newFlowName, newName });
        openDesign(design.flowName, design.name);
        toastManager.success(`Duplicated as ${designKey(design.flowName, design.name)}`, { duration: 2000 });
      }
      setDesignDialog(null);
      expand(newFlowName);
      void mutate();
    },
    [designDialog, expand, mutate, openDesign, renameDesign],
  );

  /** Downloads a whole flow as a zip archive built on the server. */
  const handleExportFlow = useCallback(async (flowName: string) => {
    setExportingFlows(current => new Set(current).add(flowName));
    try {
      const archive = await webDesignRPCClient.exportFlow({ name: flowName });
      downloadBlob(designBlob({ name: archive.fileName, content: archive.content, encoding: "base64", mimeType: archive.mimeType }), archive.fileName);
      toastManager.success(`Downloaded ${archive.fileCount} file${archive.fileCount === 1 ? "" : "s"}`, { duration: 2500 });
    } catch (e: unknown) {
      toastManager.error(formatError(e), { duration: 4000 });
    } finally {
      setExportingFlows(current => {
        const next = new Set(current);
        next.delete(flowName);
        return next;
      });
    }
  }, []);

  /** Attach any design from any flow by name (fetches saved content from disk). */
  const handleAttachDesign = useCallback((flowName: string, name: string) => {
    void webDesignRPCClient
      .getDesign({ flowName, name })
      .then(({ design }) => {
        if (!design) {
          toastManager.error(`File "${name}" not found in flow "${flowName}"`, { duration: 4000 });
          return;
        }
        attachDesign(design, { announce: true });
      })
      .catch((e: unknown) => toastManager.error(formatError(e), { duration: 4000 }));
  }, []);

  const handleDesignsUploaded = useCallback(
    (flowName: string, uploaded: number) => {
      expand(flowName);
      void mutate();
      toastManager.success(`Uploaded ${uploaded} file${uploaded === 1 ? "" : "s"}`, { duration: 2500 });
    },
    [expand, mutate],
  );

  const body = (
    <AsyncListBody
      isLoading={isLoading}
      error={error}
      onRetry={() => void mutate()}
      hasItems={flows.length > 0}
      loadingMessage="Loading flows…"
      errorTitle="Failed to load flows"
      emptyIcon={FileCode2}
      emptyTitle="No flows yet"
      emptyHint={
        <>
          A flow groups the screens of one journey. Ask a design agent to sketch one, or start it yourself.
          <span className="block mt-2">
            <Button variant="secondary" icon={Plus} onClick={() => setNewFlowOpen(true)}>
              New flow
            </Button>
          </span>
        </>
      }
    >
      {flows.map(flow => (
        <FlowRow
          key={flow.name}
          flow={flow}
          expanded={expandedKeys.has(flow.name)}
          onToggle={() => toggle(flow.name)}
          selected={selected}
          onSelectDesign={openDesign}
          onNewDesign={setNewDesignFlow}
          onDesignsUploaded={handleDesignsUploaded}
          onAttachDesign={handleAttachDesign}
          onRenameFlow={flowName => setFlowDialog({ mode: "rename", flowName })}
          onDuplicateFlow={flowName => setFlowDialog({ mode: "duplicate", flowName })}
          onExportFlow={flowName => void handleExportFlow(flowName)}
          exporting={exportingFlows.has(flow.name)}
          onRenameDesign={(flowName, name) => setDesignDialog({ mode: "rename", flowName, name })}
          onDuplicateDesign={(flowName, name) => setDesignDialog({ mode: "duplicate", flowName, name })}
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
        />
      ))}
    </AsyncListBody>
  );

  return (
    <ViewShell
      tone="sidebar"
      scroll={false}
      header={
        <NavigationSidebarHeader
          title="Design Flows"
          actions={[
            { icon: <ChevronsUpDown className="w-3.5 h-3.5" />, label: "Expand all flows", onClick: expandAll },
            { icon: <ChevronsDownUp className="w-3.5 h-3.5" />, label: "Collapse all flows", onClick: collapseAll },
            { icon: <FileCode2 className="w-3.5 h-3.5" />, label: "New file", onClick: () => setNewDesignFlow("") },
            { icon: <Plus className="w-3.5 h-3.5" />, label: "New flow", onClick: () => setNewFlowOpen(true) },
          ]}
        />
      }
    >
      <DesignAgentSessions onAgentChange={setAgentId} selected={selected} />

      <div className="flex-1 min-h-0 overflow-y-auto">{body}</div>

      {newDesignFlow !== null && (
        <DesignSaveAsModal
          title="Save File"
          flowNames={flows.map(flow => flow.name)}
          initialFlow={newDesignFlow || (selected?.flowName ?? "")}
          onSave={handleCreateDesign}
          onClose={() => setNewDesignFlow(null)}
        />
      )}
      {newFlowOpen && (
        <CreateItemModal
          title="New Flow"
          placeholder="onboarding"
          pattern={FLOW_NAME_PATTERN}
          validationError="Use letters, numbers, hyphens, and underscores only, starting with a letter or number."
          onCreate={handleCreateFlow}
          onClose={() => setNewFlowOpen(false)}
        />
      )}
      {flowDialog && (
        <CreateItemModal
          title={flowDialog.mode === "rename" ? `Rename flow ${flowDialog.flowName}` : `Duplicate flow ${flowDialog.flowName}`}
          placeholder="onboarding"
          initialValue={flowDialog.mode === "rename" ? flowDialog.flowName : `${flowDialog.flowName}-copy`}
          pattern={FLOW_NAME_PATTERN}
          validationError="Use letters, numbers, hyphens, and underscores only, starting with a letter or number."
          createLabel={flowDialog.mode === "rename" ? "Rename" : "Duplicate"}
          createIcon={flowDialog.mode === "rename" ? Pencil : Copy}
          onCreate={handleFlowDialog}
          onClose={() => setFlowDialog(null)}
        />
      )}
      {designDialog && (
        <DesignSaveAsModal
          title={designDialog.mode === "rename" ? `Rename ${designDialog.name}` : `Duplicate ${designDialog.name}`}
          saveLabel={designDialog.mode === "rename" ? "Rename" : "Duplicate"}
          saveIcon={designDialog.mode === "rename" ? Pencil : Copy}
          flowNames={flows.map(flow => flow.name)}
          initialFlow={designDialog.flowName}
          initialName={designDialog.mode === "rename" ? designDialog.name : copyFileName(designDialog.name)}
          onSave={handleDesignDialog}
          onClose={() => setDesignDialog(null)}
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
    </ViewShell>
  );
}
