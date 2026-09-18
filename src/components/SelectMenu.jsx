import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getMenuPosition } from "../lib/menuPosition.js";

function normalizeOptions(options, suffix) {
  return options.map((option) => {
    if (option && typeof option === "object" && "value" in option) return option;
    return { label: `${option}${suffix}`, value: option };
  });
}

function mobileNavigationInset() {
  return window.matchMedia("(max-width: 720px)").matches ? 84 : 0;
}

export function SelectMenu({ value, options, onChange, label, suffix = "", variant = "inline", disabled = false }) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const optionRefs = useRef([]);
  const menuId = useId().replaceAll(":", "");
  const normalizedOptions = useMemo(() => normalizeOptions(options, suffix), [options, suffix]);
  const selectedIndex = Math.max(
    0,
    normalizedOptions.findIndex((option) => Object.is(option.value, value) || String(option.value) === String(value)),
  );
  const selectedOption = normalizedOptions[selectedIndex];
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [position, setPosition] = useState(null);

  function closeMenu({ restoreFocus = false } = {}) {
    setIsOpen(false);
    setPosition(null);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function openMenu(startIndex = selectedIndex) {
    if (disabled) return;
    setActiveIndex(startIndex);
    setIsOpen(true);
  }

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !menuRef.current) return undefined;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current;
    setPosition(
      getMenuPosition({
        triggerRect,
        menuWidth: menu.scrollWidth,
        menuHeight: menu.scrollHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        bottomInset: mobileNavigationInset(),
      }),
    );
    const focusFrame = window.requestAnimationFrame(() => optionRefs.current[activeIndex]?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function updatePosition() {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!triggerRect || !menu) return;
      setPosition(
        getMenuPosition({
          triggerRect,
          menuWidth: menu.scrollWidth,
          menuHeight: menu.scrollHeight,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          bottomInset: mobileNavigationInset(),
        }),
      );
    }

    function handlePointerDown(event) {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      closeMenu();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  function handleTriggerKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(event.key === "ArrowUp" ? normalizedOptions.length - 1 : selectedIndex);
    }
  }

  function handleOptionKeyDown(event, index) {
    let nextIndex = null;
    if (event.key === "ArrowDown") nextIndex = (index + 1) % normalizedOptions.length;
    if (event.key === "ArrowUp") nextIndex = (index - 1 + normalizedOptions.length) % normalizedOptions.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = normalizedOptions.length - 1;
    if (nextIndex !== null) {
      event.preventDefault();
      setActiveIndex(nextIndex);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu({ restoreFocus: true });
    } else if (event.key === "Tab") {
      closeMenu();
    }
  }

  function selectOption(option) {
    onChange(option.value);
    closeMenu({ restoreFocus: true });
  }

  const menu = isOpen
    ? createPortal(
        <div
          aria-label={label}
          className={`select-menu-popover select-menu-popover--${variant}`}
          id={menuId}
          ref={menuRef}
          role="listbox"
          style={
            position
              ? { left: position.left, maxHeight: position.maxHeight, top: position.top, width: position.width }
              : { left: 0, top: 0, visibility: "hidden" }
          }
        >
          {normalizedOptions.map((option, index) => (
            <button
              aria-selected={index === selectedIndex}
              className="select-menu-option"
              id={`${menuId}-option-${index}`}
              key={`${String(option.value)}-${index}`}
              onClick={() => selectOption(option)}
              onFocus={() => setActiveIndex(index)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              role="option"
              tabIndex={index === activeIndex ? 0 : -1}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>,
        document.body,
      )
    : null;

  return (
    <span className={`select-menu select-menu--${variant}`}>
      <button
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`${label}，当前为${selectedOption?.label || "未选择"}`}
        className={`select-menu-trigger select-menu-trigger--${variant}${isOpen ? " is-open" : ""}`}
        disabled={disabled}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span>{selectedOption?.label}</span>
        <span className="select-menu-arrow" aria-hidden="true" />
      </button>
      {menu}
    </span>
  );
}
