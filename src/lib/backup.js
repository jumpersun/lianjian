import { compactTrainingData, loadProductState, PRODUCT_STATE_KEY } from "./productState.js";

const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const stateFields = ["version", "profile", "plan", "activeDay", "nextDay", "messages", "activeWorkout", "workoutHistory", "pendingAdjustment"];
const secretKey = /api.?key|token|password|secret|modelConfig/i;

export function exportBackup(state, now = Date.now()) {
  const data = Object.fromEntries(stateFields.map((key) => [key, state[key]]));
  return JSON.stringify({ format: "lianjian-backup", version: 1, exportedAt: now, data }, (key, value) => secretKey.test(key) ? undefined : compactTrainingData(key, value), 2);
}

function validateAction(action) {
  if (!action || typeof action.title !== "string" || !Number.isInteger(action.sets) || action.sets < 1 || action.sets > 6 || typeof action.reps !== "string" || typeof action.exercise?.id !== "string") throw new Error("备份中的动作数据不完整");
  for (const [key, pattern] of [["image", /^images\/[\w.-]+\.(jpg|jpeg|png|webp)$/i], ["gif_url", /^videos\/[\w.-]+\.gif$/i]]) {
    if (typeof action.exercise[key] !== "string" || !pattern.test(action.exercise[key]) || action.exercise[key].includes("..")) throw new Error("备份包含不可用的动作媒体地址");
  }
  for (const key of ["name", "body_part", "equipment", "target", "attribution"]) if (typeof action.exercise[key] !== "string") throw new Error("动作说明字段无效");
  if (!Array.isArray(action.exercise.instruction_steps?.zh) || !action.exercise.instruction_steps.zh.every((step) => typeof step === "string")) throw new Error("动作教学格式无效");
  for (const key of ["rest", "reason"]) if (action[key] !== undefined && typeof action[key] !== "string") throw new Error("动作训练量字段无效");
  if (action.alternative) validateAction({ ...action.alternative, alternative: null });
}

function validateSession(session) {
  if (!session || !Number.isInteger(session.day) || typeof session.title !== "string" || !Array.isArray(session.actions) || session.actions.length > 100) throw new Error("备份训练日格式不正确");
  session.actions.forEach(validateAction);
  if (session.focus !== undefined && typeof session.focus !== "string") throw new Error("训练日说明无效");
}

function validatePlan(plan) {
  if (plan === null) return;
  if (!plan || typeof plan.title !== "string" || !Array.isArray(plan.sessions) || !plan.sessions.length || plan.sessions.length > 6) throw new Error("备份计划格式不正确");
  plan.sessions.forEach(validateSession);
  for (const key of ["summary", "recovery", "coverageNote"]) if (plan[key] !== undefined && typeof plan[key] !== "string") throw new Error("计划说明字段无效");
}

function validateWorkout(workout) {
  if (!workout || typeof workout.id !== "string" || !Number.isInteger(workout.sessionDay) || !workout.completedSets || Array.isArray(workout.completedSets) || !Array.isArray(workout.skippedActionIndexes) || !workout.feedback) throw new Error("训练进度格式无效");
  if (!Object.values(workout.completedSets).every((sets) => Array.isArray(sets) && sets.every((value) => Number.isInteger(value) && value >= 0 && value < 6))) throw new Error("完成组次无效");
  if (!workout.skippedActionIndexes.every((value) => Number.isInteger(value) && value >= 0 && value < 100)) throw new Error("跳过位置无效");
  if (!Number.isFinite(workout.feedback.effort) || workout.feedback.effort < 1 || workout.feedback.effort > 10 || !["无", "轻微", "明显", "未评估"].includes(workout.feedback.pain) || typeof workout.feedback.note !== "string") throw new Error("训练反馈无效");
  for (const key of ["skipReasons", "actionPain"]) if (workout[key] && !Object.values(workout[key]).every((value) => value === null || typeof value === "string")) throw new Error("动作反馈无效");
  if (workout.actualSets && !Object.values(workout.actualSets).every((rows) => rows && typeof rows === "object" && Object.values(rows).every((row) => row && Object.values(row).every((value) => value === "" || (Number.isFinite(value) && value >= 0 && value <= 3600))))) throw new Error("实际组次无效");
  if (workout.sessionSnapshot) validateSession(workout.sessionSnapshot);
  for (const key of ["completedSetCount", "plannedSetCount", "skippedCount", "completionRate", "unfinishedSetCount"]) if (workout[key] !== undefined && (!Number.isFinite(workout[key]) || workout[key] < 0)) throw new Error("训练统计无效");
}

export function parseBackup(text) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error("备份过大，请选择 10 MB 以内的练见备份文件");
  let envelope;
  try { envelope = JSON.parse(text); } catch { throw new Error("不是有效的 JSON 备份文件"); }
  if (envelope?.format !== "lianjian-backup" || envelope.version !== 1 || envelope.data?.version !== 1) throw new Error("不是支持的练见备份版本");
  const data = envelope.data;
  validatePlan(data.plan);
  if (!data.profile || typeof data.profile !== "object" || Array.isArray(data.profile)) throw new Error("备份缺少训练资料");
  for (const key of ["age", "height", "weight", "frequency"]) if (!Number.isFinite(data.profile[key])) throw new Error("备份资料数值无效");
  if (!Array.isArray(data.profile.equipment) || !data.profile.equipment.every((value) => typeof value === "string") || !Array.isArray(data.profile.limitations) || !data.profile.limitations.every((value) => typeof value === "string")) throw new Error("备份训练条件无效");
  for (const key of ["level", "gender", "goal", "duration", "place", "equipmentMode", "limitation", "painNote", "avoidExercises"]) if (typeof data.profile[key] !== "string") throw new Error("备份资料字段无效");
  if (!["完全初学者", "有一些经验的初学者", "中级健身爱好者", "高级运动员"].includes(data.profile.level) || !["bodyweight", "available"].includes(data.profile.equipmentMode)) throw new Error("备份训练水平或器械模式无效");
  if (![data.activeDay, data.nextDay ?? 0].every((value) => Number.isInteger(value) && value >= 0 && value < 6)) throw new Error("备份当前训练日无效");
  if (!Array.isArray(data.messages) || !data.messages.every((item) => ["user", "assistant"].includes(item?.role) && typeof item.text === "string")) throw new Error("备份对话格式不正确");
  if (!Array.isArray(data.workoutHistory)) throw new Error("备份训练记录不正确");
  data.workoutHistory.forEach((record) => {
    if (!record?.id || !Number.isFinite(record.completedAt) || !Number.isFinite(new Date(record.completedAt).getTime())) throw new Error("备份训练记录时间无效");
    validateWorkout(record);
    if (record.adjustmentMessage !== undefined && typeof record.adjustmentMessage !== "string") throw new Error("调整说明无效");
    if (record.adjustmentStatus !== undefined && typeof record.adjustmentStatus !== "string") throw new Error("调整状态无效");
    if (record.adjustmentChanges && (!Array.isArray(record.adjustmentChanges) || !record.adjustmentChanges.every((change) => typeof change === "string"))) throw new Error("调整明细无效");
  });
  if (data.activeWorkout) {
    validateSession(data.activeWorkout.sessionSnapshot);
    validateWorkout(data.activeWorkout);
    if (!data.activeWorkout.sessionSnapshot.actions.length || !Number.isInteger(data.activeWorkout.currentActionIndex) || data.activeWorkout.currentActionIndex < 0 || data.activeWorkout.currentActionIndex >= data.activeWorkout.sessionSnapshot.actions.length) throw new Error("当前动作位置无效");
    if (!data.activeWorkout.completedSets || !Array.isArray(data.activeWorkout.skippedActionIndexes) || !data.activeWorkout.feedback) throw new Error("备份训练进度不完整");
  }
  // Import business data only; never restore endpoints, credentials, or unreviewed AI proposals.
  const clean = JSON.parse(exportBackup({ ...data, pendingAdjustment: null })).data;
  const restored = loadProductState({ getItem: (key) => key === PRODUCT_STATE_KEY ? JSON.stringify(clean) : null });
  if (data.activeWorkout && !restored.activeWorkout) throw new Error("备份训练进度无法对应到计划");
  return restored;
}
