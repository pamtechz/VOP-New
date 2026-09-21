export function NotFoundPage() {
  return (
    <main className="vop-error-page">
      <section className="vop-error-card" aria-labelledby="vop-not-found-title">
        <span className="vop-error-code">404</span>
        <p className="vop-error-kicker">VOICE OF PROPHECY</p>
        <h1 id="vop-not-found-title">Page not found</h1>
        <p>The page you requested does not exist or has moved.</p>
        <a className="btn btn-primary" href="/">Return to Voice of Prophecy</a>
      </section>
    </main>
  );
}
