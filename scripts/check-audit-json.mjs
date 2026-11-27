import { readFileSync } from "node:fs";

// Parses `npm audit --json` without trusting its exit status. A missing or
// error-shaped result means the advisory database was unavailable, which is
// reported separately from a clean scan. See docs/DEPENDENCY-ADVISORIES.md.
const [jsonPath] = process.argv.slice(2);
if (!jsonPath) {
  console.error("ADVISORY CHECK ERROR: no audit JSON path supplied");
  process.exit(3);
}

let report;
try {
  report = JSON.parse(readFileSync(jsonPath, "utf8"));
} catch (error) {
  console.error(
    `ADVISORY DATABASE UNAVAILABLE: cannot read audit output: ${error.message}`,
  );
  process.exit(3);
}

if (report.error) {
  const code = report.error.code ?? "unknown";
  console.error(
    `ADVISORY DATABASE UNAVAILABLE (infrastructure, not a clean scan): ${code}`,
  );
  process.exit(3);
}

const counts = report.metadata?.vulnerabilities;
if (!counts || typeof counts !== "object") {
  console.error("ADVISORY CHECK ERROR: unrecognized npm audit output");
  process.exit(3);
}

for (const [name, advisory] of Object.entries(report.vulnerabilities ?? {})) {
  console.log(`${name}: ${advisory.severity}`);
}

console.log(
  `Advisory summary: critical=${counts.critical ?? 0} high=${counts.high ?? 0} ` +
    `moderate=${counts.moderate ?? 0} low=${counts.low ?? 0} total=${counts.total ?? 0}`,
);

if ((counts.critical ?? 0) > 0 || (counts.high ?? 0) > 0) {
  console.error(
    "FAIL: critical/high advisory found; see docs/DEPENDENCY-ADVISORIES.md for triage.",
  );
  process.exit(1);
}

console.log(
  "PASS: no critical/high advisories (moderate/low are reported, not waived).",
);
