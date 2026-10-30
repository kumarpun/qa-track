// Idempotent demo seed. Usage: node scripts/seed.mjs
// Demo password for all seeded users: Passw0rd!demo  (change/remove in real deployments)
import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === "true" ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
  connectTimeout: 20000,
});

const PASSWORD = "Passw0rd!demo";
const hash = await bcrypt.hash(PASSWORD, 12);

const [[org]] = await conn.query("SELECT id FROM organizations WHERE name = 'Default'");
let orgId = org?.id;
if (!orgId) {
  orgId = randomUUID();
  await conn.query("INSERT INTO organizations (id, name) VALUES (?,?)", [orgId, "Default"]);
}

const users = [
  ["admin@example.com", "Ada Admin", "ADMIN"],
  ["lead@example.com", "Liam Lead", "QA_LEAD"],
  ["qa1@example.com", "Quinn Engineer", "QA_ENGINEER"],
  ["qa2@example.com", "Riley Tester", "QA_ENGINEER"],
  ["viewer@example.com", "Vera Viewer", "VIEWER"],
];
const ids = {};
for (const [email, name, role] of users) {
  const [[row]] = await conn.query("SELECT id FROM users WHERE email = ?", [email]);
  if (row) { ids[email] = row.id; continue; }
  ids[email] = randomUUID();
  await conn.query("INSERT INTO users (id, org_id, email, name, password_hash, role) VALUES (?,?,?,?,?,?)", [ids[email], orgId, email, name, hash, role]);
}

const projects = [
  ["APP", "Mobile App", "Customer-facing iOS/Android application", "lead@example.com",
    { "qa1@example.com": "QA_ENGINEER", "qa2@example.com": "QA_ENGINEER", "viewer@example.com": "VIEWER" }],
  ["WEB", "Web Portal", "Marketing site and customer self-service portal", "lead@example.com",
    { "qa1@example.com": "QA_ENGINEER" }],
];
for (const [key, name, description, owner, members] of projects) {
  const [[exists]] = await conn.query("SELECT id FROM projects WHERE org_id = ? AND `key` = ?", [orgId, key]);
  if (exists) continue;
  const pid = randomUUID();
  await conn.query("INSERT INTO projects (id, org_id, `key`, name, description, owner_id) VALUES (?,?,?,?,?,?)", [pid, orgId, key, name, description, ids[owner]]);
  const all = { [owner]: "QA_LEAD", ...members };
  for (const [email, role] of Object.entries(all))
    await conn.query("INSERT INTO project_members (id, project_id, user_id, role) VALUES (?,?,?,?)", [randomUUID(), pid, ids[email], role]);
}

// Demo test cases (only into projects that have none yet, so reseeding never duplicates).
const demoCases = {
  APP: [
    ["Login with valid credentials", "CRITICAL", "SMOKE", "AUTOMATED", "Auth", ["login", "smoke"], [
      ["Open the app", "", "Login screen is shown"],
      ["Enter a valid email and password and tap Sign in", "user: demo@example.com", "Home screen is shown"]]],
    ["Login rejects wrong password", "HIGH", "FUNCTIONAL", "MANUAL", "Auth", ["login", "negative"], [
      ["Enter a valid email and a wrong password", "", "An error message is shown and no session is created"]]],
    ["Reset password by email", "MEDIUM", "FUNCTIONAL", "MANUAL", "Auth", ["password"], [
      ["Tap Forgot password and submit the email", "", "Confirmation message is shown"],
      ["Open the reset link from the email", "", "New password form is shown"],
      ["Submit a strong password", "", "User can sign in with the new password"]]],
    ["Add item to cart", "HIGH", "REGRESSION", "AUTOMATED", "Checkout", ["cart"], [
      ["Open a product and tap Add to cart", "", "Cart badge increments by one"]]],
    ["Checkout with saved card", "CRITICAL", "INTEGRATION", "TO_BE_AUTOMATED", "Checkout", ["payment", "checkout"], [
      ["Open the cart with one item", "", "Cart total is correct"],
      ["Choose a saved card and confirm", "", "Order confirmation is shown and a receipt email is sent"]]],
    ["Push notification opens order", "LOW", "UI", "MANUAL", "Notifications", ["push"], [
      ["Tap an order-shipped notification", "", "The matching order detail screen opens"]]],
  ],
  WEB: [
    ["Home page loads under 3 seconds", "MEDIUM", "PERFORMANCE", "AUTOMATED", "Landing", ["performance"], [
      ["Load the home page on a throttled connection", "", "Largest contentful paint is below 3 seconds"]]],
    ["Contact form validates required fields", "MEDIUM", "FUNCTIONAL", "MANUAL", "Forms", ["forms", "validation"], [
      ["Submit the contact form empty", "", "Each required field shows an inline error"],
      ["Fill all fields and submit", "", "Success message is shown"]]],
    ["Session expires after inactivity", "HIGH", "SECURITY", "MANUAL", "Auth", ["session"], [
      ["Sign in and stay idle past the timeout", "", "Next action redirects to the login page"]]],
  ],
};
for (const [key, list] of Object.entries(demoCases)) {
  const [[p]] = await conn.query("SELECT id, tc_seq FROM projects WHERE `key` = ?", [key]);
  if (!p || p.tc_seq > 0) continue;
  const [[author]] = await conn.query("SELECT id FROM users WHERE email = ?", ["qa1@example.com"]);
  let seq = 0;
  for (const [title, priority, type, automation, component, tags, steps] of list) {
    seq++;
    const id = randomUUID();
    const code = `TC-${key}-${String(seq).padStart(4, "0")}`;
    const content = {
      title, description: "", preconditions: "", testData: "", priority, type, automation, component, tags,
      requirementUrl: "", defectUrls: [], steps: steps.map(([action, testData, expected]) => ({ action, testData, expected })),
    };
    await conn.query(
      `INSERT INTO test_cases (id, project_id, seq, code, title, priority, type, automation, component, tags, defect_urls, author_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, p.id, seq, code, title, priority, type, automation, component, JSON.stringify(tags), "[]", author.id],
    );
    for (const [i, s] of content.steps.entries())
      await conn.query(
        "INSERT INTO test_case_steps (id, test_case_id, position, action, test_data, expected) VALUES (?,?,?,?,?,?)",
        [randomUUID(), id, i + 1, s.action, s.testData || null, s.expected],
      );
  }
  await conn.query("UPDATE projects SET tc_seq = ? WHERE id = ?", [seq, p.id]);
}

console.log(`seeded. Demo login: admin@example.com / ${PASSWORD}`);
await conn.end();
