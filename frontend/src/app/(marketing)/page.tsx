import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-bg-root">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 max-w-3xl mx-auto w-full">
        <span className="text-[15px] font-semibold tracking-[0.15em] uppercase text-text-secondary">
          Tend
        </span>
        <Link
          href="/login"
          className="text-sm text-text-muted hover:text-text-secondary transition-colors"
        >
          Sign in
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center px-6">
        {/* Hero */}
        <section className="max-w-xl text-center pt-20 pb-16">
          <h1 className="text-4xl sm:text-5xl font-bold text-text-primary tracking-tight leading-tight">
            Tend your time
            <br />
            like a garden
          </h1>
          <p className="mt-5 text-lg text-text-secondary leading-relaxed">
            A quiet app for what matters today&mdash;and nothing else.
          </p>
          <Link
            href="/signup"
            className="inline-block mt-8 bg-accent-green text-bg-root font-medium rounded-xl px-8 py-3 text-base hover:bg-accent-green/90 transition-colors"
          >
            Start tending
          </Link>
        </section>

        {/* Problem */}
        <section className="max-w-lg text-center pb-20">
          <p className="text-sm text-text-muted leading-relaxed">
            Most todo apps help you capture everything. You end up with 47 tasks
            and a vague sense of guilt.
          </p>
          <p className="text-sm text-text-muted leading-relaxed mt-4">
            No inbox. No backlog. No someday-maybe.
          </p>
        </section>

        {/* How it works */}
        <section className="max-w-2xl w-full pb-20">
          <h2 className="text-xs font-medium uppercase tracking-widest text-text-muted text-center mb-10">
            How it works
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            <div className="text-center space-y-3">
              <div className="text-2xl">🌅</div>
              <h3 className="text-sm font-semibold text-text-primary">
                Morning triage
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Review your tasks one by one. Keep, defer, or let go. Takes two
                minutes.
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="text-2xl">☀️</div>
              <h3 className="text-sm font-semibold text-text-primary">Just today</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Your list is only what you chose this morning. Nothing else.
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="text-2xl">🌙</div>
              <h3 className="text-sm font-semibold text-text-primary">
                Wind down
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Before bed, close the loop. Mark what you finished. Defer what
                you didn&apos;t. Start tomorrow clean.
              </p>
            </div>
          </div>
        </section>

        {/* Principles */}
        <section className="max-w-2xl w-full pb-20">
          <h2 className="text-xs font-medium uppercase tracking-widest text-text-muted text-center mb-10">
            The practice
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-bg-card p-5 space-y-2">
              <h3 className="text-sm font-semibold text-accent-green">Plant</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Each morning, decide what deserves your attention today.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-5 space-y-2">
              <h3 className="text-sm font-semibold text-accent-green">Tend</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Work from a list of only what you chose. Nothing else sneaks in.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-5 space-y-2">
              <h3 className="text-sm font-semibold text-accent-green">Weed</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Tasks untouched for 30 days are automatically archived. Gone.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-5 space-y-2">
              <h3 className="text-sm font-semibold text-accent-green">Grow</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                No score. No streak. Just the shape of your days, over time.
              </p>
            </div>
          </div>
        </section>

        {/* Founder + CTA */}
        <section className="max-w-md text-center pb-24">
          <p className="text-sm text-text-muted mb-8">
            Built by one person who kept abandoning todo apps.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-accent-green text-bg-root font-medium rounded-xl px-8 py-3 text-base hover:bg-accent-green/90 transition-colors"
          >
            Start tending
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6 px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between text-xs text-text-muted">
          <span>Free during early access.</span>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-text-secondary transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-text-secondary transition-colors">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
