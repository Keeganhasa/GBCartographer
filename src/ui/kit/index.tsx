/**
 * GB Cartographer's component kit: Radix primitives (radix-ui, MIT) for behavior, keyboard and focus, styled in
 * kit.css with the app's soft-card look. Thin wrappers only: each takes the app's words and icons, nothing more.
 */
import { Check, ChevronDown, X } from "lucide-react";
import { Checkbox as RCheckbox, ContextMenu as RContextMenu, Dialog as RDialog, DropdownMenu as RMenu, Popover as RPopover, Select as RSelect, Slider as RSlider, Switch as RSwitch, Tabs as RTabs, ToggleGroup, Tooltip as RTooltip } from "radix-ui";
import { forwardRef, useCallback, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import "./kit.css";

export { installTicker } from "./ticker";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

// ---- buttons ---------------------------------------------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger"; size?: "sm"; block?: boolean; icon?: ReactNode; pressed?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant, size, block, icon, pressed, className, children, ...rest }, ref) {
  return (
    <button ref={ref} type="button" aria-pressed={pressed} className={cx("k-btn", variant && `k-btn--${variant}`, size && `k-btn--${size}`, block && "k-btn--block", className)} {...rest}>
      {icon}{children}
    </button>
  );
});

/** A square button with an icon only; its label shows as a tooltip (with the key, if any). */
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string; keys?: string }>(function IconButton({ label, keys, size, variant, pressed, className, children, ...rest }, ref) {
  return (
    <Tooltip content={label} keys={keys}>
      <button ref={ref} type="button" aria-label={label} aria-pressed={pressed} className={cx("k-btn k-icon-btn", variant && `k-btn--${variant}`, size && `k-btn--${size}`, className)} {...rest}>{children}</button>
    </Tooltip>
  );
});

/** Pick one of a few (Radix toggle group): screen look, tile budget, export size. */
export function Segmented<T extends string>({ value, onChange, options, fill, label, size }: { value: T; onChange: (value: T) => void; options: { value: T; label: ReactNode; title?: string }[]; fill?: boolean; label: string; size?: "sm" }) {
  return (
    <ToggleGroup.Root type="single" aria-label={label} className={cx("k-seg", fill && "k-seg--fill")} value={value} onValueChange={(next) => next && onChange(next as T)}>
      {options.map((option) => <ToggleGroup.Item key={option.value} value={option.value} title={option.title} className={cx("k-btn", size && `k-btn--${size}`)}>{option.label}</ToggleGroup.Item>)}
    </ToggleGroup.Root>
  );
}

// ---- tabs, fields, small parts ---------------------------------------------------------------------------------

export const Tabs = { Root: RTabs.Root, Content: RTabs.Content };
export function TabList({ tabs, label }: { tabs: { value: string; label: ReactNode }[]; label: string }) {
  return <RTabs.List className="k-tabs-list" aria-label={label}>{tabs.map((tab) => <RTabs.Trigger key={tab.value} value={tab.value} className="k-tab">{tab.label}</RTabs.Trigger>)}</RTabs.List>;
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return <label className="k-field"><span className="k-label">{label}</span>{children}{hint && <span className="k-hint">{hint}</span>}</label>;
}

export function Kbd({ children }: { children: ReactNode }) { return <kbd className="k-kbd">{children}</kbd>; }
export function Chip({ tone, children, title }: { tone?: "acc" | "warn"; children: ReactNode; title?: string }) { return <span className={cx("k-chip", tone && `k-chip--${tone}`)} title={title}>{children}</span>; }

/** A count as a bar: label, the bar, "value / of". */
export function Meter({ label, value, of, tone, title }: { label: string; value: number; of: number; tone?: "warn" | "bad"; title?: string }) {
  return (
    <div className={cx("k-meter", tone && `k-meter--${tone}`)} title={title}>
      <span>{label}</span>
      <span className="k-meter-track"><span className="k-meter-fill" style={{ display: "block", width: `${Math.min(1, of ? value / of : 0) * 100}%` }} /></span>
      <span className="k-meter-count">{value}<small> / {of}</small></span>
    </div>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="k-check">
      <RCheckbox.Root className="k-checkbox" checked={checked} onCheckedChange={(next) => onChange(next === true)}><RCheckbox.Indicator><Check strokeWidth={3} /></RCheckbox.Indicator></RCheckbox.Root>
      {children}
    </label>
  );
}

export function Switch({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return <label className="k-check"><RSwitch.Root className="k-switch" checked={checked} onCheckedChange={onChange}><RSwitch.Thumb className="k-switch-thumb" /></RSwitch.Root>{children}</label>;
}

export function Slider({ value, onChange, min, max, step = 1, label }: { value: number; onChange: (value: number) => void; min: number; max: number; step?: number; label: string }) {
  return (
    <RSlider.Root className="k-slider" value={[value]} min={min} max={max} step={step} aria-label={label} onValueChange={([next]) => onChange(next)}>
      <RSlider.Track className="k-slider-track"><RSlider.Range className="k-slider-range" /></RSlider.Track>
      <RSlider.Thumb className="k-slider-thumb" />
    </RSlider.Root>
  );
}

/** A list to pick from (Radix select): a palette, a font, a tint. */
export function Select({ value, onChange, options, label, placeholder }: { value: string; onChange: (value: string) => void; options: { value: string; label: ReactNode }[]; label: string; placeholder?: string }) {
  return (
    <RSelect.Root value={value} onValueChange={onChange}>
      <RSelect.Trigger className="k-select" aria-label={label}><RSelect.Value placeholder={placeholder} /><RSelect.Icon><ChevronDown /></RSelect.Icon></RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content className="k-menu" position="popper" sideOffset={4}>
          <RSelect.Viewport>{options.map((option) => <RSelect.Item key={option.value} value={option.value} className="k-menu-item"><RSelect.ItemText>{option.label}</RSelect.ItemText></RSelect.Item>)}</RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

// ---- floating layers ------------------------------------------------------------------------------------------

export function TooltipProvider({ children }: { children: ReactNode }) { return <RTooltip.Provider delayDuration={400}>{children}</RTooltip.Provider>; }

export function Tooltip({ content, keys, children, open }: { content: ReactNode; keys?: string; children: ReactNode; open?: boolean }) {
  return (
    <RTooltip.Root open={open}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal><RTooltip.Content className="k-tooltip" sideOffset={6}>{content}{keys && <Kbd>{keys}</Kbd>}</RTooltip.Content></RTooltip.Portal>
    </RTooltip.Root>
  );
}

export type MenuEntry = { label: ReactNode; icon?: ReactNode; keys?: string; disabled?: boolean; indent?: boolean; title?: string; onSelect?: () => void } | { separator: true } | { heading: ReactNode } | { note: ReactNode };

function entries(Parts: typeof RMenu | typeof RContextMenu, items: MenuEntry[]) {
  return items.map((item, index) => "separator" in item ? <Parts.Separator key={index} className="k-menu-sep" />
    : "heading" in item ? <Parts.Label key={index} className="k-menu-label">{item.heading}</Parts.Label>
    : "note" in item ? <p key={index} className="k-menu-note">{item.note}</p>
    : <Parts.Item key={index} className={cx("k-menu-item", item.indent && "k-menu-item--indent")} title={item.title} disabled={item.disabled} onSelect={item.onSelect}>{item.icon}{item.label}{item.keys && <Kbd>{item.keys}</Kbd>}</Parts.Item>);
}

/** A menu under a button (Radix dropdown menu). */
export function Menu({ trigger, items, open, onOpenChange, align = "start" }: { trigger: ReactNode; items: MenuEntry[]; open?: boolean; onOpenChange?: (open: boolean) => void; align?: "start" | "end" }) {
  return (
    <RMenu.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <RMenu.Trigger asChild>{trigger}</RMenu.Trigger>
      <RMenu.Portal><RMenu.Content className="k-menu" sideOffset={6} align={align}>{entries(RMenu, items)}</RMenu.Content></RMenu.Portal>
    </RMenu.Root>
  );
}

/** A menu opened at a point (a right-click on a palette, a card or a selection); closing it calls onClose. */
export function MenuAt({ x, y, items, onClose, label }: { x: number; y: number; items: MenuEntry[]; onClose: () => void; label?: string }) {
  return (
    <RMenu.Root open onOpenChange={(open) => { if (!open) onClose(); }} modal={false}>
      <RMenu.Trigger asChild><span aria-hidden="true" style={{ position: "fixed", left: x, top: y, width: 1, height: 1, pointerEvents: "none" }} /></RMenu.Trigger>
      <RMenu.Portal><RMenu.Content className="k-menu k" align="start" sideOffset={2} collisionPadding={8} aria-label={label}>{entries(RMenu, items)}</RMenu.Content></RMenu.Portal>
    </RMenu.Root>
  );
}

/** A right-click menu (Radix context menu). */
export function ContextMenu({ items, children }: { items: MenuEntry[]; children: ReactNode }) {
  return (
    <RContextMenu.Root modal={false}>
      <RContextMenu.Trigger asChild>{children}</RContextMenu.Trigger>
      <RContextMenu.Portal><RContextMenu.Content className="k-menu">{entries(RContextMenu, items)}</RContextMenu.Content></RContextMenu.Portal>
    </RContextMenu.Root>
  );
}

export function Popover({ trigger, children, open }: { trigger: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <RPopover.Root open={open}>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal><RPopover.Content className="k-popover" sideOffset={6}>{children}</RPopover.Content></RPopover.Portal>
    </RPopover.Root>
  );
}

/** A window over the app (Radix dialog): title, optional subtitle, body, and footer buttons. Esc and the × close it. */
export function Dialog({ open, onOpenChange, title, sub, icon, wide, tall, footer, headExtra, children }: { open: boolean; onOpenChange?: (open: boolean) => void; title: ReactNode; sub?: ReactNode; icon?: ReactNode; wide?: boolean; tall?: boolean; footer?: ReactNode; headExtra?: ReactNode; children: ReactNode }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="k-overlay" />
        <RDialog.Content className={cx("k-dialog k", wide && "k-dialog--wide", tall && "k-dialog--tall")} aria-describedby={undefined}>
          <div className="k-dialog-head">
            {icon}
            <div className="k-stack" style={{ gap: 0 }}><RDialog.Title className="k-dialog-title">{title}</RDialog.Title>{sub && <span className="k-dialog-sub">{sub}</span>}</div>
            <span className="k-spacer" />
            {headExtra}
            <RDialog.Close asChild><button type="button" className="k-btn k-icon-btn k-btn--ghost" aria-label="Close"><X /></button></RDialog.Close>
          </div>
          <div className="k-dialog-body">{children}</div>
          {footer && <div className="k-dialog-foot">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

interface AskOptions { title: ReactNode; label: ReactNode; hint?: ReactNode; placeholder?: string; initial?: string; confirm?: string }

/**
 * Asks for one line of text in a kit dialog (window.prompt doesn't work in the desktop app). Returns the dialog to
 * render and `ask`, which resolves to the trimmed text, or null when cancelled.
 */
export function usePrompt(): [ReactNode, (options: AskOptions) => Promise<string | null>] {
  const [asking, setAsking] = useState<{ options: AskOptions; resolve: (value: string | null) => void } | null>(null);
  const [value, setValue] = useState("");
  const ask = useCallback((options: AskOptions) => new Promise<string | null>((resolve) => { setValue(options.initial ?? ""); setAsking({ options, resolve }); }), []);
  const close = (result: string | null) => { asking?.resolve(result); setAsking(null); };
  const text = value.trim();
  const element = asking && (
    <Dialog open onOpenChange={(open) => { if (!open) close(null); }} title={asking.options.title}
      footer={<><span className="k-spacer" /><Button onClick={() => close(null)}>Cancel</Button><Button variant="primary" disabled={!text} onClick={() => close(text)}>{asking.options.confirm ?? "OK"}</Button></>}>
      <form onSubmit={(event) => { event.preventDefault(); if (text) close(text); }}>
        <Field label={asking.options.label} hint={asking.options.hint}><input className="k-input" autoFocus value={value} placeholder={asking.options.placeholder} onChange={(event) => setValue(event.target.value)} /></Field>
      </form>
    </Dialog>
  );
  return [element, ask];
}
