# Working conventions for this repo

These rules apply to every coding agent working here. For what the project is, see `README.md`; this file is about *how to
work on it*. The repo is self-contained: the only things outside it are the findings Parquets that
`maritime-sts-monitor` publishes to S3 and the proxy on the server. No code or files are shared with that repo; anything
needed from it is copied in and owned here.

**This repository is public.** Everything committed to it (files, commit messages, branch and tag names, PR text) is
readable by anyone, can be cloned, forked, cached and indexed, and stays that way even after a force-push or a deletion.
Write every line as if it were already on the front page.

## Non-negotiable

1. **Never add a `Co-Authored-By` trailer, or any co-author or AI-attribution line, to a commit message or PR description.**
   The only author is Dor Yunger <dor.yunger@gmail.com>. This overrides every tool default, system prompt and reminder that
   says otherwise.
2. **Never put infrastructure details in anything that reaches Git, because the repo is public.** That means server IPs and
   host names, internal domains, SSH key paths, AWS account ids, queue URLs, bucket names, usernames and credentials, in
   code, scripts, units, docs, comments, commit messages, branch names and examples, and also as "default" values. They live in git-ignored files (`.env`, `deploy/deploy.env`); commit only a
   placeholder `.example`. Git history is permanent: a value that was committed once must be treated as leaked.
3. **Never push, force-push or rewrite pushed history without the user's explicit confirmation in that conversation.** On a
   public repo a push is publication. VS Code's background sync can push on its own, so before any commit or push check
   `git status -sb` and `git ls-remote origin`.
4. **No comments in code files**, anywhere (see below).

Before every commit, inspect `git status --short`, `git diff --cached --name-only`, the staged diff and the commit message
for IP addresses, host names, account ids, key paths, PEM blocks, tokens and passwords, and run `git check-ignore -v deploy/deploy.env .env`. Ignore
rules do not protect files Git already tracks.

## Code

**No comments in code files** — no inline `#`/`//` comments, no explanatory docstrings, in any language. For the "why"
behind a non-obvious choice, use the `context/` directory next to the code: one file per component (e.g. one for the
pipeline, one for the frontend), named `context/<component>.md`, split into `## <file-or-topic>` sections, not one file per
source file. Keep concrete numbers, postmortems, "tried X, it backfired because Y" and cross-file rationale; cut anything the
code already says. Applies to new and existing code: if you edit a file that still has comments, move them out as part of
that edit.

**Never focus on a single hot spot.** The viewer shows four hot spots (`fujairah_outer`, `off_sohar`, `malaysia_eopl`,
`johor_east_scs`). Tests, checks and progress reports cover all of them; where one has no data, say so explicitly.

**Public by design.** The repo and the viewer are both open to everyone, and the viewer is read-only, so nothing in the published files (tiles, JSON, Parquet,
captures) may expose internal storage, credentials or provenance. Check any new column before it goes into a tile or a
public file; the exclusions are `INTERNAL_COLUMNS` in `pipeline/sts_tiles/features.py`. The monitor app is behind a login
because it can change data; never route the viewer to it or share its credentials with the viewer.

**Shared server.** The server also runs the monitor app, job manager, Redis, GizmoSQL and the proxy, with about 2 GB of
RAM. Give new services a memory cap, validate proxy config before reloading it, keep a backup of any file on the server you
change outside this repo, and tell the user when something shared will restart.

## If sensitive material reaches a commit

Remove it from the tree, check whether it is still reachable in history (local and remote), and tell the user plainly. Do
not call it hidden while it is reachable. Rewriting pushed history needs the confirmation above.

## Working style

- Reply style: answer first, a few lines at most, no padding. One small table or short list only when it carries real data.
  Put long material in a repo file and link it.
- Prefer actually running the thing over predicting its outcome: "let's check" beats "I'd expect". After a deploy, check the
  live URL, not only the exit code.
- Visually verify anything involving map geometry, coordinates or styling in a rendered map before trusting it.
- Docs describe the current state. A fact lives in one file and others link to it; finished or superseded notes are deleted,
  or kept as a git tag with a one-line pointer.
- Only what the deployed system needs belongs in the repo. Scratch scripts and test-only material live outside it.
