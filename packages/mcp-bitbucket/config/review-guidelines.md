# Review guidelines (quick reference)

- Optimize for correctness and trustworthiness, not comment count.
- Validate every finding against code before proposing publish.
- Inline comments must map to Bitbucket diff anchors (`to` for new lines, `from` for old).
- Bitbucket PR **Read** scope can comment; **Write** scope can approve/merge — do not request Write.
- Default git strategy: fetch + detached worktree; never checkout over dirty user work.
- Credentials live only in environment / `.env` (gitignored).
