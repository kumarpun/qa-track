import Link from "next/link";
import { parseLine } from "@/lib/automation/parse-steps";

const CALL_PREFIX = /^(\s*(?:\d+\s*[.)]\s*)?(?:call|run|include|use)(?:\s+(?:the\s+)?(?:test\s*case|case))?\s*:?\s*)/i;

/** Finds the case a "Call <title or code>" line points to (code first, then exact title; an ambiguous title matches nothing). */
const findTarget = (cases, ref) => {
  const r = ref.trim().toLowerCase();
  const byCode = cases.find((c) => c.code.toLowerCase() === r);
  if (byCode) return byCode;
  const byTitle = cases.filter((c) => c.title.trim().toLowerCase() === r);
  return byTitle.length === 1 ? byTitle[0] : null;
};

/** Step text where "Call <case>" lines show the called case as a blue link to it; other lines stay plain. `cases` = [{ id, code, title }]. */
export function LinkedText({ children, cases }) {
  if (!children) return null;
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {String(children).split("\n").map((line, i, all) => {
        const ins = parseLine(line);
        const target = ins?.kind === "call" ? findTarget(cases, ins.ref) : null;
        const prefix = target ? line.match(CALL_PREFIX)?.[1] : null;
        return (
          <span key={i}>
            {target && prefix ? (
              <>
                {prefix}
                <Link href={`/test-cases/${target.id}`} title={`${target.code} · linked test case`} className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                  {target.title}
                </Link>
              </>
            ) : line}
            {i < all.length - 1 ? "\n" : null}
          </span>
        );
      })}
    </p>
  );
}
