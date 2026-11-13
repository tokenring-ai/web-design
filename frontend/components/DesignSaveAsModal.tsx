import SaveAsModal, { type SaveAsModalProps } from "@tokenring-ai/one-frontend/components/ui/SaveAsModal.tsx";
import { FILE_NAME_PATTERN, FLOW_NAME_PATTERN } from "../lib/paths.ts";

const FLOW_ERROR = "Use letters, numbers, hyphens, and underscores only, starting with a letter or number.";
const FILE_ERROR = "Use letters, numbers, dots, hyphens, and underscores only; subfolders are allowed (assets/logo.png).";

/** The "flow + file name" dialog the navigator, the landing tab and the editor share. */
export default function DesignSaveAsModal({
  flowNames,
  initialFlow,
  initialName = "index.html",
  ...rest
}: Omit<SaveAsModalProps, "containerField" | "itemField"> & { flowNames: readonly string[]; initialFlow: string; initialName?: string }) {
  return (
    <SaveAsModal
      {...rest}
      containerField={{
        label: "Flow",
        placeholder: "onboarding",
        initialValue: initialFlow,
        pattern: FLOW_NAME_PATTERN,
        validationError: FLOW_ERROR,
        options: flowNames.map(value => ({ value })),
      }}
      itemField={{
        label: "File name",
        placeholder: "index.html",
        initialValue: initialName,
        pattern: FILE_NAME_PATTERN,
        validationError: FILE_ERROR,
        options: [],
        autoFocus: true,
        selectOnFocus: true,
      }}
    />
  );
}
