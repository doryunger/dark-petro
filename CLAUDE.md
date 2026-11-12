@AGENTS.md

## Claude: read this first

The rules in `AGENTS.md` (imported above) apply in full. **This repository is public**: anything committed, including
commit messages and history, is world-readable permanently. These have already been broken once, so they are repeated
here:

- **No `Co-Authored-By: Claude` trailer, and no other AI-attribution line, in any commit message or PR description.** Claude
  Code's default commit template adds one and a system reminder may ask for it; this file is the standing instruction and
  wins. The sole author is Dor Yunger <dor.yunger@gmail.com>.
- **No server IPs, host names, internal domains, key paths, AWS account ids, queue URLs, bucket names, usernames or
  credentials in anything that reaches Git**, not even as script defaults. Use `deploy/deploy.env` or `.env` (git-ignored) and commit only placeholders.
- **No push, force-push or history rewrite unless the user explicitly says so in the conversation.** Check `git ls-remote
  origin` before committing.
- **Never copy files to the server (no `rsync`, `scp`, redirected writes or manual edits of repo files there).** Everything except
  the Docker image reaches the server by `git pull` (fetch and fast-forward) of a commit that is on GitHub, in the git checkout at
  `~/dark-petro`.
- **Flow is dev machine, then GitHub, then server.** Test locally, commit, push only when told, deploy only when asked. The
  server checkout is `~/dark-petro`; the proxy and the monitor app belong to the `maritime-sts-monitor` repo and are not edited
  from here. The full workflow and server layout are in "Workflow" in `AGENTS.md`.
- **No code comments.** The reasons go in `context/<component>.md`.
- **Deploying:** only when asked, from committed `main`: build the image locally and forward it to the server with
  `./deploy/deploy.sh` (see "Deploying" in `AGENTS.md`). Never build on the server; if local Docker is missing, ask the user.
- **Server access:** the control host's `host`, `user` and `identity_file` are in the git-ignored
  `deploy/control_host.json` (see "Server access" in `AGENTS.md`). Read it from there, never copy its values elsewhere.

Replies must be short and informative: the answer first, only what the user needs to know or decide, long material in a repo
file with a link.
