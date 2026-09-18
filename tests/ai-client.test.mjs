import assert from "node:assert/strict";
import test from "node:test";
import {
  hydrateCustomPlan,
  hydrateRemotePlan,
  isValidRemotePlan,
  normalizeRemoteProfile,
  requestRemotePlan,
} from "../src/lib/aiClient.js";

const validPlan = {
  title: "三日训练计划",
  summary: "每周训练三次。",
  recovery: "训练之间安排恢复日。",
  sessions: [
    {
      day: 1,
      title: "全身训练",
      focus: "基础动作",
      estimatedMinutes: 30,
      actions: [
        {
          title: "四分之三仰卧起坐",
          exercise: {
            id: "0001",
            name: "3/4 sit-up",
            image: "images/0001.jpg",
            gif_url: "videos/0001.gif",
            body_part: "waist",
            equipment: "body weight",
            target: "abs",
            instructions: { zh: "平躺并收紧腹部。" },
            instruction_steps: { zh: ["平躺并屈膝。", "缓慢卷起上半身。"] },
            attribution: "© Gym visual",
          },
          sets: 2,
          reps: "8–10 次",
        },
      ],
    },
  ],
};

test("自定义模型不能在同一训练日重复安排同一动作", () => {
  const exercise = validPlan.sessions[0].actions[0].exercise;
  assert.throws(() => hydrateCustomPlan({ sessions: [{ actions: [
    { exerciseId: exercise.id, sets: 2, reps: "8–10 次" },
    { exerciseId: exercise.id, sets: 2, reps: "8–10 次" },
  ] }] }, [exercise]), /重复安排/);
});

test("模型返回异常剂量时使用有界默认值，不信任其估算时长", () => {
  const exercise = validPlan.sessions[0].actions[0].exercise;
  const plan = hydrateCustomPlan({ sessions: [{ estimatedMinutes: 9999, actions: [
    { exerciseId: exercise.id, sets: 999, reps: "999 次", rest: "休息 999 秒" },
  ] }] }, [exercise]);
  const action = plan.sessions[0].actions[0];
  assert.equal(action.sets, 2);
  assert.equal(action.reps, "8–10 次");
  assert.equal(action.rest, "组间休息 45 秒");
  assert.ok(plan.sessions[0].estimatedMinutes > 0 && plan.sessions[0].estimatedMinutes < 9999);
});

test("远端计划必须包含至少一个可渲染训练日", () => {
  assert.equal(isValidRemotePlan(validPlan), true);
  assert.equal(isValidRemotePlan({ ...validPlan, sessions: [] }), false);
});

test("远端计划会拒绝缺少动作数据的响应", () => {
  const withoutActions = {
    ...validPlan,
    sessions: [{ ...validPlan.sessions[0], actions: [] }],
  };
  const withoutImage = {
    ...validPlan,
    sessions: [
      {
        ...validPlan.sessions[0],
        actions: [
          {
            ...validPlan.sessions[0].actions[0],
            exercise: { ...validPlan.sessions[0].actions[0].exercise, image: undefined },
          },
        ],
      },
    ],
  };
  const withoutGif = {
    ...validPlan,
    sessions: [
      {
        ...validPlan.sessions[0],
        actions: [
          {
            ...validPlan.sessions[0].actions[0],
            exercise: { ...validPlan.sessions[0].actions[0].exercise, gif_url: undefined },
          },
        ],
      },
    ],
  };
  const emptyGif = {
    ...validPlan,
    sessions: [
      {
        ...validPlan.sessions[0],
        actions: [
          {
            ...validPlan.sessions[0].actions[0],
            exercise: { ...validPlan.sessions[0].actions[0].exercise, gif_url: "" },
          },
        ],
      },
    ],
  };
  const unsafeGif = {
    ...validPlan,
    sessions: [
      {
        ...validPlan.sessions[0],
        actions: [
          {
            ...validPlan.sessions[0].actions[0],
            exercise: { ...validPlan.sessions[0].actions[0].exercise, gif_url: "videos/../secret.gif" },
          },
        ],
      },
    ],
  };
  const encodedTraversalGif = {
    ...validPlan,
    sessions: [
      {
        ...validPlan.sessions[0],
        actions: [
          {
            ...validPlan.sessions[0].actions[0],
            exercise: { ...validPlan.sessions[0].actions[0].exercise, gif_url: "videos/%2e%2e/index.html" },
          },
        ],
      },
    ],
  };
  assert.equal(isValidRemotePlan(withoutActions), false);
  assert.equal(isValidRemotePlan(withoutImage), false);
  assert.equal(isValidRemotePlan(withoutGif), false);
  assert.equal(isValidRemotePlan(emptyGif), false);
  assert.equal(isValidRemotePlan(unsafeGif), false);
  assert.equal(isValidRemotePlan(encodedTraversalGif), false);
});

test("远端计划会拒绝不可渲染的文本字段", () => {
  const invalidTitle = {
    ...validPlan,
    sessions: [
      {
        ...validPlan.sessions[0],
        actions: [{ ...validPlan.sessions[0].actions[0], title: {} }],
      },
    ],
  };
  const invalidName = {
    ...validPlan,
    sessions: [
      {
        ...validPlan.sessions[0],
        actions: [
          {
            ...validPlan.sessions[0].actions[0],
            exercise: { ...validPlan.sessions[0].actions[0].exercise, name: {} },
          },
        ],
      },
    ],
  };
  assert.equal(isValidRemotePlan(invalidTitle), false);
  assert.equal(isValidRemotePlan(invalidName), false);
});

test("远端计划会拒绝空白教学内容和无效时长", () => {
  const emptyInstructions = {
    ...validPlan,
    sessions: [
      {
        ...validPlan.sessions[0],
        actions: [
          {
            ...validPlan.sessions[0].actions[0],
            exercise: { ...validPlan.sessions[0].actions[0].exercise, instructions: { zh: "" } },
          },
        ],
      },
    ],
  };
  const blankStep = {
    ...validPlan,
    sessions: [
      {
        ...validPlan.sessions[0],
        actions: [
          {
            ...validPlan.sessions[0].actions[0],
            exercise: { ...validPlan.sessions[0].actions[0].exercise, instruction_steps: { zh: ["   "] } },
          },
        ],
      },
    ],
  };
  const negativeDuration = {
    ...validPlan,
    sessions: [{ ...validPlan.sessions[0], estimatedMinutes: -15 }],
  };
  assert.equal(isValidRemotePlan(emptyInstructions), false);
  assert.equal(isValidRemotePlan(blankStep), false);
  assert.equal(isValidRemotePlan(negativeDuration), false);
});

test("远端资料中的无效值不会覆盖本地可用资料", () => {
  const localProfile = {
    duration: "30分钟",
    limitation: "没有身体限制",
    goal: "减脂塑形",
    age: 28,
  };
  const normalized = normalizeRemoteProfile(localProfile, {
    duration: null,
    limitation: null,
    goal: "提升力量",
    age: "未知",
    frequency: 2.5,
  });
  assert.deepEqual(normalized, {
    duration: "30分钟",
    limitation: "没有身体限制",
    goal: "提升力量",
    age: 28,
  });
});

test("自定义模型只能从提供的动作白名单中组装计划", () => {
  const exercise = validPlan.sessions[0].actions[0].exercise;
  const customResult = hydrateCustomPlan(
    {
      title: "AI 三日计划",
      summary: "根据当前条件调整。",
      recovery: "隔日恢复。",
      sessions: [
        {
          day: 1,
          title: "全身训练",
          focus: "基础动作",
          estimatedMinutes: 30,
          actions: [
            {
              exerciseId: exercise.id,
              sets: 3,
              reps: "10 次",
              rest: "组间休息 45 秒",
              reason: "适合当前目标。",
            },
          ],
        },
      ],
    },
    [exercise],
  );

  assert.equal(customResult.source, "custom");
  assert.equal(customResult.sessions[0].actions[0].exercise, exercise);
  assert.throws(
    () => hydrateCustomPlan({ ...customResult, sessions: [{ ...customResult.sessions[0], actions: [{ exerciseId: "unknown", sets: 2, reps: "8 次" }] }] }, [exercise]),
    /动作白名单/,
  );
});

test("系统远端计划也会用本地白名单动作重新组装", () => {
  const canonicalExercise = validPlan.sessions[0].actions[0].exercise;
  const tamperedPlan = structuredClone(validPlan);
  tamperedPlan.sessions[0].actions[0].exercise.name = "被远端篡改的名称";

  const hydrated = hydrateRemotePlan(tamperedPlan, validPlan);
  assert.equal(hydrated.source, "remote");
  assert.equal(hydrated.sessions[0].actions[0].exercise, canonicalExercise);

  const unknownPlan = structuredClone(validPlan);
  unknownPlan.sessions[0].actions[0].exercise.id = "outside-whitelist";
  assert.throws(() => hydrateRemotePlan(unknownPlan, validPlan), /动作白名单/);
});

test("自定义模型配置会调用兼容接口并返回可渲染计划", async () => {
  let capturedRequest;
  const exercise = validPlan.sessions[0].actions[0].exercise;
  const fetchImpl = async (url, options) => {
    capturedRequest = { url, options };
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  profile: { goal: "提升力量" },
                  reply: "已生成计划。",
                  plan: {
                    title: "自定义模型计划",
                    summary: "只使用动作白名单。",
                    recovery: "隔日恢复。",
                    sessions: [
                      {
                        day: 1,
                        title: "基础训练",
                        focus: "核心",
                        estimatedMinutes: 20,
                        actions: [{ exerciseId: exercise.id, sets: 2, reps: "8 次" }],
                      },
                    ],
                  },
                }),
              },
            },
          ],
        };
      },
    };
  };

  const result = await requestRemotePlan(
    { goal: "减脂塑形" },
    {
      config: { mode: "custom", baseUrl: "https://example.com/v1", model: "fitness-model", apiKey: "secret" },
      plan: validPlan,
      fetchImpl,
    },
  );

  assert.equal(capturedRequest.url, "https://example.com/v1/chat/completions");
  assert.equal(capturedRequest.options.headers.Authorization, "Bearer secret");
  assert.equal(result.plan.sessions[0].actions[0].exercise.id, exercise.id);
  assert.equal(result.plan.source, "custom");
  assert.equal(result.profile.goal, "提升力量");
});
