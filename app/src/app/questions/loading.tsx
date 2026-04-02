export default function QuestionsLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-9 bg-gray-200 rounded w-32" />
      </div>
      <div className="h-10 bg-gray-200 rounded mb-4" />
      <div className="border-t border-[var(--border)]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-4 border-b border-[var(--border)]">
            <div className="flex flex-col gap-2 min-w-[80px]">
              <div className="h-5 bg-gray-200 rounded w-16" />
              <div className="h-5 bg-gray-200 rounded w-16" />
            </div>
            <div className="flex-1">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
              <div className="flex gap-2">
                <div className="h-5 bg-gray-200 rounded w-12" />
                <div className="h-5 bg-gray-200 rounded w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
