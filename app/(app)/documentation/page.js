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
          <CardHeader><CardTitle>Run in a visible browser on your own machine</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Pick where a run happens with the <em>Hosted / My machine</em> dropdown next to Run in browser. <strong>Hosted</strong> runs on the server in a headless browser (public websites only, no window, nothing to install). <strong>My machine</strong> uses the runner below. To watch a real Chromium window, or to test sites only you can reach (localhost, VPN, staging), run the small runner on your computer. You only need <a className="underline" href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a> (v20+); there is nothing to clone.</p>
            <Block>{`npx testtrack-runner --origin https://your-app.example.com`}</Block>
            <p>The first run downloads Chromium once. Keep the terminal open, then press <strong>Run in browser</strong> on any case, suite or run case. Choose <em>My machine</em>, then use the <em>Headless / Browser</em> dropdown to hide or show the window.</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Chrome may ask once to allow the site to reach apps on this device: choose Allow.</li>
              <li>“Local runner not reachable” means the runner is not running (or uses another <Code>--port</Code>).</li>
              <li>Only the URL you pass to <Code>--origin</Code> can drive your browser; the runner listens on 127.0.0.1 only.</li>
              <li>Add <Code>--allow-private</Code> to let tests visit localhost and private-network URLs.</li>
              <li>Failure screenshots are not stored for runs done on your machine; the step log is.</li>
            </ul>
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
