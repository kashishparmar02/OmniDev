# Speed, tokens, Factory wiring, STE language

## Factory / EC MCP — wired or not?

**Not wired into our MCP.** Still separate.

| Mode | Behavior |
|---|---|
| Current (updated) | **Ours only** during review. Bundled EI checklists in skill `references/`. |
| Earlier soft text | “If Factory connected, fetch skills” — **removed** from default path. |

Factory can stay installed in Cursor for other work. PR review must not depend on it.

## ASD-ST001 vs ASD-STE100

Internet / official naming: the standard is **ASD-STE100 Simplified Technical English** (controlled language for clear technical writing). There is no widely published “ASD-ST001” PR-comment standard; STE100 is what people mean by “say technical things simply.”

We use a **lightweight STE-inspired** comment style (short sentences, active voice, simple words, concrete code refs). We do **not** load the full STE dictionary into every review (that would burn a lot of tokens).

## Why reviews felt slow

| Cost driver | Effect |
|---|---|
| Specialist sub-agents | Each can re-copy large context; often needs extra user confirms in Cursor |
| Factory `skills_get` / `brain_get_for_task` mid-review | Extra round-trips + large markdown into context |
| Activity + full comments + huge diffs always | Inflates window |
| Multiple approval steps | Human latency |

## Token / context analysis (order-of-magnitude)

Assuming a ~100–200k context window model:

| Item | Typical size | When |
|---|---|---|
| Skill + STE rules + short EI checklist recall | ~2–6k tokens | Always (cheap) |
| PR metadata + file list | ~1–3k | Always |
| Unified diff (medium PR) | ~5–30k | Always |
| Targeted local file reads | ~2–15k | As needed |
| Full Factory reviewer skill + checklist | ~8–20k **each** | Avoid mid-review |
| Brain dump `max_docs=4–5` | ~15–40k | Avoid mid-review |
| One specialist sub-agent with full history | often **2×** main context | Avoid by default |
| Post-publish 2–4 line STE summary | &lt;0.5k | OK after publish |

**Conclusion:** Keep review on Bitbucket MCP + local code + short bundled rules. Add STE “plain summary” **after** publish if wanted — negligible cost. Do not pull Factory during the review loop.

## Default UX now

1. Review runs in **one** agent  
2. **One** question: publish which findings?  
3. Optional tiny plain-language summary after comments land  

## Explicit deep mode (only if user asks)

“Run specialist sql/security pass” or “load Factory standards live” — then extra cost is intentional.
