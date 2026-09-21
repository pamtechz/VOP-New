type ErrorPageProps = {
  title?: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
};

export function ErrorPage({
  title = 'Something went wrong',
  message,
  actionLabel = 'Return to Voice of Prophecy',
  actionHref = '/',
}: ErrorPageProps) {
  return (
    <main className="vop-error-page">
      <section className="vop-error-card" aria-labelledby="vop-error-title">
        <span className="vop-error-code">ERROR</span>
        <p className="vop-error-kicker">VOICE OF PROPHECY</p>
        <h1 id="vop-error-title">{title}</h1>
        <p>{message}</p>
        <a className="btn btn-primary" href={actionHref}>{actionLabel}</a>
      </section>
    </main>
  );
}
