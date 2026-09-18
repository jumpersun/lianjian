import assert from "node:assert/strict";
import test from "node:test";
import { getMenuPosition } from "../src/lib/menuPosition.js";

test("下拉菜单不会溢出视口右侧", () => {
  const position = getMenuPosition({
    triggerRect: { bottom: 120, left: 330, top: 80, width: 48 },
    menuWidth: 220,
    menuHeight: 180,
    viewportWidth: 390,
    viewportHeight: 844,
  });
  assert.equal(position.left, 158);
  assert.equal(position.width, 220);
});

test("底部空间不足时菜单向上展开", () => {
  const position = getMenuPosition({
    triggerRect: { bottom: 810, left: 20, top: 770, width: 120 },
    menuWidth: 220,
    menuHeight: 240,
    viewportWidth: 390,
    viewportHeight: 844,
  });
  assert.equal(position.top, 522);
  assert.equal(position.maxHeight, 360);
});

test("超宽菜单会收窄到手机安全边距内", () => {
  const position = getMenuPosition({
    triggerRect: { bottom: 120, left: 16, top: 80, width: 160 },
    menuWidth: 520,
    menuHeight: 180,
    viewportWidth: 320,
    viewportHeight: 640,
  });
  assert.deepEqual({ left: position.left, width: position.width }, { left: 12, width: 296 });
});

test("手机长菜单会避开底部固定导航", () => {
  const position = getMenuPosition({
    triggerRect: { bottom: 508, left: 16, top: 470, width: 140 },
    menuWidth: 160,
    menuHeight: 1200,
    viewportWidth: 390,
    viewportHeight: 844,
    bottomInset: 84,
  });
  assert.equal(position.top + position.maxHeight <= 748, true);
});
