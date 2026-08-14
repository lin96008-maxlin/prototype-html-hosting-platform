"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";

export interface PlatformSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  options: PlatformSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  placement?: "bottom" | "top";
}

interface PanelPosition {
  top: number;
  left: number;
  width: number;
}

function useFloatingPanel(open: boolean, placement: "bottom" | "top" = "bottom") {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PanelPosition>({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setPosition({ top: placement === "top" ? rect.top - 4 : rect.bottom + 4, left: rect.left, width: rect.width });
    };
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        triggerRef.current?.dispatchEvent(new CustomEvent("ui-select-close"));
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      triggerRef.current?.dispatchEvent(new CustomEvent("ui-select-close"));
      triggerRef.current?.focus();
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, placement]);

  return { triggerRef, panelRef, position };
}

export function PlatformSelect({
  value,
  options,
  onChange,
  placeholder = "请选择",
  clearable = false,
  disabled = false,
  className = "",
  placement = "bottom",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const panelId = useId();
  const { triggerRef, panelRef, position } = useFloatingPanel(open, placement);
  const selected = options.find((option) => option.value === value);

  function enabledIndexes() {
    return options.flatMap((option, index) => option.disabled ? [] : [index]);
  }

  function openPanel(preferLast = false) {
    const enabled = enabledIndexes();
    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : preferLast ? enabled.at(-1) ?? -1 : enabled[0] ?? -1);
    setOpen(true);
  }

  function moveActive(direction: 1 | -1) {
    const enabled = enabledIndexes();
    if (!enabled.length) return;
    const position = enabled.indexOf(activeIndex);
    const nextPosition = position < 0
      ? direction > 0 ? 0 : enabled.length - 1
      : (position + direction + enabled.length) % enabled.length;
    setActiveIndex(enabled[nextPosition]);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  }

  useEffect(() => {
    const trigger = triggerRef.current;
    const close = () => setOpen(false);
    trigger?.addEventListener("ui-select-close", close);
    return () => trigger?.removeEventListener("ui-select-close", close);
  }, [triggerRef]);

  return (
    <div className={`platform-select${open ? " is-open" : ""}${value ? " has-value" : ""}${disabled ? " is-disabled" : ""} ${className}`.trim()}>
      <button
        ref={triggerRef}
        className={`platform-select-trigger${value ? " has-value" : ""}`}
        type="button"
        role="combobox"
        aria-controls={panelId}
        aria-expanded={open}
        aria-activedescendant={open && activeIndex >= 0 ? `${panelId}-option-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => open ? setOpen(false) : openPanel()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) openPanel(event.key === "ArrowUp");
            else moveActive(event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            choose(activeIndex);
          } else if (event.key === "Home" && open) {
            event.preventDefault();
            setActiveIndex(enabledIndexes()[0] ?? -1);
          } else if (event.key === "End" && open) {
            event.preventDefault();
            setActiveIndex(enabledIndexes().at(-1) ?? -1);
          }
        }}
      >
        <span>{selected?.label ?? placeholder}</span>
        {clearable && value ? (
          <i
            className="platform-select-clear"
            title="清空选择"
            onClick={(event) => {
              event.stopPropagation();
              onChange("");
              setOpen(false);
            }}
          >
            ×
          </i>
        ) : null}
        <ChevronDown className="platform-select-chevron" size={16} />
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              className="platform-select-panel"
              role="listbox"
              style={{ top: position.top, left: position.left, minWidth: position.width, transform: placement === "top" ? "translateY(-100%)" : undefined }}
            >
              {options.map((option, index) => (
                <button
                  id={`${panelId}-option-${index}`}
                  className={`platform-select-option${option.value === value ? " is-selected" : ""}${activeIndex === index ? " is-active" : ""}`}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  disabled={option.disabled}
                  key={option.value}
                  onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                  onClick={() => choose(index)}
                >
                  {option.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export interface ZTreeNode {
  id: string;
  label: string;
  parentId: string | null;
}

interface TreeSelectProps {
  value: string;
  nodes: ZTreeNode[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
}

export function PlatformTreeSelect({
  value,
  nodes,
  onChange,
  placeholder = "请选择",
  emptyLabel,
  disabled = false,
}: TreeSelectProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const [expanded, setExpanded] = useState(() => new Set(nodes.map((node) => node.id)));
  const { triggerRef, panelRef, position } = useFloatingPanel(open);

  useEffect(() => {
    const trigger = triggerRef.current;
    const close = () => setOpen(false);
    trigger?.addEventListener("ui-select-close", close);
    return () => trigger?.removeEventListener("ui-select-close", close);
  }, [triggerRef]);

  const paths = useMemo(() => {
    const map = new Map(nodes.map((node) => [node.id, node]));
    return new Map(nodes.map((node) => {
      const labels = [node.label];
      let parent = node.parentId ? map.get(node.parentId) : undefined;
      while (parent) {
        labels.unshift(parent.label);
        parent = parent.parentId ? map.get(parent.parentId) : undefined;
      }
      return [node.id, labels.join(" / ")];
    }));
  }, [nodes]);

  function renderNodes(parentId: string | null, depth = 0): React.ReactNode {
    const children = nodes.filter((node) =>
      node.parentId === parentId
      || (parentId === null && node.parentId && !nodes.some((candidate) => candidate.id === node.parentId)),
    );
    return children.map((node) => {
      const hasChildren = nodes.some((candidate) => candidate.parentId === node.id);
      return (
        <div key={node.id}>
          <div className={`platform-tree-option${node.id === value ? " is-selected" : ""}`} style={{ paddingLeft: 8 + depth * 20 }}>
            <button
              className={`platform-tree-toggle${expanded.has(node.id) ? " is-open" : ""}`}
              type="button"
              aria-label={hasChildren ? "展开或收起" : undefined}
              disabled={!hasChildren}
              onClick={() => setExpanded((current) => {
                const next = new Set(current);
                if (next.has(node.id)) next.delete(node.id);
                else next.add(node.id);
                return next;
              })}
            >
              <ChevronRight size={12} />
            </button>
            <button
              className="platform-tree-label"
              type="button"
              onClick={() => {
                onChange(node.id);
                setOpen(false);
              }}
            >
              <Folder size={14} />
              <span>{node.label}</span>
            </button>
          </div>
          {hasChildren && expanded.has(node.id) ? renderNodes(node.id, depth + 1) : null}
        </div>
      );
    });
  }

  return (
    <div className={`platform-select${open ? " is-open" : ""}${value ? " has-value" : ""}${disabled ? " is-disabled" : ""}`}>
      <button
        ref={triggerRef}
        className={`platform-select-trigger${value ? " has-value" : ""}`}
        type="button"
        role="combobox"
        aria-controls={panelId}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{value ? paths.get(value) ?? placeholder : emptyLabel ?? placeholder}</span>
        <ChevronDown className="platform-select-chevron" size={16} />
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              className="platform-select-panel platform-tree-panel"
              role="tree"
              style={{ top: position.top, left: position.left, minWidth: position.width }}
            >
              {emptyLabel ? (
                <button
                  className={`platform-select-option${!value ? " is-selected" : ""}`}
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  {emptyLabel}
                </button>
              ) : null}
              {renderNodes(null)}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
