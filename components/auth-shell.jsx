import { FlaskConical, ListChecks, PlayCircle, ShieldCheck } from "lucide-react";

const POINTS = [
  [ListChecks, "Organize test cases and suites", "Steps, tags and CSV import in one place."],
  [PlayCircle, "Run and track every release", "Frozen run snapshots with pass/fail history."],
  [ShieldCheck, "Private to your company", "Each organization sees only its own projects."],
];

/** Split layout for the public pages: brand panel on large screens, form on the right. */
export function AuthShell({ title, subtitle, children }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[oklch(0.15_0.015_270)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-[28rem] rounded-full bg-[oklch(0.78_0.12_82/0.28)] blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-[oklch(0.6_0.12_60/0.22)] blur-3xl" />
        <span className="font-display relative flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.86_0.12_88)] to-[oklch(0.66_0.12_72)] text-[oklch(0.2_0.03_70)]"><FlaskConical className="size-5" aria-hidden /></span>
          TestTrack
        </span>
        <div className="relative max-w-md space-y-8">
          <h2 className="font-display text-5xl font-semibold leading-[1.1] tracking-tight">Ship with confidence. <span className="text-[oklch(0.82_0.12_85)]">Test with clarity.</span></h2>
          <ul className="space-y-5">
            {POINTS.map(([Icon, head, text]) => (
              <li key={head} className="flex gap-3.5">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.78_0.12_82/0.14)] text-[oklch(0.84_0.12_85)] ring-1 ring-[oklch(0.78_0.12_82/0.3)]"><Icon className="size-4.5" aria-hidden /></span>
                <span><span className="block font-medium">{head}</span><span className="block text-sm text-white/75">{text}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/60">Test case management, runs and defect tracking.</p>
      </aside>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1.5">
            <span className="mb-4 flex items-center gap-2 font-semibold tracking-tight lg:hidden">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.86_0.12_88)] to-[oklch(0.66_0.12_72)] text-[oklch(0.2_0.03_70)]"><FlaskConical className="size-4" aria-hidden /></span>
              TestTrack
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
