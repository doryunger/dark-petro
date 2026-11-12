# Working conventions for this repo

These rules apply to every coding agent working here. For what the project is, see `README.md`; this file is about *how to
work on it*. The repo is self-contained: the only things outside it are the findings Parquets and the hot-spot list that
`maritime-sts-monitor` publishes to S3, and the proxy on the server. No code or files are shared with that repo; anything
needed from it is copied in and owned here, except the hot-spot areas, which are read from the monitor's published list so
that there is one source of truth.

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

**Never focus on a single hot spot.** The viewer shows every hot spot in the monitor's published list (at the time of writing
five: `fujairah_outer`, `off_sohar`, `malaysia_eopl`, `johor_east_scs`, `sikka_vadinar`). Tests, checks and progress reports
cover all of them; where one has no data, say so explicitly.

**Public by design.** The repo and the viewer are both open to everyone, and the viewer is read-only, so nothing in the published files (tiles, JSON, Parquet,
captures) may expose internal storage, credentials or provenance. The published Parquet holds only the columns the viewer reads (`TABLE_TYPES` in `pipeline/sts_tiles/build.py`); adding a column
means adding it there, deliberately, and bumping `SCHEMA_VERSION`. The monitor app is behind a login
because it can change data; never route the viewer to it or share its credentials with the viewer.

**Shared server.** The server also runs the monitor app, job manager, Redis, GizmoSQL and the proxy, with about 2 GB of
RAM. Give new services a memory cap, validate proxy config before reloading it, keep a backup of any file on the server you
change outside this repo, and tell the user when something shared will restart.

## Server access

The control host (the server that runs the viewer, the listener and the data) is described by the git-ignored
`deploy/control_host.json`: `host`, `user` and `identity_file`. Read that file for every SSH or rsync call (`ssh -i
<identity_file> <user>@<host>`) and never copy its values into a tracked file, a commit message or a reply. The app's data
lives on it under `~/sts-viewer/data` (`current/` is a symlink to the newest build, `mirror/captures/` holds the captures).
Reading and copying are fine; anything that restarts or changes something shared needs the user's say-so first.

## Deploying

Deploy only when the user asks, from a clean, committed `main`, and say that the viewer will restart. The way we deploy is to
build the image on the dev machine and forward it to the server: `./deploy/deploy.sh` (see "Deploying" in `README.md`) builds
the image locally (the frontend check runs inside the build), runs the Python tests in it, ships it with `docker save`, and
restarts the viewer, watcher and listener. It needs the git-ignored `deploy/deploy.env` and Docker on the dev machine.

- Never build the image on the server: it has about 2 GB of RAM shared with the monitor app, the job manager, Postgres and the
  proxy.
- If Docker is missing locally, stop and ask the user to install it (it needs `sudo`, which agents do not have); do not
  substitute another route without the user's agreement.
- Before running the script, tag the running image on the server as a rollback (`sts-tiles:before-<change>-<date>`); to roll
  back, tag it back as `sts-tiles` and `docker compose up -d --no-build --no-deps viewer` in `~/sts-viewer`.
- Check the live site, not the exit code: the public viewer address is `VIEWER_DOMAIN` in the proxy container's environment;
  fetch its page (title, bundle name), `/metadata` and a tile.

## If sensitive material reaches a commit

Remove it from the tree, check whether it is still reachable in history (local and remote), and tell the user plainly. Do
not call it hidden while it is reachable. Rewriting pushed history needs the confirmation above.

## Working style

- Reply style: short and informative. Answer first, a few lines at most, no padding, no recap of what the user already knows. One small table or short list only when it carries real data.
  Put long material in a repo file and link it.
- Prefer actually running the thing over predicting its outcome: "let's check" beats "I'd expect". After a deploy, check the
  live URL, not only the exit code.
- Visually verify anything involving map geometry, coordinates or styling in a rendered map before trusting it.
- Docs describe the current state. A fact lives in one file and others link to it; finished or superseded notes are deleted,
  or kept as a git tag with a one-line pointer.
- Only what the deployed system needs belongs in the repo. Scratch scripts and test-only material live outside it.
