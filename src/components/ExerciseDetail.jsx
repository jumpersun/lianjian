import { useEffect, useState } from "react";
import { bodyPartLabel, equipmentLabel, exerciseTitle, targetLabel } from "../data/exerciseTaxonomy.js";
import { useModalDialog } from "../lib/useModalDialog.js";
import { SelectMenu } from "./SelectMenu.jsx";
import { coreMetadata, LEVEL_LABELS } from "../data/coreExercises.js";
import { ExerciseMedia } from "./ExerciseMedia.jsx";
import { exerciseMediaEnabled } from "../lib/exerciseMedia.js";

export function ExerciseDetail({
  exercise,
  onClose,
  onAddToPlan,
  plannedDayIndexes,
  planSessions,
  defaultDay,
  isPlanLocked,
  onOpenPlan,
  onCreatePlan,
}) {
  const dialogRef = useModalDialog(Boolean(exercise), onClose);
  const [selectedDay, setSelectedDay] = useState(defaultDay || 0);
  const [isMotionPlaying, setIsMotionPlaying] = useState(false);
  const [confirmedUnreviewed, setConfirmedUnreviewed] = useState(false);

  useEffect(() => {
    setSelectedDay(defaultDay || 0);
    setIsMotionPlaying(false);
    setConfirmedUnreviewed(false);
  }, [defaultDay, exercise]);

  if (!exercise) return null;
  const title = exerciseTitle(exercise);
  const steps = exercise.instruction_steps?.zh || [];
  const dayOptions = planSessions.map((session, index) => ({ label: `训练 ${String.fromCharCode(64 + session.day)}`, value: index }));
  const isInSelectedDay = plannedDayIndexes.includes(selectedDay);
  const metadata = coreMetadata(exercise);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="exercise-dialog" role="dialog" aria-modal="true" aria-labelledby="exercise-dialog-title">
        <div className="dialog-topbar">
          <span>动作教学</span>
          <button type="button" onClick={onClose} data-dialog-initial-focus>关闭</button>
        </div>
        <div className="dialog-layout">
          <div className="dialog-media">
            <ExerciseMedia exercise={exercise} animated={isMotionPlaying} alt={`${title}动作演示`} />
            {exerciseMediaEnabled && <button className="media-toggle" type="button" onClick={() => setIsMotionPlaying((current) => !current)}>
              {isMotionPlaying ? "暂停演示" : "播放演示"}
            </button>}
          </div>
          <div className="dialog-content">
            <div className="dialog-title-row">
              <div>
                <h2 id="exercise-dialog-title">{title}</h2>
                {title !== exercise.name && <p className="original-name">{exercise.name}</p>}
              </div>
              <div className="dialog-plan-actions">
                {planSessions.length > 0 && (
                  <SelectMenu
                    value={selectedDay}
                    options={dayOptions}
                    onChange={(value) => setSelectedDay(Number(value))}
                    label="加入训练日"
                    variant="filter"
                    disabled={isPlanLocked}
                  />
                )}
                {isInSelectedDay ? (
                  <button className="save-button is-saved" type="button" onClick={onOpenPlan}>
                    已在训练 {String.fromCharCode(64 + planSessions[selectedDay]?.day)} · 查看计划
                  </button>
                ) : planSessions.length ? (
                  <button className="save-button" type="button" onClick={() => onAddToPlan(exercise, selectedDay)} disabled={isPlanLocked || (!metadata && !confirmedUnreviewed)}>
                    {isPlanLocked ? "完成训练后可添加" : `加入训练 ${String.fromCharCode(64 + planSessions[selectedDay]?.day)}`}
                  </button>
                ) : (
                  <button className="save-button" type="button" onClick={onCreatePlan}>先创建计划</button>
                )}
              </div>
            </div>
            <div className="dialog-tags">
              <span>{bodyPartLabel(exercise.body_part)}</span>
              <span>{equipmentLabel(exercise.equipment)}</span>
              <span>{targetLabel(exercise.target)}</span>
              {metadata && <span>{LEVEL_LABELS[metadata.level]} · {metadata.purpose}</span>}
            </div>
            <div className="exercise-quality-note">
              {metadata ? <p>{metadata.cue}<small>{metadata.reviewStatus}，不代表适用于伤病训练。</small></p> : <><p>该动作未纳入核心推荐池，难度和中文说明尚未核验。请先核对教学与所需器械，不建议初学者自行尝试高难度动作。</p>{planSessions.length > 0 && !isInSelectedDay && <label><input type="checkbox" checked={confirmedUnreviewed} onChange={(event) => setConfirmedUnreviewed(event.target.checked)} /> 我已确认动作和器械适合自己，手动加入</label>}</>}
            </div>
            <div className="instruction-block">
              <h3>动作步骤</h3>
              {steps.length ? (
                <ol>
                  {steps.map((step, index) => <li key={`${exercise.id}-step-${index}`}>{step}</li>)}
                </ol>
              ) : (
                <p>{exercise.instructions?.zh || "暂无中文说明。"}</p>
              )}
            </div>
            <div className="safety-callout">
              <strong>训练提醒</strong>
              <p>{exercise.equipment === "body weight" ? "先熟悉动作与可控制的幅度。" : "先用可控制的轻负荷熟悉动作。"}出现疼痛、眩晕或明显不适时停止，不要为了完成组数勉强继续。</p>
            </div>
            <p className="media-attribution">{exerciseMediaEnabled ? `媒体来源：${exercise.attribution}` : "文字数据来源：hasaneyldrm/exercises-dataset（MIT）。第三方媒体不随开源版分发。"}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
