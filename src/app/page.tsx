import data from "../../data/findings.json";
import observedRun from "../../data/retest/control-observed.json";
import correctedRun from "../../data/retest/control-corrected.json";
import removedRun from "../../data/retest/control-component-removed.json";
import CopyTicket from "./CopyTicket";
import { ticketFor } from "./ticket";
import type { Corpus, Observation, RetestReport } from "./types";

const corpus = data.corpus as unknown as Corpus;
const observations = data.observations as unknown as Observation[];
const featured = observations.find((o) => o.featured)!;
const runs = [observedRun, correctedRun, removedRun] as unknown as RetestReport[];

const stats = {
  screens: corpus.screens.length,
  viewports: corpus.viewports.length,
  runs: corpus.runs.length,
  rules: corpus.rulesExecuted,
  reproduced: observations.filter((o) => o.technicalEvidence === "reproduced").length,
  open: observations.filter((o) => o.technicalEvidence === "to-investigate").length,
  issues: corpus.executionIssues.length,
};

const REPO = "https://github.com/fred1433/a11y-evidence-harness";
const CAL = "https://cal.theaipipe.com";
const screenOf = (slug: string) => corpus.screens.find((s) => s.slug === slug)!;
const shortDate = new Date(corpus.date + "T00:00:00Z").toLocaleDateString("en-GB", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});
const VERDICT: Record<string, string> = {
  reproduced: "reproduced",
  "not-reproduced": "not reproduced",
  "cannot-conclude": "cannot conclude",
  "to-investigate": "to investigate",
};
const SCRIPT_EXCERPT = `// scripts/retest.mjs
if (!r.stateVerified)      v = 'cannot-conclude'; // screen never rendered
else if (!r.anchorPresent) v = 'cannot-conclude'; // element is gone
else if (!r.ruleExecuted)  v = 'cannot-conclude'; // rule never ran
else if (r.ruleIncomplete) v = 'cannot-conclude'; // axe could not settle it
else if (r.nodeCount > 0)  v = 'reproduced';
else                       v = 'not-reproduced';`;

function Verdict({ status }: { status: string }) {
  const tone = status === "reproduced" ? "text-ink" : status === "to-investigate" ? "text-[#8a5a00]" : "text-muted";
  return <span className={`whitespace-nowrap font-medium ${tone}`}>{VERDICT[status] ?? status}</span>;
}

const NOT_COVERED = [
  "Everything behind a sign in. Nothing was signed into.",
  "The mobile application, which is not tested in this demonstration.",
  "Screen reader passes with NVDA, JAWS and VoiceOver.",
  "Whether an alt text is meaningful, a reading order sensible, a heading descriptive.",
];
const YOURS = [
  "Which criteria apply to which screens, and what the sample should be.",
  "Whether each proposed criterion is right, and whether an exception applies.",
  "Severity and priority, a judgement rather than an axe impact.",
  "The assessment and the signature at the end of it.",
];

export default function Page() {
  return (
    <>
      <a href="#observations" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
        Skip to the observations
      </a>

      <main className="mx-auto w-full max-w-[1120px] px-6 sm:px-8">
        {/* 1. What this is ------------------------------------------------ */}
        <header className="pt-12 pb-10 md:pt-16 md:pb-12">
          <p className="text-[12.5px] font-medium uppercase tracking-[0.16em] text-muted">The AI Pipe</p>
          <h1 className="mt-6 max-w-[17ch] text-[40px] font-semibold leading-[1.03] tracking-[-0.028em] sm:text-[50px] md:text-[58px]">
            WeGuide public-login checks
          </h1>
          <p className="mt-8 max-w-[78ch] text-[17px] leading-[1.6] text-muted md:text-[18px]">
            A replayable harness pointed at the WeGuide screens reachable without an account, on app.weguide.com.au
            and movement.weguide.health. Run twice on {shortDate}, in {stats.viewports} viewport conditions, with
            axe-core {corpus.engine.axeCore} and a scripted Playwright sequence. Not an accessibility assessment:
            each line records what a machine saw, how to see it again, and which criterion it might belong to.
            The judgement, the severity and the signature stay with a specialist.
          </p>
          <dl className="mt-9 flex flex-wrap gap-x-12 gap-y-4 border-t border-line pt-6 text-[14px]">
            {[
              ["Screens", `${stats.screens}`],
              ["Runs", `${stats.runs}, twenty minutes apart`],
              ["axe rules executed", `${stats.rules}`],
              ["Engine", `axe-core ${corpus.engine.axeCore}, ${corpus.engine.browser}`],
              ["Reviewed by a specialist", "none of it, yet"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted">{k}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
  <div className="mt-9 rounded-xl border border-line bg-[#fbfbfc] p-5 md:p-6">
    <h2 className="text-[16px] font-semibold tracking-[-0.012em]">Why an ordinary axe run reports almost nothing here</h2>
    <p className="mt-2.5 max-w-[92ch] text-[14.5px] leading-[1.6]">
      The portal overrides the native DOM child accessors on{" "}
      {Object.keys(corpus.toolingNote.patchedHostTags).map((t) => `<${t}>`).join(", ")}: those elements
      report no child nodes while holding real children, and any engine that walks a page through
      childNodes stops there. On the sign in screen axe-core saw {corpus.toolingNote.axeNodesAsServed}{" "}
      nodes as served and returned {corpus.toolingNote.violationsAsServed.join(", ")}. With the native
      accessors restored inside the scan, it sees {corpus.toolingNote.axeNodesAfterRestore} nodes and
      returns {corpus.toolingNote.violationsAfterRestore.join(", ")}. Nothing is sent to the site. A near
      empty automated report on this portal is not evidence that the portal is clean.
    </p>
  </div>
        </header>

        {/* 2. One observation, all the way through ------------------------ */}
        <section className="border-t border-line py-12 md:py-14" aria-labelledby="loop">
          <h2 id="loop" className="text-[28px] font-semibold leading-[1.12] tracking-[-0.022em] md:text-[36px]">
            One observation, all the way through
          </h2>
          <p className="mt-5 max-w-[78ch] text-[16px] leading-[1.65] text-muted">
            A list of defects is easy to produce and hard to act on. A loop is not: something seen, handed over with its
            interpretation kept separate, and checked again later by the same control.
          </p>

          <div className="mt-12 grid gap-x-14 gap-y-12 md:grid-cols-2">
            <div className="min-w-0">
              <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">1. Observed</p>
              <h3 className="mt-3 text-[20px] font-semibold tracking-[-0.012em]">{featured.headline}</h3>
              <p className="mt-3 text-[15.5px] leading-[1.65]">{featured.observation}</p>
              <pre tabIndex={0} className="mt-5 overflow-x-auto rounded-lg border border-line bg-[#fbfbfc] p-4 text-[12px] leading-[1.55]">
                <code>{featured.snippet}</code>
              </pre>
              <figure className="mt-5">
                <img
                  src="/evidence/signin-login-button.png"
                  alt="The Login button on the WeGuide sign in screen, outlined, with a caption reading: aria-disabled holds an un-evaluated template expression."
                  width={2560} height={286}
                  className="w-full rounded-lg border border-line"
                />
                <figcaption className="mt-2.5 text-[12.5px] leading-[1.55] text-muted">
                  app.weguide.com.au sign in screen at {corpus.viewportDetail[0].width}{"×"}{corpus.viewportDetail[0].height}. The
                  outline and the caption were drawn by the capture script; the rest is as it rendered.
                </figcaption>
              </figure>

              <p className="mt-9 text-[12px] font-medium uppercase tracking-[0.14em] text-muted">2. Handed over</p>
              <div className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <div>
                  <p className="text-[13px] text-muted">Proposed criterion, not reviewed</p>
                  <p className="mt-1 text-[15.5px] font-medium">
                    {featured.proposedCriterion.number} {featured.proposedCriterion.name} ({featured.proposedCriterion.level})
                  </p>
                </div>
                <div>
                  <p className="text-[13px] text-muted">Accessibility review</p>
                  <p className="mt-1 text-[15.5px] font-medium">Pending a specialist</p>
                </div>
              </div>
              <p className="mt-4 text-[15.5px] leading-[1.65]">
                <span className="text-muted">Proposed remediation. </span>{featured.proposedRemediation}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <CopyTicket text={ticketFor(featured, corpus)} label="Copy this ticket" />
                <span className="text-[13px] text-muted">Plain text for GitHub or Jira, no integration.</span>
              </div>
            </div>

            <div className="min-w-0">
              <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">3. Retested</p>
              <p className="mt-3 text-[15.5px] leading-[1.65]">
                The same control runs again later, and answers only while it still has its subject: the screen must
                render, the element must be there, the rule must execute. Below it runs against a small synthetic
                screen carrying the same four defect shapes, corrected in the repository. A local demonstration,
                not a change to anything you run.
              </p>
              <div tabIndex={0} role="region" aria-label="Retest verdicts for the local control case" className="mt-5 overflow-x-auto rounded-lg border border-line">
                <table className="w-full border-collapse text-[13.5px]">
                  <caption className="sr-only">The same four controls against three local variants of one screen</caption>
                  <thead>
                    <tr className="border-b border-line bg-[#fbfbfc] text-left">
                      <th scope="col" className="px-4 py-2.5 font-medium text-muted">Control</th>
                      {["as observed", "corrected", "form deleted"].map((h) => (
                        <th scope="col" key={h} className="whitespace-nowrap px-4 py-2.5 font-medium text-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runs[0].results.map((row, i) => (
                      <tr key={row.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-2.5 font-mono text-[11.5px] text-muted">{row.ruleId}</td>
                        {runs.map((r) => (
                          <td key={r.variant} className="px-4 py-2.5"><Verdict status={r.results[i].verdict} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-[14.5px] leading-[1.65] text-muted">
                The third column is the one that matters. Deleting the form makes three controls go quiet and the harness
                answers cannot conclude, not fixed. The fourth survived the deletion and was genuinely corrected,
                so it may report not reproduced.
              </p>
              <pre tabIndex={0} className="mt-5 overflow-x-auto rounded-lg border border-line bg-[#fbfbfc] p-4 text-[11.5px] leading-[1.65]">
                <code>{SCRIPT_EXCERPT}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* 3. Everything the two runs recorded ----------------------------- */}
        <section id="observations" className="border-t border-line py-12 md:py-14" aria-labelledby="obs-h">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 id="obs-h" className="text-[28px] font-semibold leading-[1.12] tracking-[-0.022em] md:text-[36px]">
              Everything the two runs recorded
            </h2>
            <p className="text-[14px] text-muted">
              <a className="font-medium text-accent underline underline-offset-4" href="/findings.json">findings.json</a>
              <span className="px-2.5 text-line" aria-hidden="true">/</span>
              <a className="font-medium text-accent underline underline-offset-4" href={REPO}>the harness</a>
            </p>
          </div>
          <p className="mt-5 max-w-[78ch] text-[16px] leading-[1.65] text-muted">
            {stats.reproduced} appeared in both runs, {stats.open} are open questions. Severity is the impact axe
            assigns to its own rule, not a judgement of ours, and the criterion beside each line is a proposal for
            a specialist to accept or throw out.
          </p>

          {/* wide */}
          <div className="mt-10 hidden md:block">
            <table className="w-full border-collapse text-left text-[14.5px]">
              <caption className="sr-only">
                Observations on the public WeGuide screens: proposed criterion, axe impact, whether both runs
                reproduced it, and the review status
              </caption>
              <thead>
                <tr className="border-b border-ink/15">
                  <th scope="col" className="w-[74px] py-2.5 pr-4 font-medium text-muted">SC</th>
                  <th scope="col" className="py-2 pr-4 font-medium text-muted">Observation</th>
                  <th scope="col" className="w-[150px] py-2.5 pr-4 font-medium text-muted">Screens</th>
                  <th scope="col" className="w-[78px] py-2.5 pr-4 font-medium text-muted">axe impact</th>
                  <th scope="col" className="w-[104px] py-2.5 pr-4 font-medium text-muted">Evidence</th>
                  <th scope="col" className="w-[96px] py-2.5 font-medium text-muted">Review</th>
                  <th scope="col" className="w-[118px] py-2.5 font-medium text-muted"><span className="sr-only">Ticket</span></th>
                </tr>
              </thead>
              <tbody>
                {observations.map((o) => (
                  <tr key={o.id} className="border-b border-line">
                    <td className="py-2 pr-4 font-medium">{o.proposedCriterion.number}</td>
                    <td className="py-2 pr-4">{o.headline}</td>
                    <td className="py-2 pr-4 text-[13px] text-muted">
                      {o.screens.length > 1 ? `${o.screens.length} screens` : screenOf(o.screens[0]).group}
                      {o.viewports.length === 1 ? `, ${o.viewports[0]}` : ""}
                    </td>
                    <td className="py-2 pr-4 text-[13px] text-muted">{o.axeImpact ?? "measure"}</td>
                    <td className="py-2 pr-4"><Verdict status={o.technicalEvidence} /></td>
                    <td className="py-2 text-[13px] text-muted">pending</td>
                    <td className="py-2"><CopyTicket text={ticketFor(o, corpus)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* narrow */}
          <ul className="mt-8 md:hidden">
            {observations.map((o) => (
              <li key={o.id} className="border-b border-line py-5">
                <p className="text-[15.5px] font-medium leading-[1.4]">{o.headline}</p>
                <p className="mt-1.5 text-[13.5px] text-muted">
                  {o.proposedCriterion.number} {o.proposedCriterion.name}, Level {o.proposedCriterion.level}
                </p>
                <p className="mt-1.5 text-[13.5px] text-muted">
                  {o.screens.length > 1 ? `${o.screens.length} screens` : screenOf(o.screens[0]).group}
                  <span className="px-2" aria-hidden="true">/</span>
                  axe impact {o.axeImpact ?? "not applicable"}
                  <span className="px-2" aria-hidden="true">/</span>
                  review pending
                </p>
                <p className="mt-1.5 text-[13.5px]"><Verdict status={o.technicalEvidence} /></p>
                <div className="mt-3"><CopyTicket text={ticketFor(o, corpus)} /></div>
              </li>
            ))}
          </ul>

        </section>

        {/* Where this stops ------------------------------------------------ */}
        <section className="border-t border-line py-12 md:py-14" aria-labelledby="stops">
          <h2 id="stops" className="text-[26px] font-semibold leading-[1.12] tracking-[-0.022em] md:text-[32px]">
            Where this stops and where your specialist starts
          </h2>
          <div className="mt-8 grid gap-x-12 gap-y-8 md:grid-cols-3">
            <div>
              <h3 className="text-[15px] font-semibold">Not covered here</h3>
              <ul className="mt-3 space-y-2 text-[14.5px] leading-[1.6] text-muted">
                {NOT_COVERED.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold">Yours to decide, not the tool&apos;s</h3>
              <ul className="mt-3 space-y-2 text-[14.5px] leading-[1.6] text-muted">
                {YOURS.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold">What the measurements could not settle</h3>
              <ul className="mt-3 space-y-2 text-[14.5px] leading-[1.6] text-muted">
                {corpus.limitsShort.map((l) => <li key={l}>{l}</li>)}
                <li>
                  axe returned results it could not settle on some screens, recorded as {stats.issues} execution
                  entries. The rest of the limits are in{" "}
                  <a className="text-accent underline underline-offset-4" href="/findings.json">findings.json</a>.
                </li>
              </ul>
            </div>
          </div>
          <p className="mt-9 max-w-[92ch] text-[16.5px] leading-[1.65]">
            The harness earns its place where an expert&apos;s hours are worth more than a machine&apos;s: clear the
            automated baseline and the regression checks before the review starts, and hand the review a record it
            can replay.{" "}
            <a className="font-medium text-accent underline underline-offset-4" href={CAL}>
              Fifteen minutes to talk it through
            </a>
            .
          </p>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-8 text-[13.5px] leading-[1.6] text-muted sm:px-8">
          <p>
            Built by Frederic de Lavenne de Choulot, The AI Pipe. Observations recorded on {shortDate}. Not
            indexed, and not an accessibility assessment.{" "}
            <a className="text-accent underline underline-offset-4" href={REPO}>the harness on GitHub</a>
            <span className="px-2.5 text-line" aria-hidden="true">/</span>
            <a className="text-accent underline underline-offset-4" href="/findings.json">findings.json</a>
          </p>
        </div>
      </footer>
    </>
  );
}
