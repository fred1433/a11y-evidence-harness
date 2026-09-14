import type { Observation, Corpus } from "./types";

/** The text a developer pastes into GitHub or Jira. No integration, no assumptions about their tracker. */
export function ticketFor(o: Observation, corpus: Corpus): string {
  const screens = o.screens
    .map((s) => {
      const screen = corpus.screens.find((x) => x.slug === s);
      return `  - ${screen?.label ?? s}  ${screen?.url ?? ""}`;
    })
    .join("\n");
  const runs = corpus.runs.map((r) => `${r.label} ${r.startedAt}`).join(", ");
  return `[a11y] ${o.headline}

OBSERVED
${o.observation}

Screens
${screens}

State tested
  ${o.state}

Viewports
  ${o.viewports.join(", ")}

Element
  ${o.selector}
  ${o.snippet}

HOW IT WAS PRODUCED
  ${o.method}
  Runs: ${runs}
  Engine: axe-core ${corpus.engine.axeCore}, ${corpus.engine.browser}, headless
  Rules requested: ${corpus.tags.normative.join(", ")} (best-practice rules run separately and are not counted as failures)

Technical evidence: ${o.technicalEvidence}${o.technicalEvidence === "reproduced" ? ` (${o.reproducedIn.join(" and ")})` : ""}
${o.openQuestion ? `Open question: ${o.openQuestion}\n` : ""}
PROPOSED, NOT REVIEWED
  Success criterion: ${o.proposedCriterion.number} ${o.proposedCriterion.name} (Level ${o.proposedCriterion.level})
  Accessibility review: pending, for a specialist to confirm or reject
  ${o.axeImpact ? `axe impact: ${o.axeImpact}` : "No axe impact: this came from a scripted measure, not a rule"}

PROPOSED REMEDIATION
  ${o.proposedRemediation}

RETEST
  npx playwright install chromium
  node scripts/retest.mjs --url "${corpus.screens.find((s) => s.slug === o.screens[0])?.url ?? ""}" --controls findings.json
${
  o.check.kind === "axe"
    ? `  The control passes only if the rule ${o.check.ruleId} runs, the element ${o.check.anchor} is still on the screen, and the screen state ${o.check.stateSelector} renders.
  If any of those is missing the retest answers "cannot conclude", not "fixed". No longer detected is not the same as sufficient.`
    : `  This one came from a scripted measure rather than an axe rule. Re-run it with: node scripts/manual-checks.mjs --pass retest
  A measure that does not reach the same screen state answers "cannot conclude", not "fixed".`
}
`;
}
