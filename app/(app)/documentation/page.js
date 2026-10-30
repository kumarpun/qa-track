import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUserPage } from "@/lib/server/dal";

export const metadata = { title: "Documentation" };

const Code = ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>;
const Block = ({ children }) => <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">{children}</pre>;

const KEYWORDS = [
  ["Visit / Open / Go to [site|page|url] <url>", "Open an http(s) page", "Visit site: https://app.example.com/login"],
  ["Click / Select / Press <text> [button|link]", "Click a link, button or text. Spacing and case are ignored", "Click Sign in"],
  ["Enter <field>: <value>", "Fill an input found by label, placeholder or name", "Enter Email: qa@example.com"],
  ["Type <value> into <field>", "Same, value first", "Type abc123 into Password"],
  ["Text should present: <text>", "Wait until the text is on the page (also: Should see, Should contain)", "Should see Welcome back"],
  ["Validation message: '<text>'", "Text on the page, or an input's own browser validation message", "Validation message: 'Email is invalid'"],
  ["Should navigate to url: <url>", "The browser must be on exactly this URL (ignores trailing / and #fragment)", "Should navigate to url: https://app.example.com/dashboard"],
  ["Call / Run / Include <test case title or code>", "Runs another case's steps at this point (same project, up to 3 levels). Reuse a login case instead of copying its steps", "Call Willow admin login"],
  ["Form does not submit", "The URL is unchanged after the last click (negative tests)", "Form does not submit"],
];

export default async function DocumentationPage() {
  await requireUserPage();
  return (
    <>
      <PageHeader title="Documentation" description="How to write test cases that are clear for people and, when you want, runnable in a browser." />
      <div className="max-w-4xl space-y-6">
        <Card>
          <CardHeader><CardTitle>Keywords for “Run in browser”</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Put one instruction per line (numbering and case are optional). If any line is not in this list the case is “not runnable” and nothing changes. Actions go in <em>Test steps</em>, checks in <em>Expected result</em>; actions always run first.</p>
            <Table>
              <TableHeader><TableRow><TableHead>Write</TableHead><TableHead>Meaning</TableHead><TableHead>Example</TableHead></TableRow></TableHeader>
              <TableBody>
                {KEYWORDS.map(([k, m, e]) => (
                  <TableRow key={k}><TableCell className="whitespace-normal font-mono text-xs">{k}</TableCell><TableCell className="whitespace-normal">{m}</TableCell><TableCell className="whitespace-normal font-mono text-xs">{e}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-muted-foreground">Quote text that contains punctuation: <Code>{"Click 'Log in'"}</Code>. Browser runs only visit public web pages, and results are saved as Pass/Fail with a step log and a screenshot on failure.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sample 1: positive test (login)</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p><strong>Title:</strong> Login with a valid email and password</p>
            <p><strong>Preconditions:</strong> An active user <Code>qa@example.com</Code> exists; nobody is logged in.</p>
            <p className="font-medium">Test steps</p>
            <Block>{`1. Visit site: https://app.example.com/login
2. Enter Email: qa@example.com
3. Enter Password: Test@1234
4. Click Sign in`}</Block>
            <p className="font-medium">Expected result</p>
            <Block>{`Should navigate to url: https://app.example.com/dashboard
Should see Welcome back`}</Block>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
