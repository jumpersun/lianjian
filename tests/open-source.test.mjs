import assert from "node:assert/strict";
import { readFile, readdir, lstat } from "node:fs/promises";
import test from "node:test";
import { exerciseMediaEnabled, exerciseMediaUrl } from "../src/lib/exerciseMedia.js";
import { DEFAULT_PROFILE, generatePlan, planCompatibilityIssues } from "../src/lib/planner.js";

const exercises = JSON.parse(await readFile(new URL("../public/data/exercises.json", import.meta.url), "utf8"));

test("开源数据可独立读取，只含中英文，核心推荐可用", () => {
  assert.equal(exercises.length, 1324);
  assert.equal(new Set(exercises.map((exercise) => exercise.id)).size, exercises.length);
  assert.ok(exercises.every((exercise) => Object.keys(exercise.instructions).sort().join(",") === "en,zh"));
  assert.ok(generatePlan(DEFAULT_PROFILE, exercises).sessions.every((session) => session.actions.length > 0));
});

test("默认不开启第三方媒体，启用后仍限制为安全的本地路径", () => {
  assert.equal(exerciseMediaEnabled, false);
  assert.equal(exerciseMediaUrl("images/0001.jpg"), null);
  assert.equal(exerciseMediaUrl("images/0001.jpg", true, "/lianjian/"), "/lianjian/images/0001.jpg");
  for (const path of ["https://example.test/p.png", "../secret", "images/../secret.jpg", "images/%2e%2e/x.jpg", "videos/a.svg", undefined]) {
    assert.equal(exerciseMediaUrl(path, true), null);
  }
});

test("公开资源不包含媒体或指向仓库外的符号链接", async () => {
  async function check(directory) {
    for (const name of await readdir(directory)) {
      const path = new URL(name, directory);
      const info = await lstat(path);
      assert.equal(info.isSymbolicLink(), false, `${name} is a symlink`);
      if (info.isDirectory()) await check(new URL(`${name}/`, directory));
      else assert.ok(!/\.(gif|jpe?g|png|webp|mp4)$/i.test(name), `${name} is restricted media`);
    }
  }
  await check(new URL("../public/", import.meta.url));
});

test("旧计划在开始前可以列出与当前资料不匹配的动作", () => {
  const archer = exercises.find((exercise) => exercise.id === "3294");
  const plan = { sessions: [{ actions: [{ title: "射手俯卧撑", exercise: archer }] }] };
  assert.deepEqual(planCompatibilityIssues(plan, DEFAULT_PROFILE), [{ dayIndex: 0, title: "射手俯卧撑", exerciseId: "3294" }]);
  assert.deepEqual(planCompatibilityIssues(generatePlan(DEFAULT_PROFILE, exercises), DEFAULT_PROFILE), []);
  assert.deepEqual(planCompatibilityIssues(null, DEFAULT_PROFILE), []);
});
