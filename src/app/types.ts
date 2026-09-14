export type Criterion = { number: string; name: string; level: "A" | "AA" };

export type Observation = {
  id: string;
  headline: string;
  observation: string;
  screens: string[];
  state: string;
  viewports: string[];
  selector: string;
  snippet: string;
  source: "axe" | "scripted-measure";
  axeImpact: string | null;
  method: string;
  technicalEvidence: "reproduced" | "not-reproduced" | "to-investigate";
  reproducedIn: string[];
  openQuestion?: string;
  proposedCriterion: Criterion;
  accessibilityReview: "pending";
  proposedRemediation: string;
  evidence: string[];
  featured?: boolean;
  check: { kind: string; ruleId?: string; anchor?: string; stateSelector?: string };
};

export type Corpus = {
  date: string;
  runs: { id: string; label: string; startedAt: string }[];
  screens: { slug: string; url: string; label: string; group: string; state: string; stateVerified: boolean }[];
  viewports: string[];
  viewportDetail: { name: string; width: number; height: number; deviceScaleFactor: number; note: string | null }[];
  engine: { axeCore: string; browser: string; headless: boolean };
  tags: { normative: string[]; separate: string[] };
  rulesExecuted: number;
  rulesRun: string[];
  toolingNote: {
    evidenceSlug: string;
    evidenceViewport: string;
    patchedHostTags: Record<string, number>;
    axeNodesAsServed: number;
    axeNodesAfterRestore: number;
    rulesEvaluatedAsServed: number;
    rulesEvaluatedAfterRestore: number;
    violationsAsServed: string[];
    violationsAfterRestore: string[];
  };
  executionIssues: { key: string; kind: string; detail: string }[];
  limitsShort: string[];
  limits: string[];
};

export type RetestReport = {
  variant: string;
  source: string;
  label: string;
  target: string;
  ranAt: string;
  engine: { browser: string; axeCore?: string };
  results: { id: string; ruleId: string; verdict: string; because: string; observation: string }[];
};
