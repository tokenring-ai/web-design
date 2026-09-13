import { useLocalStorageState } from "@tokenring-ai/one-frontend/hooks/useLocalStorageState.ts";
import { Maximize2, Monitor, RotateCw, Smartphone, Tablet } from "lucide-react";

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
  return (
    <div className="flex items-center gap-1" role="toolbar" aria-label="Preview device width">
      {DEVICE_PRESETS.map(preset => {
        const Icon = preset.icon;
        const active = value.presetId === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange({ presetId: preset.id, landscape: false, customWidth: null })}
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
          min={200}
          max={4096}
          value={value.presetId === "custom" ? (value.customWidth ?? "") : ""}
          placeholder="Custom"
          onChange={event => {
            const parsed = Number.parseInt(event.target.value, 10);
            if (Number.isFinite(parsed) && parsed >= 200 && parsed <= 4096) {
              onChange({ presetId: "custom", landscape: false, customWidth: parsed });
            } else if (event.target.value === "") {
              onChange(DEFAULT_DEVICE_SELECTION);
            }
          }}
          className="w-16 px-1.5 py-0.5 bg-transparent border border-primary rounded text-xs text-primary focus-ring"
        />
        {effectivePreviewWidth(value) !== null && <span className="shrink-0 tabular-nums">{effectivePreviewWidth(value)}px</span>}
      </label>
    </div>
  );
}
