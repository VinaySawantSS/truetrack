import { scanFixture } from "./scanner/index.js";
import { scoreStack } from "./scoring/index.js";
import { generateFixes, applyFixes } from "./fixer/index.js";

function line(label: string) {
  console.log(`\n${label}`);
  console.log("-".repeat(label.length));
}

line("TrueTrack demo: scan -> score -> fix -> re-score");

const brokenSnapshot = scanFixture("broken-store");
const before = scoreStack(brokenSnapshot);
console.log(`\nBroken store: score ${before.score}/100 (grade ${before.grade})`);
for (const i of before.issues) {
  console.log(`  x [${i.severity}] ${i.title}  ~${i.conversionsLostPct}% lost`);
}

const fixes = generateFixes(before.issues);
console.log(`\nGenerated ${fixes.length} fixes:`);
for (const f of fixes) console.log(`  - ${f.title} (${f.type})`);

const after = scoreStack(applyFixes(brokenSnapshot, fixes));
console.log(`\nAfter TrueTrack fixes: score ${after.score}/100 (grade ${after.grade})`);
if (after.issues.length) {
  console.log("Remaining (recommended next):");
  for (const i of after.issues) console.log(`  - ${i.title}`);
}

const recovered = Math.max(0, before.estimatedConversionsLostPct - after.estimatedConversionsLostPct);
console.log(`\nScore jump: ${before.score} -> ${after.score}`);
console.log(`Conversions recovered this month: +${recovered}%`);
