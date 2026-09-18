import { exerciseTitle } from "../data/exerciseTaxonomy.js";
import { chatCompletionsUrl, isCustomModelReady } from "./modelConfig.js";
import { alternativeKind, estimateSessionMinutes, isEligibleExercise } from "./planner.js";
import { sameMovement } from "../data/coreExercises.js";

const endpoint = import.meta.env?.VITE_AI_PLAN_ENDPOINT;
const REQUEST_TIMEOUT_MS = 12_000;

const oneOf = (options) => (value) => options.includes(value);
const integerWithin = (minimum, maximum) => (value) => Number.isInteger(value) && value >= minimum && value <= maximum;
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const MEDIA_PATH_PATTERNS = {
  images: /^images\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$/i,
  videos: /^videos\/[A-Za-z0-9._-]+\.gif$/i,
};
const isSafeMediaPath = (value, directory) =>
  isNonEmptyString(value) && MEDIA_PATH_PATTERNS[directory].test(value) && !value.includes("..");

const PROFILE_VALIDATORS = {
  level: oneOf(["完全初学者", "有一些经验的初学者", "中级健身爱好者", "高级运动员"]),
  gender: oneOf(["不限", "女性", "男性"]),
  age: integerWithin(16, 80),
  height: integerWithin(130, 220),
  weight: integerWithin(35, 220),
  goal: oneOf(["减脂塑形", "增肌塑形", "提升力量", "改善体能"]),
  frequency: integerWithin(1, 6),
  duration: oneOf(["15–20分钟", "30分钟", "45分钟", "60分钟"]),
  place: oneOf(["家里", "健身房", "户外"]),
  equipmentMode: oneOf(["available", "bodyweight"]),
  limitation: oneOf(["没有身体限制", "膝盖需要保护", "腰背需要保护", "肩部需要保护", "手腕需要保护"]),
  intensityOffset: integerWithin(-1, 2),
};

export function hasRemoteAi(config) {
  return isCustomModelReady(config) || Boolean(endpoint);
}

function isValidAction(action) {
  return Boolean(
    action &&
      isNonEmptyString(action.title) &&
      Number.isInteger(action.sets) &&
      action.sets > 0 &&
      isNonEmptyString(action.reps) &&
      isNonEmptyString(action.exercise?.id) &&
      isNonEmptyString(action.exercise.name) &&
      isSafeMediaPath(action.exercise.image, "images") &&
      isSafeMediaPath(action.exercise.gif_url, "videos") &&
      isNonEmptyString(action.exercise.body_part) &&
      isNonEmptyString(action.exercise.equipment) &&
      isNonEmptyString(action.exercise.target) &&
      isNonEmptyString(action.exercise.instructions?.zh) &&
      Array.isArray(action.exercise.instruction_steps?.zh) &&
      action.exercise.instruction_steps.zh.length > 0 &&
      action.exercise.instruction_steps.zh.every(isNonEmptyString) &&
      isNonEmptyString(action.exercise.attribution),
  );
}

export function isValidRemotePlan(plan) {
  return Boolean(
    plan &&
      isNonEmptyString(plan.title) &&
      isNonEmptyString(plan.summary) &&
      isNonEmptyString(plan.recovery) &&
      Array.isArray(plan.sessions) &&
      plan.sessions.length > 0 &&
      plan.sessions.every(
        (session) =>
          session &&
          Number.isInteger(session.day) &&
          session.day > 0 &&
          isNonEmptyString(session.title) &&
          isNonEmptyString(session.focus) &&
          Number.isFinite(session.estimatedMinutes) &&
          session.estimatedMinutes > 0 &&
          Array.isArray(session.actions) &&
          session.actions.length > 0 &&
          session.actions.every(isValidAction),
      ),
  );
}

export function normalizeRemoteProfile(baseProfile, remoteProfile) {
  return Object.entries(PROFILE_VALIDATORS).reduce((profile, [key, isValid]) => {
    if (isValid(remoteProfile?.[key])) profile[key] = remoteProfile[key];
    return profile;
  }, { ...baseProfile });
}

function safeModelText(value, fallback, maximumLength = 240) {
  return isNonEmptyString(value) ? value.trim().slice(0, maximumLength) : fallback;
}

function safeReps(value) {
  const match = String(value || "").match(/^(\d+)(?:[–-](\d+))?\s*(次|秒)$/);
  if (!match || Number(match[1]) < 1 || Number(match[2] || match[1]) > (match[3] === "秒" ? 120 : 30) || Number(match[2] || match[1]) < Number(match[1])) return "8–10 次";
  return value;
}

function safeRest(value) {
  const seconds = Number(String(value || "").match(/\d+/)?.[0]);
  return `组间休息 ${seconds >= 15 && seconds <= 180 ? seconds : 45} 秒`;
}

function constrainedBaseline(plan, profile) {
  if (!profile.level) return plan;
  return { ...plan, sessions: plan.sessions.map((session) => ({ ...session, actions: session.actions
    .filter((action) => isEligibleExercise(action.exercise, profile))
    .map((action) => ({ ...action, alternative: action.alternative && isEligibleExercise(action.alternative.exercise, profile) && sameMovement(action.exercise, action.alternative.exercise) ? action.alternative : null })) })) };
}

export function hydrateCustomPlan(rawPlan, exercises) {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  if (!rawPlan || !Array.isArray(rawPlan.sessions) || !rawPlan.sessions.length) {
    throw new Error("自定义模型没有返回可用训练日");
  }
  const sessions = rawPlan.sessions.slice(0, 6).map((session, sessionIndex) => {
    if (!Array.isArray(session.actions) || !session.actions.length) {
      throw new Error("自定义模型没有返回可用动作");
    }
    const actions = session.actions.slice(0, 8).map((action) => {
      const exercise = exerciseById.get(String(action.exerciseId || action.exercise?.id || ""));
      if (!exercise) throw new Error("自定义模型返回了动作白名单之外的内容");
      const requestedAlternative = exerciseById.get(String(action.alternativeExerciseId || ""));
      const fallbackAlternative = exercises.find(
        (candidate) =>
          candidate.id !== exercise.id &&
          sameMovement(candidate, exercise) &&
          alternativeKind(candidate),
      );
      const alternativeExercise = requestedAlternative && sameMovement(requestedAlternative, exercise) && alternativeKind(requestedAlternative)
        ? requestedAlternative
        : fallbackAlternative;
      return {
        title: exerciseTitle(exercise),
        exercise,
        sets: integerWithin(1, 6)(action.sets) ? action.sets : 2,
        reps: safeReps(action.reps),
        rest: safeRest(action.rest),
        reason: safeModelText(action.reason, "符合你当前的目标与训练条件。", 120),
        alternative: alternativeExercise && alternativeExercise.id !== exercise.id
          ? {
              title: exerciseTitle(alternativeExercise),
              exercise: alternativeExercise,
              sets: integerWithin(1, 6)(action.sets) ? action.sets : 2,
              reps: safeReps(action.reps),
              rest: safeRest(action.rest),
              reason: "同一训练方向的可执行替代动作。",
              kind: alternativeKind(alternativeExercise),
            }
          : null,
      };
    });
    if (new Set(actions.map((action) => action.exercise.id)).size !== actions.length) throw new Error("自定义模型在同一训练日重复安排了同一动作");
    return {
      day: sessionIndex + 1,
      title: safeModelText(session.title, `第 ${sessionIndex + 1} 天训练`, 60),
      focus: safeModelText(session.focus, "全身协调与基础体能", 100),
      estimatedMinutes: estimateSessionMinutes(actions),
      actions,
    };
  });
  return {
    source: "custom",
    title: safeModelText(rawPlan.title, "AI 个性化训练计划", 80),
    summary: safeModelText(rawPlan.summary, "根据你的目标、器械和身体状态生成。", 240),
    recovery: safeModelText(rawPlan.recovery, "两次力量训练之间至少留出 1 天恢复。", 240),
    sessions,
  };
}

export function hydrateRemotePlan(remotePlan, safePlan) {
  if (!isValidRemotePlan(remotePlan) || !safePlan?.sessions?.length) {
    throw new Error("AI 服务返回的数据结构不完整");
  }
  const idBasedPlan = {
    title: remotePlan.title,
    summary: remotePlan.summary,
    recovery: remotePlan.recovery,
    sessions: remotePlan.sessions.map((session) => ({
      day: session.day,
      title: session.title,
      focus: session.focus,
      estimatedMinutes: session.estimatedMinutes,
      actions: session.actions.map((action) => ({
        exerciseId: action.exercise.id,
        alternativeExerciseId: action.alternative?.exercise?.id,
        sets: action.sets,
        reps: action.reps,
        rest: action.rest,
        reason: action.reason,
      })),
    })),
  };
  return {
    ...hydrateCustomPlan(idBasedPlan, customExerciseWhitelist(safePlan)),
    source: "remote",
  };
}

async function requestRemote(payload, requireReply, safePlan) {
  if (!endpoint) return null;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AI 服务返回 HTTP ${response.status}`);
    const result = await response.json();
    if (
      !isValidRemotePlan(result?.plan) ||
      !result?.profile ||
      typeof result.profile !== "object" ||
      (requireReply && typeof result.reply !== "string")
    ) {
      throw new Error("AI 服务返回的数据结构不完整");
    }
    return {
      ...result,
      profile: { ...normalizeRemoteProfile(payload.profile, result.profile), limitation: payload.profile.limitation, equipmentMode: payload.profile.equipmentMode, level: payload.profile.level },
      plan: hydrateRemotePlan(result.plan, safePlan),
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

function compactPlan(plan) {
  return {
    title: plan.title,
    summary: plan.summary,
    recovery: plan.recovery,
    sessions: plan.sessions.map((session) => ({
      day: session.day,
      title: session.title,
      focus: session.focus,
      estimatedMinutes: session.estimatedMinutes,
      actions: session.actions.map((action) => ({
        exerciseId: action.exercise.id,
        title: action.title,
        equipment: action.exercise.equipment,
        bodyPart: action.exercise.body_part,
        target: action.exercise.target,
        sets: action.sets,
        reps: action.reps,
        rest: action.rest,
        reason: action.reason,
        alternativeExerciseId: action.alternative?.exercise.id || null,
        alternativeTitle: action.alternative?.title || null,
      })),
    })),
  };
}

function customExerciseWhitelist(plan) {
  const exercises = [];
  const ids = new Set();
  plan.sessions.forEach((session) => {
    session.actions.forEach((action) => {
      [action.exercise, action.alternative?.exercise].filter(Boolean).forEach((exercise) => {
        if (!ids.has(exercise.id)) {
          ids.add(exercise.id);
          exercises.push(exercise);
        }
      });
    });
  });
  return exercises;
}

function parseCustomModelContent(content) {
  const normalized = String(content || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(normalized);
}

async function requestCustomModel({ type, profile, plan, message, config, fetchImpl = fetch }) {
  if (!isCustomModelReady(config) || !plan) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const baseline = compactPlan(plan);
  const prompt = [
    "你是谨慎的中文健身计划助手。只能使用基准计划里出现的 exerciseId 或 alternativeExerciseId，不得创造动作。",
    "请遵守用户的器材、疼痛与身体限制。返回纯 JSON，不要 Markdown。",
    '格式为 {"profile":{},"reply":"...","plan":{"title":"...","summary":"...","recovery":"...","sessions":[{"day":1,"title":"...","focus":"...","estimatedMinutes":30,"actions":[{"exerciseId":"0001","sets":2,"reps":"8–10 次","rest":"组间休息 45 秒","reason":"选择原因","alternativeExerciseId":"0002"}]}]}}。',
    `任务类型：${type === "adjust" ? "根据用户消息调整计划" : "生成并解释计划"}`,
    `用户资料：${JSON.stringify(profile)}`,
    `用户消息：${message || "请基于资料生成计划"}`,
    `安全基准计划：${JSON.stringify(baseline)}`,
  ].join("\n");
  try {
    const response = await fetchImpl(chatCompletionsUrl(config), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: "你输出安全、可执行、严格结构化的中文健身计划。" },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`自定义模型返回 HTTP ${response.status}`);
    const body = await response.json();
    const parsed = parseCustomModelContent(body?.choices?.[0]?.message?.content);
    const whitelist = customExerciseWhitelist(plan);
    return {
      profile: { ...normalizeRemoteProfile(profile, parsed.profile), limitation: profile.limitation, equipmentMode: profile.equipmentMode, level: profile.level },
      plan: hydrateCustomPlan(parsed.plan || parsed, whitelist),
      reply: safeModelText(parsed.reply, "已按照你的要求更新训练计划。", 360),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function testCustomModel(config, fetchImpl = fetch) {
  if (!isCustomModelReady(config)) throw new Error("请先填写完整的模型地址、名称和 API Key");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(chatCompletionsUrl(config), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 8,
        messages: [{ role: "user", content: "只回复 OK" }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`连接失败（HTTP ${response.status}）`);
    const body = await response.json();
    if (!isNonEmptyString(body?.choices?.[0]?.message?.content)) throw new Error("模型响应格式不兼容");
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

export function requestRemotePlan(profile, options = {}) {
  if (options.config?.mode === "custom") {
    return isCustomModelReady(options.config)
      ? requestCustomModel({ type: "create", profile, ...options })
      : Promise.resolve(null);
  }
  if (!options.plan) return Promise.resolve(null);
  return requestRemote({ type: "create", profile, plan: compactPlan(options.plan) }, false, options.plan);
}

export function requestRemoteAdjustment(payload, options = {}) {
  payload = { ...payload, plan: constrainedBaseline(payload.plan, payload.profile) };
  if (options.config?.mode === "custom") {
    return isCustomModelReady(options.config)
      ? requestCustomModel({ type: "adjust", ...payload, ...options })
      : Promise.resolve(null);
  }
  return requestRemote(
    { ...payload, type: "adjust", plan: compactPlan(payload.plan) },
    true,
    payload.plan,
  );
}
