"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface ThemedSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ThemedSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "className"> {
  variant?: "base" | "surface";
  containerClassName?: string;
  selectClassName?: string;
  className?: string;
  icon?: React.ReactNode;
}

function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return "";
}

function parseOptions(children: React.ReactNode): ThemedSelectOption[] {
  const options: ThemedSelectOption[] = [];

  const visit = (nodes: React.ReactNode) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return;

      if (child.type === React.Fragment) {
        visit((child.props as { children?: React.ReactNode }).children);
        return;
      }

      if (child.type === "optgroup") {
        visit((child.props as { children?: React.ReactNode }).children);
        return;
      }

      if (child.type === "option") {
        const optProps = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
        const label = extractText(optProps.children).trim();
        const val = optProps.value !== undefined ? String(optProps.value) : label;
        options.push({
          value: val,
          label: label || val,
          disabled: Boolean(optProps.disabled),
        });
        return;
      }

      const maybeChildren = (child.props as { children?: React.ReactNode } | undefined)?.children;
      if (maybeChildren) {
        visit(maybeChildren);
      }
    });
  };

  visit(children);
  return options;
}

/**
 * Accessible custom portal dropdown replacing native <select> controls across all
 * pages and modals so browsers never render mismatched or duplicate native arrows.
 */
export function ThemedSelect({
  variant = "base",
  containerClassName = "",
  selectClassName = "",
  className = "",
  icon,
  value,
  defaultValue,
  onChange,
  disabled = false,
  id,
  name,
  title,
  "aria-label": ariaLabel,
  children,
}: ThemedSelectProps) {
  const options = useMemo(() => parseOptions(children), [children]);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string>(() => {
    if (defaultValue !== undefined) return String(defaultValue);
    return options[0]?.value ?? "";
  });

  const currentValue = isControlled ? String(value ?? "") : internalValue;
  const selectedIndex = useMemo(
    () => options.findIndex((opt) => opt.value === currentValue),
    [options, currentValue]
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : options[0];

  const [open, setOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState<number>(Math.max(selectedIndex, 0));
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    openUpward: boolean;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const margin = 12;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
    const availableHeight = openUpward ? spaceAbove - gap : spaceBelow - gap;
    const maxHeight = Math.max(120, Math.min(256, availableHeight));
    const width = Math.max(rect.width, 120);
    const clampedLeft = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - width - margin)
    );

    setCoords({
      top: openUpward ? rect.top - gap : rect.bottom + gap,
      left: clampedLeft,
      width,
      maxHeight,
      openUpward,
    });
  }, []);

  const commitValue = useCallback(
    (opt: ThemedSelectOption) => {
      if (opt.disabled) return;
      if (!isControlled) {
        setInternalValue(opt.value);
      }
      if (onChange) {
        const syntheticEvent = {
          target: { value: opt.value, id: id ?? "", name: name ?? "" },
          currentTarget: { value: opt.value, id: id ?? "", name: name ?? "" },
        } as unknown as React.ChangeEvent<HTMLSelectElement>;
        onChange(syntheticEvent);
      }
      setOpen(false);
      triggerRef.current?.focus();
    },
    [id, isControlled, name, onChange]
  );

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const onScrollOrResize = (e: Event) => {
      if (e.type === "scroll" && menuRef.current && e.target instanceof Node) {
        if (menuRef.current.contains(e.target)) {
          return;
        }
      }
      updatePosition();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open || !menuRef.current) return;
    const activeEl = menuRef.current.querySelector<HTMLElement>('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [open]);

  const moveHighlight = (delta: number) => {
    if (options.length === 0) return;
    let next = highlightedIdx;
    for (let i = 0; i < options.length; i++) {
      next = (next + delta + options.length) % options.length;
      if (!options[next]?.disabled) {
        setHighlightedIdx(next);
        const item = menuRef.current?.querySelector<HTMLElement>(
          `[data-index="${next}"]`
        );
        item?.scrollIntoView({ block: "nearest" });
        return;
      }
    }
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setHighlightedIdx(Math.max(selectedIndex, 0));
        setOpen(true);
      } else {
        moveHighlight(1);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setHighlightedIdx(Math.max(selectedIndex, 0));
        setOpen(true);
      } else {
        moveHighlight(-1);
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) {
        setHighlightedIdx(Math.max(selectedIndex, 0));
        setOpen(true);
      } else if (options[highlightedIdx] && !options[highlightedIdx].disabled) {
        commitValue(options[highlightedIdx]);
      }
    } else if (e.key === "Tab" && open) {
      setOpen(false);
    }
  };

  const bgClass =
    variant === "surface"
      ? "bg-[var(--bg-surface)]"
      : "bg-[var(--bg-base)]";

  return (
    <div className={`relative w-full ${containerClassName}`.trim()}>
      {name && <input type="hidden" name={name} value={currentValue} />}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (!open) {
            setHighlightedIdx(Math.max(selectedIndex, 0));
          }
          setOpen((prev) => !prev);
        }}
        onKeyDown={handleTriggerKeyDown}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-xs border border-[var(--border-hairline)] ${bgClass} text-[var(--text-primary)] font-sans focus:outline-hidden focus:border-[var(--accent-primary)] hover:border-[var(--text-muted)] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className} ${selectClassName}`.trim()}
      >
        <span className="truncate text-left flex-1">
          {selectedOption?.label ?? ""}
        </span>
        {icon ? (
          <span className="shrink-0 flex items-center pointer-events-none">
            {icon}
          </span>
        ) : (
          <ChevronDown
            aria-hidden="true"
            className={`w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 transition-transform duration-150 ${
              open ? "rotate-180 text-[var(--accent-primary)]" : ""
            }`}
          />
        )}
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            style={{
              position: "fixed",
              left: `${coords.left}px`,
              top: `${coords.top}px`,
              width: `${coords.width}px`,
              maxHeight: `${coords.maxHeight}px`,
              transform: coords.openUpward ? "translateY(-100%)" : undefined,
            }}
            className="z-[250] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] shadow-2xl overflow-y-auto py-1"
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === currentValue;
              const isHighlighted = idx === highlightedIdx;
              return (
                <button
                  key={`${opt.value}-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-active={isSelected ? "true" : undefined}
                  data-index={idx}
                  disabled={opt.disabled}
                  onMouseEnter={() => {
                    if (!opt.disabled) setHighlightedIdx(idx);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitValue(opt);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-xs font-sans flex items-center justify-between gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isSelected
                      ? "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] font-medium"
                      : isHighlighted
                      ? "bg-[var(--bg-surface)] text-[var(--text-primary)]"
                      : "text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <Check
                      aria-hidden="true"
                      className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0"
                    />
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
