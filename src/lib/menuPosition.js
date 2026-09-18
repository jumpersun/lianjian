const DEFAULT_MARGIN = 12;
const DEFAULT_GAP = 8;
const MAX_MENU_HEIGHT = 360;
const MIN_USEFUL_HEIGHT = 144;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function getMenuPosition({
  triggerRect,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  bottomInset = 0,
  margin = DEFAULT_MARGIN,
  gap = DEFAULT_GAP,
}) {
  const usableViewportHeight = viewportHeight - bottomInset;
  const width = Math.min(Math.max(triggerRect.width, menuWidth), viewportWidth - margin * 2);
  const left = clamp(triggerRect.left, margin, viewportWidth - width - margin);
  const spaceBelow = usableViewportHeight - triggerRect.bottom - gap - margin;
  const spaceAbove = triggerRect.top - gap - margin;
  const openAbove = spaceBelow < Math.min(menuHeight, MIN_USEFUL_HEIGHT) && spaceAbove > spaceBelow;
  const availableHeight = Math.max(openAbove ? spaceAbove : spaceBelow, MIN_USEFUL_HEIGHT);
  const maxHeight = Math.min(MAX_MENU_HEIGHT, availableHeight);
  const renderedHeight = Math.min(menuHeight, maxHeight);
  const top = openAbove
    ? Math.max(margin, triggerRect.top - gap - renderedHeight)
    : Math.min(triggerRect.bottom + gap, usableViewportHeight - renderedHeight - margin);

  return { left, maxHeight, top, width };
}
