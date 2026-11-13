import EmptyStateWithPrompt from "@tokenring-ai/one-frontend/components/ui/EmptyStateWithPrompt.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import { useNavigationStatePayload } from "@tokenring-ai/one-frontend/hooks/useNavigationStatePayload.ts";
import { useFlows, webDesignRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import { Frame } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import DesignSaveAsModal from "../components/DesignSaveAsModal.tsx";
import { WEB_DESIGN_ROOT } from "../lib/paths.ts";
import { useWebDesignLayoutNavigation } from "../lib/useWebDesignLayoutNavigation.ts";
import { useWebDesignAgentSession } from "../lib/webDesignStore.ts";

/**
 * The panel before a design is opened: browse existing flows or describe the
 * screens you need and a design agent writes mockups into a flow. The agent
 * belongs to the flows navigator, which publishes the session this prompt uses.
 * Closes itself once a design is opened.
 */
export default function DesignLandingPane() {
  const flows = useFlows();
  const navigate = useNavigate();
  const { openDesign } = useWebDesignLayoutNavigation();
  const session = useWebDesignAgentSession();
  const flowCount = flows.data?.flows.length ?? 0;
  // HTML handed over from another app (Files → "Open in Web Design") lands here.
  const [imported, setImported] = useState<string | null>(null);

  // One-shot payload: clear the navigation state so a later visit does not re-import it.
  useNavigationStatePayload<{ fileContent?: string }>({
    onPayload: state => {
      if (state.fileContent === undefined) return;
      setImported(state.fileContent);
    },
    clearAfterConsume: true,
    navigate,
    clearNavigateTo: WEB_DESIGN_ROOT,
  });

  const handleSaveImported = useCallback(
    async (flowName: string, name: string) => {
      try {
        const { design } = await webDesignRPCClient.createDesign({ flowName, name, content: imported ?? "" });
        setImported(null);
        void flows.mutate();
        openDesign(design.flowName, design.name);
        toastManager.success("Saved", { duration: 2000 });
      } catch (e: unknown) {
        toastManager.error(formatError(e), { duration: 4000 });
      }
    },
    [flows, imported, openDesign],
  );

  const handleStartDesign = useCallback(
    async (prompt: string): Promise<boolean> => {
      if (!session) {
        toastManager.error("Open the Design flows panel to start a design agent", { duration: 5000 });
        return false;
      }
      return session.start(prompt);
    },
    [session],
  );

  return (
    <>
      {imported !== null && (
        <DesignSaveAsModal
          title="Save File"
          flowNames={(flows.data?.flows ?? []).map(flow => flow.name)}
          initialFlow=""
          onSave={handleSaveImported}
          onClose={() => setImported(null)}
        />
      )}
      <EmptyStateWithPrompt
        icon={Frame}
        iconGradient="from-purple-500 to-violet-600"
        title="Design with agents"
        descriptionWithContent={
          <>
            Open a mockup from the <span className="font-medium text-secondary">Design Flows</span> panel to edit its HTML beside a live preview, or describe
            screens below and a design agent will write mockups into flows for you.
          </>
        }
        descriptionEmpty={
          <>
            Describe the product area and screens you need. A design agent will create a flow and save self-contained HTML mockups you can preview and refine
            here.
          </>
        }
        hasContent={flowCount > 0}
        agentRunningMessage="A design agent is running in the chat panel. Designs it writes appear in the Design Flows panel — select one to open its editor and live preview."
        hasAgent={!!session?.agentId}
        promptLabel="Design prompt"
        promptPlaceholder="e.g. Onboarding for a notes app: welcome, sign-up, empty state, first note"
        submitLabel="Start design"
        submitAriaLabel="Start design agent"
        buttonVariant="violet"
        onSubmit={handleStartDesign}
      />
    </>
  );
}
