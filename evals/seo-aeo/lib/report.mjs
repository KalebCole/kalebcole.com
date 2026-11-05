// Renders a run's scores as Markdown for the monthly audit (#150). Every
// number keeps its raw counts, and missing or not applicable stays visible.

const METRIC_LABELS = {
  visibility: 'Visibility',
  entitySeparation: 'Entity separation',
  factAccuracy: 'Fact accuracy',
  completeness: 'Completeness',
  citationSupport: 'Citation support',
  organicRank: 'Organic rank',
};

const LABELS = {
  fixture: 'offline fixture, not a real engine',
  'serp-capture': 'third-party SERP capture',
  'api-proxy': 'API proxy, not the consumer app',
  'manual-ui': 'manual consumer UI capture',
};

function formatTime(iso, timeZone) {
  if (!iso) return 'not recorded';
  const date = new Date(iso);
  const local = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
  return `${local} (${iso})`;
}

function cell(entry) {
  if (entry.status !== 'measured') return entry.status;
  return String(entry.score);
}

function raw(name, entry) {
  if (name === 'organicRank') {
    if (!entry.perQuery?.length) return entry.note ?? '';
    return entry.perQuery.map((row) => `${row.queryId}: kalebcole.com ${row.siteRank} of ${row.captured}, namesake ${row.namesakePosition ?? `>${row.captured}`}`).join('; ');
  }
  const parts = [`${entry.numerator}/${entry.denominator}`];
  if (entry.pendingReview) parts.push(`${entry.pendingReview} pending review`);
  if (name === 'factAccuracy' && entry.denominator) parts.push(`${entry.incorrect} incorrect`);
  if (name === 'entitySeparation' && entry.confirmedConflations) parts.push(`${entry.confirmedConflations} confirmed conflation(s)`);
  if (name === 'citationSupport' && entry.denominator) parts.push(`${entry.siteCited} cite kalebcole.com, ${entry.supportUnconfirmed} support unconfirmed`);
  if (entry.note) parts.push(entry.note);
  return parts.join(', ');
}

export function renderReport({ manifest, scores, timeZone = 'America/Los_Angeles' }) {
  const lines = [
    `# SEO and AEO eval run ${manifest.runId}`,
    '',
    `- Kind: ${manifest.kind}`,
    `- Started: ${formatTime(manifest.startedAt, timeZone)}`,
    `- Commit: ${manifest.commit ?? 'not recorded'}`,
    `- Versions: queries ${manifest.versions.queries}, facts ${manifest.versions.facts}, rubric ${manifest.versions.rubric}, config ${manifest.versions.config}`,
    `- Locale: ${manifest.locale.location}, ${manifest.locale.language}-${manifest.locale.country}, ${manifest.locale.device}`,
  ];
  if (manifest.provisional) lines.push(`- Provisional: facts.json is ${manifest.factsStatus}, so these scores are not a baseline.`);
  if (manifest.plan?.skipped?.length) {
    lines.push('', '## Skipped', '', ...manifest.plan.skipped.map((entry) => `- ${entry.reason}`));
  }

  const alerts = scores.groups.flatMap((group) => group.critical.confirmedConflations.map((id) => `- Confirmed conflation: ${id}`));
  const suspected = scores.groups.flatMap((group) => group.critical.suspectedConflations.map((id) => `- Suspected conflation, pending review: ${id}`));
  if (alerts.length || suspected.length) lines.push('', '## Critical', '', ...alerts, ...suspected);

  for (const group of scores.groups) {
    const missing = group.missingness;
    lines.push(
      '',
      `## ${group.provider} (${group.surface})`,
      '',
      `Source: ${LABELS[group.label] ?? group.label}. Compatibility key ${group.compatibilityKey}; compare month over month only when it matches.`,
      '',
      '| Metric | Score (0 to 100) | Raw |',
      '| --- | --- | --- |',
      ...Object.entries(METRIC_LABELS).map(([name, label]) => `| ${label} | ${cell(group.metrics[name])} | ${raw(name, group.metrics[name])} |`),
      '',
      `Classifications: ${Object.entries(group.classifications).map(([name, count]) => `${name} ${count}`).join(', ')}.`,
      `Missingness: ${missing.attempted} attempted, ${missing.ok} ok, ${missing.absent} absent, ${missing.error} error, ${missing.skipped} skipped, ${missing.noAnswerText} without answer text, ${missing.pendingReview} pending review.`,
    );
  }

  lines.push('', '## Review queue', '');
  if (scores.review.length === 0) lines.push('Nothing to review.');
  for (const item of scores.review) {
    if (item.kind === 'classification') {
      lines.push(`- ${item.answerId}: confirm the classification (auto: ${item.autoClassification}; ${item.reasons.join('; ') || 'no reason recorded'}).`);
    } else {
      lines.push(`- ${item.answerId}: confirm the cited page supports the claim (${item.citedUrls.join(', ')}).`);
    }
  }
  return `${lines.join('\n')}\n`;
}
