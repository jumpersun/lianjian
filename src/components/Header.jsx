export function Header({ activeView, onNavigate, onOpenPlan, onOpenSettings }) {
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <button className="wordmark" type="button" onClick={() => onNavigate("coach")} aria-label="返回练见首页">
            练见
          </button>
          <nav className="desktop-nav" aria-label="主要导航">
            <button className={activeView === "coach" ? "is-active" : ""} type="button" onClick={() => onNavigate("coach")}>
              AI 私教
            </button>
            <button className={activeView === "library" ? "is-active" : ""} type="button" onClick={() => onNavigate("library")}>
              动作库
            </button>
            <button type="button" onClick={onOpenPlan}>我的计划</button>
          </nav>
          <div className="header-actions">
            <button className="header-settings" type="button" onClick={onOpenSettings}>设置</button>
            <button className="header-cta" type="button" onClick={() => onNavigate(activeView === "coach" ? "library" : "coach")}>
              {activeView === "coach" ? "浏览动作" : "制定计划"}
            </button>
          </div>
        </div>
      </header>

      <nav className="mobile-nav" aria-label="移动端主要导航">
        <button className={activeView === "coach" ? "is-active" : ""} type="button" onClick={() => onNavigate("coach")}>
          AI 私教
        </button>
        <button className={activeView === "library" ? "is-active" : ""} type="button" onClick={() => onNavigate("library")}>
          动作库
        </button>
        <button type="button" onClick={onOpenPlan}>
          我的计划
        </button>
      </nav>
    </>
  );
}
