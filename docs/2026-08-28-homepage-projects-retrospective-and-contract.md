# Homepage and Projects Retrospective and Deterministic Contract Proposal

Date: 2026-08-28

Status: Retrospective and proposal. This document records what happened in the Student Developer Series and homepage session. The proposed rules are not an active repository contract until they are implemented in code, certification, and a short pointer from `AGENTS.md`.

## Why this document exists

The session produced a successful homepage and Projects redesign, but it also exposed a recurring problem. Some product decisions were written in prompts and discovered through visual review instead of being encoded in the repository. An agent could therefore make a locally reasonable change that violated an already-settled site rule.

The goal is to move repeatable decisions into deterministic systems:

1. Checked-in structured project data.
2. A schema that rejects invalid project entries.
3. Build certification that checks rendered behavior.
4. Browser tests for responsive geometry and computed styles.
5. A small agent-facing contract that points to the executable rules.

Prompts should decide new editorial questions. They should not repeatedly rediscover settled constraints such as "every project has an image" or "the homepage shows no more than two projects."

## What was done in the session

### 1. Student Developer Series project work

- Researched the Student Developer Series and its public website.
- Established that Kaleb co-created the series with a team and built its website. The page copy was written to avoid implying sole authorship.
- Set the public title to **Build Your Personal Brand with Copilot**.
- Set the description to: **A YouTube series for the Microsoft Developer channel that guides college students and beginners through turning an existing PDF resume into a portfolio website with GitHub Copilot.**
- Linked the project to `https://aka.ms/student-learning-series-website`, not directly to YouTube or GitHub.
- Used the Microsoft series share image as the card image.
- Added the role statement: **I helped create the series with a team and built its website.**

### 2. Project presentation exploration

- Built and compared three throwaway homepage directions:
  - Hand-marked workshop
  - Blue-hour dispatch
  - Living notebook
- Used desktop and mobile screenshots to compare the directions.
- Rejected a horizontal row treatment for projects.
- Selected a clean visual grid with a large image, title, description, and optional contribution context.
- Kept the prototypes out of production output.

### 3. Homepage information architecture

- Removed the retired hero tagline.
- Added two clear hero actions:
  - **See my projects**
  - **Read my writing**
- Added a **Recent projects** section before Recent writing.
- Limited the homepage project preview to two cards.
- Added a minimal **All projects →** link that matches the hierarchy of **All writing →**.
- Removed the project-loading fallback message from public pages.

### 4. Project data and card behavior

- Continued to load GitHub pinned repositories through the GitHub GraphQL API.
- Kept the Student Developer Series as an explicitly authored project before the pinned repositories.
- Made the homepage limit account for the authored series card, so the combined total stays at two.
- Removed manual repository exclusions. GitHub-pinned repositories remain the dynamic source for repository cards.
- Renamed the override map from homepage-specific language to `repoOverrides`.
- Applied repository overrides on both the homepage and the Projects index.
- Updated `uprint-cli` to use:
  - Title: **uprint-cli**
  - Public website: `https://kalebcole.github.io/uprint-cli/`
  - A checked-in website screenshot at `public/projects/uprint-website.webp`
  - The approved GitHub About description
- Removed language labels and taxonomy rows such as **Website + video** and **Website + PowerShell**.
- Removed the project-specific blue title rule so all project titles use the same text color.

### 5. Projects index copy

- Replaced the previous introduction after reviewing several alternatives.
- Kept Kaleb's selected wording exactly:
  - **Things I've built, contributed to, or am currently working on.**

### 6. Responsive and visual corrections

- Preserved the homepage hero as the dominant opening section.
- Verified that both hero actions are visible at 100% desktop zoom.
- Corrected the mobile source and visual order to:
  1. Complete introduction
  2. Hero actions
  3. Portrait
  4. Recent projects
  5. Recent writing
- Prevented the portrait from being squeezed beside the introduction on narrow screens.
- Used a two-column project grid on desktop and a single-column layout on mobile.
- Aligned homepage project typography with the rest of the documented type system.
- Verified no page-level horizontal overflow at a 390px mobile viewport.
- Verified the desktop project grid and title treatment at a wide viewport.

### 7. Product and design documentation

- Updated `PRODUCT.md` so the homepage contract includes direct paths to Projects and Writing and a compact project preview before recent writing.
- Updated `PRODUCT.md` so Projects is described as a full index with a two-project homepage preview.
- Updated `DESIGN.md` with the full-width project grid, the All projects link, and the mobile order that places projects after the portrait and before writing.
- Recorded the intended two-project cap in the primary homepage layout section.
- The audit for this retrospective found and corrected two stale later bullets in `DESIGN.md` that still said three projects. This contradiction was not caught by certification.

### 8. Review and correction loop

An independent rubber-duck review found three material issues:

1. `uprint-cli` overrides were homepage-only, causing different links and metadata on the Projects index.
2. Certification did not prove cross-page project consistency.
3. The mobile hero layout violated the documented source order and squeezed the portrait.

All three were corrected. Rendered HTML assertions were added for shared project metadata and homepage source order.

Subsequent visual review found two more issues:

1. Redundant project metadata labels cluttered the cards.
2. The Student Developer Series title was blue while `uprint-cli` was black.

Both issues were removed and reverified.

### 9. Certification added or strengthened

`scripts/certify.mjs` now asserts the following session decisions:

- The retired hero copy stays removed.
- The hero links to Projects and Writing.
- Recent projects exists.
- The homepage has between one and two project cards.
- The project preview ends with the minimal All projects link.
- The Student Developer Series uses its approved title and description.
- Project cards do not render the removed taxonomy or language metadata.
- The `uprint-cli` override uses its public website, checked-in preview, and approved description.
- Repository overrides apply on every project surface.
- The Projects index includes the Student Developer Series.
- The homepage and Projects index use consistent `uprint-cli` data.
- The homepage source order places actions before the portrait.
- The `uprint-cli` image is emitted in the production build.
- Project-loading errors are not shown to visitors.

The full existing certification also checks routes, headings, landmarks, language, skip links, navigation, metadata, declared image dimensions, local asset references, no positive `tabindex`, reduced motion, forced colors, keyboard focus, safe areas, performance budgets, no third-party JavaScript, feeds, icon dimensions, canonical URLs, and the repository-wide punctuation rule.

### 10. Verification and delivery

- Ran tokenless production builds and full certification.
- Ran authenticated certification while investigating pinned repository behavior.
- Inspected rendered HTML for exact content and links.
- Captured and reviewed desktop and mobile screenshots.
- Verified the Vercel preview deployment.
- Created PR #85 and pushed the scoped commits.
- Confirmed all GitHub and Vercel checks passed.
- Encountered a `gh pr merge --delete-branch` failure because another worktree had `master` checked out.
- Verified that the merge itself could be completed independently of the local worktree checkout.
- Completed the merge through GitHub, deleted the remote feature branch, and verified `master` at squash commit `57555e6`.
- Verified the production homepage and Projects page. A cache-busting request was used when the first public fetch returned stale HTML.
- Recorded the misleading post-merge worktree failure as an agent papercut.

### PR #85 commit sequence

GitHub records these 15 branch commits before the squash merge:

1. `0fe9e18` feat: add Student Developer Series project
2. `ad3c7d9` feat: add homepage project preview
3. `18d3ddd` fix: keep homepage actions above the fold
4. `b9b9d9d` fix: rebalance homepage sections
5. `5c5a40b` fix: preserve available project previews
6. `7d16d2f` fix: curate homepage project preview
7. `ee76560` fix: link uprint project to its website
8. `f34c9f7` fix: match uprint GitHub metadata
9. `cdf9241` fix: curate projects index
10. `b060112` fix: follow pinned project curation
11. `2ce93f0` fix: use published series title and description
12. `c4968f6` fix: align project surfaces and mobile order
13. `479b19e` fix: remove project metadata labels
14. `98231b5` copy: clarify projects introduction
15. `a6a1d94` fix: align project title colors

They were squash-merged as `57555e6` in [PR #85](https://github.com/KalebCole/kalebcole.com/pull/85).

## What is deterministic today

The repository already has a strong build-time certification layer. The following decisions are executable rather than prompt-only:

| Area | Current deterministic protection |
| --- | --- |
| Global copy | Tracked source and emitted text cannot contain em dashes. |
| Accessibility basics | Every route has one `h1`, a named main landmark, language, skip link, named primary navigation, and no positive `tabindex`. Images require alt text and dimensions. |
| Metadata | Canonical, Open Graph, Twitter, theme-color, RSS, and social-image invariants are checked. |
| Performance | HTML, CSS, JavaScript, fonts, images, route payload, and request counts have budgets. |
| Interaction resilience | CSS must include reduced-motion, forced-colors, hover-capability, safe-area, and focus-visible handling. |
| Homepage project count | The rendered homepage must contain one or two project cards. |
| Homepage hierarchy | Hero actions, Recent projects, All projects, and the introduction-before-portrait source order are checked. |
| Approved project details | The series title and description and the `uprint-cli` URL, image, and description are asserted. |
| Cross-page consistency | The same `uprint-cli` override must appear on the homepage and Projects index. |
| Removed UI | Taxonomy labels, language metadata, public load-error copy, and retired hero copy are rejected. |

## What is still prompt-based or fragile

### 1. There is no project content model

The Student Developer Series is hardcoded in `PinnedRepos.astro`. Repository projects arrive from GitHub and are then patched by an inline override map. The system has no single schema that defines what a project must contain.

Consequence: "projects must contain an image" is currently an implementation convention, not a data invariant.

### 2. Production content depends on a live remote API

The build queries GitHub GraphQL for pinned repositories. Missing credentials, rate limits, API errors, SAML restrictions, or partial GraphQL results can change the built Projects page without a repository change.

Consequence: the same commit can emit different project content at different times or in different environments. The tokenless certification run for this document passed while emitting only the hardcoded Student Developer Series card. That is the opposite of a deterministic build.

### 3. Project images are not governed uniformly

`uprint-cli` uses a checked-in local image. The Student Developer Series uses a remote Microsoft image. Other GitHub repositories use GitHub-generated Open Graph images.

Consequence: image availability, exact pixels, file size, and aspect ratio are not fully controlled by the repository.

### 4. Cross-page tests are project-specific

Current certification contains exact assertions for the two projects discussed in this session. The rendered `uprint-cli` checks are conditional on that project appearing in the build, so a tokenless build skips them instead of failing when the card disappears. It does not generically prove that every expected project exists or that every project card uses the same title, description, URL, image, and contribution text across every surface.

### 5. Visual invariants are mostly manual

The session caught title-color inconsistency and mobile layout problems through screenshots. Static HTML assertions cannot prove computed color, column count, clipping, overflow, visible actions, or actual rendered order.

### 6. The guardrails are not mutation-tested

A green certification run proves only that the current repository passes the checks. It does not prove that each important checker rejects a deliberately invalid project.

### 7. The durable documentation contradicted itself

`PRODUCT.md` and the primary homepage layout section in `DESIGN.md` specified a two-project homepage preview while two later `DESIGN.md` bullets still specified up to three projects. The rendered-output gate enforced two, but an agent reading only the stale bullets could have made the wrong change. This audit corrected those bullets.

Consequence: documentation is not generated from, or checked against, the executable limit. The stale references are corrected, but the cap should still be exported from one named source that both rendering and certification consume.

## Proposed deterministic project contract

### Principle

A project page must be reproducible from the Git commit alone. Remote services may suggest updates, but they must not decide production content during the build.

### Canonical source

Create an Astro `projects` content collection. Use one checked-in entry per project under `src/content/projects/`. Both the homepage and Projects index must render from this collection.

Suggested schema:

```ts
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1).max(80),
    description: z.string().min(1).max(240),
    url: z.string().url().refine((url) => url.startsWith('https://')),
    image: z.string().regex(/^\/projects\/[a-z0-9-]+\.webp$/),
    imageAlt: z.string().min(1).max(160),
    imageWidth: z.number().int().positive(),
    imageHeight: z.number().int().positive(),
    source: z.enum(['github-pin', 'editorial']),
    repositoryId: z.string().min(1).optional(),
    featured: z.boolean().default(false),
    order: z.number().int(),
    draft: z.boolean().default(false),
    repository: z.string().url().optional(),
    collaboration: z.boolean().default(false),
    role: z.string().min(1).max(180).optional(),
  }).superRefine((project, context) => {
    if (project.collaboration && !project.role) {
      context.addIssue({
        code: 'custom',
        path: ['role'],
        message: 'Collaborative projects require a role statement.',
      });
    }
    if (project.source === 'github-pin' && !project.repositoryId) {
      context.addIssue({
        code: 'custom',
        path: ['repositoryId'],
        message: 'GitHub-pinned projects require a stable repository ID.',
      });
    }
  }),
});
```

The exact field names can change during implementation. The enforceable behavior should not.

### Required project invariants

Every published project must:

1. Have a unique stable slug.
2. Have a non-empty title and description.
3. Have an explicit HTTPS destination URL.
4. Have one checked-in local WebP image under `public/projects/`.
5. Have non-empty alt text that describes the image rather than repeating the title or filename.
6. Declare the image's real width and height.
7. Fit the shared project-card aspect ratio.
8. Stay under an agreed image byte budget.
9. Declare a deterministic integer order.
10. Declare whether it is featured on the homepage.
11. Include a role statement when the work was collaborative.
12. Use the same data on every surface.
13. Stay out of all public output when `draft: true`.
14. Declare whether its provenance is a GitHub pin or an editorial project.
15. Include GitHub's stable repository node ID when its provenance is a GitHub pin.

### Homepage invariants

The homepage must:

1. Render one or two published projects with `featured: true`.
2. Reject a third featured project at certification time rather than silently slicing it away.
3. Render featured projects in declared order.
4. Render the same project data and card structure as the Projects index.
5. Keep Recent projects before Recent writing.
6. Keep the complete introduction and actions before the portrait in source order.
7. Keep both hero actions fully visible at the agreed desktop acceptance viewport.
8. End the preview with the minimal All projects link.
9. Show no remote-loading status or error message.

The maximum should live in one exported constant or project-selection function. The page, validator, and tests must import or derive from that same source instead of repeating the number in three files.

### Projects index invariants

The Projects index must:

1. Render every published project exactly once.
2. Render no draft project.
3. Use the approved introduction exactly until Kaleb intentionally changes the locked copy and its assertion together.
4. Use the same card component and project data as the homepage.
5. Render no language label, project taxonomy, achievement metric, or project-specific visual treatment.

### Card invariants

Every project card must:

1. Contain exactly one image, one title link, and one description.
2. Point both the image and title to the project's explicit public URL.
3. Use identical structural classes across projects.
4. Use the same computed title color, typography, and spacing across projects in each theme.
5. Use the same image aspect ratio.
6. Reserve intrinsic image space.
7. Include collaboration context only when the data requires it.
8. Avoid project-specific CSS selectors and slug-derived visual classes.

## GitHub pins without nondeterministic builds

The product decision that repository projects should reflect Kaleb's GitHub pins can remain, but synchronization should be separated from rendering.

Recommended model:

1. `npm run projects:sync` queries GitHub with an authenticated token.
2. Every entry declares `source: github-pin` or `source: editorial`.
3. Pin-sourced entries carry GitHub's stable repository node ID. Names and URLs are mutable metadata, not identity.
4. The command reconciles pin-sourced entries one-to-one against the complete current pin set. Added pins create entries, renamed pins update the matching stable ID, and removed pins remove or explicitly retire their pin-sourced entries.
5. Editorial entries such as the Student Developer Series are outside pin reconciliation and cannot be deleted by the sync.
6. Existing approved editorial fields such as public URL, image, alt text, and description overrides are preserved on a matched stable repository ID.
7. The command rejects duplicate IDs, incomplete API responses, and ambiguous reconciliation instead of producing a partial manifest.
8. The command prints a reviewable diff. It does not publish automatically.
9. A scheduled GitHub workflow can run the sync and open a PR when pins change.
10. Normal builds and PR certification use only checked-in data and never require GitHub network access.
11. A failed sync reports drift-monitoring failure, but it cannot remove projects from production.

This preserves "current GitHub pins, no hidden exclusion list" while making each deployed commit reproducible.

Fixture-driven sync tests must cover added, removed, renamed, and overridden pins using saved complete GraphQL responses. They must also prove that an incomplete or partial response fails closed without rewriting the manifest.

## Proposed executable gates

### Gate 1: schema validation

Use Astro's content schema for field shape, URL form, lengths, draft state, collaboration requirements, and featured state.

Failure examples:

- Missing image
- Remote image URL
- Empty alt text
- Collaborative project without a role
- Invalid URL
- Duplicate or missing order

### Gate 2: project asset validation

Add `scripts/certify-projects.mjs` and include it in `npm run certify`.

It should verify for every published project:

- The image exists.
- The file is WebP.
- Encoded dimensions match declared dimensions.
- Aspect ratio matches the project-card standard.
- File size stays under budget.
- The referenced source image is tracked by Git.
- No two projects reuse a slug or public URL accidentally.
- Featured count is between one and two.
- Featured order and full-index order are deterministic.

### Gate 3: generic rendered-output validation

Parse the built homepage and Projects index against the collection data.

For every project, verify:

- Draft visibility is correct.
- Occurrence counts are exact.
- Title, description, URL, image, alt text, and role match the source data.
- Featured projects appear on both surfaces.
- Non-featured projects appear only on the full index.
- Image and title links have the same destination.
- Every card has the same required structure.

This replaces one-off assertions for named projects with data-driven checks. Exact locked copy can remain as a separate editorial assertion.

### Gate 4: browser geometry and computed-style checks

Add a small browser certification script. Prefer geometry and computed-style assertions over broad pixel snapshots.

Run at least these viewports:

- 1432 by 748 desktop
- 390 by 844 mobile
- 320px narrow mobile

Check:

- No horizontal document overflow.
- Hero actions are within the first desktop viewport and are not clipped.
- Desktop project cards form two columns.
- Mobile project cards form one column.
- The introduction, actions, portrait, projects, and writing appear in the approved visual order.
- Project card rectangles do not overlap.
- All project titles have the same computed color in light mode and in dark mode.
- Focus indicators are visible.
- A 200% text-size run does not hide content or controls.
- Reduced-motion mode does not depend on animation for access to content.

### Gate 5: banned project-specific presentation

Reject project-specific card styling unless a future approved design explicitly adds a typed variant.

The narrow rule can reject:

- Slug-derived project-card classes.
- CSS selectors that target a named project.
- Inline style attributes inside project cards.
- Language and taxonomy metadata classes that were removed in this session.

The positive target is one shared card component with one shared style contract.

### Gate 6: mutation tests

Create invalid fixtures and prove the gates go red for at least:

1. A project without an image.
2. A remote project image.
3. A missing local image file.
4. Three featured projects.
5. A collaborative project without a role statement.
6. A duplicate project URL.
7. A draft project emitted publicly.
8. A project-specific title color.
9. A mobile overflow regression.
10. A project card whose image and title point to different URLs.
11. An untracked project image that exists in the working tree but not in the commit.
12. A partial GitHub pin response presented to the sync command.

Run the invalid cases against the narrow validator in automated tests. Keep mutation fixtures outside production content or create and remove them in a controlled temporary test directory.

### Gate 7: reproducible output

Add a reproducibility check that exports the exact commit into two fresh directories, installs from the lockfile, performs two tokenless builds, and compares generated project manifests. Each manifest must contain:

- SHA-256 hashes for `dist/index.html` and `dist/projects/index.html`
- SHA-256 hashes, encoded dimensions, and paths for every emitted project image
- SHA-256 hashes for the complete local asset closure referenced by those HTML files, including stylesheets, stylesheet assets, scripts, fonts, and images

The build input must come from the commit rather than the working tree so an untracked local image cannot make both builds pass. Generated values that are intentionally time-dependent must be removed from these surfaces or normalized explicitly. A manifest mismatch is a release failure.

### Gate 8: CI contract

A pull request that changes project data, project cards, homepage structure, shared CSS, or certification must pass:

```text
npm run certify
npm run test:project-contract
npm run test:responsive-contract
```

The command names are proposals. The important rule is that the default release certification includes every blocking gate and runs without secrets or network access.

## What should not be a blocking deterministic gate

Do not put live external state back into release certification under a different name.

- Do not require GitHub's current pin response during a normal build or pull request.
- Do not require external project websites to return HTTP 200 during release certification.
- Do not use remote image availability because project images should be local.
- Do not make a broad pixel-perfect screenshot diff the only visual gate.

Current GitHub pins and external link health belong in scheduled monitors that report drift or open a reviewable pull request. Geometry, content shape, local assets, and rendered consistency belong in blocking CI because the repository controls them.

## What should remain human judgment

Determinism should protect settled constraints, not pretend to make editorial decisions.

The following still require Kaleb's approval:

- Whether a project deserves publication.
- Whether a project should be one of the one or two homepage features.
- The project title and description.
- The contribution statement and whether it fairly describes collaboration.
- The image selection and crop, after it passes technical requirements.
- Major changes to hierarchy, typography, or visual identity.
- Intentional changes to locked copy.

Once one of those choices is approved, the selected value can become deterministic through checked-in content and an explicit assertion.

## Recommended implementation order

### PR 1: deterministic project data

- Add the `projects` content collection.
- Move the Student Developer Series and `uprint-cli` into checked-in entries.
- Download and process every project image into a local WebP asset.
- Render both surfaces from one shared project list and card component.
- Remove build-time GitHub data from production rendering.
- Preserve the current visual output.

Completion criterion: two tokenless builds from the same commit emit identical project HTML and image references.

### PR 2: project contract certification

- Add generic project schema and asset validation.
- Add data-driven rendered-output checks.
- Add mutation tests for missing images, featured overflow, drafts, collaboration context, and URL mismatches.
- Fold all blocking checks into `npm run certify`.

Completion criterion: clean fixtures pass, every invalid fixture fails for the intended reason, and full certification passes.

### PR 3: responsive browser contract

- Add the narrow browser test dependency and scripts.
- Encode viewport geometry, computed title-color equality, visible hero actions, source order, text resize, and overflow checks.
- Keep screenshots as review evidence, not the only pass/fail mechanism.

Completion criterion: the browser contract passes in both themes at all required viewports and goes red under controlled layout and color mutations.

### Optional PR 4: GitHub pin synchronization

- Add an authenticated sync command that updates checked-in project data.
- Add a scheduled workflow that opens a PR when pins drift.
- Keep normal builds offline and deterministic.

Completion criterion: a pin change produces a reviewable data diff, while a GitHub outage leaves the production build unchanged.

## Recommended durable documentation placement

After implementation:

- Keep product intent in `PRODUCT.md`.
- Keep visual and responsive rules in `DESIGN.md`.
- Keep executable checks in the schema and certification scripts.
- Add one short `AGENTS.md` pointer for any project or homepage change:
  - Read the project collection schema and run the full certification. A project is complete only when its local image, rendered surfaces, responsive contract, and mutation-tested gates pass.
- Do not copy the full rule list into `AGENTS.md`. The code and focused documentation should remain the single source of truth.

## Bottom line

The current site has unusually strong general certification, and this session improved it. The remaining root problem is architectural: projects are not yet modeled as deterministic content. The highest-leverage next change is not another exact string assertion. It is a checked-in project collection with required local images, one shared renderer, generic output validation, and a tokenless build.

That would make the user's example enforceable: a project without an image could not compile, could not pass certification, and could not be deployed, regardless of what an agent's prompt said.
