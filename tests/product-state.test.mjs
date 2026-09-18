import assert from "node:assert/strict";
import test from "node:test";
import {
  createProductState,
  loadProductState,
  persistProductState,
  productStateReducer,
} from "../src/lib/productState.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

const plan = {
  title: "三日计划",
  summary: "每周训练三次",
  recovery: "隔日恢复",
  source: "local",
  sessions: [
    { day: 1, title: "上肢", focus: "推力", estimatedMinutes: 30, actions: [] },
    { day: 2, title: "下肢", focus: "腿臀", estimatedMinutes: 30, actions: [] },
  ],
};

const firstAction = {
  title: "深蹲",
  sets: 3,
  reps: "10 次",
  exercise: { id: "squat", name: "squat" },
};

const secondAction = {
  title: "俯卧撑",
  sets: 2,
  reps: "8 次",
  exercise: { id: "push-up", name: "push-up" },
};

test("资料、计划、对话与当前训练日可以跨刷新恢复", () => {
  const storage = createMemoryStorage();
  let state = createProductState();
  state = productStateReducer(state, { type: "profile.update", key: "goal", value: "提升力量" });
  state = productStateReducer(state, { type: "plan.replace", plan });
  state = productStateReducer(state, { type: "plan.day", dayIndex: 1 });
  state = productStateReducer(state, {
    type: "chat.append",
    message: { role: "user", text: "周三只有二十分钟" },
  });

  persistProductState(storage, state);
  const restored = loadProductState(storage);

  assert.equal(restored.profile.goal, "提升力量");
  assert.equal(restored.plan.title, "三日计划");
  assert.equal(restored.activeDay, 1);
  assert.equal(restored.messages.at(-1).text, "周三只有二十分钟");
});

test("恢复时会丢弃无法对应到有效训练日的损坏进度", () => {
  const storage = createMemoryStorage();
  storage.setItem("fitness-coach-product-state-v1", JSON.stringify({
    ...createProductState(),
    plan,
    activeWorkout: { sessionDay: 99, currentActionIndex: 3 },
  }));

  assert.equal(loadProductState(storage).activeWorkout, null);
});

test("可以把动作加入指定训练日且不会重复加入", () => {
  let state = productStateReducer(createProductState(), { type: "plan.replace", plan });
  state = productStateReducer(state, { type: "plan.action.add", dayIndex: 1, planAction: firstAction });
  state = productStateReducer(state, { type: "plan.action.add", dayIndex: 1, planAction: firstAction });

  assert.deepEqual(state.plan.sessions[0].actions, []);
  assert.deepEqual(state.plan.sessions[1].actions, [firstAction]);
});

test("可以把动作移动到另一个训练日", () => {
  let state = productStateReducer(createProductState(), { type: "plan.replace", plan });
  state = productStateReducer(state, { type: "plan.action.add", dayIndex: 0, planAction: firstAction });
  state = productStateReducer(state, { type: "plan.action.add", dayIndex: 0, planAction: secondAction });
  state = productStateReducer(state, {
    type: "plan.action.moveDay",
    fromDayIndex: 0,
    actionIndex: 0,
    toDayIndex: 1,
  });

  assert.deepEqual(state.plan.sessions[0].actions, [secondAction]);
  assert.deepEqual(state.plan.sessions[1].actions, [firstAction]);
});

test("可以调整同一训练日内的动作顺序", () => {
  let state = productStateReducer(createProductState(), { type: "plan.replace", plan });
  state = productStateReducer(state, { type: "plan.action.add", dayIndex: 0, planAction: firstAction });
  state = productStateReducer(state, { type: "plan.action.add", dayIndex: 0, planAction: secondAction });
  state = productStateReducer(state, {
    type: "plan.action.reorder",
    dayIndex: 0,
    actionIndex: 1,
    direction: -1,
  });

  assert.deepEqual(state.plan.sessions[0].actions, [secondAction, firstAction]);
});

test("可以删除和替换计划动作", () => {
  let state = productStateReducer(createProductState(), { type: "plan.replace", plan });
  state = productStateReducer(state, { type: "plan.action.add", dayIndex: 0, planAction: firstAction });
  state = productStateReducer(state, {
    type: "plan.action.replace",
    dayIndex: 0,
    actionIndex: 0,
    planAction: secondAction,
  });
  assert.deepEqual(state.plan.sessions[0].actions, [secondAction]);

  state = productStateReducer(state, { type: "plan.action.remove", dayIndex: 0, actionIndex: 0 });
  assert.deepEqual(state.plan.sessions[0].actions, []);
});

test("开始训练时会创建可恢复的训练进度", () => {
  let state = productStateReducer(createProductState(), {
    type: "plan.replace",
    plan: {
      ...plan,
      sessions: [{ ...plan.sessions[0], actions: [firstAction, secondAction] }],
    },
  });
  state = productStateReducer(state, { type: "workout.start", dayIndex: 0, now: 1_000 });

  assert.equal(state.activeWorkout.sessionDay, 1);
  assert.equal(state.activeWorkout.startedAt, 1_000);
  assert.equal(state.activeWorkout.currentActionIndex, 0);
  assert.deepEqual(state.activeWorkout.completedSets, {});
  assert.deepEqual(state.activeWorkout.skippedActionIndexes, []);
});

test("完成一组后会记录组次并启动休息计时", () => {
  let state = productStateReducer(createProductState(), {
    type: "plan.replace",
    plan: { ...plan, sessions: [{ ...plan.sessions[0], actions: [firstAction] }] },
  });
  state = productStateReducer(state, { type: "workout.start", dayIndex: 0, now: 1_000 });
  state = productStateReducer(state, {
    type: "workout.toggleSet",
    actionIndex: 0,
    setIndex: 0,
    now: 2_000,
    restSeconds: 45,
  });

  assert.deepEqual(state.activeWorkout.completedSets, { 0: [0] });
  assert.equal(state.activeWorkout.restEndsAt, 47_000);
});

test("跳过动作后会保留记录并进入下一个动作", () => {
  let state = productStateReducer(createProductState(), {
    type: "plan.replace",
    plan: { ...plan, sessions: [{ ...plan.sessions[0], actions: [firstAction, secondAction] }] },
  });
  state = productStateReducer(state, { type: "workout.start", dayIndex: 0, now: 1_000 });
  state = productStateReducer(state, { type: "workout.skip", actionIndex: 0 });

  assert.deepEqual(state.activeWorkout.skippedActionIndexes, [0]);
  assert.equal(state.activeWorkout.currentActionIndex, 1);
});

test("训练进行中会拒绝计划编辑，避免组次记录和动作错配", () => {
  let state = productStateReducer(createProductState(), {
    type: "plan.replace",
    plan: { ...plan, sessions: [{ ...plan.sessions[0], actions: [firstAction, secondAction] }] },
  });
  state = productStateReducer(state, { type: "workout.start", dayIndex: 0, now: 1_000 });
  const actionsBeforeEdit = state.plan.sessions[0].actions;

  state = productStateReducer(state, {
    type: "plan.action.reorder",
    dayIndex: 0,
    actionIndex: 1,
    direction: -1,
  });
  state = productStateReducer(state, { type: "plan.action.remove", dayIndex: 0, actionIndex: 0 });

  assert.equal(state.plan.sessions[0].actions, actionsBeforeEdit);
});

test("完成训练先记录实际结果，不应用未确认的模型计划", () => {
  const adjustedPlan = { ...plan, recovery: "下次降低一档强度" };
  let state = productStateReducer(createProductState(), {
    type: "plan.replace",
    plan: { ...plan, sessions: [{ ...plan.sessions[0], actions: [firstAction] }] },
  });
  state = productStateReducer(state, { type: "workout.start", dayIndex: 0, now: 1_000 });
  state = productStateReducer(state, { type: "workout.toggleSet", actionIndex: 0, setIndex: 0, now: 2000, restSeconds: 45 });
  state = productStateReducer(state, { type: "workout.review" });
  state = productStateReducer(state, {
    type: "workout.feedback",
    feedback: { effort: 8, pain: "轻微", note: "右肩有些紧" },
  });
  state = productStateReducer(state, {
    type: "workout.complete",
    now: 5_000,
    nextPlan: adjustedPlan,
    nextProfile: { ...state.profile, intensityOffset: -1 },
    adjustmentMessage: "已为下一次训练降低训练量。",
    completionSummary: {
      completedSetCount: 1,
      plannedSetCount: 3,
      skippedCount: 0,
      completionRate: 1 / 3,
    },
  });

  assert.equal(state.activeWorkout, null);
  assert.equal(state.workoutHistory.length, 1);
  assert.equal(state.workoutHistory[0].feedback.note, "右肩有些紧");
  assert.equal(state.workoutHistory[0].completedSetCount, 1);
  assert.equal(state.workoutHistory[0].plannedSetCount, 3);
  assert.equal(state.plan.recovery, "隔日恢复");
  assert.equal(state.profile.intensityOffset, 0);
  assert.notEqual(state.messages.at(-1).text, "已为下一次训练降低训练量。");
  assert.equal(state.workoutHistory[0].sessionSnapshot.actions[0].title, "深蹲");
});
