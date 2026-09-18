import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  adaptPlanFromFeedback,
  DEFAULT_PROFILE,
  generatePlan,
  refinePlan,
  summarizeWorkoutCompletion,
  findAlternativeAction,
  estimateSessionMinutes,
} from "../src/lib/planner.js";
import { coreMetadata, sameMovement } from "../src/data/coreExercises.js";

const exercises = JSON.parse(await readFile(new URL("../public/data/exercises.json", import.meta.url), "utf8"));

test("生成计划时遵守训练频率与居家器材范围", () => {
  const plan = generatePlan(DEFAULT_PROFILE, exercises);
  const homeEquipment = new Set(["body weight", "band", "resistance band", "dumbbell", "stability ball", "wheel roller", "rope"]);
  assert.equal(plan.sessions.length, 3);
  assert.ok(plan.sessions.every((session) => session.actions.length === 4));
  assert.ok(plan.sessions.flatMap((session) => session.actions).every((action) => homeEquipment.has(action.exercise.equipment)));
});

test("生成计划只使用用户明确拥有的器材", () => {
  const profile = { ...DEFAULT_PROFILE, equipment: ["body weight"] };
  const plan = generatePlan(profile, exercises);
  const actions = plan.sessions.flatMap((session) => session.actions);

  assert.ok(actions.length > 0);
  assert.ok(actions.every((action) => action.exercise.equipment === "body weight"));
  assert.ok(actions.every((action) => !/(bench|chair|pull.?up|chin.?up|hanging|balance board|\bdips?\b|inverted row)/i.test(action.exercise.name)));
});

test("拥有哑铃但没有卧推凳时不会选择隐含需要卧推凳的动作", () => {
  const profile = {
    ...DEFAULT_PROFILE,
    equipmentMode: "available",
    equipment: ["body weight", "dumbbell"],
  };
  const plan = generatePlan(profile, exercises);
  const actions = plan.sessions.flatMap((session) => session.actions);

  assert.ok(actions.length > 0);
  assert.ok(actions.every((action) => !/(bench|chair)/i.test(action.exercise.name)));
  assert.ok(actions.flatMap((action) => action.alternative || []).every((alternative) => !/(bench|chair)/i.test(alternative.exercise.name)));
});

test("膝盖保护模式不会返回下肢、跑跳动作", () => {
  const profile = { ...DEFAULT_PROFILE, limitation: "膝盖需要保护" };
  const plan = generatePlan(profile, exercises);
  const actions = plan.sessions.flatMap((session) => session.actions);
  assert.ok(actions.length > 0);
  assert.ok(actions.every((action) => !["upper legs", "lower legs", "cardio"].includes(action.exercise.body_part)));
  assert.ok(actions.every((action) => !/(squat|lunge|jump|\brun)/i.test(action.exercise.name)));
});

test("多项身体限制和不适动作会共同约束计划", () => {
  const profile = {
    ...DEFAULT_PROFILE,
    frequency: 1,
    limitations: ["膝盖", "肩部"],
    avoidExercises: "push up",
  };
  const plan = generatePlan(profile, exercises);
  const actions = plan.sessions.flatMap((session) => session.actions);

  assert.ok(actions.length > 0);
  assert.ok(actions.every((action) => !["upper legs", "lower legs", "cardio", "shoulders"].includes(action.exercise.body_part)));
  assert.ok(actions.every((action) => !/(squat|lunge|jump|\brun|push.?up|overhead|lateral raise)/i.test(action.exercise.name)));
});

test("每个动作解释原因，替代必须同类型，无候选时不拼凑", () => {
  const profile = { ...DEFAULT_PROFILE, equipment: ["body weight"] };
  const plan = generatePlan(profile, exercises);
  const actions = plan.sessions.flatMap((session) => session.actions);

  assert.ok(actions.every((action) => typeof action.reason === "string" && action.reason.length > 0));
  const withAlternatives = actions.filter((action) => action.alternative);
  assert.ok(withAlternatives.length > 0);
  assert.ok(withAlternatives.every((action) => action.alternative.exercise.id !== action.exercise.id));
  assert.ok(withAlternatives.every((action) => sameMovement(action.exercise, action.alternative.exercise)));
  assert.ok(withAlternatives.every((action) => action.alternative.kind === "无器械替代"));
  const deadBug = { exercise: exercises.find((item) => item.id === "0276") };
  assert.equal(findAlternativeAction(deadBug, profile, exercises), null);
});

test("对话可将计划压缩为每次三个动作", () => {
  const original = generatePlan(DEFAULT_PROFILE, exercises);
  const result = refinePlan("这周太忙了，压缩到 20 分钟", original, DEFAULT_PROFILE, exercises);
  assert.equal(result.profile.duration, "15–20分钟");
  assert.ok(result.plan.sessions.every((session) => session.actions.length === 3));
});

test("无器械调整只返回徒手动作", () => {
  const original = generatePlan(DEFAULT_PROFILE, exercises);
  const result = refinePlan("改成无器械训练", original, DEFAULT_PROFILE, exercises);
  const actions = result.plan.sessions.flatMap((session) => session.actions);
  assert.equal(result.profile.equipmentMode, "bodyweight");
  assert.ok(actions.length > 0);
  assert.ok(actions.every((action) => action.exercise.equipment === "body weight"));
});

test("强度调整会在后续对话中持续保留", () => {
  const original = generatePlan(DEFAULT_PROFILE, exercises);
  const increased = refinePlan("强度再高一点", original, DEFAULT_PROFILE, exercises);
  const shortened = refinePlan("压缩到 20 分钟", increased.plan, increased.profile, exercises);
  assert.equal(shortened.profile.intensityOffset, 1);
  assert.ok(shortened.plan.sessions.flatMap((session) => session.actions).every((action) => action.sets >= 3));
});

test("高主观强度且无疼痛时建议降低同一训练日的训练量", () => {
  const original = generatePlan(DEFAULT_PROFILE, exercises);
  const beforeSets = original.sessions[0].actions.map((action) => action.sets);
  const result = adaptPlanFromFeedback(original, 1, { effort: 9, pain: "无", note: "很吃力" });
  const afterSets = result.plan.sessions[0].actions.map((action) => action.sets);

  assert.deepEqual(afterSets, beforeSets.map((sets) => Math.max(1, sets - 1)));
  assert.match(result.message, /建议|减少/);
  assert.equal(result.plan.lastAdjustment.feedback.pain, "无");
});

test("训练完成摘要会统计完成组、跳过动作和完成率", () => {
  const plan = generatePlan(DEFAULT_PROFILE, exercises);
  const summary = summarizeWorkoutCompletion(plan, {
    sessionDay: 1,
    completedSets: { 0: [0, 1], 1: [0] },
    skippedActionIndexes: [2],
  });

  assert.equal(summary.completedSetCount, 3);
  assert.equal(summary.plannedSetCount, 8);
  assert.equal(summary.skippedCount, 1);
  assert.equal(summary.completionRate, 3 / 8);
});

test("时间不足导致低完成率不等于强度过高，不自动降低训练量", () => {
  const original = generatePlan(DEFAULT_PROFILE, exercises);
  const beforeSets = original.sessions[0].actions.map((action) => action.sets);
  const result = adaptPlanFromFeedback(
    original,
    1,
    { effort: 6, pain: "无", note: "时间不够" },
    { completedSetCount: 2, plannedSetCount: 8, skippedCount: 1, completionRate: 0.25 },
  );

  assert.deepEqual(result.plan.sessions[0].actions.map((action) => action.sets), beforeSets);
  assert.match(result.message, /确认原因|保留/);
});

test("初学者只使用入门核心池，未知动作不会进入自动推荐", () => {
  const plan = generatePlan(DEFAULT_PROFILE, exercises);
  assert.ok(plan.sessions.flatMap((session) => session.actions).every((action) => coreMetadata(action.exercise)?.level === 0));
  const advancedOnly = exercises.filter((item) => ["3294", "3211"].includes(item.id));
  assert.ok(generatePlan(DEFAULT_PROFILE, advancedOnly).sessions.every((session) => session.actions.length === 0));
});

test("时长由实际组次估算，并包含准备、组间休息和动作转换", () => {
  const action = { sets: 2, reps: "10 次", rest: "组间休息 60 秒" };
  assert.equal(estimateSessionMinutes([action]), 7);
  assert.equal(estimateSessionMinutes([action, action]), 10);
  assert.equal(estimateSessionMinutes([]), 0);
});

test("本地模式不能理解时不重排计划也不声称已执行", () => {
  const plan = generatePlan(DEFAULT_PROFILE, exercises);
  const result = refinePlan("我想练成超级英雄", plan, DEFAULT_PROFILE, exercises);
  assert.equal(result.plan, plan);
  assert.equal(result.changed, false);
  assert.match(result.reply, /未改变/);
});
