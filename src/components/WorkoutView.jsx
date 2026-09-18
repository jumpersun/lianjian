import { useEffect, useMemo, useState } from "react";
import { bodyPartLabel, equipmentLabel } from "../data/exerciseTaxonomy.js";
import { useModalDialog } from "../lib/useModalDialog.js";
import { SelectMenu } from "./SelectMenu.jsx";
import { summarizeWorkoutCompletion } from "../lib/planner.js";
import { ExerciseMedia } from "./ExerciseMedia.jsx";

function restSeconds(rest) {
  const value = Number.parseInt(String(rest || "").match(/\d+/)?.[0] || "45", 10);
  return Number.isFinite(value) ? value : 45;
}

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function WorkoutView({
  isOpen,
  plan,
  workout,
  onPause,
  onDispatch,
  onOpenExercise,
  onReplace,
  onComplete,
  isCompleting,
}) {
  const dialogRef = useModalDialog(isOpen, onPause);
  const [now, setNow] = useState(Date.now());
  const [skipReason, setSkipReason] = useState("时间不足");
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    if (isOpen) dialogRef.current?.querySelector("#workout-title")?.focus({ preventScroll: true });
    setShowSkip(false);
  }, [isOpen, workout?.currentActionIndex, workout?.phase, dialogRef]);

  useEffect(() => {
    if (!isOpen || !workout?.restEndsAt) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [isOpen, workout?.restEndsAt]);

  const session = useMemo(
    () => workout?.sessionSnapshot || plan?.sessions.find((item) => item.day === workout?.sessionDay),
    [plan, workout?.sessionDay, workout?.sessionSnapshot],
  );

  if (!isOpen || !workout || !session?.actions.length) return null;
  const actionIndex = Math.max(0, Math.min(workout.currentActionIndex, session.actions.length - 1));
  const action = session.actions[actionIndex];
  const completedForAction = workout.completedSets[actionIndex] || [];
  const completedActions = session.actions.filter((item, index) =>
    (workout.completedSets[index] || []).length >= item.sets,
  ).length;
  const progress = Math.round((completedActions / session.actions.length) * 100);
  const remainingRest = workout.restEndsAt ? workout.restEndsAt - now : 0;
  const summary = summarizeWorkoutCompletion(plan, workout);

  return (
    <div className="workout-backdrop" role="presentation">
      <section ref={dialogRef} className="workout-dialog" role="dialog" aria-modal="true" aria-labelledby="workout-title">
        <div className="workout-topbar">
          <div>
            <span>{session.title} · 已完成 {summary.completedSetCount}/{summary.plannedSetCount} 组</span>
            <div className="workout-progress" aria-label={`训练进度 ${progress}%`}>
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          <button type="button" onClick={onPause} disabled={isCompleting} data-dialog-initial-focus>暂存退出</button>
        </div>

        {workout.phase === "feedback" ? (
          <div className="workout-feedback">
            <span className="section-kicker">完成记录</span>
            <h2 id="workout-title" tabIndex={-1}>今天练得怎么样？</h2>
            <p>已完成 {summary.completedSetCount} 组 · 跳过 {summary.skippedCount} 个动作 · 未完成 {summary.unfinishedSetCount} 组。记录先保存，后续建议确认后才生效。</p>
            {Object.keys(workout.actionPain || {}).length > 0 && <p className="pain-alert" role="alert">已记录不适动作：{Object.keys(workout.actionPain).map((index) => session.actions[index]?.title).join("、")}。请停止诱发不适的动作；持续或明显疼痛时寻求专业意见。</p>}

            <label className="feedback-field">
              <span>主观强度 <strong>{workout.feedback.effort}/10</strong></span>
              <input
                type="range"
                min="1"
                max="10"
                value={workout.feedback.effort}
                disabled={isCompleting}
                onChange={(event) => onDispatch({
                  type: "workout.feedback",
                  feedback: { effort: Number(event.target.value) },
                })}
              />
              <small>1 很轻松 · 10 已到极限</small>
            </label>

            <fieldset className="pain-options">
              <legend>训练中是否有疼痛？</legend>
              <div>
                {["无", "轻微", "明显", "未评估"].map((pain) => (
                  <button
                    type="button"
                    className={workout.feedback.pain === pain ? "is-active" : ""}
                    aria-pressed={workout.feedback.pain === pain}
                    disabled={isCompleting}
                    key={pain}
                    onClick={() => onDispatch({ type: "workout.feedback", feedback: { pain } })}
                  >
                    {pain}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="feedback-field">
              <span>补充说明</span>
              <textarea
                value={workout.feedback.note}
                onChange={(event) => onDispatch({ type: "workout.feedback", feedback: { note: event.target.value } })}
                placeholder="例如：右肩发紧，最后一组动作变形"
                rows="3"
                disabled={isCompleting}
              />
            </label>

            <div className="workout-feedback-actions">
              <button type="button" onClick={() => onDispatch({ type: "workout.navigate", actionIndex })} disabled={isCompleting}>返回训练</button>
              <button className="primary-button" type="button" onClick={onComplete} disabled={isCompleting}>
                {isCompleting ? "正在保存…" : summary.completionRate < 1 ? "保存本次部分训练" : "保存并完成训练"}
              </button>
            </div>
          </div>
        ) : (
          <div className="workout-layout">
            <div className="workout-media">
              <ExerciseMedia exercise={action.exercise} alt={`${action.title}动作示意图`} />
              <button type="button" onClick={() => onOpenExercise(action.exercise)}>查看动作教学与步骤</button>
            </div>

            <div className="workout-content">
              <span className="workout-step">动作 {actionIndex + 1} / {session.actions.length}</span>
              <h2 id="workout-title" tabIndex={-1}>{action.title}</h2>
              <p className="workout-meta">{bodyPartLabel(action.exercise.body_part)} · {equipmentLabel(action.exercise.equipment)}</p>
              <p className="workout-reason">{action.reason}</p>
              {action.alternative && (
                <p className="workout-alternative">
                  {action.alternative.kind || "替代动作"}：{action.alternative.title}
                </p>
              )}

              <div className="workout-prescription">
                <div><span>训练量</span><strong>{action.sets} 组 × {action.reps}</strong></div>
                <div><span>组间休息</span><strong>{action.rest?.replace("组间休息 ", "") || "45 秒"}</strong></div>
              </div>

              {remainingRest > 0 && (
                <div className="rest-timer" role="timer" aria-live="polite">
                  <span>休息倒计时</span>
                  <strong>{formatTime(remainingRest)}</strong>
                  <button type="button" onClick={() => onDispatch({ type: "workout.rest.stop" })}>跳过休息</button>
                </div>
              )}

              <div className="set-checklist" aria-label="完成组次">
                {Array.from({ length: action.sets }, (_, setIndex) => {
                  const isComplete = completedForAction.includes(setIndex);
                  return (
                    <div className="set-record" key={setIndex}>
                    <button
                      type="button"
                      className={isComplete ? "is-complete" : ""}
                      aria-pressed={isComplete}
                      disabled={Boolean(workout.actionPain?.[actionIndex])}
                      onClick={() => onDispatch({
                        type: "workout.toggleSet",
                        actionIndex,
                        setIndex,
                        now: Date.now(),
                        restSeconds: restSeconds(action.rest),
                      })}
                    >
                      <span>{isComplete ? "已完成" : `第 ${setIndex + 1} 组`}</span>
                      <strong>{action.reps}</strong>
                    </button>
                    <label><span>实际{/秒|分钟/.test(action.reps) ? "秒数" : "次数"}</span><input type="number" inputMode="numeric" min="0" max="3600" placeholder="选填" value={workout.actualSets?.[actionIndex]?.[setIndex]?.amount ?? ""} aria-label={`第 ${setIndex + 1} 组实际数量`} onChange={(event) => onDispatch({ type: "workout.actual", actionIndex, setIndex, field: "amount", value: event.target.value })} /></label>
                    {action.exercise.equipment !== "body weight" && <label><span>重量 kg</span><input type="number" inputMode="decimal" min="0" max="500" step="0.5" placeholder="选填" aria-label={`第 ${setIndex + 1} 组重量`} value={workout.actualSets?.[actionIndex]?.[setIndex]?.weight ?? ""} onChange={(event) => onDispatch({ type: "workout.actual", actionIndex, setIndex, field: "weight", value: event.target.value })} /></label>}
                    </div>
                  );
                })}
              </div>

              <div className="workout-secondary-actions">
                <button type="button" onClick={() => onReplace(actionIndex)} disabled={completedForAction.length > 0 || Boolean(workout.actionPain?.[actionIndex])}>替换本次动作</button>
                <button type="button" onClick={() => setShowSkip(!showSkip)}>跳过剩余组次</button>
                <button className="pain-button" type="button" onClick={() => onDispatch({ type: "workout.pain", actionIndex, pain: "训练中不适" })}>疼痛 / 不适，停止动作</button>
              </div>
              {workout.skippedActionIndexes.includes(actionIndex) && <p>已跳过：{workout.skipReasons?.[actionIndex] || "未说明"}。勾选新组次可恢复此动作。</p>}
              {showSkip && <div className="skip-panel"><SelectMenu label="跳过原因" value={skipReason} options={["时间不足", "器械不可用", "动作不会做", "强度过高", "其他原因"]} onChange={setSkipReason} /><button className="secondary-button" type="button" onClick={() => { onDispatch({ type: "workout.skip", actionIndex, reason: skipReason }); setShowSkip(false); }}>确认跳过</button></div>}
              <button className="end-workout-button" type="button" onClick={() => onDispatch({ type: "workout.review" })}>提前结束并保存记录</button>

              <div className="workout-navigation">
                <button
                  type="button"
                  onClick={() => onDispatch({ type: "workout.navigate", actionIndex: actionIndex - 1 })}
                  disabled={actionIndex === 0}
                >
                  上一个
                </button>
                {actionIndex < session.actions.length - 1 ? (
                  <button className="primary-button" type="button" onClick={() => onDispatch({ type: "workout.navigate", actionIndex: actionIndex + 1 })}>
                    下一个动作
                  </button>
                ) : (
                  <button className="primary-button" type="button" onClick={() => onDispatch({ type: "workout.review" })}>
                    结束并填写反馈
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
