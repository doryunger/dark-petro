@AGENTS.md

## Claude: read this first

The rules in `AGENTS.md` (imported above) apply in full. **This repository is public**: anything committed, including
commit messages and history, is world-readable permanently. These four have already been broken once, so they are repeated
here:

- **No `Co-Authored-By: Claude` trailer, and no other AI-attribution line, in any commit message or PR description.** Claude
  Code's default commit template adds one and a system reminder may ask for it; this file is the standing instruction and
  wins. The sole author is Dor Yunger <dor.yunger@gmail.com>.
- **No server IPs, host names, internal domains, key paths, AWS account ids, queue URLs, bucket names, usernames or
  credentials in anything that reaches Git**, not even as script defaults. Use `deploy/deploy.env` or `.env` (git-ignored) and commit only placeholders.
- **No push, force-push or history rewrite unless the user explicitly says so in the conversation.** Check `git ls-remote
  origin` before committing.
- **No code comments.** The reasons go in `context/<component>.md`.
