import Link from "next/link";
import { FENCE, parseLine, stepBlocks } from "@/lib/automation/parse-steps";
import { StepMore } from "./step-more";

const CALL_PREFIX = /^(\s*(?:\d+\s*[.)]\s*)?(?:call|run|include|use)(?:\s+(?:the\s+)?(?:test\s*case|case))?\s*:?\s*)/i;

/** Finds the case a "Call <title or code>" line points to (code first, then exact title; an ambiguous title matches nothing). */
/** Upper-cases the first letter of the step text, after any "8. " numbering. */
const capFirst = (line) => line.replace(/^(\s*(?:\d+\s*[.)]\s*)?)(\p{Ll})/u, (_, pre, ch) => pre + ch.toUpperCase());

const findTarget = (cases, ref) => {
  const r = ref.trim().toLowerCase();
  const byCode = cases.find((c) => c.code.toLowerCase() === r);
  if (byCode) return byCode;
  const byTitle = cases.filter((c) => c.title.trim().toLowerCase() === r);
  return byTitle.length === 1 ? byTitle[0] : null;
};

/**
 * Step text where "Call <case>" lines show the called case as a blue link to it; other lines stay plain. `cases` = [{ id, code, title }].
 * A step's extra lines (a long "Enter content: ..." value) are collapsed to one line with an ellipsis and a "See more" toggle.
 */
export function LinkedText({ children, cases }) {
  if (!children) return null;
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {stepBlocks(children).map((block, i) => {
        let [line, ...more] = block.split("\n");
        line = capFirst(line);
        const ins = parseLine(block.includes(FENCE) ? block : line);
        const target = ins?.kind === "call" ? findTarget(cases, ins.ref) : null;
        const prefix = target ? line.match(CALL_PREFIX)?.[1] : null;
        // Fenced long value: show "Enter content: <first line>" collapsed, the rest under See more (the fences themselves are hidden).
        if (line.trimEnd().endsWith(FENCE)) {
          const body = more.join("\n").replace(new RegExp(`\\s*${FENCE}\\s*$`), "").trim().split("\n");
          line = `${line.trimEnd().slice(0, -FENCE.length).trimEnd()} ${body[0] ?? ""}`.trim();
          more = body.slice(1);
        }
        const extra = more.join("\n").trim();
        return (
          <div key={i} data-testid="step-line">
            {(() => {
              const first = target && prefix ? (
                <>
                  {prefix}
                  <Link href={`/test-cases/${target.id}`} title={`${target.code} · linked test case`} className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                    {target.title}
                  </Link>
                </>
              ) : line;
              return extra ? <StepMore extra={extra}>{first}</StepMore> : <p className="whitespace-pre-wrap">{first}</p>;
            })()}
          </div>
        );
      })}
    </div>
  );
}
