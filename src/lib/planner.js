import { equipmentLabel, exerciseTitle, targetLabel } from "../data/exerciseTaxonomy.js";
import { coreMetadata, LEVEL_LABELS, normalizeCatalogExercise, sameMovement } from "../data/coreExercises.js";

export const DEFAULT_PROFILE = {
  level: "完全初学者",
  gender: "不限",
  age: 28,
  height: 170,
  weight: 65,
  goal: "减脂塑形",
  frequency: 3,
  duration: "30分钟",
  place: "家里",
  equipmentMode: "bodyweight",
  equipment: ["body weight"],
  limitation: "没有身体限制",
  limitations: [],
  painNote: "",
  avoidExercises: "",
  intensityOffset: 0,
};

const THEME_SETS = {
  1: [{ title: "全身启动", focus: "全身协调与基础体能", parts: ["chest", "back", "upper legs", "waist", "cardio"] }],
  2: [
    { title: "上肢与核心", focus: "推、拉与躯干稳定", parts: ["chest", "back", "shoulders", "upper arms", "waist"] },
    { title: "腿臀与心肺", focus: "下肢力量与耐力", parts: ["upper legs", "lower legs", "waist", "cardio", "upper legs"] },
  ],
  3: [
    { title: "上肢推力", focus: "胸、肩、肱三头肌", parts: ["chest", "shoulders", "upper arms", "waist"] },
    { title: "后链拉力", focus: "背部、肱二头肌与后链", parts: ["back", "upper arms", "upper legs", "waist"] },
    { title: "腿臀心肺", focus: "下肢与循环能力", parts: ["upper legs", "lower legs", "cardio", "waist"] },
  ],
  4: [
    { title: "上肢力量 A", focus: "胸背基础", parts: ["chest", "back", "upper arms", "waist"] },
    { title: "下肢力量 A", focus: "腿臀基础", parts: ["upper legs", "lower legs", "waist", "cardio"] },
    { title: "上肢力量 B", focus: "肩臂稳定", parts: ["shoulders", "back", "upper arms", "chest"] },
    { title: "下肢力量 B", focus: "后链与心肺", parts: ["upper legs", "waist", "cardio", "lower legs"] },
  ],
  5: [
    { title: "胸肩推", focus: "推力与肩胛控制", parts: ["chest", "shoulders", "upper arms", "waist"] },
    { title: "背臂拉", focus: "背部与握力", parts: ["back", "upper arms", "lower arms", "waist"] },
    { title: "腿臀", focus: "髋膝主导动作", parts: ["upper legs", "lower legs", "waist", "upper legs"] },
    { title: "全身循环", focus: "低间歇综合训练", parts: ["cardio", "chest", "back", "waist"] },
    { title: "活动恢复", focus: "轻量激活与恢复", parts: ["waist", "shoulders", "upper legs", "cardio"] },
  ],
  6: [
    { title: "推力", focus: "胸肩臂", parts: ["chest", "shoulders", "upper arms", "waist"] },
    { title: "拉力", focus: "背部与手臂", parts: ["back", "upper arms", "lower arms", "waist"] },
    { title: "腿臀", focus: "下肢力量", parts: ["upper legs", "lower legs", "waist", "upper legs"] },
    { title: "心肺", focus: "循环能力", parts: ["cardio", "waist", "cardio", "upper legs"] },
    { title: "全身力量", focus: "复合动作", parts: ["chest", "back", "upper legs", "shoulders"] },
    { title: "主动恢复", focus: "轻量活动", parts: ["waist", "shoulders", "cardio", "upper legs"] },
  ],
};

const HIGH_IMPACT_PATTERN = /(jump|\brun|burpee|hop|skip|mountain climber|high knee)/i;
const ACCESSORY_RULES = [
  { value: "bench", pattern: /\b(?:bench(?:es)?|chairs?)\b/i },
  { value: "pull-up bar", pattern: /(pull.?up|chin.?up|hanging|muscle.?up|front lever|back lever|inverted row)/i },
  { value: "dip bars", pattern: /\bdips?\b/i },
  { value: "balance board", pattern: /balance board/i },
];
const ACCESSORY_LABELS = {
  bench: "卧推凳",
  "pull-up bar": "单杠",
  "dip bars": "双杠",
  "balance board": "平衡板",
};

const EQUIPMENT_BY_PLACE = {
  家里: new Set(["body weight", "band", "resistance band", "dumbbell", "stability ball", "wheel roller", "rope"]),
  健身房: null,
  户外: new Set(["body weight", "band", "resistance band", "rope"]),
};

function seededNumber(profile) {
  return `${profile.goal}-${profile.frequency}-${profile.duration}-${profile.place}`
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);
}

function isSafeForProfile(exercise, profile) {
  const name = exercise.name.toLowerCase();
  const restrictions = [profile.limitation, ...(profile.limitations || []), profile.painNote]
    .filter(Boolean)
    .join(" ");
  if (coreMetadata(exercise)?.cautions.some((part) => restrictions.includes(part))) return false;
  if (
    restrictions.includes("膝") &&
    (["upper legs", "lower legs", "cardio"].includes(exercise.body_part) || /(squat|lunge|jump|\brun)/.test(name))
  ) return false;
  if (
    (restrictions.includes("腰") || restrictions.includes("背")) &&
    /(deadlift|back extension|good morning|hyperextension)/.test(name)
  ) return false;
  if (
    restrictions.includes("肩") &&
    (exercise.body_part === "shoulders" || /(overhead|military press|front raise|lateral raise)/.test(name))
  ) return false;
  if (restrictions.includes("腕") && /(push.?up|plank|handstand|wrist)/.test(name)) return false;
  const normalizeAvoidanceText = (value) => value.toLocaleLowerCase("zh-CN").replace(/[\s_-]+/g, "");
  const avoidedTerms = String(profile.avoidExercises || "")
    .toLocaleLowerCase("zh-CN")
    .split(/[,，、;；\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  const searchableName = normalizeAvoidanceText(`${name} ${exerciseTitle(exercise)}`);
  if (avoidedTerms.some((term) => searchableName.includes(normalizeAvoidanceText(term)))) return false;
  return true;
}

export function requiredAccessory(exercise) {
  return ACCESSORY_RULES.find((rule) => rule.pattern.test(exercise.name))?.value || null;
}

function allowedForProfile(exercise, profile) {
  const accessory = requiredAccessory(exercise);
  if (profile.equipmentMode === "bodyweight") {
    return exercise.equipment === "body weight" && !accessory;
  }
  if (Array.isArray(profile.equipment) && profile.equipment.length) {
    const selected = new Set(profile.equipment);
    if (selected.has("band")) selected.add("resistance band");
    if (selected.has("resistance band")) selected.add("band");
    if (!selected.has(exercise.equipment)) return false;
    if (accessory && !selected.has(accessory)) return false;
    return true;
  }
  const allowed = EQUIPMENT_BY_PLACE[profile.place];
  return !allowed || allowed.has(exercise.equipment);
}

export function isEligibleExercise(exercise, profile) {
  const metadata = coreMetadata(exercise);
  const level = ["完全初学者", "有一些经验的初学者", "中级健身爱好者", "高级运动员"].indexOf(profile.level);
  return Boolean(metadata && metadata.level <= Math.max(0, level) && allowedForProfile(exercise, profile) && isSafeForProfile(exercise, profile));
}

export function planCompatibilityIssues(plan, profile) {
  return (plan?.sessions || []).flatMap((session, dayIndex) => session.actions
    .filter((action) => coreMetadata(action.exercise) && !isEligibleExercise(action.exercise, profile))
    .map((action) => ({ dayIndex, title: action.title, exerciseId: action.exercise.id })));
}

export function estimateSessionMinutes(actions) {
  if (!actions.length) return 0;
  // Planning estimate: 5 min preparation/cool-down, 30 sec transitions, 3 sec per repetition.
  const seconds = actions.reduce((total, action) => {
    const values = String(action.reps).match(/\d+/g)?.map(Number) || [10];
    const amount = Math.min(300, Math.max(...values));
    const workSeconds = /秒/.test(action.reps) ? amount : /分钟/.test(action.reps) ? amount * 60 : amount * 3;
    const rest = Math.min(300, Number(String(action.rest).match(/\d+/)?.[0] || 45));
    return total + action.sets * workSeconds + Math.max(0, action.sets - 1) * rest;
  }, 300 + Math.max(0, actions.length - 1) * 30);
  return Math.ceil(seconds / 60);
}

export function recalculatePlan(plan) {
  return { ...plan, sessions: plan.sessions.map((session) => ({ ...session, estimatedMinutes: estimateSessionMinutes(session.actions) })) };
}

function exercisePrescription(exercise, profile, intensityOffset = 0) {
  const isCardio = exercise.body_part === "cardio";
  const isBeginner = profile.level === "完全初学者";
  let sets = isBeginner ? 2 : 3;
  if (profile.goal === "增肌塑形") sets += 1;
  sets = Math.max(1, sets + intensityOffset);

  if (isCardio) {
    return { sets, reps: isBeginner ? "30 秒" : "45 秒", rest: "组间休息 30 秒" };
  }
  if (profile.goal === "提升力量") {
    return { sets, reps: isBeginner ? "8 次" : "6–8 次", rest: "组间休息 90 秒" };
  }
  if (profile.goal === "增肌塑形") {
    return { sets, reps: "8–12 次", rest: "组间休息 60 秒" };
  }
  return { sets, reps: isBeginner ? "8–10 次" : "12–15 次", rest: "组间休息 45 秒" };
}

function actionReason(exercise, profile) {
  const accessory = requiredAccessory(exercise);
  const equipmentReason = exercise.equipment === "body weight" && !accessory
    ? "无需额外器械"
    : `匹配你选择的${accessory ? ACCESSORY_LABELS[accessory] : equipmentLabel(exercise.equipment)}`;
  const metadata = coreMetadata(exercise);
  return metadata
    ? `${metadata.purpose} · ${LEVEL_LABELS[metadata.level]}动作，${equipmentReason}。${metadata.cue}`
    : `主要训练${targetLabel(exercise.target)}；该动作未纳入核心推荐池，请先确认器械、动作难度和身体适用性。`;
}

function toPlanAction(exercise, profile, intensityOffset = 0) {
  return {
    exercise,
    title: exerciseTitle(exercise),
    reason: actionReason(exercise, profile),
    ...exercisePrescription(exercise, profile, intensityOffset),
  };
}

export function alternativeKind(exercise) {
  if (!coreMetadata(exercise)) return null;
  if (exercise.equipment === "body weight" && !requiredAccessory(exercise)) return "无器械替代";
  return HIGH_IMPACT_PATTERN.test(exercise.name) ? null : "低冲击替代";
}

function replacementCandidates(exercise, profile, exercises, excludedIds = new Set()) {
  const eligible = exercises.filter(
    (candidate) =>
      candidate.id !== exercise.id &&
      !excludedIds.has(candidate.id) &&
      isEligibleExercise(candidate, profile) &&
      sameMovement(exercise, candidate),
  );
  return eligible
    .filter((candidate) => alternativeKind(candidate))
    .sort((left, right) => {
      const leftRank = left.equipment === "body weight" ? 0 : 1;
      const rightRank = right.equipment === "body weight" ? 0 : 1;
      return leftRank - rightRank || left.id.localeCompare(right.id);
    });
}

export function createPlanAction(exercise, profile, exercises = [], options = {}) {
  const intensityOffset = options.intensityOffset ?? profile.intensityOffset ?? 0;
  const action = toPlanAction(exercise, profile, intensityOffset);
  const alternatives = replacementCandidates(exercise, profile, exercises, options.excludedIds);
  const alternativeExercise = alternatives[0];
  return {
    ...action,
    alternative: alternativeExercise
      ? { ...toPlanAction(alternativeExercise, profile, intensityOffset), kind: alternativeKind(alternativeExercise) }
      : null,
  };
}

export function findAlternativeAction(action, profile, exercises, excludedIds = []) {
  const alternatives = replacementCandidates(action.exercise, profile, exercises, new Set(excludedIds));
  const replacement = alternatives[0];
  return replacement ? createPlanAction(replacement, profile, exercises, { excludedIds: new Set(excludedIds) }) : null;
}

function targetActionCount(duration) {
  if (duration.includes("15") || duration.includes("20")) return 3;
  if (duration.includes("45")) return 5;
  if (duration.includes("60")) return 6;
  return 4;
}

function pickAction({ exercises, part, profile, used, seed, index, intensityOffset }) {
  const eligible = exercises.filter(
    (exercise) => isEligibleExercise(exercise, profile) && !used.has(exercise.id),
  );
  const partMatches = eligible.filter((exercise) => exercise.body_part === part);
  const candidates = (partMatches.length ? partMatches : eligible)
    .sort((left, right) => {
      return coreMetadata(left).level - coreMetadata(right).level || left.id.localeCompare(right.id);
    });

  const pool = candidates;
  if (!pool.length) return null;
  const exercise = pool[(seed + index) % Math.min(pool.length, 3)];
  used.add(exercise.id);
  // Avoid repeating two variants of the same movement in one session.
  exercises.filter((item) => sameMovement(exercise, item)).forEach((item) => used.add(item.id));
  const alternativePool = replacementCandidates(exercise, profile, exercises);
  const alternativeExercise = alternativePool[(seed + index * 3) % Math.max(1, Math.min(alternativePool.length, 12))];
  return {
    ...toPlanAction(exercise, profile, intensityOffset),
    alternative: alternativeExercise
      ? { ...toPlanAction(alternativeExercise, profile, intensityOffset), kind: alternativeKind(alternativeExercise) }
      : null,
  };
}

export function generatePlan(profile, exercises, options = {}) {
  exercises = exercises.map(normalizeCatalogExercise);
  const normalizedFrequency = Math.max(1, Math.min(6, Number(profile.frequency) || 3));
  const themes = THEME_SETS[normalizedFrequency];
  const seed = seededNumber(profile);
  const actionCount = targetActionCount(profile.duration);
  const intensityOffset = options.intensityOffset ?? profile.intensityOffset ?? 0;
  const sessions = themes.map((theme, sessionIndex) => {
    const used = new Set();
    const parts = profile.level === "完全初学者"
      ? ["chest", "upper legs", "waist", "lower legs", "upper arms", "back"]
      : [...theme.parts];
    while (parts.length < actionCount) parts.push(parts[parts.length % theme.parts.length]);
    const actions = parts
      .slice(0, actionCount)
      .map((part, actionIndex) =>
        pickAction({
          exercises,
          part,
          profile,
          used,
          seed: seed + sessionIndex * 11,
          index: actionIndex,
          intensityOffset,
        }),
      )
      .filter(Boolean);
    const minuteBudget = /15|20/.test(profile.duration) ? 20 : Number.parseInt(profile.duration, 10) || 30;
    while (actions.length > 1 && estimateSessionMinutes(actions) > minuteBudget) actions.pop();
    return {
      day: sessionIndex + 1,
      ...theme,
      title: `训练 ${String.fromCharCode(65 + sessionIndex)}`,
      focus: [...new Set(actions.map((action) => coreMetadata(action.exercise).purpose))].join(" · "),
      estimatedMinutes: estimateSessionMinutes(actions),
      actions,
    };
  });

  return {
    source: "local",
    title: `${profile.goal} · ${normalizedFrequency} 次轮转计划`,
    summary: `目标每周 ${normalizedFrequency} 次，可用时间 ${profile.duration}。按 A/B/C 顺序轮转，不绑定星期；时长由实际动作估算，含约 5 分钟准备与收尾。`,
    coverageNote: "自动编排仅使用已标注核心动作，并非专业审核。候选不足时保留较短方案，不用不匹配的动作补数；当前器械未覆盖的训练方向需另行安排。",
    recovery: normalizedFrequency >= 5 ? "每 3 天安排一次低强度日，并保证睡眠。" : "两次力量训练之间至少留出 1 天恢复。",
    sessions,
  };
}

export function refinePlan(message, plan, profile, exercises) {
  const nextProfile = { ...profile };
  let reply = "本地模式尚不能理解这个要求，计划未改变。可使用下方快捷调整、修改训练条件，或在设置中连接自定义模型。";
  let matched = true;

  if (/(膝|膝盖)/.test(message)) {
    nextProfile.limitation = "膝盖需要保护";
    reply = "已避开跳跃、跑步和髋膝主导动作，改成以上肢与核心为主。若疼痛持续，请先咨询医生或康复师。";
  } else if (/(腰|下背|腰椎)/.test(message)) {
    nextProfile.limitation = "腰背需要保护";
    reply = "已按腰背限制重新筛选核心推荐池；候选不足时不会补入其他未核验动作。这不是康复训练方案。";
  } else if (/(肩|肩膀)/.test(message)) {
    nextProfile.limitation = "肩部需要保护";
    reply = "已按肩部限制排除相关核心动作；程序筛选不能保证动作不会诱发疼痛，请以实际身体反应和专业指导为准。";
  } else if (/(徒手|无器械|不带器械)/.test(message)) {
    nextProfile.place = "家里";
    nextProfile.equipmentMode = "bodyweight";
    reply = "已切换为无器械方案，计划只会使用徒手动作。";
  } else if (/(家里|居家)/.test(message)) {
    nextProfile.place = "家里";
    nextProfile.equipmentMode = "available";
    reply = "已切换为居家训练，仍只使用你勾选拥有的器械。";
  } else if (/(短|没时间|20\s*分钟|十五分钟|15\s*分钟)/.test(message)) {
    nextProfile.duration = "15–20分钟";
    reply = "已压缩为 15–20 分钟：每次保留 3 个关键动作，减少切换成本。";
  } else if (/(加强|更难|强度.{0,3}高|加量)/.test(message)) {
    nextProfile.intensityOffset = Math.min(2, (profile.intensityOffset || 0) + 1);
    reply = "已把主要动作增加 1 组。先保证动作标准；若最后两次仍很轻松，再逐步加重量。";
  } else if (/(轻松|简单|降低|强度低)/.test(message)) {
    nextProfile.intensityOffset = Math.max(-1, (profile.intensityOffset || 0) - 1);
    reply = "已把每个动作减少 1 组，并保留完整热身与休息。";
  } else {
    matched = false;
  }

  return {
    profile: nextProfile,
    plan: matched ? generatePlan(nextProfile, exercises) : plan,
    changed: matched,
    reply,
    previousPlan: plan,
  };
}

export function summarizeWorkoutCompletion(plan, workout) {
  const session = workout?.sessionSnapshot || plan?.sessions.find((item) => item.day === workout?.sessionDay);
  if (!session) {
    return { completedSetCount: 0, plannedSetCount: 0, skippedCount: 0, completionRate: 0 };
  }
  const plannedSetCount = session.actions.reduce((total, action) => total + action.sets, 0);
  const completedSetCount = session.actions.reduce((total, action, actionIndex) => {
    const completedSets = [...new Set(workout.completedSets?.[actionIndex] || [])].filter((index) => Number.isInteger(index) && index >= 0 && index < action.sets);
    return total + Math.min(action.sets, completedSets.length);
  }, 0);
  const skippedCount = (workout.skippedActionIndexes || []).filter(
    (actionIndex) => actionIndex >= 0 && actionIndex < session.actions.length,
  ).length;
  return {
    completedSetCount,
    plannedSetCount,
    skippedCount,
    unfinishedSetCount: plannedSetCount - completedSetCount,
    completionRate: plannedSetCount ? completedSetCount / plannedSetCount : 0,
  };
}

export function adaptPlanFromFeedback(plan, sessionDay, feedback, completionSummary = null) {
  const hasLowCompletion = Boolean(
    completionSummary?.plannedSetCount && completionSummary.completionRate < 0.7,
  );
  const hasSkippedActions = Number(completionSummary?.skippedCount) > 0;
  const hasPain = feedback.pain !== "无";
  const shouldReduce = !hasPain && Number(feedback.effort) >= 8;
  const shouldIncrease =
    feedback.pain === "无" &&
    Number(feedback.effort) <= 4 &&
    (!completionSummary || (completionSummary.completionRate >= 0.9 && !hasSkippedActions));
  const sessions = plan.sessions.map((session) => {
    if (session.day !== sessionDay || (!shouldReduce && !shouldIncrease)) return session;
    return {
      ...session,
      actions: session.actions.map((action) => ({
        ...action,
        sets: shouldReduce ? Math.max(1, action.sets - 1) : Math.min(6, action.sets + 1),
      })),
    };
  });

  let message = "已记录本次训练反馈，下一次会延续当前训练量。";
  let recovery = plan.recovery;
  if (hasPain) {
    message = "已记录疼痛，暂不自动增减组数；先停止诱发不适的动作并寻求专业意见。";
  } else if (shouldReduce) {
    message = "本次主观强度偏高，建议下一次同一训练日每个动作减少 1 组。";
    recovery = "优先恢复，出现疼痛时停止训练。";
  } else if (shouldIncrease) {
    message = "本次训练完成得较轻松，建议下一次同一训练日每个动作增加 1 组。";
  } else if (hasLowCompletion || hasSkippedActions) {
    message = "本次有未完成或跳过动作，尚不能据此判断强度过高，建议保留训练量并确认原因。";
  }

  return {
    plan: recalculatePlan({
      ...plan,
      sessions,
      recovery,
      lastAdjustment: {
        sessionDay,
        feedback,
        completionSummary,
        direction: shouldReduce ? "down" : shouldIncrease ? "up" : "keep",
      },
    }),
    message,
  };
}
