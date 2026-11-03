# STE-inspired PR comment language (lightweight)

**Source idea:** [ASD-STE100 Simplified Technical English](https://www.asd-ste100.org/) (user shorthand “ASD-ST001” → this is **STE100**, not a separate ST001 doc).

We do **not** load the full STE dictionary during review (too heavy). We apply a **small rule set** so comments stay clear for everyone, including non-native readers.

## Always apply to inline comments

1. **Short sentences** — aim ≤ ~20 words per sentence.
2. **One idea per sentence** — what is wrong; then why; then ask/fix.
3. **Active voice** — “This loop calls the DB once per student” not “The DB is called…”.
4. **Simple words** — prefer *use / start / stop / show / make sure / can / must* over *utilize / commence / facilitate / leverage*.
5. **Concrete names** — file, function, condition; avoid vague “this might be suboptimal”.
6. **No filler** — no “Great job”, “AI suggestion”, “best practices”, “consider improving”.
7. **Technical nouns/verbs allowed** — code identifiers, SQL, API names stay as-is.

## Shape

```text
[What happens in the code]. [Why it matters / failure mode]. [Question or clear fix ask]?
```

Example:

> On prefetch failure, `prefetch_task` stays set. The next chunk awaits the same failed task and can fail the whole run. Can we set `prefetch_task = None` in the `except` before `continue`?

## Do not do during review

- Full STE dictionary compliance checks
- Rewriting the whole report into formal STE manuals style

## Optional after publish (summary only)

If the user wants, add a short **clarity note** in the chat/PR summary: 2–4 lines restating the top findings in even simpler STE-style English. Do not re-run specialists just for wording.
