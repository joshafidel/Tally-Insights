export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-8">
      <div className="mb-6 h-7 w-72 animate-pulse rounded bg-brand-100" />
      <div className="mb-6 grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-brand-50" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-2xl bg-brand-50" />
    </div>
  );
}
