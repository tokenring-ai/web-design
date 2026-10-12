import { useLocalStorageState } from "@tokenring-ai/one-frontend/hooks/useLocalStorageState.ts";
import { Maximize2, Monitor, RotateCw, Smartphone, Tablet } from "lucide-react";
import { useEffect, useState } from "react";

export interface DevicePreset {
  id: string;
  label: string;
  /** [portrait, landscape] viewport widths; a single width ignores orientation. */
  widths: [number, number] | number;
  icon: typeof Monitor;
}

const DEVICE_PRESETS: DevicePreset[] = [
  { id: "mobile", label: "Mobile", widths: [375, 667], icon: Smartphone },
  { id: "mobile-l", label: "Mobile L", widths: [430, 932], icon: Smartphone },
  { id: "tablet", label: "Tablet", widths: [768, 1024], icon: Tablet },
  { id: "desktop", label: "Desktop", widths: 1024, icon: Monitor },
  { id: "full", label: "Full width", widths: 0, icon: Maximize2 },
];

export interface DeviceSelection {
  presetId: string;
  landscape: boolean;
  customWidth: number | null;
}

export const MIN_CUSTOM_WIDTH = 200;
export const MAX_CUSTOM_WIDTH = 4096;

export const DEFAULT_DEVICE_SELECTION: DeviceSelection = { presetId: "full", landscape: false, customWidth: null };

function isSelection(value: unknown): value is DeviceSelection {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as DeviceSelection).presetId === "string" &&
    typeof (value as DeviceSelection).landscape === "boolean"
  );
}

/** Preview iframe width for a selection, or null for full width. */
export function effectivePreviewWidth(selection: DeviceSelection): number | null {
  if (selection.presetId === "custom") return selection.customWidth;
  const preset = DEVICE_PRESETS.find(candidate => candidate.id === selection.presetId);
  if (!preset) return null;
  if (typeof preset.widths === "number") return preset.widths === 0 ? null : preset.widths;
  return selection.landscape ? preset.widths[1] : preset.widths[0];
}

const orientationAware = (selection: DeviceSelection) => selection.presetId !== "full" && selection.presetId !== "desktop";

/** Storage hook for the preview device selection (persists the last-used device per app). */
export function useDeviceSelection(): [DeviceSelection, (next: DeviceSelection) => void] {
  return useLocalStorageState<DeviceSelection>("webdesign:device", DEFAULT_DEVICE_SELECTION, {
    deserialize: raw => {
      try {
        const parsed: unknown = JSON.parse(raw);
        return isSelection(parsed) ? parsed : DEFAULT_DEVICE_SELECTION;
      } catch {
        return DEFAULT_DEVICE_SELECTION;
      }
    },
  });
}

/** Device-frame presets above the preview pane. State lives in the parent via {@link useDeviceSelection}. */
export default function DeviceToolbar({ value, onChange }: { value: DeviceSelection; onChange: (next: DeviceSelection) => void }) {
  const committedText = value.presetId === "custom" && value.customWidth !== null ? String(value.customWidth) : "";
  // The field keeps what the user typed, so an out-of-range width is visible (and flagged) instead of vanishing.
  const [widthText, setWidthText] = useState(committedText);
  useEffect(() => setWidthText(committedText), [committedText]);
  const parsedWidth = Number.parseInt(widthText, 10);
  const widthOutOfRange = widthText !== "" && !(Number.isFinite(parsedWidth) && parsedWidth >= MIN_CUSTOM_WIDTH && parsedWidth <= MAX_CUSTOM_WIDTH);
  const rangeHint = `Custom width must be ${MIN_CUSTOM_WIDTH}–${MAX_CUSTOM_WIDTH}px`;

  return (
    <div className="flex items-center gap-1" role="toolbar" aria-label="Preview device width">
      {DEVICE_PRESETS.map(preset => {
        const Icon = preset.icon;
        const active = value.presetId === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => {
              setWidthText("");
              onChange({ presetId: preset.id, landscape: false, customWidth: null });
            }}
            title={preset.label}
            aria-label={preset.label}
            aria-pressed={active}
            className={`p-1 rounded transition-colors cursor-pointer focus-ring ${
              active ? "bg-accent-muted text-accent" : "text-muted hover:text-primary hover:bg-hover"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        );
      })}
      {orientationAware(value) && (
        <button
          type="button"
          onClick={() => onChange({ ...value, landscape: !value.landscape })}
          title={value.landscape ? "Landscape" : "Portrait"}
          aria-label="Toggle portrait or landscape width"
          aria-pressed={value.landscape}
          className="p-1 text-muted hover:text-primary hover:bg-hover rounded transition-colors cursor-pointer focus-ring"
        >
          <RotateCw className="w-3 h-3.5" />
        </button>
      )}
      <label className="flex items-center gap-1 text-xs text-muted">
        <span className="sr-only">Custom preview width in pixels</span>
        <input
          type="number"
          min={MIN_CUSTOM_WIDTH}
          max={MAX_CUSTOM_WIDTH}
          value={widthText}
          placeholder="Custom"
          aria-invalid={widthOutOfRange}
          title={widthOutOfRange ? rangeHint : `Custom width (${MIN_CUSTOM_WIDTH}–${MAX_CUSTOM_WIDTH}px)`}
          onChange={event => {
            const text = event.target.value;
            setWidthText(text);
            const parsed = Number.parseInt(text, 10);
            if (Number.isFinite(parsed) && parsed >= MIN_CUSTOM_WIDTH && parsed <= MAX_CUSTOM_WIDTH) {
              onChange({ presetId: "custom", landscape: false, customWidth: parsed });
            } else if (text === "" && value.presetId === "custom") {
              onChange(DEFAULT_DEVICE_SELECTION);
            }
          }}
          className={`w-16 px-1.5 py-0.5 bg-transparent border rounded text-xs text-primary focus-ring ${widthOutOfRange ? "border-red-500" : "border-primary"}`}
        />
        {widthOutOfRange ? (
          <span role="alert" className="shrink-0 text-red-500">
            {MIN_CUSTOM_WIDTH}–{MAX_CUSTOM_WIDTH}px
          </span>
        ) : (
          effectivePreviewWidth(value) !== null && <span className="shrink-0 tabular-nums">{effectivePreviewWidth(value)}px</span>
        )}
      </label>
    </div>
  );
}
