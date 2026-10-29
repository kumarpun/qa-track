const initials = (name) => {
  const w = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? "?").slice(0, 2)).toUpperCase();
};

export function Avatar({ name }) {
  return (
    <span aria-hidden className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[11px] font-medium text-white">
      {initials(name)}
    </span>
  );
}
