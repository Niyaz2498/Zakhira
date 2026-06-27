import { useState, useRef, useEffect } from "react";

// ── Icons ────────────────────────────────────────────────────────────────────

const ChevronDown = ({ color, open }: { color: string; open: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"
    style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0, display: "block" }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const CalendarIcon = ({ color }: { color: string }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ display: "block" }}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

// ── CustomSelect ─────────────────────────────────────────────────────────────

export interface SelectOption { value: string; label: string }

export function CustomSelect({ value, onChange, options, placeholder = "Select…", tokens }: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  tokens: any;
}) {
  const [open, setOpen] = useState(false);
  const [hoverItem, setHoverItem] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", padding: "9px 38px 9px 12px", cursor: "pointer",
          backgroundColor: tokens.bgInput,
          border: `1px solid ${open ? tokens.accent : tokens.border}`,
          borderRadius: 8, color: selected ? tokens.textPrimary : tokens.textTertiary,
          fontSize: 14, textAlign: "left", position: "relative",
          boxShadow: open ? `0 0 0 3px ${tokens.accent}22` : "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}
      >
        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.label ?? placeholder}
        </span>
        <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center" }}>
          <ChevronDown color={tokens.textTertiary} open={open} />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0,
          backgroundColor: tokens.bgCard, border: `1px solid ${tokens.borderStrong}`,
          borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.2)",
          zIndex: 2000, maxHeight: 230, overflowY: "auto", padding: "4px",
        }}>
          {options.map((opt) => {
            const isSelected = opt.value === value;
            const isHovered = hoverItem === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                onMouseEnter={() => setHoverItem(opt.value)}
                onMouseLeave={() => setHoverItem(null)}
                style={{
                  width: "100%", padding: "9px 12px", textAlign: "left", borderRadius: 7,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                  fontSize: 14, fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? tokens.accent : tokens.textPrimary,
                  backgroundColor: isSelected
                    ? tokens.accent + "18"
                    : isHovered
                    ? tokens.border
                    : "transparent",
                  transition: "background-color 0.1s",
                }}
              >
                <span style={{ width: 14, flexShrink: 0, fontSize: 11, color: tokens.accent }}>
                  {isSelected ? "✓" : ""}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── DateInput ────────────────────────────────────────────────────────────────

export function DateInput({ value, onChange, tokens }: {
  value: string;
  onChange: (v: string) => void;
  tokens: any;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: "9px 38px 9px 12px",
          backgroundColor: tokens.bgInput,
          border: `1px solid ${focused ? tokens.accent : tokens.border}`,
          borderRadius: 8, color: value ? tokens.textPrimary : tokens.textTertiary,
          fontSize: 14, outline: "none", boxSizing: "border-box" as const,
          colorScheme: "dark" as any, cursor: "pointer",
          fontFamily: "system-ui, sans-serif",
          boxShadow: focused ? `0 0 0 3px ${tokens.accent}22` : "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}
      />
      <span
        onClick={() => (ref.current as any)?.showPicker?.()}
        style={{
          position: "absolute", right: 11, top: "50%",
          transform: "translateY(-50%)", display: "flex", alignItems: "center",
          pointerEvents: "none",
        }}
      >
        <CalendarIcon color={focused ? tokens.accent : tokens.textTertiary} />
      </span>
    </div>
  );
}
