import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { DEFAULT_PROFILE, generatePlan } from "../src/lib/planner.js";
import { createProductState, productStateReducer as reduce, loadProductState, persistProductState } from "../src/lib/productState.js";
import { exportBackup, parseBackup } from "../src/lib/backup.js";
import { feedbackProposal } from "../src/lib/adjustments.js";

const exercises = JSON.parse(await readFile(new URL("../public/data/exercises.json", import.meta.url), "utf8"));
const makeState = () => reduce(createProductState(), { type: "plan.replace", plan: generatePlan(DEFAULT_PROFILE, exercises) });
const start = (state, day = state.nextDay) => reduce(state, { type: "workout.start", dayIndex: day, now: 1000 + day });
const finish = (state) => reduce(state, { type: "workout.complete", now: 2000, proposal: feedbackProposal(state.plan, state.activeWorkout, state.profile) });
function roundTrip(state) {
  let value;
  const storage = { setItem: (_, next) => { value = next; }, getItem: () => value };
  assert.equal(persistProductState(storage, state).ok, true);
  return loadProductState(storage);
}

test("查看其他训练日不改变下次顺序，连续两场记录后按 A B C 轮转", () => {
  let state = makeState();
  state = reduce(state, { type: "plan.day", dayIndex: 2 });
  assert.equal(state.nextDay, 0);
  state = roundTrip(finish(start(state)));
  assert.equal(state.nextDay, 1);
  state = roundTrip(finish(start(state)));
  assert.equal(state.nextDay, 2);
  assert.equal(state.workoutHistory.length, 2);
  assert.equal(state.workoutHistory[0].sessionDay, 2);
  assert.equal(state.workoutHistory[1].sessionDay, 1);
});

test("进行中快照与实际次数可以刷新恢复，历史不随计划编辑改变", () => {
  let state = start(makeState());
  const title = state.activeWorkout.sessionSnapshot.actions[0].title;
  state = reduce(state, { type: "workout.actual", actionIndex: 0, setIndex: 0, field: "amount", value: "9" });
  state = reduce(state, { type: "workout.toggleSet", actionIndex: 0, setIndex: 0, restSeconds: 45, now: 1200 });
  state = roundTrip(state);
  assert.equal(state.activeWorkout.actualSets[0][0].amount, 9);
  assert.equal(state.activeWorkout.restEndsAt, 46200);
  state = finish(state);
  state = reduce(state, { type: "plan.action.remove", dayIndex: 0, actionIndex: 0 });
  assert.equal(state.workoutHistory[0].sessionSnapshot.actions[0].title, title);
  assert.equal(state.workoutHistory[0].actualSets[0][0].amount, 9);
});

test("训练中即使查看另一天，替换只改本次快照而非其他日或原计划", () => {
  let state = start(makeState());
  const before = structuredClone(state.plan);
  state = reduce(state, { type: "plan.day", dayIndex: 2 });
  const replacement = state.plan.sessions[1].actions[0];
  state = reduce(state, { type: "workout.action.replace", actionIndex: 0, planAction: replacement });
  assert.deepEqual(state.plan, before);
  assert.equal(state.activeWorkout.sessionSnapshot.actions[0].title, replacement.title);
});

test("已经完成的组次不能通过替换被清空", () => {
  let state = start(makeState());
  state = reduce(state, { type: "workout.toggleSet", actionIndex: 0, setIndex: 0, restSeconds: 45, now: 1200 });
  assert.equal(reduce(state, { type: "workout.action.replace", actionIndex: 0, planAction: state.plan.sessions[1].actions[0] }), state);
});

test("调整需要确认，接受增加修订号，历史记录采用原因", () => {
  let state = start(makeState());
  const planId = state.plan.id;
  const revision = state.plan.revision;
  state = reduce(state, { type: "workout.feedback", feedback: { effort: 9 } });
  state = finish(state);
  assert.equal(state.plan.sessions[0].actions[0].sets, 2);
  assert.ok(state.pendingAdjustment.changes.length > 0);
  state = reduce(state, { type: "adjustment.accept" });
  assert.equal(state.plan.id, planId);
  assert.equal(state.plan.revision, revision + 1);
  assert.equal(state.plan.sessions[0].actions[0].sets, 1);
  assert.equal(state.workoutHistory[0].adjustmentStatus, "已采用");
});

test("旧建议和迟到的 AI 结果不能覆盖编辑后的计划或用户放弃的建议", () => {
  let state = finish(start(makeState()));
  const proposal = state.pendingAdjustment;
  state = reduce(state, { type: "plan.action.remove", dayIndex: 0, actionIndex: 0 });
  assert.equal(reduce(state, { type: "adjustment.accept" }), state);
  assert.equal(reduce(state, { type: "adjustment.propose", proposal }), state);
  state = reduce(state, { type: "adjustment.dismiss" });
  assert.equal(reduce(state, { type: "adjustment.propose", proposal }), state);
});

test("不适反馈关联动作，建议移除相关动作但不自动执行", () => {
  let state = start(makeState());
  const painfulId = state.activeWorkout.sessionSnapshot.actions[0].exercise.id;
  state = reduce(state, { type: "workout.pain", actionIndex: 0, pain: "手腕不适" });
  assert.equal(state.activeWorkout.phase, "feedback");
  state = finish(state);
  assert.equal(state.workoutHistory[0].actionPain[0], "手腕不适");
  assert.ok(state.plan.sessions[0].actions.some((action) => action.exercise.id === painfulId));
  assert.ok(state.pendingAdjustment.plan.sessions.every((session) => session.actions.every((action) => action.exercise.id !== painfulId)));
  assert.deepEqual(state.pendingAdjustment.changes, state.plan.sessions.filter((session) => session.actions.some((action) => action.exercise.id === painfulId)).map((session) => `训练 ${String.fromCharCode(64 + session.day)}：移除 ${state.workoutHistory[0].sessionSnapshot.actions[0].title}`));
});

test("文件备份能恢复资料、会话、训练明细和当前进度，不包含模型密钥", () => {
  let state = finish(start(makeState()));
  state = start(state);
  state.modelConfig = { apiKey: "must-not-export" };
  state.profile.apiKey = "must-not-export";
  const backup = exportBackup(state);
  assert.ok(!backup.includes("must-not-export"));
  const restored = parseBackup(backup);
  assert.equal(restored.plan.id, state.plan.id);
  assert.equal(restored.workoutHistory.length, 1);
  assert.equal(restored.activeWorkout.sessionDay, 2);
  assert.deepEqual(restored.messages, state.messages);
});

test("损坏或恶意备份在恢复前拒绝，不影响原始对象", () => {
  const state = makeState();
  const original = exportBackup(state, 1000);
  assert.throws(() => parseBackup("not-json"), /JSON/);
  const backup = JSON.parse(original);
  backup.data.plan.sessions[0].actions[0].exercise.gif_url = "https://untrusted.example/secret";
  assert.throws(() => parseBackup(JSON.stringify(backup)), /媒体地址/);
  backup.data.plan = state.plan;
  backup.data.profile.goal = {};
  assert.throws(() => parseBackup(JSON.stringify(backup)), /资料字段/);
  assert.equal(exportBackup(state, 1000), original);
});

test("本地存储失败返回明确错误而非使应用崩溃", () => {
  const result = persistProductState({ setItem: () => { throw new Error("QuotaExceeded"); } }, makeState());
  assert.equal(result.ok, false);
  assert.match(result.message, /导出备份/);
});

test("旧版进行中训练自动建立稳定身份和快照", () => {
  const state = start(makeState());
  delete state.plan.id;
  delete state.plan.revision;
  delete state.activeWorkout.sessionSnapshot;
  delete state.activeWorkout.actualSets;
  const restored = roundTrip(state);
  assert.ok(restored.plan.id);
  assert.ok(restored.activeWorkout.sessionSnapshot.actions.length);
  assert.deepEqual(restored.activeWorkout.actualSets, {});
});

test("修改资料使旧建议失效，不允许回滚新的身体限制", () => {
  let state = finish(start(makeState()));
  const proposal = state.pendingAdjustment;
  state = reduce(state, { type: "profile.update", key: "painNote", value: "右肩不适" });
  assert.equal(state.pendingAdjustment, null);
  assert.equal(reduce(state, { type: "adjustment.propose", proposal }), state);
  assert.equal(reduce(state, { type: "adjustment.accept" }).profile.painNote, "右肩不适");
});

test("导入拒绝小数动作位置、空快照和对象类型的历史状态", () => {
  const envelope = JSON.parse(exportBackup(start(makeState())));
  envelope.data.activeWorkout.currentActionIndex = 0.5;
  assert.throws(() => parseBackup(JSON.stringify(envelope)), /位置/);
  envelope.data.activeWorkout.currentActionIndex = 0;
  envelope.data.activeWorkout.sessionSnapshot.actions = [];
  assert.throws(() => parseBackup(JSON.stringify(envelope)), /位置/);
  const history = JSON.parse(exportBackup(finish(start(makeState()))));
  history.data.workoutHistory[0].adjustmentStatus = { bad: "object" };
  assert.throws(() => parseBackup(JSON.stringify(history)), /状态/);
});

test("坏存储保留原件后才允许新状态保存，无法隔离则阻止覆盖", () => {
  const values = new Map([["fitness-coach-product-state-v1", "broken-json"]]);
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const recovered = loadProductState(storage);
  assert.match(recovered.recoveryNotice, /原件已单独保留/);
  assert.equal(values.get("fitness-coach-recovery-v1"), "broken-json");
  assert.equal(persistProductState(storage, recovered).ok, true);
  const blockedStorage = { getItem: () => "broken-json", setItem: () => { throw new Error("full"); } };
  // A different existing quarantine cannot safely stand in for the current raw value.
  const blocked = loadProductState({ ...blockedStorage, getItem: (key) => key.endsWith("recovery-v1") ? null : "broken-json" });
  assert.equal(blocked.persistenceBlocked, true);
  assert.equal(persistProductState(blockedStorage, blocked).ok, false);
});
