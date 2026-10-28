# 👋 Hey, welcome to my site!

This is the repo behind [kalebcole.com](https://kalebcole.com), my personal site and blog.

[Visit the site](https://kalebcole.com) · [Read the blog](https://kalebcole.com/blog)

## Résumé publication

`public/resume.pdf` is generated publication output. Do not edit it directly.
The canonical source is `master.tex` in the private `KalebCole/Resume`
repository. That repository builds and validates `master.pdf`, then opens or
updates the website publication pull request.

## GitHub project data

`src/data/github.json` is the committed source for the GitHub projects shown on
the Projects page and homepage. Site builds read this file and never contact
GitHub for pinned repositories. The weekly
[`refresh-github.yml`](.github/workflows/refresh-github.yml) workflow can also be
run manually in Actions. It uses the workflow's `GITHUB_TOKEN`, includes only
public pinned repositories, and commits when the repositories change or their
verification date needs renewal.

To refresh locally, run `GITHUB_TOKEN="$YOUR_GITHUB_TOKEN" node scripts/refresh-github.mjs`.
The token needs access to GitHub's GraphQL API and must not be committed. If a
refresh fails, the existing snapshot stays in place. A snapshot older than 30
days since its last committed verification still renders, with a warning that
can appear without another build. Successful refreshes renew the verification
date at most every 21 days when the repositories are unchanged. A missing or
malformed snapshot leaves the hand-written project visible and links to GitHub.
