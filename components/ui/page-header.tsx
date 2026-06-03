import { BackButton } from "@/components/navigation/back-button";

type Props = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  backHref?: string;
};

export function PageHeader({ title, subtitle, action, backHref }: Props) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">{subtitle}</p> : null}
      </div>
      {backHref || action ? (
        <div className="flex flex-wrap items-center gap-2">
          {backHref ? <BackButton fallbackHref={backHref} /> : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
