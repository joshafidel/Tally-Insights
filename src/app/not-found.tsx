import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-white px-6 text-center">
      <span
        aria-hidden="true"
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-2xl font-bold text-white shadow-sm"
      >
        T
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-brand-900">
        This page does not exist
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        The district, bill, topic, or official you are looking for is not
        here. It may have moved, or the link may be misspelled.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Go to the dashboard
        </Link>
        <Link
          href="/districts/nyc/topics"
          className="rounded-md border border-border bg-white px-4 py-2 text-sm text-brand-800 hover:bg-brand-50"
        >
          Browse topics
        </Link>
        <Link
          href="/districts/nyc/bills"
          className="rounded-md border border-border bg-white px-4 py-2 text-sm text-brand-800 hover:bg-brand-50"
        >
          Browse bills
        </Link>
      </div>
    </div>
  );
}
