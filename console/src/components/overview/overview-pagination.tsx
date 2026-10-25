const PAGE_SIZE = 10;
/** The complete, bounded persisted snapshot, never a remote result-page total. */
export function overviewPage(total: number, requested: number) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, requested));
  const start = (page - 1) * PAGE_SIZE;
  return { total, pages, page, start, end: Math.min(total, start + PAGE_SIZE) };
}

export function OverviewPagination({ pagination: p }: { pagination: ReturnType<typeof overviewPage> }) {
  const href = (page: number) => `/?page=${page}`;
  const numbers = [...new Set([1, p.page - 1, p.page, p.page + 1, p.pages])].filter(n => n >= 1 && n <= p.pages).sort((a, b) => a - b);
  return <footer className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
    <p className="ui-helper">Showing {p.total ? p.start + 1 : 0}–{p.end} of {p.total} invocations</p>
    <nav aria-label="Recent invocation pages" className="flex max-w-full flex-wrap items-center gap-1 text-sm">
      {p.page > 1 ? <a className="ui-page-link" href={href(p.page - 1)} rel="prev">Previous</a> : <button type="button" className="ui-page-link" disabled>Previous</button>}
      {numbers.map((n, index) => <span className="inline-flex items-center gap-1" key={n}>{index > 0 && n - numbers[index - 1] > 1 && <span className="px-1 text-muted" aria-hidden="true">…</span>}<a className="ui-page-link" href={href(n)} aria-label={`Page ${n}`} aria-current={n === p.page ? "page" : undefined}>{n}</a></span>)}
      {p.page < p.pages ? <a className="ui-page-link" href={href(p.page + 1)} rel="next">Next</a> : <button type="button" className="ui-page-link" disabled>Next</button>}
    </nav>
  </footer>;
}
