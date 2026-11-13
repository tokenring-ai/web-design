import { beforeEach, describe, expect, it, mock } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defineView } from "@tokenring-ai/one-frontend/layout/define.ts";
import { createLayoutRegistry } from "@tokenring-ai/one-frontend/layout/registry.ts";
import { renderLayoutApp } from "@tokenring-ai/one-frontend/test/layout.tsx";
import { MessageSquare } from "lucide-react";
import type React from "react";
import { SWRConfig } from "swr";

const PassThroughFocusTrap = ({ children }: { children: React.ReactNode }) => children;
void mock.module("focus-trap-react", () => ({ FocusTrap: PassThroughFocusTrap, default: PassThroughFocusTrap }));

// Monaco is a heavy browser widget; a textarea stands in for it.
void mock.module("@monaco-editor/react", () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string | undefined) => void }) => (
    <textarea aria-label="HTML editor" value={value} onChange={e => onChange?.(e.target.value)} />
  ),
  DiffEditor: ({ original, modified }: { original: string; modified: string }) => (
    <div role="region" aria-label="Version diff">{`${original}|||${modified}`}</div>
  ),
}));

void mock.module("@tokenring-ai/one-frontend/hooks/useTheme.ts", () => ({ useTheme: () => ["dark", mock()] as const }));

const flows = [
  { name: "onboarding", designCount: 2, updatedAt: "2026-07-01T12:00:00.000Z", absolutePath: "/project/web-design/onboarding" },
  { name: "checkout", designCount: 0, updatedAt: "2026-07-01T11:00:00.000Z", absolutePath: "/project/web-design/checkout" },
];

const onboardingDesigns = [
  { flowName: "onboarding", name: "index.html", size: 420, updatedAt: "2026-07-01T12:00:00.000Z", mimeType: "text/html" },
  { flowName: "onboarding", name: "welcome.html", size: 180, updatedAt: "2026-07-01T12:01:00.000Z", mimeType: "text/html" },
];

const indexDesign = {
  flowName: "onboarding",
  name: "index.html",
  content: "<!DOCTYPE html><html><body><h1>Index</h1></body></html>",
  size: 420,
  updatedAt: "2026-07-01T12:00:00.000Z",
  encoding: "utf8" as const,
  mimeType: "text/html",
};

const welcomeDesign = { ...indexDesign, name: "welcome.html", content: "<!DOCTYPE html><html><body><h1>Welcome</h1></body></html>", size: 180 };

let flowsState = [...flows];
let designsByFlow: Record<string, typeof onboardingDesigns> = {};
let getDesignResult: typeof indexDesign | null = indexDesign;

const createAgent = mock(async (_args: { agentType: string; headless: boolean }) => ({ id: "web-design-agent-1", displayName: "Designer", description: "" }));
const sendInput = mock(async () => ({ status: "success" as const, requestId: "req-1" }));
const deleteAgent = mock(async () => ({ status: "success" as const }));
const getDesign = mock(async (args: { flowName: string; name: string }) => ({
  design: args.name === "welcome.html" ? welcomeDesign : getDesignResult,
}));
const updateDesign = mock(async (args: { flowName: string; name: string; content: string }) => ({
  design: { ...indexDesign, flowName: args.flowName, name: args.name, content: args.content, updatedAt: "2026-07-02T00:00:00.000Z" },
}));
const createDesign = mock(async (args: { flowName: string; name: string; content: string }) => ({
  design: { ...indexDesign, flowName: args.flowName, name: args.name, content: args.content, updatedAt: "2026-07-02T00:00:00.000Z" },
}));
const listDesigns = mock(async (args: { flowName: string }) => ({ designs: designsByFlow[args.flowName] ?? [] }));
const deleteDesign = mock(async (_args: { flowName: string; name: string }) => ({ success: true }));
const createFlow = mock(async (_args: { name: string }) => ({ flow: flows[0] }));
const deleteFlow = mock(async (_args: { name: string }) => ({ success: true }));
const mutateFlows = mock(async () => undefined);
const renameFlow = mock(async (args: { name: string; newName: string }) => ({ flow: { ...flows[0]!, name: args.newName } }));
const duplicateFlow = mock(async (args: { name: string; newName: string }) => ({ flow: { ...flows[0]!, name: args.newName } }));
const exportFlow = mock(async (args: { name: string }) => ({
  fileName: `${args.name}.zip`,
  mimeType: "application/zip" as const,
  content: "UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==",
  fileCount: 2,
}));
const renameDesign = mock(async (args: { flowName: string; name: string; newFlowName?: string; newName: string }) => ({
  design: { ...indexDesign, flowName: args.newFlowName ?? args.flowName, name: args.newName },
}));
const duplicateDesign = mock(async (args: { flowName: string; name: string; newFlowName?: string; newName: string }) => ({
  design: { ...indexDesign, flowName: args.newFlowName ?? args.flowName, name: args.newName },
}));
const captureDesignScreenshot = mock(async (_args: { flowName: string; name: string; width?: number; height?: number; save: boolean }) => ({
  savedAs: "screenshots/index-1280x720-20260712T101500Z.png",
  content: "AAEC",
  mimeType: "image/png" as const,
  viewport: { width: 1280, height: 720 },
  console: "Console: clean (no messages since navigation).",
}));
const updateWebDesignState = mock(async () => ({ status: "success" as const, selectedFlowName: null, selectedDesignName: null }));

void mock.module("@tokenring-ai/one-frontend/rpc.ts", () => ({
  useFlows: () => ({ data: { flows: flowsState }, isLoading: false, error: undefined, mutate: mutateFlows }),
  useDesigns: (flowName: string | null) => ({
    data: flowName ? { designs: designsByFlow[flowName] ?? [] } : undefined,
    isLoading: false,
    error: undefined,
    mutate: mock(async () => undefined),
  }),
  useWebDesignConfiguration: () => ({
    data: { agentTypes: ["web-design"], webDesignDirectory: "web-design", serveDirectory: ".tokenring/web-design", fsProvider: "posix", previewBaseUrl: null },
    isLoading: false,
    error: undefined,
    mutate: mock(async () => undefined),
  }),
  useDesignHistory: () => ({ data: { versions: [] }, isLoading: false, error: undefined, mutate: mock(async () => undefined) }),
  useAgentList: () => ({ data: [], isLoading: false, error: undefined, mutate: mock(async () => undefined) }),
  useAgentTypes: () => ({
    data: [{ type: "web-design", displayName: "Designer", description: "Web design", category: "Design", enabledTools: [] }],
    isLoading: false,
  }),
  agentRPCClient: { createAgent, sendInput, deleteAgent },
  webDesignRPCClient: {
    getDesign,
    listDesigns,
    updateDesign,
    createDesign,
    deleteDesign,
    createFlow,
    deleteFlow,
    renameFlow,
    duplicateFlow,
    exportFlow,
    renameDesign,
    duplicateDesign,
    captureDesignScreenshot,
    updateWebDesignState,
    listDesignHistory: mock(async () => ({ versions: [] })),
    getDesignVersion: mock(async () => ({ version: null })),
  },
}));
const { WEB_DESIGN_APP } = await import("../layout.ts");
const { default: webDesignViews } = await import("../views.tsx");
const { attachDesign, getAttachedDesigns, getDesignDocument, getDesignDraft, resetWebDesignStore, setDesignDocument, setDesignDraft } = await import(
  "../lib/webDesignStore.ts"
);
const { designBlob } = await import("../lib/downloadDesign.ts");
const { default: DeviceToolbar, DEFAULT_DEVICE_SELECTION } = await import("../components/DeviceToolbar.tsx");
const { render } = await import("@testing-library/react");

function ChatStub() {
  return <p>chat stub</p>;
}

const chatView = defineView({
  id: "chat",
  kind: "agent",
  title: params => params.agentId ?? "Chat",
  icon: MessageSquare,
  route: "agent/:agentId",
  instanceKey: params => params.agentId ?? "",
  component: ChatStub,
});

const registry = createLayoutRegistry({
  apps: [WEB_DESIGN_APP],
  views: [...webDesignViews.views, chatView],
  kinds: [
    { id: "navigator", label: "Navigators", plural: "navigators" },
    { id: "agent", label: "Agents", plural: "agent chats" },
    { id: "design", label: "Designs", plural: "designs" },
    { id: "design-preview", label: "Design previews", plural: "design previews" },
  ],
});

function Fresh({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>;
}

const renderApp = (url = "/web-design", state?: unknown) => renderLayoutApp({ registry, url, wrapper: Fresh, ...(state === undefined ? {} : { state }) });
const tab = (name: string | RegExp) => screen.queryByRole("tab", { name });
const panel = (viewId: string, key: string) => document.querySelector(`[data-panel="${viewId}:${key}"]`);
const hasUnsavedBadge = () => screen.queryAllByRole("img", { name: "Unsaved changes" }).length > 0;

const logoDesign = {
  flowName: "onboarding",
  name: "logo.png",
  content: "AAEC",
  size: 3,
  updatedAt: "2026-07-01T12:00:00.000Z",
  encoding: "base64" as const,
  mimeType: "image/png",
};
const logoPath = "/web-design/onboarding/logo.png";
const indexPath = "/web-design/onboarding/index.html";

/** Picks files on the flow row's hidden upload input. */
async function uploadToFlow(user: ReturnType<typeof userEvent.setup>, flowName: string, file: File) {
  const button = await screen.findByRole("button", { name: `Upload files to ${flowName}` });
  const input = button.parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, file);
}

/** Stubs the browser download path; returns the blobs handed to it and the anchor clicks. */
function stubDownloads() {
  const urlApi = URL as unknown as { createObjectURL: ((blob: Blob) => string) | undefined; revokeObjectURL: ((url: string) => void) | undefined };
  const original = { create: urlApi.createObjectURL, revoke: urlApi.revokeObjectURL, click: HTMLAnchorElement.prototype.click };
  const blobs: Blob[] = [];
  const click = mock(() => {});
  urlApi.createObjectURL = (blob: Blob) => {
    blobs.push(blob);
    return "blob:download";
  };
  urlApi.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = click;
  return {
    blobs,
    click,
    restore() {
      urlApi.createObjectURL = original.create;
      urlApi.revokeObjectURL = original.revoke;
      HTMLAnchorElement.prototype.click = original.click;
    },
  };
}

describe("Web Design app", () => {
  beforeEach(() => {
    localStorage.clear();
    resetWebDesignStore();
    for (const fn of [
      createAgent,
      sendInput,
      deleteAgent,
      getDesign,
      listDesigns,
      updateDesign,
      createDesign,
      deleteDesign,
      createFlow,
      deleteFlow,
      mutateFlows,
      renameFlow,
      duplicateFlow,
      exportFlow,
      renameDesign,
      duplicateDesign,
      captureDesignScreenshot,
    ]) {
      fn.mockClear();
    }
    flowsState = [...flows];
    designsByFlow = { onboarding: [...onboardingDesigns], checkout: [] };
    getDesignResult = { ...indexDesign };
  });

  describe("routes", () => {
    it("resolves every old URL shape", () => {
      expect(registry.routes.resolve("/web-design")).toMatchObject({ app: "web-design", viewId: "design-landing" });
      expect(registry.routes.resolve("/web-design/onboarding")).toMatchObject({ viewId: "design-landing", params: { flowName: "onboarding" } });
      expect(registry.routes.resolve(indexPath)).toMatchObject({ viewId: "design-editor", params: { flowName: "onboarding", "*": "index.html" } });
      // Nested design names arrive in the splat.
      expect(registry.routes.resolve("/web-design/onboarding/assets/logo.png")).toMatchObject({
        viewId: "design-editor",
        params: { flowName: "onboarding", "*": "assets/logo.png" },
      });
      expect(registry.routes.urlFor("web-design", "design-editor", { flowName: "onboarding", "*": "assets/logo.png" })).toBe(
        "/web-design/onboarding/assets/logo.png",
      );
    });

    it("keeps the app's rail metadata", () => {
      expect(WEB_DESIGN_APP).toMatchObject({ id: "web-design", path: "/web-design", label: "Web Design", shortLabel: "WD", group: "Build" });
    });
  });

  describe("flows navigator", () => {
    it("lists flows and the files inside one once it is expanded", async () => {
      const user = userEvent.setup();
      renderApp();

      expect(await screen.findByText("onboarding")).toBeInTheDocument();
      expect(screen.getByText("checkout")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Expand flow onboarding" }));
      expect(await screen.findByText("index.html")).toBeInTheDocument();
      expect(screen.getByText("welcome.html")).toBeInTheDocument();
    });

    it("opens the editor and the preview, and closes the landing tab, when a design is picked", async () => {
      const user = userEvent.setup();
      const app = renderApp();
      expect(tab("Select a design")).toBeInTheDocument();

      await user.click(await screen.findByRole("button", { name: "Expand flow onboarding" }));
      await user.click(await screen.findByRole("button", { name: "Open design index.html" }));

      expect(app.location().pathname).toBe(indexPath);
      await waitFor(() => expect(tab("index.html")).toBeInTheDocument());
      await waitFor(() => expect(tab("index.html preview")).toBeInTheDocument());
      expect(tab("Select a design")).not.toBeInTheDocument();
      expect(panel("design-editor", "onboarding/index.html")).not.toBeNull();
      expect(panel("design-preview", "onboarding/index.html")).not.toBeNull();
    });

    it("expands the flow named by the URL and highlights the open design", async () => {
      renderApp(indexPath);
      // Auto-expanded from the route, so the files are listed without a click.
      const row = await screen.findByRole("button", { name: "Open design index.html" });
      expect(screen.getByText("welcome.html")).toBeInTheDocument();
      expect(row.closest("[data-item-id]")).toHaveAttribute("aria-current", "true");
    });

    it("expands a flow named alone in the URL without opening a design", async () => {
      renderApp("/web-design/onboarding");
      expect(await screen.findByRole("button", { name: "Open design index.html" })).toBeInTheDocument();
      expect(tab("Select a design")).toBeInTheDocument();
    });

    it("uploads a new file with createDesign", async () => {
      const user = userEvent.setup();
      renderApp();

      await uploadToFlow(user, "onboarding", new File(["<p>new</p>"], "fresh.html", { type: "text/html" }));
      await waitFor(() =>
        expect(createDesign).toHaveBeenCalledWith(expect.objectContaining({ flowName: "onboarding", name: "fresh.html", encoding: "base64" })),
      );
      expect(updateDesign).not.toHaveBeenCalled();
    });

    it("replaces an existing file via updateDesign once the overwrite is confirmed", async () => {
      const user = userEvent.setup();
      const originalConfirm = window.confirm;
      const confirm = mock(() => true);
      window.confirm = confirm;
      try {
        renderApp();
        await uploadToFlow(user, "onboarding", new File(["<p>v2</p>"], "index.html", { type: "text/html" }));

        await waitFor(() =>
          expect(updateDesign).toHaveBeenCalledWith(expect.objectContaining({ flowName: "onboarding", name: "index.html", encoding: "base64" })),
        );
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(createDesign).not.toHaveBeenCalled();
      } finally {
        window.confirm = originalConfirm;
      }
    });

    it("leaves an existing file alone when the overwrite is declined", async () => {
      const user = userEvent.setup();
      const originalConfirm = window.confirm;
      window.confirm = mock(() => false);
      try {
        renderApp();
        await uploadToFlow(user, "onboarding", new File(["<p>v2</p>"], "index.html", { type: "text/html" }));

        await waitFor(() => expect(listDesigns).toHaveBeenCalled());
        expect(updateDesign).not.toHaveBeenCalled();
        expect(createDesign).not.toHaveBeenCalled();
      } finally {
        window.confirm = originalConfirm;
      }
    });

    it("explains flows and offers New flow when there are none", async () => {
      const user = userEvent.setup();
      flowsState = [];
      renderApp();

      expect(await screen.findByText(/A flow groups the screens of one journey/)).toBeInTheDocument();
      const emptyButtons = screen.getAllByRole("button", { name: "New flow" });
      await user.click(emptyButtons[emptyButtons.length - 1]!);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    it("creates a flow", async () => {
      const user = userEvent.setup();
      renderApp();

      await user.click(await screen.findByRole("button", { name: "New flow" }));
      await user.type(screen.getByPlaceholderText("onboarding"), "checkout-v2");
      await user.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() => expect(createFlow).toHaveBeenCalledWith({ name: "checkout-v2" }));
    });

    it("creates a design inside a flow and opens it", async () => {
      const user = userEvent.setup();
      const app = renderApp();

      await user.click(await screen.findByRole("button", { name: "New file in onboarding" }));
      const dialog = screen.getByRole("dialog");
      const nameInput = within(dialog).getByPlaceholderText("index.html");
      await user.clear(nameInput);
      await user.type(nameInput, "signup.html");
      await user.click(within(dialog).getByRole("button", { name: "Save" }));

      await waitFor(() => expect(createDesign).toHaveBeenCalledWith(expect.objectContaining({ flowName: "onboarding", name: "signup.html" })));
      await waitFor(() => expect(app.location().pathname).toBe("/web-design/onboarding/signup.html"));
      expect(panel("design-editor", "onboarding/signup.html")).not.toBeNull();
    });

    it("deletes a design after confirmation and closes its editor and preview", async () => {
      const user = userEvent.setup();
      const app = renderApp(indexPath);
      await screen.findByLabelText("HTML editor");

      await user.click(await screen.findByRole("button", { name: "Delete file index.html" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteDesign).toHaveBeenCalledWith({ flowName: "onboarding", name: "index.html" }));
      await waitFor(() => expect(panel("design-editor", "onboarding/index.html")).toBeNull());
      expect(panel("design-preview", "onboarding/index.html")).toBeNull();
      await waitFor(() => expect(app.location().pathname).toBe("/web-design"));
    });

    it("deletes a flow after confirmation", async () => {
      const user = userEvent.setup();
      renderApp();

      await user.click(await screen.findByRole("button", { name: "Delete flow checkout" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteFlow).toHaveBeenCalledWith({ name: "checkout" }));
    });

    it("deleting a flow closes every design of it and drops their drafts, documents and attachments", async () => {
      const user = userEvent.setup();
      const app = renderApp("/web-design/onboarding/welcome.html");
      await screen.findByLabelText("HTML editor");
      // A second design of the flow opened beside the one in the URL.
      app.go(indexPath);
      await waitFor(() => expect(panel("design-editor", "onboarding/index.html")).not.toBeNull());
      app.go("/web-design/onboarding/welcome.html");
      for (const design of [indexDesign, welcomeDesign, { ...indexDesign, flowName: "checkout", name: "cart.html" }]) {
        setDesignDocument(design);
        setDesignDraft(`${design.flowName}/${design.name}`, "<p>edited</p>");
        attachDesign(design);
      }

      await user.click(await screen.findByRole("button", { name: "Delete flow onboarding" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteFlow).toHaveBeenCalledWith({ name: "onboarding" }));
      await waitFor(() => expect(panel("design-editor", "onboarding/welcome.html")).toBeNull());
      for (const viewId of ["design-editor", "design-preview"]) {
        expect(panel(viewId, "onboarding/index.html")).toBeNull();
        expect(panel(viewId, "onboarding/welcome.html")).toBeNull();
      }
      for (const key of ["onboarding/index.html", "onboarding/welcome.html"]) {
        expect(getDesignDraft(key)).toBeNull();
        expect(getDesignDocument(key)).toBeNull();
      }
      // Deleted designs can no longer be sent to the agent; the other flow's attachment stays.
      expect(getAttachedDesigns().map(extra => extra.id)).toEqual(["checkout/cart.html"]);
      expect(getDesignDraft("checkout/cart.html")).toBe("<p>edited</p>");
      expect(getDesignDocument("checkout/cart.html")).not.toBeNull();
      await waitFor(() => expect(app.location().pathname).toBe("/web-design"));
    });

    it("attaches a design from the tree to the agent chat", async () => {
      const user = userEvent.setup();
      renderApp();

      await user.click(await screen.findByRole("button", { name: "Expand flow onboarding" }));
      await user.click(await screen.findByRole("button", { name: "Attach index.html to agent chat" }));

      await waitFor(() => expect(getAttachedDesigns().map(extra => extra.id)).toEqual(["onboarding/index.html"]));
      expect(getAttachedDesigns()[0]!.attachment).toMatchObject({ mimeType: "text/html", body: indexDesign.content });
    });
  });

  describe("flow and file management", () => {
    it("renames a design and moves its open panels, draft and URL along", async () => {
      const user = userEvent.setup();
      const app = renderApp(indexPath);
      const editor = await screen.findByLabelText("HTML editor");
      await userEvent.clear(editor);
      await userEvent.type(editor, "<h1>Unsaved</h1>");
      expect(getDesignDraft("onboarding/index.html")).toBe("<h1>Unsaved</h1>");

      await user.click(await screen.findByRole("button", { name: "Rename file index.html" }));
      const dialog = screen.getByRole("dialog");
      const nameInput = within(dialog).getByPlaceholderText("index.html");
      expect(nameInput).toHaveValue("index.html");
      await user.clear(nameInput);
      await user.type(nameInput, "home.html");
      await user.click(within(dialog).getByRole("button", { name: "Rename" }));

      await waitFor(() =>
        expect(renameDesign).toHaveBeenCalledWith({ flowName: "onboarding", name: "index.html", newFlowName: "onboarding", newName: "home.html" }),
      );
      await waitFor(() => expect(app.location().pathname).toBe("/web-design/onboarding/home.html"));
      await waitFor(() => expect(panel("design-editor", "onboarding/index.html")).toBeNull());
      expect(panel("design-editor", "onboarding/home.html")).not.toBeNull();
      expect(panel("design-preview", "onboarding/home.html")).not.toBeNull();
      expect(panel("design-preview", "onboarding/index.html")).toBeNull();
      expect(getDesignDraft("onboarding/home.html")).toBe("<h1>Unsaved</h1>");
      expect(getDesignDraft("onboarding/index.html")).toBeNull();
    });

    it("duplicates a design under a -copy name and opens the copy", async () => {
      const user = userEvent.setup();
      const app = renderApp();

      await user.click(await screen.findByRole("button", { name: "Expand flow onboarding" }));
      await user.click(await screen.findByRole("button", { name: "Duplicate file welcome.html" }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByPlaceholderText("index.html")).toHaveValue("welcome-copy.html");
      await user.click(within(dialog).getByRole("button", { name: "Duplicate" }));

      await waitFor(() =>
        expect(duplicateDesign).toHaveBeenCalledWith({ flowName: "onboarding", name: "welcome.html", newFlowName: "onboarding", newName: "welcome-copy.html" }),
      );
      await waitFor(() => expect(app.location().pathname).toBe("/web-design/onboarding/welcome-copy.html"));
    });

    it("renames a flow, re-pointing open designs and the URL", async () => {
      const user = userEvent.setup();
      const app = renderApp(indexPath);
      await screen.findByLabelText("HTML editor");

      await user.click(await screen.findByRole("button", { name: "Rename flow onboarding" }));
      const dialog = screen.getByRole("dialog");
      const input = within(dialog).getByRole("textbox");
      await user.clear(input);
      await user.type(input, "welcome");
      await user.click(within(dialog).getByRole("button", { name: "Rename" }));

      await waitFor(() => expect(renameFlow).toHaveBeenCalledWith({ name: "onboarding", newName: "welcome" }));
      await waitFor(() => expect(app.location().pathname).toBe("/web-design/welcome/index.html"));
      await waitFor(() => expect(panel("design-editor", "onboarding/index.html")).toBeNull());
      expect(panel("design-editor", "welcome/index.html")).not.toBeNull();
      expect(panel("design-preview", "welcome/index.html")).not.toBeNull();
    });

    it("shows a rename collision in the dialog instead of closing it", async () => {
      const user = userEvent.setup();
      renameFlow.mockImplementationOnce(async () => {
        throw new Error('Flow "checkout" already exists');
      });
      renderApp();

      await user.click(await screen.findByRole("button", { name: "Rename flow onboarding" }));
      const dialog = screen.getByRole("dialog");
      const input = within(dialog).getByRole("textbox");
      await user.clear(input);
      await user.type(input, "checkout");
      await user.click(within(dialog).getByRole("button", { name: "Rename" }));

      expect(await within(dialog).findByText(/already exists/)).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("duplicates a flow", async () => {
      const user = userEvent.setup();
      renderApp();

      await user.click(await screen.findByRole("button", { name: "Duplicate flow onboarding" }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("textbox")).toHaveValue("onboarding-copy");
      await user.click(within(dialog).getByRole("button", { name: "Duplicate" }));

      await waitFor(() => expect(duplicateFlow).toHaveBeenCalledWith({ name: "onboarding", newName: "onboarding-copy" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("downloads a whole flow as a zip", async () => {
      const user = userEvent.setup();
      const downloads = stubDownloads();
      try {
        renderApp();
        await user.click(await screen.findByRole("button", { name: "Download flow onboarding as zip" }));

        await waitFor(() => expect(downloads.click).toHaveBeenCalledTimes(1));
        expect(exportFlow).toHaveBeenCalledWith({ name: "onboarding" });
        expect(downloads.blobs[0]?.type).toBe("application/zip");
        expect(downloads.blobs[0]?.size).toBe(22);
      } finally {
        downloads.restore();
      }
    });

    it("captures a screenshot from the preview header and offers it for download", async () => {
      const user = userEvent.setup();
      const downloads = stubDownloads();
      try {
        renderApp(indexPath);
        await screen.findByTitle("Design preview");
        expect(screen.queryByRole("button", { name: "Download screenshot" })).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Capture screenshot" }));
        await waitFor(() => expect(captureDesignScreenshot).toHaveBeenCalledTimes(1));
        expect(captureDesignScreenshot.mock.calls[0]?.[0]).toMatchObject({ flowName: "onboarding", name: "index.html", save: true });

        await user.click(await screen.findByRole("button", { name: "Download screenshot" }));
        expect(downloads.click).toHaveBeenCalledTimes(1);
        expect(downloads.blobs[0]?.type).toBe("image/png");
        expect(downloads.blobs[0]?.size).toBe(3);
      } finally {
        downloads.restore();
      }
    });
  });

  describe("landing tab", () => {
    it("shows the design prompt at the app root", async () => {
      renderApp();
      expect(await screen.findByText("Design with agents")).toBeInTheDocument();
      expect(screen.getByLabelText("Design prompt")).toBeInTheDocument();
    });

    it("starts a design agent from the landing prompt and opens its chat", async () => {
      const user = userEvent.setup();
      renderApp();

      await user.type(await screen.findByLabelText("Design prompt"), "Onboarding for a notes app");
      await user.click(screen.getByRole("button", { name: "Start design agent" }));

      await waitFor(() => expect(createAgent).toHaveBeenCalledWith({ agentType: "web-design", headless: false }));
      expect(sendInput).toHaveBeenCalledWith({
        agentId: "web-design-agent-1",
        input: { from: "Web Design app", message: "/design Onboarding for a notes app" },
      });
      await waitFor(() => expect(panel("chat", "web-design-agent-1")).not.toBeNull());
    });

    it("offers to save HTML handed over from the Files app", async () => {
      const handoff = "<html><body><h1>From Files</h1></body></html>";
      renderApp("/web-design", { fileContent: handoff });

      const dialog = await screen.findByRole("dialog", { name: "Save File" });
      expect(within(dialog).getByPlaceholderText("index.html")).toHaveValue("index.html");
    });

    it("writes the handed-over HTML into the chosen flow and opens it", async () => {
      const user = userEvent.setup();
      const handoff = "<html><body><h1>From Files</h1></body></html>";
      const app = renderApp("/web-design", { fileContent: handoff });

      const dialog = await screen.findByRole("dialog", { name: "Save File" });
      await user.type(within(dialog).getByPlaceholderText("onboarding"), "onboarding");
      await user.click(within(dialog).getByRole("button", { name: "Save" }));

      await waitFor(() => expect(createDesign).toHaveBeenCalledWith({ flowName: "onboarding", name: "index.html", content: handoff }));
      await waitFor(() => expect(app.location().pathname).toBe(indexPath));
      expect(panel("design-editor", "onboarding/index.html")).not.toBeNull();
    });
  });

  describe("editor tab", () => {
    it("opens the design from its URL in the editor, titled by its file name", async () => {
      renderApp(indexPath);

      await waitFor(() => expect(getDesign).toHaveBeenCalledWith({ flowName: "onboarding", name: "index.html" }));
      expect(await screen.findByLabelText("HTML editor")).toHaveValue(indexDesign.content);
      expect(tab("index.html")).toBeInTheDocument();
    });

    it("opens a nested design name", async () => {
      renderApp("/web-design/onboarding/assets/logo.png");
      await waitFor(() => expect(getDesign).toHaveBeenCalledWith({ flowName: "onboarding", name: "assets/logo.png" }));
      expect(tab("logo.png")).toBeInTheDocument();
    });

    it("badges the tab while edits are unsaved and clears it on save", async () => {
      const user = userEvent.setup();
      renderApp(indexPath);

      const editor = await screen.findByLabelText("HTML editor");
      expect(hasUnsavedBadge()).toBe(false);
      await user.clear(editor);
      await user.type(editor, "<h1>Edited</h1>");
      await waitFor(() => expect(hasUnsavedBadge()).toBe(true));

      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(updateDesign).toHaveBeenCalledWith({ flowName: "onboarding", name: "index.html", content: "<h1>Edited</h1>", encoding: "utf8" }),
      );
      await waitFor(() => expect(hasUnsavedBadge()).toBe(false));
    });

    it("keeps an unsaved draft when the app is closed and reopened", async () => {
      const user = userEvent.setup();
      const first = renderApp(indexPath);
      const editor = await first.findByLabelText("HTML editor");
      await user.clear(editor);
      await user.type(editor, "<h1>Draft</h1>");
      first.unmount();

      const second = renderApp(indexPath);
      await waitFor(() => expect(second.getByLabelText("HTML editor")).toHaveValue("<h1>Draft</h1>"));
    });

    it("saves with Ctrl/⌘+S while the editor is active", async () => {
      const user = userEvent.setup();
      renderApp(indexPath);

      const editor = await screen.findByLabelText("HTML editor");
      await user.clear(editor);
      await user.type(editor, "shortcut save");
      await user.keyboard("{Control>}s{/Control}");

      await waitFor(() => expect(updateDesign).toHaveBeenCalledWith(expect.objectContaining({ name: "index.html", content: "shortcut save" })));
    });

    it("saves a copy under a new name, which opens in its own tab", async () => {
      const user = userEvent.setup();
      const app = renderApp(indexPath);

      await screen.findByLabelText("HTML editor");
      await user.click(screen.getByRole("button", { name: "Save As…" }));
      const dialog = screen.getByRole("dialog");
      const nameInput = within(dialog).getByPlaceholderText("index.html");
      await user.clear(nameInput);
      await user.type(nameInput, "index-copy.html");
      await user.click(within(dialog).getByRole("button", { name: "Save" }));

      await waitFor(() => expect(createDesign).toHaveBeenCalledWith(expect.objectContaining({ flowName: "onboarding", name: "index-copy.html" })));
      await waitFor(() => expect(app.location().pathname).toBe("/web-design/onboarding/index-copy.html"));
      await waitFor(() => expect(panel("design-editor", "onboarding/index.html")).toBeNull());
      expect(panel("design-editor", "onboarding/index-copy.html")).not.toBeNull();
    });

    it("attaches the design on screen, unsaved edits included", async () => {
      const user = userEvent.setup();
      renderApp(indexPath);

      const editor = await screen.findByLabelText("HTML editor");
      await user.clear(editor);
      await user.type(editor, "<h1>Unsaved</h1>");
      await user.click(screen.getByRole("button", { name: "Attach this design to the agent chat" }));

      await waitFor(() => expect(getAttachedDesigns()[0]?.attachment.body).toBe("<h1>Unsaved</h1>"));
    });

    it("downloads the design on screen", async () => {
      const user = userEvent.setup();
      const downloads = stubDownloads();
      try {
        renderApp(indexPath);
        await screen.findByLabelText("HTML editor");
        await user.click(screen.getByRole("button", { name: "Download this file" }));

        expect(downloads.click).toHaveBeenCalledTimes(1);
        expect(downloads.blobs[0]?.type).toBe("text/html");
        expect(downloads.blobs[0]?.size).toBe(indexDesign.content.length);
      } finally {
        downloads.restore();
      }
    });

    it("decodes binary content for download", () => {
      const blob = designBlob(logoDesign);
      expect(blob.type).toBe("image/png");
      expect(blob.size).toBe(3);
    });

    it("explains that binary assets are read-only and replaces one by upload", async () => {
      const user = userEvent.setup();
      getDesignResult = { ...logoDesign } as unknown as typeof indexDesign;
      renderApp(logoPath);

      expect(await screen.findByText("Read-only binary")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save As…" })).not.toBeInTheDocument();

      await user.upload(screen.getByLabelText("Replacement file"), new File([new Uint8Array([1, 2, 3])], "other.png", { type: "image/png" }));
      await waitFor(() => expect(updateDesign).toHaveBeenCalledWith(expect.objectContaining({ flowName: "onboarding", name: "logo.png", encoding: "base64" })));
    });

    it("shows a not-found state with a close button for a design that is gone", async () => {
      const user = userEvent.setup();
      getDesignResult = null;
      renderApp(indexPath);

      expect((await screen.findAllByText("Design not found")).length).toBeGreaterThan(0);
      await user.click(screen.getAllByRole("button", { name: "Close panel" })[0]!);
      await waitFor(() => expect(panel("design-editor", "onboarding/index.html")).toBeNull());
    });
  });

  describe("preview tab", () => {
    it("previews HTML from a sandboxed editor mirror and links out to the hosted file", async () => {
      renderApp(indexPath);

      const preview = await screen.findByTitle("Design preview");
      // HTML previews render the editor content as-is inside a sandboxed iframe (scripts run,
      // opaque origin), with a <base> tag so sibling links resolve to the hosted flow.
      expect(preview).toHaveAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-modals");
      const srcdoc = preview.getAttribute("srcdoc") ?? "";
      expect(srcdoc).toContain("<h1>Index</h1>");
      expect(srcdoc).toContain('<base href="/api/fs/posix/.tokenring/web-design/onboarding/">');

      const external = screen.getByTitle("Open hosted preview in a new tab");
      expect(external.getAttribute("href")).toContain("/api/fs/posix/.tokenring/web-design/onboarding/index.html");
    });

    it("sandboxes the hosted preview of a binary asset", async () => {
      getDesignResult = { ...logoDesign } as unknown as typeof indexDesign;
      renderApp(logoPath);

      const preview = await screen.findByTitle("Design preview");
      await waitFor(() => expect(preview.getAttribute("src")).toContain("logo.png"));
      expect(preview).toHaveAttribute("sandbox", "");
    });

    it("flags an out-of-range custom width instead of ignoring it", async () => {
      const user = userEvent.setup();
      const onChange = mock((_next: unknown) => {});
      render(<DeviceToolbar value={DEFAULT_DEVICE_SELECTION} onChange={onChange} />);

      const input = screen.getByLabelText("Custom preview width in pixels");
      await user.type(input, "50");
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByRole("alert")).toHaveTextContent("200–4096px");
      expect(onChange).not.toHaveBeenCalled();

      await user.clear(input);
      await user.type(input, "375");
      expect(input).toHaveAttribute("aria-invalid", "false");
      expect(onChange).toHaveBeenLastCalledWith({ presetId: "custom", landscape: false, customWidth: 375 });
    });

    it("holds the preview back until Run is pressed once auto-preview is off", async () => {
      const user = userEvent.setup();
      renderApp(indexPath);

      await screen.findByTitle("Design preview");
      await user.click(screen.getByRole("checkbox"));

      const editor = await screen.findByLabelText("HTML editor");
      await user.clear(editor);
      await user.type(editor, "<h1>Manual</h1>");
      expect(screen.getByTitle("Design preview").getAttribute("srcdoc")).not.toContain("<h1>Manual</h1>");

      await user.click(screen.getByRole("button", { name: "Run" }));
      await waitFor(() => expect(screen.getByTitle("Design preview").getAttribute("srcdoc")).toContain("<h1>Manual</h1>"));
    });

    it("keeps one preview per design and never remounts its iframe when the URL moves on", async () => {
      const app = renderApp(indexPath);
      const frame = await screen.findByTitle("Design preview");

      app.go("/web-design/onboarding/welcome.html");
      await waitFor(() => expect(panel("design-preview", "onboarding/welcome.html")).not.toBeNull());

      expect(panel("design-preview", "onboarding/index.html")).not.toBeNull();
      expect(frame.isConnected).toBe(true);
      expect(document.querySelectorAll('iframe[title="Design preview"]').length).toBe(2);
    });
  });
});
