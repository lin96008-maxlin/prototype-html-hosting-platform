export function PagePanel({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="page-panel">
      <header className="page-panel-header">
        <h1 className="page-panel-title">{title}</h1>
        {actions ? <div className="page-panel-actions">{actions}</div> : null}
      </header>
      <div className="page-panel-body">{children}</div>
    </section>
  );
}
