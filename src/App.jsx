import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { CoachView } from "./components/CoachView.jsx";
import { ExerciseDetail } from "./components/ExerciseDetail.jsx";
import { Header } from "./components/Header.jsx";
import { LibraryView } from "./components/LibraryView.jsx";
import { ModelSettings } from "./components/ModelSettings.jsx";
import { PlanManager } from "./components/PlanManager.jsx";
import { WorkoutView } from "./components/WorkoutView.jsx";
import { hasRemoteAi, requestRemoteAdjustment } from "./lib/aiClient.js";
import { loadModelConfig, persistModelConfig } from "./lib/modelConfig.js";
import { loadProductState, persistProductState, productStateReducer } from "./lib/productState.js";
import { describePlanChanges, feedbackProposal } from "./lib/adjustments.js";
import { exportBackup } from "./lib/backup.js";
import {
  createPlanAction,
  findAlternativeAction,
  isEligibleExercise,
  summarizeWorkoutCompletion,
} from "./lib/planner.js";
import { coreMetadata, normalizeCatalogExercise } from "./data/coreExercises.js";

function viewFromHash() {
  return window.location.hash === "#library" ? "library" : "coach";
}

export function App() {
  const [activeView, setActiveView] = useState(viewFromHash);
  const [exercises, setExercises] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [detailReturn, setDetailReturn] = useState(null);
  const [planRestoreTarget, setPlanRestoreTarget] = useState(null);
  const [productState, dispatch] = useReducer(
    productStateReducer,
    undefined,
    () => loadProductState(window.localStorage),
  );
  const [isWorkoutOpen, setIsWorkoutOpen] = useState(Boolean(productState.activeWorkout));
  const [modelConfig, setModelConfig] = useState(() =>
    loadModelConfig(window.localStorage, window.sessionStorage),
  );
  const [isCompletingWorkout, setIsCompletingWorkout] = useState(false);
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState("");
  const completionLock = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/exercises.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((items) => {
        setExercises(items.map(normalizeCatalogExercise));
        setDataError("");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setDataError(error.message || "未知错误");
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const result = persistProductState(window.localStorage, productState);
    setStorageError(result.ok ? "" : result.message);
  }, [productState]);

  useEffect(() => {
    function handleHashChange() {
      setActiveView(viewFromHash());
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const planCount = useMemo(
    () => productState.plan?.sessions.reduce((total, session) => total + session.actions.length, 0) || 0,
    [productState.plan],
  );
  const selectedExerciseDayIndexes = useMemo(
    () => productState.plan?.sessions.reduce((indexes, session, index) => {
      if (session.actions.some((action) => action.exercise.id === selectedExercise?.id)) indexes.push(index);
      return indexes;
    }, []) || [],
    [productState.plan, selectedExercise?.id],
  );

  const closeExercise = useCallback(() => {
    const returnTarget = detailReturn;
    setSelectedExercise(null);
    setDetailReturn(null);
    if (returnTarget?.type === "workout") {
      setIsWorkoutOpen(true);
    } else if (returnTarget?.type === "plan") {
      setPlanRestoreTarget(returnTarget);
      setIsPlanOpen(true);
    }
  }, [detailReturn]);

  function navigate(view) {
    if (view === activeView) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.location.hash = view === "library" ? "library" : "coach";
  }

  function openPlan() {
    setSelectedExercise(null);
    setDetailReturn(null);
    setIsWorkoutOpen(false);
    setIsPlanOpen(true);
  }

  function openExercise(exercise) {
    setDetailReturn(null);
    setSelectedExercise(exercise);
  }

  function openExerciseFromWorkout(exercise) {
    setDetailReturn({ type: "workout" });
    setIsWorkoutOpen(false);
    setSelectedExercise(exercise);
  }

  function openExerciseFromPlan(exercise, dayIndex, actionIndex) {
    setDetailReturn({ type: "plan", dayIndex, actionIndex, exerciseId: exercise.id });
    setIsPlanOpen(false);
    setSelectedExercise(exercise);
  }

  function createPlanFirst() {
    setSelectedExercise(null);
    setIsPlanOpen(false);
    navigate("coach");
    setToast("请先生成训练计划，再安排动作");
  }

  function addExerciseToPlan(exercise, dayIndex) {
    if (coreMetadata(exercise) && !isEligibleExercise(exercise, productState.profile)) {
      setToast("该动作不符合当前水平、器械或身体限制，请先核对训练条件");
      return;
    }
    if (productState.activeWorkout) {
      setToast("请先完成当前训练，再编辑计划");
      return;
    }
    if (!productState.plan?.sessions[dayIndex]) {
      createPlanFirst();
      return;
    }
    const excludedIds = productState.plan.sessions.flatMap((session) =>
      session.actions.map((action) => action.exercise.id),
    );
    const planAction = createPlanAction(exercise, productState.profile, exercises, {
      excludedIds: new Set(excludedIds),
    });
    dispatch({ type: "plan.action.add", dayIndex, planAction });
    closeExercise();
    setToast(`已加入训练 ${String.fromCharCode(64 + productState.plan.sessions[dayIndex].day)}`);
  }

  function replacePlanAction(dayIndex, actionIndex, fromWorkout = false) {
    if (productState.activeWorkout && !fromWorkout) {
      setToast("请先完成当前训练，再编辑计划");
      return;
    }
    const session = fromWorkout ? productState.activeWorkout?.sessionSnapshot : productState.plan?.sessions[dayIndex];
    const currentAction = session?.actions[actionIndex];
    if (!currentAction) return;
    if (fromWorkout && (productState.activeWorkout.completedSets[actionIndex]?.length || productState.activeWorkout.actionPain[actionIndex])) {
      setToast("已有完成或不适记录，请保留记录并跳过剩余组次");
      return;
    }
    const excludedIds = session.actions.map((action) => action.exercise.id);
    const replacement = findAlternativeAction(currentAction, productState.profile, exercises, excludedIds);
    if (!replacement) {
      setToast("暂时没有符合当前条件的替代动作");
      return;
    }
    dispatch({
      type: fromWorkout ? "workout.action.replace" : "plan.action.replace",
      dayIndex,
      actionIndex,
      planAction: replacement,
    });
    setToast(`已替换为${replacement.title}`);
  }

  function startWorkout(dayIndex) {
    const incompatible = productState.plan?.sessions[dayIndex]?.actions.find((action) => coreMetadata(action.exercise) && !isEligibleExercise(action.exercise, productState.profile));
    if (!productState.activeWorkout && incompatible) {
      setToast(`${incompatible.title}不符合当前训练条件，请修改计划或重新生成后再开始`);
      return;
    }
    setIsPlanOpen(false);
    if (productState.activeWorkout) {
      const existingDayIndex = productState.plan.sessions.findIndex(
        (session) => session.day === productState.activeWorkout.sessionDay,
      );
      dispatch({ type: "plan.day", dayIndex: Math.max(0, existingDayIndex) });
      if (existingDayIndex !== dayIndex) setToast("已恢复尚未完成的训练");
    } else {
      dispatch({ type: "workout.start", dayIndex, now: Date.now() });
    }
    setIsWorkoutOpen(true);
  }

  async function completeWorkout() {
    if (!productState.activeWorkout || !productState.plan || completionLock.current) return;
    completionLock.current = true;
    const workout = productState.activeWorkout;
    const completionSummary = summarizeWorkoutCompletion(productState.plan, workout);
    const proposal = feedbackProposal(productState.plan, workout, productState.profile);
    // Recording is independent of AI availability. Persist the local proposal before the request.
    const completionAction = { type: "workout.complete", now: Date.now(), proposal };
    const saved = persistProductState(window.localStorage, productStateReducer(productState, completionAction));
    dispatch(completionAction);
    setIsWorkoutOpen(false);
    setToast(saved.ok ? "训练记录已保存，调整建议需要你确认后生效" : "训练暂存于当前页面，保存失败，请立即导出备份");
    setIsCompletingWorkout(true);
    try {
      if (hasRemoteAi(modelConfig) && workout.feedback.pain === "无" && !Object.keys(workout.actionPain).length) {
        const note = workout.feedback.note ? `；补充：${workout.feedback.note}` : "";
        const remoteResult = await requestRemoteAdjustment(
          {
            message: `刚完成训练 ${String.fromCharCode(64 + workout.sessionDay)}：完成 ${completionSummary.completedSetCount}/${completionSummary.plannedSetCount} 组，跳过原因 ${JSON.stringify(workout.skipReasons)}，实际组次 ${JSON.stringify(workout.actualSets)}，主观强度 ${workout.feedback.effort}/10${note}。请只调整下一次同一训练日，并解释原因。时间不足不等于强度过高。`,
            plan: productState.plan,
            profile: productState.profile,
          },
          { config: modelConfig },
        );
        if (remoteResult) {
          if (remoteResult.plan.sessions.length !== productState.plan.sessions.length) throw new Error("调整改变了训练日结构");
          const scopedPlan = { ...productState.plan, sessions: productState.plan.sessions.map((session, index) => session.day === workout.sessionDay ? { ...remoteResult.plan.sessions[index], id: session.id, day: session.day, title: session.title } : session) };
          dispatch({ type: "adjustment.propose", proposal: {
            ...proposal, plan: scopedPlan,
            message: remoteResult.reply, source: "ai", changes: describePlanChanges(productState.plan, scopedPlan),
          } });
        }
      }
    } catch {
      setToast("记录已保存。AI 暂时不可用，保留本地调整建议");
    } finally {
      setIsCompletingWorkout(false);
      completionLock.current = false;
    }
  }

  function downloadBackup(state = productState, prefix = "练见备份") {
    const url = URL.createObjectURL(new Blob([exportBackup(state)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function restoreBackup(state) {
    if (productState.activeWorkout) throw new Error("请先保存当前训练，再恢复备份");
    // Retain an automatic rollback copy before replacing any local business data.
    try { window.localStorage.setItem("fitness-coach-before-import", exportBackup(productState)); }
    catch { throw new Error("无法备份当前数据，因此尚未恢复文件。请先导出并释放浏览器存储空间"); }
    const saved = persistProductState(window.localStorage, state);
    if (!saved.ok) throw new Error(saved.message);
    dispatch({ type: "state.restore", state });
    setIsSettingsOpen(false);
    setIsWorkoutOpen(Boolean(state.activeWorkout));
    setToast("备份已恢复，原数据可从设置中下载");
  }

  function saveModelConfig(nextConfig) {
    persistModelConfig(window.localStorage, window.sessionStorage, nextConfig);
    setModelConfig(loadModelConfig(window.localStorage, window.sessionStorage));
    setToast(nextConfig.mode === "custom" ? "自定义模型设置已保存" : "已切换到系统方案");
  }

  return (
    <div className="app-shell">
      <Header
        activeView={activeView}
        onNavigate={navigate}
        onOpenPlan={openPlan}
        onOpenSettings={() => setIsSettingsOpen(true)}
        planCount={planCount}
      />
      {storageError && <div className="storage-warning" role="alert">{storageError}<button type="button" onClick={() => downloadBackup()}>导出备份</button></div>}
      {productState.recoveryNotice && <div className="storage-warning" role="alert">{productState.recoveryNotice}<button type="button" onClick={() => {
        const raw = window.localStorage.getItem(productState.persistenceBlocked ? "fitness-coach-product-state-v1" : "fitness-coach-recovery-v1");
        if (!raw) return;
        const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = "练见损坏数据原件.json"; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>下载保留原件</button></div>}
      {activeView === "coach" ? (
        <CoachView
          exercises={exercises}
          isLoading={isLoading}
          dataError={dataError}
          profile={productState.profile}
          plan={productState.plan}
          activeDay={productState.activeDay}
          nextDay={productState.nextDay}
          pendingAdjustment={productState.pendingAdjustment}
          isAdjusting={isCompletingWorkout}
          onAcceptAdjustment={() => dispatch({ type: "adjustment.accept" })}
          onDismissAdjustment={() => dispatch({ type: "adjustment.dismiss" })}
          messages={productState.messages}
          modelConfig={modelConfig}
          activeWorkout={productState.activeWorkout}
          workoutHistory={productState.workoutHistory}
          onProfileChange={(profile) => dispatch({ type: "profile.replace", profile })}
          onPlanChange={(plan, options = {}) => dispatch({ type: "plan.replace", plan, ...options })}
          onActiveDayChange={(dayIndex) => dispatch({ type: "plan.day", dayIndex })}
          onAppendMessage={(message) => dispatch({ type: "chat.append", message })}
          onOpenExercise={openExercise}
          onNavigateLibrary={() => navigate("library")}
          onOpenPlan={openPlan}
          onStartWorkout={startWorkout}
          isPlanLocked={Boolean(productState.activeWorkout)}
        />
      ) : (
        <LibraryView
          exercises={exercises}
          isLoading={isLoading}
          dataError={dataError}
          onOpenExercise={openExercise}
          planCount={planCount}
          onOpenPlan={openPlan}
        />
      )}
      <footer className="site-footer">
        <strong>练见</strong>
        <p>计划与记录保存在此浏览器，建议定期备份。健身建议不替代专业指导。开源版默认文字教学，第三方媒体需自行授权。</p>
      </footer>

      <ExerciseDetail
        exercise={selectedExercise}
        onClose={closeExercise}
        onAddToPlan={addExerciseToPlan}
        plannedDayIndexes={selectedExerciseDayIndexes}
        planSessions={productState.plan?.sessions || []}
        defaultDay={productState.activeDay}
        isPlanLocked={Boolean(productState.activeWorkout)}
        onOpenPlan={openPlan}
        onCreatePlan={createPlanFirst}
      />
      <PlanManager
        isOpen={isPlanOpen}
        plan={productState.plan}
        activeDay={productState.activeDay}
        activeWorkout={productState.activeWorkout}
        restoreTarget={planRestoreTarget}
        onClose={() => setIsPlanOpen(false)}
        onRestoreComplete={() => setPlanRestoreTarget(null)}
        onOpenExercise={openExerciseFromPlan}
        onMove={(dayIndex, actionIndex, direction) => dispatch({
          type: "plan.action.reorder",
          dayIndex,
          actionIndex,
          direction,
        })}
        onMoveDay={(fromDayIndex, actionIndex, toDayIndex) => dispatch({
          type: "plan.action.moveDay",
          fromDayIndex,
          actionIndex,
          toDayIndex,
        })}
        onRemove={(dayIndex, actionIndex) => dispatch({ type: "plan.action.remove", dayIndex, actionIndex })}
        onReplace={(dayIndex, actionIndex) => replacePlanAction(dayIndex, actionIndex)}
        onStartWorkout={startWorkout}
        onCreatePlan={createPlanFirst}
      />
      <ModelSettings
        isOpen={isSettingsOpen}
        config={modelConfig}
        onClose={() => setIsSettingsOpen(false)}
        onSave={saveModelConfig}
        productState={productState}
        onExport={() => downloadBackup()}
        onRestore={restoreBackup}
        onExportPrevious={() => {
          const backup = window.localStorage.getItem("fitness-coach-before-import");
          if (!backup) throw new Error("尚无恢复前备份");
          downloadBackup(JSON.parse(backup).data, "练见恢复前备份");
        }}
      />
      <WorkoutView
        isOpen={isWorkoutOpen}
        plan={productState.plan}
        workout={productState.activeWorkout}
        onPause={() => setIsWorkoutOpen(false)}
        onDispatch={dispatch}
        onOpenExercise={openExerciseFromWorkout}
        onReplace={(actionIndex) => replacePlanAction(productState.activeDay, actionIndex, true)}
        onComplete={completeWorkout}
        isCompleting={isCompletingWorkout}
      />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
