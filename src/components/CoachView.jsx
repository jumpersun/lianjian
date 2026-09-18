import { useEffect, useRef, useState } from "react";
import { bodyPartLabel, equipmentLabel } from "../data/exerciseTaxonomy.js";
import { hasRemoteAi, requestRemoteAdjustment, requestRemotePlan } from "../lib/aiClient.js";
import { DEFAULT_PROFILE, generatePlan, refinePlan, planCompatibilityIssues } from "../lib/planner.js";
import { SelectMenu } from "./SelectMenu.jsx";
import { ExerciseMedia } from "./ExerciseMedia.jsx";

const FIELD_OPTIONS = {
  level: ["完全初学者", "有一些经验的初学者", "中级健身爱好者", "高级运动员"],
  gender: ["不限", "女性", "男性"],
  goal: ["减脂塑形", "增肌塑形", "提升力量", "改善体能"],
  frequency: [1, 2, 3, 4, 5, 6],
  duration: ["15–20分钟", "30分钟", "45分钟", "60分钟"],
  place: ["家里", "健身房", "户外"],
  limitation: ["没有身体限制", "膝盖需要保护", "腰背需要保护", "肩部需要保护", "手腕需要保护"],
};

const QUICK_ADJUSTMENTS = ["改成无器械训练", "我膝盖不舒服", "压缩到 20 分钟", "强度再高一点"];

const EQUIPMENT_OPTIONS = [
  { value: "body weight", label: "徒手" },
  { value: "dumbbell", label: "哑铃" },
  { value: "band", label: "弹力带" },
  { value: "bench", label: "卧推凳" },
  { value: "pull-up bar", label: "单杠" },
  { value: "dip bars", label: "双杠" },
  { value: "barbell", label: "杠铃" },
  { value: "kettlebell", label: "壶铃" },
];

const LIMITATION_OPTIONS = ["膝盖", "腰背", "肩部", "手腕"];

function InlineNumber({ value, onChange, label, unit, min, max }) {
  return (
    <span className="inline-number-wrap">
      <input
        className="inline-number"
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        style={{ "--number-digits": String(value).length }}
      />
      <span>{unit}</span>
    </span>
  );
}

function PlanAction({ action, onOpenExercise }) {
  return (
    <button className="plan-action" type="button" onClick={() => onOpenExercise(action.exercise)}>
      <ExerciseMedia exercise={action.exercise} compact />
      <span className="plan-action-copy">
        <strong>{action.title}</strong>
        <small>
          {bodyPartLabel(action.exercise.body_part)} · {equipmentLabel(action.exercise.equipment)}
        </small>
        {action.reason && <span className="plan-action-reason">{action.reason}</span>}
        {action.alternative && (
          <span className="plan-action-alternative">
            {action.alternative.kind || "替代动作"}：{action.alternative.title}
          </span>
        )}
      </span>
      <span className="plan-action-dose">
        {action.sets} 组 × {action.reps}
      </span>
    </button>
  );
}

function PlanResult({
  plan,
  activeDay,
  onActiveDayChange,
  onOpenExercise,
  onOpenPlan,
  onStartWorkout,
  activeWorkout,
  workoutHistory,
}) {
  const session = plan.sessions[activeDay] || plan.sessions[0];
  const completedCount = workoutHistory.filter((record) => record.planId === plan.id && record.sessionId === session.id).length;
  return (
    <section className="plan-result" aria-labelledby="plan-title">
      <div className="plan-heading">
        <div>
          <span className="section-kicker">你的轮转安排 · {plan.sessions.length} 个训练日</span>
          <h2 id="plan-title">{plan.title}</h2>
          <p>{plan.summary}</p>
        </div>
        <div className="plan-heading-actions">
          <span className="demo-badge">
            {plan.source === "remote" ? "AI 生成" : plan.source === "custom" ? "自定义模型" : "本地智能编排"}
          </span>
          <button type="button" onClick={onOpenPlan}>管理计划</button>
        </div>
      </div>

      <div className="day-tabs" role="tablist" aria-label="训练日">
        {plan.sessions.map((item, index) => (
          <button
            key={`${item.day}-${item.title}`}
            className={activeDay === index ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={activeDay === index}
            onClick={() => onActiveDayChange(index)}
          >
            训练 {String.fromCharCode(64 + item.day)}
          </button>
        ))}
      </div>

      <div className="session-card">
        <div className="session-summary">
          <span>训练 {String.fromCharCode(64 + session.day)}</span>
          <h3>{session.title}</h3>
          <p>{session.focus}</p>
          <dl>
            <div>
              <dt>预计时长</dt>
              <dd>{session.estimatedMinutes} 分钟</dd>
            </div>
            <div>
              <dt>动作数量</dt>
              <dd>{session.actions.length} 个</dd>
            </div>
            <div>
              <dt>完成记录</dt>
              <dd>{completedCount} 次</dd>
            </div>
          </dl>
          <button className="session-start-button" type="button" onClick={() => onStartWorkout(activeDay)} disabled={!session.actions.length}>
            {activeWorkout ? "继续未完成训练" : "开始这次训练"}
          </button>
        </div>
        <div className="plan-actions">
          {!session.actions.length && <p className="empty-plan-notice">当前条件下没有可推荐动作。请核对器械与限制，或咨询专业人员；不会用不匹配的动作补数。</p>}
          {session.actions.map((action, index) => (
            <PlanAction key={`${action.exercise.id}-${index}`} action={action} onOpenExercise={onOpenExercise} />
          ))}
        </div>
      </div>

      <p className="recovery-note">恢复建议：{plan.recovery}</p>
      {plan.coverageNote && <p className="health-note">{plan.coverageNote}</p>}
    </section>
  );
}

function CoachChat({
  plan,
  profile,
  exercises,
  messages,
  modelConfig,
  onAppendMessage,
  onUpdatePlan,
  onUpdateProfile,
  isPlanLocked,
}) {
  const [message, setMessage] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const currentContext = useRef({ plan, profile, isPlanLocked });
  currentContext.current = { plan, profile, isPlanLocked };
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function submitMessage(nextMessage) {
    const trimmed = nextMessage.trim();
    if (!trimmed || isThinking || isPlanLocked) return;
    onAppendMessage({ role: "user", text: trimmed });
    setMessage("");
    setIsThinking(true);
    const localResult = refinePlan(trimmed, plan, profile, exercises);
    try {
      const remoteResult = await requestRemoteAdjustment(
        { message: trimmed, plan: localResult.plan, profile: localResult.profile },
        { config: modelConfig },
      );
      const result = remoteResult || localResult;
      if (!mounted.current) return;
      if (currentContext.current.plan !== plan || currentContext.current.profile !== profile || currentContext.current.isPlanLocked) {
        onAppendMessage({ role: "assistant", text: "计划已更新或训练已开始，本次迟到的调整未应用。" });
        return;
      }
      if (result.changed !== false) {
        onUpdateProfile(result.profile);
        onUpdatePlan(result.plan);
      }
      onAppendMessage({ role: "assistant", text: result.reply });
    } catch {
      const fallback = localResult;
      if (!mounted.current || currentContext.current.plan !== plan || currentContext.current.profile !== profile || currentContext.current.isPlanLocked) return;
      if (fallback.changed !== false) {
        onUpdateProfile(fallback.profile);
        onUpdatePlan(fallback.plan);
      }
      onAppendMessage({ role: "assistant", text: `AI 服务暂时不可用。${fallback.reply}` });
    } finally {
      setIsThinking(false);
    }
  }

  return (
    <aside className="coach-chat" aria-labelledby="chat-title">
      <div className="chat-heading">
        <div>
          <span className="section-kicker">继续对话</span>
          <h2 id="chat-title">让计划更懂你</h2>
        </div>
        <span className="chat-status">
          {hasRemoteAi(modelConfig) ? (modelConfig.mode === "custom" ? "自定义模型" : "AI 已连接") : "本地模式"}
        </span>
      </div>
      <p className="chat-disclosure">
        {isPlanLocked
          ? "当前训练正在进行，完成后即可继续调整计划。"
          : hasRemoteAi(modelConfig)
            ? "当前调整请求由已配置的 AI 服务处理，结果仍会经过本地动作白名单校验。"
            : "当前由本地规则引擎响应；可在设置中连接自己的兼容模型。"}
      </p>
      <div className="chat-messages" aria-live="polite">
        {messages.map((item, index) => (
          <div className={`chat-message ${item.role}`} key={`${item.role}-${index}`}>
            {item.text}
          </div>
        ))}
        {isThinking && <div className="chat-message assistant thinking">正在调整计划…</div>}
      </div>
      <div className="quick-adjustments" aria-label="快捷调整">
        {QUICK_ADJUSTMENTS.map((item) => (
          <button type="button" key={item} onClick={() => submitMessage(item)} disabled={isThinking || isPlanLocked}>
            {item}
          </button>
        ))}
      </div>
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          submitMessage(message);
        }}
      >
        <label className="sr-only" htmlFor="coach-message">
          告诉教练你想怎么调整
        </label>
        <input
          id="coach-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="例如：周三只有 20 分钟"
          disabled={isPlanLocked}
        />
        <button type="submit" disabled={!message.trim() || isThinking || isPlanLocked}>
          发送
        </button>
      </form>
    </aside>
  );
}

function WorkoutHistory({ records }) {
  const [showAll, setShowAll] = useState(false);
  if (!records.length) return null;
  return (
    <section className="workout-history" aria-labelledby="workout-history-title">
      <div className="history-heading">
        <div>
          <span className="section-kicker">训练记录</span>
          <h2 id="workout-history-title">最近完成</h2>
        </div>
        <span>本机保存 {records.length} 次</span>
      </div>
      <div className="history-list">
        {(showAll ? records : records.slice(0, 6)).map((record) => {
          const completedSetCount = record.completedSetCount ?? Object.values(record.completedSets || {})
            .reduce((total, sets) => total + sets.length, 0);
          const skippedCount = record.skippedCount ?? record.skippedActionIndexes?.length ?? 0;
          const date = new Intl.DateTimeFormat("zh-CN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(record.completedAt));
          return (
            <details className="history-item" key={record.id}>
              <summary>
                <span><strong>训练 {String.fromCharCode(64 + record.sessionDay)} · {record.completionRate >= 1 ? "完成" : "部分完成"}</strong><small>{date}</small></span>
                <span>{completedSetCount}{record.plannedSetCount ? `/${record.plannedSetCount}` : ""} 组</span>
              </summary>
              <div className="history-detail">
                <dl>
                  <div><dt>完成组数</dt><dd>{completedSetCount}{record.plannedSetCount ? ` / ${record.plannedSetCount}` : ""}</dd></div>
                  <div><dt>跳过动作</dt><dd>{skippedCount} 个</dd></div>
                  <div><dt>主观强度</dt><dd>{record.feedback?.effort ?? "—"} / 10</dd></div>
                  <div><dt>疼痛反馈</dt><dd>{record.feedback?.pain || "未填写"}</dd></div>
                </dl>
                {record.feedback?.note && <p>备注：{record.feedback.note}</p>}
                {record.sessionSnapshot?.actions.map((action, index) => (
                  <div className="history-action" key={`${action.exercise.id}-${index}`}>
                    <strong>{action.title}</strong>
                    <span>{record.completedSets?.[index]?.length || 0}/{action.sets} 组{record.skipReasons?.[index] ? ` · 跳过：${record.skipReasons[index]}` : ""}{record.actionPain?.[index] ? ` · 不适：${record.actionPain[index]}` : ""}</span>
                    {(record.completedSets?.[index] || []).map((setIndex) => {
                      const actual = record.actualSets?.[index]?.[setIndex];
                      return <small key={setIndex}>第 {setIndex + 1} 组：{actual?.amount !== undefined && actual.amount !== "" ? `${actual.amount}${/秒|分钟/.test(action.reps) ? "秒" : "次"}` : "实际数量未填写"}{actual?.weight !== undefined && actual.weight !== "" ? ` · ${actual.weight} kg` : ""}</small>;
                    })}
                  </div>
                ))}
                {!record.sessionSnapshot && <small>旧版记录不包含动作快照，无法还原每组明细。</small>}
                <small>{record.adjustmentStatus || "旧版自动调整记录"}</small>
                {record.adjustmentMessage && <p>{record.adjustmentMessage}</p>}
                {record.adjustmentChanges?.length > 0 && <ul>{record.adjustmentChanges.map((change, index) => <li key={index}>{change}</li>)}</ul>}
              </div>
            </details>
          );
        })}
      </div>
      {records.length > 6 && <button type="button" className="secondary-button" onClick={() => setShowAll(!showAll)}>{showAll ? "收起记录" : `查看全部 ${records.length} 次记录`}</button>}
    </section>
  );
}

export function CoachView({
  exercises,
  isLoading,
  dataError,
  profile = DEFAULT_PROFILE,
  plan,
  activeDay,
  nextDay = 0,
  pendingAdjustment,
  isAdjusting,
  onAcceptAdjustment,
  onDismissAdjustment,
  messages,
  modelConfig,
  activeWorkout,
  workoutHistory,
  onProfileChange,
  onPlanChange,
  onActiveDayChange,
  onAppendMessage,
  onOpenExercise,
  onNavigateLibrary,
  onOpenPlan,
  onStartWorkout,
  isPlanLocked,
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationNotice, setGenerationNotice] = useState("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const compatibilityIssues = planCompatibilityIssues(plan, profile);
  const planRef = useRef(null);
  const generationContext = useRef({ plan, profile, isPlanLocked });
  generationContext.current = { plan, profile, isPlanLocked };
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  function updateProfile(key, value) {
    onProfileChange({ ...profile, [key]: value });
  }

  function toggleEquipment(value) {
    if (value === "body weight") return;
    const current = profile.equipment || ["body weight"];
    const equipment = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    onProfileChange({
      ...profile,
      equipment,
      equipmentMode: equipment.length === 1 && equipment[0] === "body weight" ? "bodyweight" : "available",
    });
  }

  function toggleLimitation(value) {
    const current = profile.limitations || [];
    const limitations = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    onProfileChange({
      ...profile,
      limitations,
      limitation: limitations.length ? `${limitations[0]}需要保护` : "没有身体限制",
    });
  }

  async function createPlan() {
    if (!exercises.length || isGenerating || isPlanLocked) return;
    if (!Number.isInteger(profile.age) || profile.age < 16 || profile.age > 80 || profile.height < 130 || profile.height > 220 || profile.weight < 35 || profile.weight > 220) {
      setGenerationNotice("请检查资料：年龄 16–80 岁，身高 130–220 cm，体重 35–220 kg。本产品暂未覆盖这些范围以外的训练需求。");
      return;
    }
    if (plan && !confirmRegenerate) { setConfirmRegenerate(true); return; }
    setIsGenerating(true);
    setGenerationNotice("");
    const stillCurrent = () => mounted.current && generationContext.current.plan === plan && generationContext.current.profile === profile && !generationContext.current.isPlanLocked;
    let applied = false;
    try {
      const baselinePlan = generatePlan(profile, exercises);
      const remoteResult = await requestRemotePlan(profile, { config: modelConfig, plan: baselinePlan });
      if (!stillCurrent()) return;
      if (remoteResult) {
        onProfileChange(remoteResult.profile);
        onPlanChange(remoteResult.plan);
      } else {
        onPlanChange(baselinePlan);
      }
      applied = true;
    } catch {
      if (!stillCurrent()) return;
      onPlanChange(generatePlan(profile, exercises));
      setGenerationNotice("AI 服务暂时不可用，已使用本地方案生成计划。");
      applied = true;
    } finally {
      setIsGenerating(false);
      setConfirmRegenerate(false);
      if (applied) {
        setIsProfileOpen(false);
        window.setTimeout(() => planRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      }
    }
  }

  return (
    <main>
      <section className={`coach-hero${plan ? " returning-hero" : ""}`} aria-labelledby="coach-heading">
        <h1 id="coach-heading"><span className="coach-heading-ai">AI</span> 健身教练</h1>
        <p className="hero-subtitle">{plan ? "计划一直都在，按自己的节奏继续。" : "把目标、时间和身体状态说清楚，得到一套真正做得完的计划。"}</p>
        {!plan && <p className="planning-mode-note">{hasRemoteAi(modelConfig) ? "已配置模型接口，生成失败时会明确提示并回退本地规则。" : "当前为本地规则模式，无需密钥；可在设置中连接自己的 AI 模型。"}</p>}

        {plan && <>
          {compatibilityIssues.length > 0 && !activeWorkout && <div className="plan-compatibility-note" role="alert">
            <strong>这份计划需要核对训练条件</strong>
            <p>以下动作与当前水平、器械或身体限制不匹配：{compatibilityIssues.map((issue) => issue.title).join("、")}。</p>
            <p>可以管理计划逐项调整，或按当前条件重新生成。已有训练历史不会删除。</p>
            <div className="mvp-button-row"><button type="button" className="secondary-button" onClick={onOpenPlan}>查看并调整计划</button><button type="button" className="secondary-button" onClick={() => { setIsProfileOpen(true); setConfirmRegenerate(true); }}>展开条件，准备重新生成</button></div>
          </div>}
          <div className="return-dashboard">
            <div><span className="section-kicker">{activeWorkout ? "有一场训练等待继续" : "下一次训练"}</span>
              <h2>{activeWorkout?.sessionSnapshot?.title || plan.sessions[nextDay]?.title}</h2>
              <p>{activeWorkout ? "已保存动作位置、组次与休息时间" : `${plan.sessions[nextDay]?.actions.length || 0} 个动作 · 预计 ${plan.sessions[nextDay]?.estimatedMinutes || 0} 分钟（含准备与收尾）`}</p>
              <small>累计记录 {workoutHistory.length} 次 · {plan.sessions.length} 个训练日轮转 · 不绑定星期</small>
            </div>
            <button type="button" className="primary-button" disabled={!activeWorkout && !plan.sessions[nextDay]?.actions.length} onClick={() => onStartWorkout(nextDay)}>{activeWorkout ? "继续今天训练" : "开始今天训练"}</button>
          </div>
          {pendingAdjustment && <div className="adjustment-card" role="region" aria-label="下次训练建议">
            <span className="section-kicker">记录已保存 · {pendingAdjustment.source === "ai" ? "AI 建议" : "本地规则建议"}</span>
            <h2>下次怎么练，由你确认</h2>
            <p>{pendingAdjustment.message}</p>
            {pendingAdjustment.changes.length ? <ul>{pendingAdjustment.changes.map((change, index) => <li key={index}>{change}</li>)}</ul> : <p>建议保留现有动作与训练量。</p>}
            {isAdjusting && <p role="status">正在请求 AI 补充建议；可以先保留原计划继续使用。</p>}
            <div className="mvp-button-row">
              <button type="button" className="primary-button" disabled={isPlanLocked || isAdjusting || pendingAdjustment.baseRevision !== plan.revision} onClick={onAcceptAdjustment}>接受建议</button>
              <button type="button" className="secondary-button" onClick={onDismissAdjustment}>保留原计划</button>
            </div>
            {pendingAdjustment.baseRevision !== plan.revision && <p>计划已编辑，这条旧建议不能覆盖新计划，请保留原计划。</p>}
          </div>}
          <button type="button" className="profile-toggle" aria-expanded={isProfileOpen} onClick={() => setIsProfileOpen(!isProfileOpen)}>{isProfileOpen ? "收起训练条件" : "修改训练条件"}</button>
        </>}

        <div hidden={Boolean(plan) && !isProfileOpen}>
        <fieldset className="profile-fields" disabled={isPlanLocked || isGenerating}>

        <div className="profile-composer">
          <p>
            我是一名
            <SelectMenu value={profile.level} options={FIELD_OPTIONS.level} onChange={(value) => updateProfile("level", value)} label="训练水平" />
            ，
            <SelectMenu value={profile.gender} options={FIELD_OPTIONS.gender} onChange={(value) => updateProfile("gender", value)} label="性别" />
            ，今年
            <InlineNumber value={profile.age} onChange={(value) => updateProfile("age", value)} label="年龄" unit="岁" min={16} max={80} />
            ，身高
            <InlineNumber value={profile.height} onChange={(value) => updateProfile("height", value)} label="身高" unit="cm" min={130} max={220} />
            ，体重
            <InlineNumber value={profile.weight} onChange={(value) => updateProfile("weight", value)} label="体重" unit="kg" min={35} max={220} />
            。我的主要目标是
            <SelectMenu value={profile.goal} options={FIELD_OPTIONS.goal} onChange={(value) => updateProfile("goal", value)} label="训练目标" />
            。我每周可以训练
            <SelectMenu
              value={profile.frequency}
              options={FIELD_OPTIONS.frequency}
              onChange={(value) => updateProfile("frequency", Number(value))}
              label="每周训练次数"
              suffix="次"
            />
            ，每次
            <SelectMenu value={profile.duration} options={FIELD_OPTIONS.duration} onChange={(value) => updateProfile("duration", value)} label="单次训练时长" />
            ，主要在
            <SelectMenu value={profile.place} options={FIELD_OPTIONS.place} onChange={(value) => updateProfile("place", value)} label="训练地点" />
            训练。我
            <SelectMenu
              value={profile.limitation}
              options={FIELD_OPTIONS.limitation}
              onChange={(value) => onProfileChange({
                ...profile,
                limitation: value,
                limitations: value === "没有身体限制" ? [] : [value.replace("需要保护", "")],
              })}
              label="身体限制"
            />
            。
          </p>
        </div>

        <section className="training-conditions" aria-labelledby="training-conditions-title">
          <div className="conditions-heading">
            <div>
              <span className="section-kicker">训练条件</span>
              <h2 id="training-conditions-title">让计划真正做得了</h2>
            </div>
            <span>自动保存</span>
          </div>
          <div className="condition-grid">
            <div className="condition-group">
              <strong>我可以使用</strong>
              <div className="condition-chips" role="group" aria-label="可用器械">
                {EQUIPMENT_OPTIONS.map((item) => {
                  const isActive = (profile.equipment || ["body weight"]).includes(item.value);
                  return (
                    <button
                      type="button"
                      className={isActive ? "is-active" : ""}
                      aria-pressed={isActive}
                      key={item.value}
                      onClick={() => toggleEquipment(item.value)}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="condition-group">
              <strong>需要保护的部位</strong>
              <div className="condition-chips" role="group" aria-label="身体限制">
                {LIMITATION_OPTIONS.map((item) => {
                  const isActive = (profile.limitations || []).includes(item);
                  return (
                    <button
                      type="button"
                      className={isActive ? "is-active" : ""}
                      aria-pressed={isActive}
                      key={item}
                      onClick={() => toggleLimitation(item)}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="condition-field">
              <span>疼痛或伤病说明</span>
              <input
                value={profile.painNote || ""}
                onChange={(event) => updateProfile("painNote", event.target.value)}
                placeholder="例如：右肩抬高时会疼"
              />
            </label>
            <label className="condition-field">
              <span>不想做或会不舒服的动作</span>
              <input
                value={profile.avoidExercises || ""}
                onChange={(event) => updateProfile("avoidExercises", event.target.value)}
                placeholder="例如：俯卧撑、跳跃"
              />
            </label>
          </div>
        </section>
        </fieldset>

        {dataError && <p className="form-error">动作数据暂时加载失败：{dataError}</p>}
        <button className="primary-button hero-button" type="button" onClick={createPlan} disabled={isLoading || isGenerating || !exercises.length || isPlanLocked}>
          {isLoading ? "正在读取动作库…" : isGenerating ? "正在生成计划…" : isPlanLocked ? "先完成当前训练" : confirmRegenerate ? "确认替换当前计划" : plan ? "按新条件重新生成" : "获取我的健身计划"}
        </button>
        {confirmRegenerate && <p className="form-notice">这会替换当前动作安排并从训练 A 重新轮转；训练历史保留。<button type="button" onClick={() => setConfirmRegenerate(false)}>取消</button></p>}
        {generationNotice && <p className="form-notice" role="status">{generationNotice}</p>}
        <p className="health-note">计划仅供健身参考；如有疾病、受伤或持续疼痛，请先咨询医生。</p>
        </div>
      </section>

      <div ref={planRef} className="plan-anchor">
        {plan && (
          <section className="plan-workspace">
            <PlanResult
              plan={plan}
              activeDay={activeDay}
              onActiveDayChange={onActiveDayChange}
              onOpenExercise={onOpenExercise}
              onOpenPlan={onOpenPlan}
              onStartWorkout={onStartWorkout}
              activeWorkout={activeWorkout}
              workoutHistory={workoutHistory}
            />
            <CoachChat
              plan={plan}
              profile={profile}
              exercises={exercises}
              messages={messages}
              modelConfig={modelConfig}
              onAppendMessage={onAppendMessage}
              onUpdatePlan={(nextPlan) => onPlanChange(nextPlan, { keepDay: true })}
              onUpdateProfile={onProfileChange}
              isPlanLocked={isPlanLocked}
            />
            <WorkoutHistory records={workoutHistory} />
          </section>
        )}
      </div>

      {!plan && (
        <section className="value-section" id="how-it-works" aria-labelledby="value-title">
          <span className="section-kicker centered">不只是一张训练表</span>
          <h2 id="value-title">从计划到学会动作</h2>
          <div className="value-grid">
            <article className="value-card schedule-preview">
              <div className="value-card-copy">
                <span>01 · 个性化安排</span>
                <h3>围绕你的时间，而不是打乱生活</h3>
                <p>按照频率、时长、地点和身体限制，自动组合每周训练节奏。</p>
              </div>
              <div className="week-preview" aria-label="每周训练示例">
                <div><span>周一</span><strong>上肢与核心</strong><small>30 分钟</small></div>
                <div><span>周三</span><strong>腿臀与心肺</strong><small>30 分钟</small></div>
                <div><span>周六</span><strong>全身循环</strong><small>25 分钟</small></div>
              </div>
            </article>
            <article className="value-card exercise-preview">
              <div className="value-card-copy">
                <span>02 · 动作教学</span>
                <h3>每个动作，都能点开学明白</h3>
                <p>查看目标肌群与中文分步说明。开源版默认文字教学，已授权媒体可自行接入。</p>
                <button type="button" onClick={onNavigateLibrary}>进入动作库</button>
              </div>
              <div className="preview-media">
                <ExerciseMedia />
                <div><strong>杠铃卧推</strong><span>胸部 · 杠铃</span></div>
              </div>
            </article>
          </div>
        </section>
      )}
    </main>
  );
}
