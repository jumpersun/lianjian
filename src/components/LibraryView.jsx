import { useEffect, useMemo, useState } from "react";
import {
  BODY_PART_LABELS,
  EQUIPMENT_LABELS,
  FEATURED_IDS,
  bodyPartLabel,
  equipmentLabel,
  exerciseSearchText,
  exerciseTitle,
  targetLabel,
} from "../data/exerciseTaxonomy.js";
import { SelectMenu } from "./SelectMenu.jsx";
import { coreMetadata, LEVEL_LABELS } from "../data/coreExercises.js";
import { ExerciseMedia } from "./ExerciseMedia.jsx";

const PAGE_SIZE = 16;

function ExerciseCard({ exercise, onOpenExercise }) {
  const title = exerciseTitle(exercise);
  const isTranslated = title !== exercise.name;
  return (
    <button className="exercise-card" type="button" onClick={() => onOpenExercise(exercise)}>
      <span className="exercise-image-wrap">
        <ExerciseMedia exercise={exercise} alt={`${title}动作缩略图`} />
        <span className="exercise-card-link">查看教学</span>
      </span>
      <span className="exercise-card-body">
        <span className="exercise-meta">
          <span>{bodyPartLabel(exercise.body_part)}</span>
          <span>{equipmentLabel(exercise.equipment)}</span>
        </span>
        <strong>{title}</strong>
        {isTranslated && <small>{exercise.name}</small>}
        <span className="target-copy">主要训练：{targetLabel(exercise.target)}</span>
        {coreMetadata(exercise) && <span className="core-label">{LEVEL_LABELS[coreMetadata(exercise).level]} · {coreMetadata(exercise).purpose}</span>}
      </span>
    </button>
  );
}

export function LibraryView({ exercises, isLoading, dataError, onOpenExercise, planCount, onOpenPlan }) {
  const [query, setQuery] = useState("");
  const [bodyPart, setBodyPart] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [scope, setScope] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const equipmentOptions = useMemo(() => {
    const counts = exercises.reduce((result, exercise) => {
      result.set(exercise.equipment, (result.get(exercise.equipment) || 0) + 1);
      return result;
    }, new Map());
    return [
      { label: "全部器材", value: "all" },
      ...[...counts.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([value, count]) => ({ label: `${EQUIPMENT_LABELS[value] || value}（${count}）`, value })),
    ];
  }, [exercises]);

  const filteredExercises = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    const featuredRanks = new Map(FEATURED_IDS.map((id, index) => [id, index]));
    return exercises
      .filter((exercise) => scope === "all" || (scope === "core" ? Boolean(coreMetadata(exercise)) : coreMetadata(exercise)?.level === 0))
      .filter((exercise) => bodyPart === "all" || exercise.body_part === bodyPart)
      .filter((exercise) => equipment === "all" || exercise.equipment === equipment)
      .filter((exercise) => !normalizedQuery || exerciseSearchText(exercise).includes(normalizedQuery))
      .sort((left, right) => {
        if (normalizedQuery || bodyPart !== "all" || equipment !== "all") return left.id.localeCompare(right.id);
        const leftRank = featuredRanks.has(left.id) ? featuredRanks.get(left.id) : 9999;
        const rightRank = featuredRanks.has(right.id) ? featuredRanks.get(right.id) : 9999;
        return leftRank - rightRank || left.id.localeCompare(right.id);
      });
  }, [bodyPart, equipment, exercises, query, scope]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [bodyPart, equipment, query, scope]);

  function resetFilters() {
    setQuery("");
    setBodyPart("all");
    setEquipment("all");
    setScope("all");
  }

  return (
    <main className="library-page">
      <section className="library-hero" aria-labelledby="library-title">
        <span className="hero-kicker">{exercises.length.toLocaleString("zh-CN")} 个动作 · 中文筛选与分步教学</span>
        <h1 id="library-title">找到今天要练的动作</h1>
        <p className="hero-subtitle">按身体部位、器材或动作名称检索，先读懂步骤，再开始训练。</p>
        <div className="search-panel">
          <label className="sr-only" htmlFor="exercise-search">搜索动作库</label>
          <input
            id="exercise-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="试试搜索：胸部、哑铃、深蹲或 pull-up"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")}>
              清空
            </button>
          )}
        </div>
      </section>

      <section className="catalog-section" aria-label="动作目录">
        <div className="catalog-toolbar">
          <div className="body-filters-wrap">
            <div className="body-filters" role="group" aria-label="按身体部位筛选">
              {Object.entries(BODY_PART_LABELS).map(([value, label]) => (
                <button
                  type="button"
                  className={bodyPart === value ? "is-active" : ""}
                  aria-pressed={bodyPart === value}
                  key={value}
                  onClick={() => setBodyPart(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="filter-scroll-hint" aria-hidden="true">左右滑动查看更多</span>
          </div>
          <div className="secondary-filters">
            <SelectMenu label="动作范围" value={scope} options={[{ value: "all", label: "全部动作" }, { value: "core", label: "核心推荐池" }, { value: "beginner", label: "入门动作" }]} onChange={setScope} variant="filter" />
            <div className="equipment-filter">
              <span>训练器材</span>
              <SelectMenu
                label="训练器材"
                onChange={setEquipment}
                options={equipmentOptions}
                value={equipment}
                variant="filter"
              />
            </div>
            <button className="saved-count" type="button" onClick={onOpenPlan}>我的计划 · {planCount} 个动作</button>
          </div>
        </div>

        <div className="catalog-result-heading">
          <p>
            共找到 <strong>{filteredExercises.length}</strong> 个动作
          </p>
          {(query || bodyPart !== "all" || equipment !== "all" || scope !== "all") && (
            <button type="button" onClick={resetFilters}>重置筛选</button>
          )}
        </div>

        {isLoading && <div className="catalog-state">正在载入动作库…</div>}
        {dataError && <div className="catalog-state error">动作数据加载失败：{dataError}</div>}
        {!isLoading && !dataError && filteredExercises.length === 0 && (
          <div className="catalog-state">
            <strong>没有找到匹配动作</strong>
            <p>换一个关键词，或清除部分筛选条件。</p>
            <button type="button" onClick={resetFilters}>查看全部动作</button>
          </div>
        )}

        <div className="exercise-grid">
          {filteredExercises.slice(0, visibleCount).map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} onOpenExercise={onOpenExercise} />
          ))}
        </div>

        {visibleCount < filteredExercises.length && (
          <button className="load-more" type="button" onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}>
            加载更多动作
          </button>
        )}
      </section>
    </main>
  );
}
