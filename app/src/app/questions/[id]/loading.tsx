export default function QuestionDetailLoading() {
  return (
    <div className="animate-pulse">
      <div className="border-b border-[var(--border)] pb-4 mb-6">
        <div className="h-7 bg-gray-200 rounded w-3/4 mb-3" />
        <div className="flex gap-4">
          <div className="h-4 bg-gray-200 rounded w-24" />
          <div className="h-4 bg-gray-200 rounded w-24" />
        </div>
      </div>
      <div className="flex gap-6">
        <div className="flex flex-col items-center gap-2 w-10">
          <div className="h-6 w-6 bg-gray-200 rounded" />
          <div className="h-6 w-6 bg-gray-200 rounded" />
          <div className="h-6 w-6 bg-gray-200 rounded" />
        </div>
        <div className="flex-1 space-y-3">
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-5/6" />
          <div className="h-4 bg-gray-200 rounded w-4/6" />
          <div className="h-20 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-3/6" />
        </div>
      </div>
    </div>
  );
}
