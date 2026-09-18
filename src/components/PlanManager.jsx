import { useEffect, useMemo, useState } from "react";
import { bodyPartLabel, equipmentLabel } from "../data/exerciseTaxonomy.js";
import { ExerciseMedia } from "./ExerciseMedia.jsx";
import { useModalDialog } from "../lib/useModalDialog.js";
import { SelectMenu } from "./SelectMenu.jsx";

export function PlanManager({
  isOpen,
  plan,
  activeDay,
  activeWorkout,
  restoreTarget,
  onClose,
  onRestoreComplete,
  onOpenExercise,
  onMove,
  onMoveDay,
  onRemove,
  onReplace,
  onStartWorkout,
  onCreatePlan,
}) {
  const dialogRef = useModalDialog(isOpen, onClose);
  const [selectedDay, setSelectedDay] = useState(activeDay);

  useEffect(() => {
    if (!isOpen) return;
    const requestedDay = restoreTarget?.dayIndex ?? activeDay;
    setSelectedDay(Math.min(requestedDay, Math.max(0, (plan?.sessions.length || 1) - 1)));
  }, [activeDay, isOpen, plan?.sessions.length, restoreTarget?.dayIndex]);

  useEffect(() => {
    if (!isOpen || !restoreTarget || selectedDay !== restoreTarget.dayIndex) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const trigger = dialogRef.current?.querySelector(
        `[data-plan-position="${restoreTarget.dayIndex}-${restoreTarget.actionIndex}"]`,
      );
      trigger?.scrollIntoView({ block: "center" });
      trigger?.focus({ preventScroll: true });
      onRestoreComplete();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, onRestoreComplete, restoreTarget, selectedDay, dialogRef]);

  const dayOptions = useMemo(
    () => (plan?.sessions || []).map((session, index) => ({ label: `训练 ${String.fromCharCode(64 + session.day)}`, value: index })),
    [plan],
  );

  if (!isOpen) return null;
  const session = plan?.sessions[selectedDay];
  const actionCount = plan?.sessions.reduce((total, item) => total + item.actions.length, 0) || 0;

  return (
    <div className="dialog-backdrop plan-manager-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="plan-manager" role="dialog" aria-modal="true" aria-labelledby="plan-manager-title">
        <div className="dialog-topbar">
          <span>共 {actionCount} 个动作</span>
          <button type="button" onClick={onClose} data-dialog-initial-focus>关闭</button>
        </div>

        <div className="plan-manager-content">
          <div className="plan-manager-heading">
            <div>
              <span className="section-kicker">持续保存</span>
              <h2 id="plan-manager-title">我的计划</h2>
              <p>动作顺序、训练日和调整结果会自动保存在当前设备。</p>
            </div>
            {session?.actions.length > 0 && (
              <button className="primary-button" type="button" onClick={() => onStartWorkout(selectedDay)}>
                {activeWorkout ? "继续进行中的训练" : `开始训练 ${String.fromCharCode(64 + session.day)}`}
              </button>
            )}
          </div>

          {activeWorkout && (
            <div className="plan-lock-notice" role="status">
              当前训练正在进行。为避免完成组次与动作错配，请完成训练后再移动、删除或排序计划。
            </div>
          )}

          {!plan ? (
            <div className="plan-manager-empty">
              <strong>还没有训练计划</strong>
              <p>先让 AI 私教生成计划，再从动作库添加和调整动作。</p>
              <button type="button" onClick={onCreatePlan}>去制定计划</button>
            </div>
          ) : (
            <>
              <div className="day-tabs plan-manager-tabs" role="tablist" aria-label="管理训练日">
                {plan.sessions.map((item, index) => (
                  <button
                    key={`${item.day}-${item.title}`}
                    className={selectedDay === index ? "is-active" : ""}
                    type="button"
                    role="tab"
                    aria-selected={selectedDay === index}
                    onClick={() => setSelectedDay(index)}
                  >
                    训练 {String.fromCharCode(64 + item.day)} · {item.actions.length}
                  </button>
                ))}
              </div>

              {session?.actions.length ? (
                <div className="plan-manager-list">
                  {session.actions.map((action, actionIndex) => (
                    <article className="plan-manager-item" key={`${action.exercise.id}-${actionIndex}`}>
                      <button
                        className="plan-manager-exercise"
                        type="button"
                        data-plan-position={`${selectedDay}-${actionIndex}`}
                        onClick={() => onOpenExercise(action.exercise, selectedDay, actionIndex)}
                      >
                        <ExerciseMedia exercise={action.exercise} compact />
                        <span>
                          <strong>{action.title}</strong>
                          <small>{bodyPartLabel(action.exercise.body_part)} · {equipmentLabel(action.exercise.equipment)}</small>
                        </span>
                      </button>
                      <div className="plan-manager-dose">
                        <strong>{action.sets} 组 × {action.reps}</strong>
                        <span>{action.reason}</span>
                        {action.alternative && (
                          <span>{action.alternative.kind || "替代动作"}：{action.alternative.title}</span>
                        )}
                      </div>
                      <div className="plan-manager-controls">
                        <SelectMenu
                          value={selectedDay}
                          options={dayOptions}
                          onChange={(value) => onMoveDay(selectedDay, actionIndex, Number(value))}
                          label={`${action.title}的训练日`}
                          variant="filter"
                          disabled={Boolean(activeWorkout)}
                        />
                        <button type="button" onClick={() => onMove(selectedDay, actionIndex, -1)} disabled={Boolean(activeWorkout) || actionIndex === 0}>上移</button>
                        <button type="button" onClick={() => onMove(selectedDay, actionIndex, 1)} disabled={Boolean(activeWorkout) || actionIndex === session.actions.length - 1}>下移</button>
                        <button type="button" onClick={() => onReplace(selectedDay, actionIndex)} disabled={Boolean(activeWorkout)}>智能替换</button>
                        <button className="danger-link" type="button" onClick={() => onRemove(selectedDay, actionIndex)} disabled={Boolean(activeWorkout)}>移除</button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="plan-manager-empty compact">
                  <strong>这一天还没有动作</strong>
                  <p>可以从其他训练日移动动作，或前往动作库添加。</p>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
