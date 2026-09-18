import { DEFAULT_PROFILE, recalculatePlan, summarizeWorkoutCompletion } from "./planner.js";
import { describePlanChanges } from "./adjustments.js";

export const PRODUCT_STATE_KEY = "fitness-coach-product-state-v1";

const INITIAL_MESSAGE = {
  role: "assistant",
  text: "计划准备好后，你可以告诉我时间、器械、强度或身体限制，我会继续调整。",
};

export function createProductState() {
  return {
    version: 1,
    profile: { ...DEFAULT_PROFILE },
    plan: null,
    activeDay: 0,
    nextDay: 0,
    messages: [INITIAL_MESSAGE],
    activeWorkout: null,
    workoutHistory: [],
    pendingAdjustment: null,
  };
}

const PLAN_EDIT_ACTIONS = new Set([
  "plan.replace",
  "plan.action.add",
  "plan.action.moveDay",
  "plan.action.reorder",
  "plan.action.replace",
  "plan.action.remove",
]);

function reduceProductState(state, action) {
  if (state.activeWorkout && (PLAN_EDIT_ACTIONS.has(action.type) || action.type.startsWith("profile."))) return state;
  switch (action.type) {
    case "profile.update":
      return { ...state, profile: { ...state.profile, [action.key]: action.value }, pendingAdjustment: null };
    case "profile.patch":
      return { ...state, profile: { ...state.profile, ...action.profile }, pendingAdjustment: null };
    case "profile.replace":
      return { ...state, profile: action.profile, pendingAdjustment: null };
    case "plan.replace": {
      const lastDayIndex = Math.max(0, (action.plan?.sessions.length || 1) - 1);
      return {
        ...state,
        plan: action.plan,
        activeDay: action.keepDay ? Math.min(state.activeDay, lastDayIndex) : 0,
        nextDay: action.keepDay ? Math.min(state.nextDay || 0, lastDayIndex) : 0,
        pendingAdjustment: null,
        activeWorkout: action.keepWorkout ? state.activeWorkout : null,
      };
    }
    case "plan.day": {
      const lastDayIndex = Math.max(0, (state.plan?.sessions.length || 1) - 1);
      return { ...state, activeDay: Math.max(0, Math.min(lastDayIndex, action.dayIndex)) };
    }
    case "plan.action.add": {
      if (!state.plan?.sessions[action.dayIndex]) return state;
      const session = state.plan.sessions[action.dayIndex];
      const alreadyIncluded = session.actions.some(
        (item) => item.exercise.id === action.planAction.exercise.id,
      );
      if (alreadyIncluded) return state;
      const sessions = state.plan.sessions.map((item, index) =>
        index === action.dayIndex
          ? { ...item, actions: [...item.actions, action.planAction] }
          : item,
      );
      return { ...state, plan: { ...state.plan, sessions } };
    }
    case "plan.action.moveDay": {
      if (
        !state.plan?.sessions[action.fromDayIndex] ||
        !state.plan.sessions[action.toDayIndex] ||
        action.fromDayIndex === action.toDayIndex
      ) return state;
      const movingAction = state.plan.sessions[action.fromDayIndex].actions[action.actionIndex];
      if (!movingAction) return state;
      const destinationHasAction = state.plan.sessions[action.toDayIndex].actions.some(
        (item) => item.exercise.id === movingAction.exercise.id,
      );
      if (destinationHasAction) return state;
      const sessions = state.plan.sessions.map((session, index) => {
        if (index === action.fromDayIndex) {
          return {
            ...session,
            actions: session.actions.filter((_, actionIndex) => actionIndex !== action.actionIndex),
          };
        }
        if (index === action.toDayIndex) {
          return { ...session, actions: [...session.actions, movingAction] };
        }
        return session;
      });
      return { ...state, plan: { ...state.plan, sessions } };
    }
    case "plan.action.reorder": {
      const session = state.plan?.sessions[action.dayIndex];
      if (!session) return state;
      const nextIndex = action.actionIndex + action.direction;
      if (nextIndex < 0 || nextIndex >= session.actions.length) return state;
      const actions = [...session.actions];
      [actions[action.actionIndex], actions[nextIndex]] = [actions[nextIndex], actions[action.actionIndex]];
      const sessions = state.plan.sessions.map((item, index) =>
        index === action.dayIndex ? { ...item, actions } : item,
      );
      return { ...state, plan: { ...state.plan, sessions } };
    }
    case "plan.action.replace": {
      const session = state.plan?.sessions[action.dayIndex];
      if (!session?.actions[action.actionIndex]) return state;
      const actions = session.actions.map((item, index) =>
        index === action.actionIndex ? action.planAction : item,
      );
      const sessions = state.plan.sessions.map((item, index) =>
        index === action.dayIndex ? { ...item, actions } : item,
      );
      return { ...state, plan: { ...state.plan, sessions } };
    }
    case "plan.action.remove": {
      const session = state.plan?.sessions[action.dayIndex];
      if (!session?.actions[action.actionIndex]) return state;
      const actions = session.actions.filter((_, index) => index !== action.actionIndex);
      const sessions = state.plan.sessions.map((item, index) =>
        index === action.dayIndex ? { ...item, actions } : item,
      );
      return { ...state, plan: { ...state.plan, sessions } };
    }
    case "workout.start": {
      if (state.activeWorkout) return state;
      const session = state.plan?.sessions[action.dayIndex];
      if (!session?.actions.length) return state;
      return {
        ...state,
        activeDay: action.dayIndex,
        activeWorkout: {
          id: `workout-${action.now}`,
          planId: state.plan.id,
          planRevision: state.plan.revision,
          sessionId: session.id,
          sessionDay: session.day,
          sessionSnapshot: structuredClone(session),
          actualSets: {},
          skipReasons: {},
          actionPain: {},
          replacements: [],
          startedAt: action.now,
          currentActionIndex: 0,
          completedSets: {},
          skippedActionIndexes: [],
          restEndsAt: null,
          phase: "training",
          feedback: { effort: 6, pain: "无", note: "" },
        },
      };
    }
    case "workout.toggleSet": {
      if (!state.activeWorkout) return state;
      const plannedAction = state.activeWorkout.sessionSnapshot?.actions[action.actionIndex];
      if (!plannedAction || !Number.isInteger(action.setIndex) || action.setIndex < 0 || action.setIndex >= plannedAction.sets) return state;
      const currentSets = state.activeWorkout.completedSets[action.actionIndex] || [];
      const isComplete = currentSets.includes(action.setIndex);
      const nextSets = isComplete
        ? currentSets.filter((setIndex) => setIndex !== action.setIndex)
        : [...currentSets, action.setIndex].sort((left, right) => left - right);
      return {
        ...state,
        activeWorkout: {
          ...state.activeWorkout,
          completedSets: {
            ...state.activeWorkout.completedSets,
            [action.actionIndex]: nextSets,
          },
          skippedActionIndexes: state.activeWorkout.skippedActionIndexes.filter((index) => index !== action.actionIndex),
          skipReasons: { ...state.activeWorkout.skipReasons, [action.actionIndex]: null },
          restEndsAt: isComplete ? null : action.now + action.restSeconds * 1_000,
        },
      };
    }
    case "workout.skip": {
      if (!state.activeWorkout) return state;
      const actionCount = state.activeWorkout.sessionSnapshot.actions.length;
      if (!state.activeWorkout.sessionSnapshot.actions[action.actionIndex]) return state;
      const skippedActionIndexes = state.activeWorkout.skippedActionIndexes.includes(action.actionIndex)
        ? state.activeWorkout.skippedActionIndexes
        : [...state.activeWorkout.skippedActionIndexes, action.actionIndex];
      return {
        ...state,
        activeWorkout: {
          ...state.activeWorkout,
          skippedActionIndexes,
          skipReasons: { ...state.activeWorkout.skipReasons, [action.actionIndex]: action.reason || "未说明" },
          currentActionIndex: Math.min(actionCount - 1, action.actionIndex + 1),
          restEndsAt: null,
        },
      };
    }
    case "workout.navigate": {
      if (!state.activeWorkout) return state;
      const actionCount = state.activeWorkout.sessionSnapshot.actions.length;
      return {
        ...state,
        activeWorkout: {
          ...state.activeWorkout,
          currentActionIndex: Math.max(0, Math.min(actionCount - 1, action.actionIndex)),
          restEndsAt: null,
          phase: "training",
        },
      };
    }
    case "workout.rest.stop":
      return state.activeWorkout
        ? { ...state, activeWorkout: { ...state.activeWorkout, restEndsAt: null } }
        : state;
    case "workout.action.replace": {
      if (!state.activeWorkout) return state;
      const session = state.activeWorkout.sessionSnapshot;
      if (!session?.actions[action.actionIndex]) return state;
      // Never erase already performed sets when changing exercise identity.
      if (state.activeWorkout.completedSets[action.actionIndex]?.length || state.activeWorkout.actionPain?.[action.actionIndex]) return state;
      const actions = session.actions.map((item, index) =>
        index === action.actionIndex ? action.planAction : item,
      );
      const completedSets = { ...state.activeWorkout.completedSets };
      delete completedSets[action.actionIndex];
      return {
        ...state,
        activeWorkout: {
          ...state.activeWorkout, completedSets, restEndsAt: null,
          sessionSnapshot: { ...session, actions },
          actualSets: { ...state.activeWorkout.actualSets, [action.actionIndex]: {} },
          skippedActionIndexes: state.activeWorkout.skippedActionIndexes.filter((index) => index !== action.actionIndex),
          skipReasons: { ...state.activeWorkout.skipReasons, [action.actionIndex]: null },
          replacements: [...state.activeWorkout.replacements, { actionIndex: action.actionIndex, from: session.actions[action.actionIndex].title, to: action.planAction.title }],
        },
      };
    }
    case "workout.actual": {
      const workout = state.activeWorkout;
      const planned = workout?.sessionSnapshot.actions[action.actionIndex];
      if (!planned || !Number.isInteger(action.setIndex) || action.setIndex < 0 || action.setIndex >= planned.sets) return state;
      if (!["amount", "weight"].includes(action.field)) return state;
      const value = action.value === "" ? "" : Number(action.value);
      if (value !== "" && (!Number.isFinite(value) || value < 0 || value > (action.field === "weight" ? 500 : 3600))) return state;
      const rows = workout.actualSets?.[action.actionIndex] || {};
      return { ...state, activeWorkout: { ...workout, actualSets: { ...workout.actualSets, [action.actionIndex]: { ...rows, [action.setIndex]: { ...rows[action.setIndex], [action.field]: value } } } } };
    }
    case "workout.pain": {
      const workout = state.activeWorkout;
      if (!workout?.sessionSnapshot.actions[action.actionIndex]) return state;
      return { ...state, activeWorkout: {
        ...workout, phase: "feedback", restEndsAt: null,
        actionPain: { ...workout.actionPain, [action.actionIndex]: action.pain || "不适" },
        feedback: { ...workout.feedback, pain: "未评估" },
      } };
    }
    case "workout.cancel":
      return { ...state, activeWorkout: null };
    case "workout.review":
      return state.activeWorkout
        ? { ...state, activeWorkout: { ...state.activeWorkout, phase: "feedback", restEndsAt: null } }
        : state;
    case "workout.feedback":
      return state.activeWorkout
        ? {
            ...state,
            activeWorkout: {
              ...state.activeWorkout,
              feedback: { ...state.activeWorkout.feedback, ...action.feedback },
            },
          }
        : state;
    case "workout.complete": {
      if (!state.activeWorkout) return state;
      const record = {
        id: state.activeWorkout.id,
        planId: state.activeWorkout.planId,
        planRevision: state.activeWorkout.planRevision,
        sessionId: state.activeWorkout.sessionId,
        sessionSnapshot: state.activeWorkout.sessionSnapshot,
        actualSets: state.activeWorkout.actualSets,
        skipReasons: state.activeWorkout.skipReasons,
        actionPain: state.activeWorkout.actionPain,
        replacements: state.activeWorkout.replacements,
        sessionDay: state.activeWorkout.sessionDay,
        startedAt: state.activeWorkout.startedAt,
        completedAt: action.now,
        completedSets: state.activeWorkout.completedSets,
        skippedActionIndexes: state.activeWorkout.skippedActionIndexes,
        feedback: state.activeWorkout.feedback,
        adjustmentSource: action.adjustmentSource || "local",
        ...summarizeWorkoutCompletion(state.plan, state.activeWorkout),
        adjustmentStatus: "待确认",
      };
      return {
        ...state,
        activeWorkout: null,
        nextDay: (state.plan.sessions.findIndex((session) => session.id === record.sessionId) + 1) % state.plan.sessions.length,
        activeDay: (state.plan.sessions.findIndex((session) => session.id === record.sessionId) + 1) % state.plan.sessions.length,
        workoutHistory: [record, ...state.workoutHistory],
        pendingAdjustment: action.proposal || null,
      };
    }
    case "adjustment.propose":
      if (state.activeWorkout || state.pendingAdjustment?.workoutId !== action.proposal.workoutId || state.plan?.id !== action.proposal.basePlanId || state.plan?.revision !== action.proposal.baseRevision) return state;
      return { ...state, pendingAdjustment: action.proposal };
    case "adjustment.accept": {
      const proposal = state.pendingAdjustment;
      if (!proposal || state.activeWorkout || proposal.basePlanId !== state.plan?.id || proposal.baseRevision !== state.plan.revision) return state;
      return {
        ...state, plan: { ...proposal.plan, id: state.plan.id, revision: state.plan.revision },
        profile: proposal.profile || state.profile, pendingAdjustment: null,
        workoutHistory: state.workoutHistory.map((record) => record.id === proposal.workoutId ? { ...record, adjustmentStatus: "已采用", adjustmentMessage: proposal.message, adjustmentChanges: proposal.changes } : record),
        messages: [...state.messages, { role: "assistant", text: `已采用调整：${proposal.message}` }],
      };
    }
    case "adjustment.dismiss":
      return { ...state, pendingAdjustment: null, workoutHistory: state.workoutHistory.map((record) => record.id === state.pendingAdjustment?.workoutId ? { ...record, adjustmentStatus: "保留原计划" } : record) };
    case "state.restore":
      return state.activeWorkout ? state : action.state;
    case "chat.append":
      return { ...state, messages: [...state.messages, action.message] };
    case "chat.replace":
      return { ...state, messages: action.messages };
    default:
      return state;
  }
}

export function identifyPlan(plan, previous = null) {
  if (!plan) return null;
  const id = plan.id || previous?.id || `plan-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
  return recalculatePlan({
    ...plan, id, revision: Math.max(1, Number(plan.revision) || 1),
    sessions: plan.sessions.map((session, index) => ({ ...session, day: index + 1, id: session.id || previous?.sessions[index]?.id || `${id}-day-${index + 1}` })),
  });
}

export function productStateReducer(state, action) {
  let next = reduceProductState(state, action);
  if (state.pendingAdjustment && !next.pendingAdjustment && !["adjustment.accept", "adjustment.dismiss", "state.restore"].includes(action.type)) {
    next = { ...next, workoutHistory: next.workoutHistory.map((record) => record.id === state.pendingAdjustment.workoutId ? { ...record, adjustmentStatus: "条件已更新，旧建议失效" } : record) };
  }
  if (next === state || next.plan === state.plan || action.type === "state.restore") return next;
  const keepIdentity = action.type !== "plan.replace" || action.keepDay;
  const plan = identifyPlan(next.plan, keepIdentity ? state.plan : null);
  if (keepIdentity && state.plan) plan.revision = state.plan.revision + 1;
  return { ...next, plan, pendingAdjustment: action.type === "adjustment.accept" ? null : next.pendingAdjustment };
}

export function persistProductState(storage, state) {
  if (state.persistenceBlocked) return { ok: false, message: "原数据尚未安全备份，自动保存已暂停。请下载原件或恢复有效备份后再继续。" };
  try {
    storage.setItem(PRODUCT_STATE_KEY, JSON.stringify(state, compactTrainingData));
    return { ok: true };
  } catch {
    return { ok: false, message: "此浏览器未能保存数据（空间不足或存储受限）。请立即导出备份，关闭页面可能丢失最新进度。" };
  }
}

export function compactTrainingData(key, value) {
  // The source dataset includes many languages; duplicating all of them per workout quickly fills browser storage.
  if (["instructions", "instruction_steps"].includes(key) && value && typeof value === "object") return { zh: value.zh, en: value.en };
  return value;
}

function validateSavedState(stored, fallback) {
  const texts = (values) => Array.isArray(values) && values.every((value) => typeof value === "string");
  const optionalText = (value) => value === undefined || typeof value === "string";
  function sessionValid(session) {
    return session && typeof session.title === "string" && optionalText(session.focus) && Array.isArray(session.actions) && session.actions.length <= 100 && session.actions.every((action) =>
      action && typeof action.title === "string" && typeof action.reps === "string" && optionalText(action.reason) && optionalText(action.rest) && Number.isInteger(action.sets) && action.sets > 0 && action.sets <= 6 && typeof action.exercise?.id === "string" && typeof action.exercise.name === "string");
  }
  function planValid(plan) {
    return plan && typeof plan.title === "string" && optionalText(plan.summary) && optionalText(plan.recovery) && optionalText(plan.coverageNote) && Array.isArray(plan.sessions) && plan.sessions.length > 0 && plan.sessions.length <= 6 && plan.sessions.every(sessionValid);
  }
  function workoutValid(workout) {
    return workout && Number.isInteger(workout.sessionDay) && ["completedSetCount", "plannedSetCount", "skippedCount", "completionRate", "unfinishedSetCount"].every((key) => workout[key] === undefined || Number.isFinite(workout[key])) && workout.completedSets && Object.values(workout.completedSets).every((sets) => Array.isArray(sets) && sets.every(Number.isInteger)) &&
      Array.isArray(workout.skippedActionIndexes) && workout.skippedActionIndexes.every(Number.isInteger) && workout.feedback && Number.isFinite(workout.feedback.effort) && optionalText(workout.feedback.pain) && optionalText(workout.feedback.note) &&
      (!workout.sessionSnapshot || sessionValid(workout.sessionSnapshot)) &&
      ["skipReasons", "actionPain"].every((key) => !workout[key] || Object.values(workout[key]).every((value) => value === null || typeof value === "string")) &&
      (!workout.actualSets || Object.values(workout.actualSets).every((rows) => rows && typeof rows === "object" && Object.values(rows).every((row) => row && Object.values(row).every((value) => value === "" || Number.isFinite(value)))));
  }
  if (stored.version !== 1 || (stored.plan && !planValid(stored.plan))) throw new Error("无效计划");
  for (const [key, value] of Object.entries(fallback.profile)) {
    const saved = stored.profile?.[key];
    if (saved === undefined) continue;
    if (Array.isArray(value) ? !texts(saved) : typeof saved !== typeof value) throw new Error("无效资料");
  }
  if (stored.messages && (!Array.isArray(stored.messages) || !stored.messages.every((message) => ["user", "assistant"].includes(message?.role) && typeof message.text === "string"))) throw new Error("无效对话");
  if (stored.workoutHistory && (!Array.isArray(stored.workoutHistory) || !stored.workoutHistory.every((record) => workoutValid(record) && Number.isFinite(record.completedAt) && Number.isFinite(new Date(record.completedAt).getTime()) && optionalText(record.adjustmentStatus) && optionalText(record.adjustmentMessage) && (!record.adjustmentChanges || texts(record.adjustmentChanges))))) throw new Error("无效记录");
  if (stored.activeWorkout?.sessionSnapshot && (!workoutValid(stored.activeWorkout) || !stored.activeWorkout.sessionSnapshot.actions.length)) throw new Error("无效进行中训练");
  const proposal = stored.pendingAdjustment;
  if (proposal && (!planValid(proposal.plan) || !texts(proposal.changes) || typeof proposal.message !== "string" || !Number.isInteger(proposal.baseRevision))) throw new Error("无效调整建议");
  if (proposal?.profile) validateSavedState({ version: 1, profile: proposal.profile }, fallback);
}

export function loadProductState(storage) {
  const fallback = createProductState();
  let raw;
  try {
    raw = storage.getItem(PRODUCT_STATE_KEY);
    const stored = JSON.parse(raw || "null");
    if (!stored) return fallback;
    validateSavedState(stored, fallback);
    const plan = Array.isArray(stored.plan?.sessions) && stored.plan.sessions.length && stored.plan.sessions.every((session) => Array.isArray(session.actions))
      ? identifyPlan({ ...stored.plan, id: stored.plan.id || "plan-legacy" }) : null;
    const activeDay = Math.max(0, Math.min(
      Number.isInteger(stored.activeDay) ? stored.activeDay : 0,
      Math.max(0, (plan?.sessions.length || 1) - 1),
    ));
    const workoutSession = plan?.sessions.find(
      (session) => session.day === stored.activeWorkout?.sessionDay && session.actions?.length,
    );
    const activeWorkout = workoutSession &&
      stored.activeWorkout?.completedSets &&
      Array.isArray(stored.activeWorkout.skippedActionIndexes) &&
      stored.activeWorkout.feedback
      ? {
          ...stored.activeWorkout,
          planId: stored.activeWorkout.planId || plan.id,
          planRevision: stored.activeWorkout.planRevision || plan.revision,
          sessionId: stored.activeWorkout.sessionId || workoutSession.id,
          sessionSnapshot: stored.activeWorkout.sessionSnapshot || structuredClone(workoutSession),
          actualSets: stored.activeWorkout.actualSets || {},
          skipReasons: stored.activeWorkout.skipReasons || {},
          actionPain: stored.activeWorkout.actionPain || {},
          replacements: stored.activeWorkout.replacements || [],
          currentActionIndex: Math.max(0, Math.min(
            Math.trunc(Number(stored.activeWorkout.currentActionIndex)) || 0,
            (stored.activeWorkout.sessionSnapshot || workoutSession).actions.length - 1,
          )),
        }
      : null;
    return {
      ...fallback,
      ...stored,
      plan,
      activeDay,
      nextDay: Math.max(0, Math.min(Math.trunc(Number(stored.nextDay)) || 0, (plan?.sessions.length || 1) - 1)),
      activeWorkout,
      pendingAdjustment: stored.pendingAdjustment ? { ...stored.pendingAdjustment, changes: describePlanChanges(plan, stored.pendingAdjustment.plan) } : null,
      profile: { ...fallback.profile, ...(stored.profile || {}) },
      messages: Array.isArray(stored.messages) && stored.messages.length ? stored.messages : fallback.messages,
      workoutHistory: Array.isArray(stored.workoutHistory) ? stored.workoutHistory : [],
    };
  } catch {
    let isolated = false;
    try {
      if (raw && !storage.getItem("fitness-coach-recovery-v1")) storage.setItem("fitness-coach-recovery-v1", raw);
      isolated = Boolean(raw) && storage.getItem("fitness-coach-recovery-v1") === raw;
    } catch { /* If quarantine cannot be written, preserve the primary value by blocking subsequent saves. */ }
    return { ...fallback, persistenceBlocked: !isolated, recoveryNotice: isolated
      ? "检测到无法读取的本机数据，原件已单独保留，可下载后尝试恢复。当前显示新的空白工作区。"
      : "本机数据无法读取，且未能创建安全副本。原存储不会被覆盖，请先下载原件或恢复有效备份。" };
  }
}
