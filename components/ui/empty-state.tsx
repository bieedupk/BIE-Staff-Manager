export function EmptyState({ message = "No records found." }: { message?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-medium text-slate-500">
      {message}
    </div>
  );
}
