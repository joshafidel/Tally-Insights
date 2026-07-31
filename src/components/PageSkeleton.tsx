export function PageSkeleton({ sidebar = false }: { sidebar?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[1400px] animate-pulse px-6 py-6">
      <div className="mb-3 h-7 w-64 rounded-md bg-brand-100" />
      <div className="mb-6 h-4 w-96 rounded bg-brand-50" />
      <div className="flex items-start gap-5">
        {sidebar && (
          <div className="hidden h-[560px] w-[440px] shrink-0 rounded-xl bg-brand-50 md:block" />
        )}
        <div className="min-w-0 flex-1 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="h-24 rounded-xl bg-brand-50" />
            <div className="h-24 rounded-xl bg-brand-50" />
            <div className="h-24 rounded-xl bg-brand-50" />
          </div>
          <div className="h-[420px] rounded-xl bg-brand-50" />
        </div>
      </div>
    </div>
  );
}
