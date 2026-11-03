# ASD-STE100 for author PR workflow (lightweight)

Official name: [ASD-STE100 Simplified Technical English](https://www.asd-ste100.org/). Shorthand “ASD-ST001” in chat means **STE100**, not a separate standard.

OmniDev applies a **small rule set** — not full dictionary compliance — for every user-facing message and every text you publish (replies, PR title, PR description, thread summaries, confirmation prompts).

Aligned with reviewer rules in `skills/omnidev-review/references/ste-comment-language.md`.

## Always apply

1. **Short sentences** — aim for about 25 words or fewer (about 20 for inline replies).
2. **One idea per sentence**.
3. **Active voice** — “This change adds retry” not “Retry was added”.
4. **Simple words** — prefer *use / fix / add / remove / defer / must / can* over *utilize / leverage / facilitate / commence*.
5. **Concrete names** — branch, file, function, flag, ticket id.
6. **No filler** — no praise, emoji, sign-offs, or vague “best practices”.
7. **Technical terms stay** — code identifiers, SQL, API names unchanged.

## Inline thread replies

Shape:

```text
[What you did or decided]. [Evidence or scope]. [Optional next step].
```

Example:

> Fixed. `build()` runs single-item prefetch when the bundle is missing.

### Banned patterns (non-exhaustive)

Do not open replies or chat with: `thanks`, `thank you`, `good catch`, `great point`, `fair point`, `nice find`, `happy to`, `glad to`, `will do`, `makes sense`, `sounds good`, `awesome`, `perfect`, `no worries`, `good idea`, `well spotted`, `appreciate the review`, `let me know if`, `feel free to`, emoji, sign-offs (`Regards`, `HTH`).

Do not hedge without a fact: `maybe`, `probably`, `I think`, `should be fine`.

## PR title and description

- **Title:** one line; ticket first when the branch has one (`AC-14941: …`); state outcome for the reviewer.
- **Summary / What changed / Why:** what changed and why; no file-name-only lists.
- **Notes for reviewers:** plain facts for scope, risk, rollout.
- **Test plan:** imperative steps a human can run (“Run `npm test` in `packages/foo`”, “Call GET `/health` on QA”).
- Same STE rules apply inside every markdown section of the published PR body.

## Listing comments (chat only)

When summarizing **`{prefix}pr_list_comments`** output: lead with PR link and `head -> base`; one short line per open `#N` (author, file:line, gist). Quote reviewer comment bodies verbatim when needed; your framing uses STE. Do not paste raw JSON.

## Confirmation before publish

When asking the user to approve a reply or PR body, use STE. State what will post and where. Do not use softeners (“I'll go ahead and…”).

## Do not

- Load the full STE dictionary into context.
- Rewrite entire diffs into manual-style STE.
- Call external “language” MCP for wording.
