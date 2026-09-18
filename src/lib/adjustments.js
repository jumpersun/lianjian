import { adaptPlanFromFeedback, recalculatePlan, summarizeWorkoutCompletion } from "./planner.js";

export function describePlanChanges(before, after) {
  const changes = [];
  const count = Math.max(before.sessions.length, after.sessions.length);
  for (let day = 0; day < count; day += 1) {
    const left = before.sessions[day]?.actions || [];
    const right = after.sessions[day]?.actions || [];
    const leftById = new Map(left.map((action) => [action.exercise.id, action]));
    const rightById = new Map(right.map((action) => [action.exercise.id, action]));
    const removed = left.filter((action) => !rightById.has(action.exercise.id));
    const added = right.filter((action) => !leftById.has(action.exercise.id));
    const label = `训练 ${String.fromCharCode(65 + day)}`;
    removed.forEach((action) => changes.push(`${label}：移除 ${action.title}`));
    added.forEach((action) => changes.push(`${label}：新增 ${action.title}，${action.sets} 组 × ${action.reps}`));
    right.forEach((b) => {
      const a = leftById.get(b.exercise.id);
      if (a && (a.sets !== b.sets || a.reps !== b.reps || a.rest !== b.rest)) changes.push(`${label} · ${a.title}：${a.sets} 组 × ${a.reps}，${a.rest || "休息未设定"} → ${b.sets} 组 × ${b.reps}，${b.rest || "休息未设定"}`);
    });
    const originalOrder = left.filter((action) => rightById.has(action.exercise.id)).map((action) => action.exercise.id);
    const nextOrder = right.filter((action) => leftById.has(action.exercise.id)).map((action) => action.exercise.id);
    if (originalOrder.join(",") !== nextOrder.join(",")) changes.push(`${label}：调整动作顺序为 ${right.map((action) => action.title).join(" → ")}`);
  }
  return changes;
}

export function feedbackProposal(plan, workout, profile) {
  const summary = summarizeWorkoutCompletion(plan, workout);
  const painIndexes = Object.keys(workout.actionPain || {}).map(Number);
  const hasPain = painIndexes.length > 0 || workout.feedback.pain !== "无";
  let result = adaptPlanFromFeedback(plan, workout.sessionDay, workout.feedback, summary);
  if (hasPain) {
    const painfulIds = new Set(painIndexes.map((index) => workout.sessionSnapshot.actions[index]?.exercise.id));
    result = {
      plan: recalculatePlan({ ...plan, sessions: plan.sessions.map((session) => ({ ...session, actions: session.actions.filter((action) => !painfulIds.has(action.exercise.id)) })) }),
      message: painfulIds.size
        ? "建议从后续计划暂时移除本次标记不适的动作，不自动增加强度或给出康复替代。疼痛持续或加重时，请停止训练并咨询专业人员。"
        : "本次报告了疼痛，但未关联具体动作，因此不自动修改训练量。请先确认不适动作并寻求专业意见。",
    };
  } else if (summary.completionRate < 0.7 || summary.skippedCount) {
    if (Number(workout.feedback.effort) < 8) {
      result = { plan, message: "本次有未完成内容。时间不足、器械不可用或主动跳过不等于强度过高，先保留原训练量；可在修改训练条件中缩短下次训练。" };
    }
  }
  return {
    basePlanId: plan.id, baseRevision: plan.revision, workoutId: workout.id,
    plan: result.plan, profile, message: result.message, source: "local",
    changes: describePlanChanges(plan, result.plan),
  };
}
