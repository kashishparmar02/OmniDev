# Architecture overview

```text
┌─────────────────────────────────────────────────────────────┐
│  Cursor / CLI / (later) Web UI                              │
│  Skills: omnidev-review, omnidev-respond, …                 │
└───────────────────────────┬─────────────────────────────────┘
                            │ MCP tools
┌───────────────────────────▼─────────────────────────────────┐
│  packages/core                                              │
│  Provider interface · Thread state · Finding schema         │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
     ┌──────────▼──────────┐       ┌──────────▼──────────┐
     │ mcp-bitbucket       │       │ mcp-github (later)  │
     │ PR/diff/comments/…  │       │ same tool shapes    │
     └──────────┬──────────┘       └──────────┬──────────┘
                │                             │
                └──────────► Host APIs ◄──────┘
```

## Thread state (author mode target)

| State | Meaning | Typical action |
|---|---|---|
| `needs_fix` | Valid finding; code should change or already did | Reply + resolve when fixed |
| `needs_discussion` | Judgment / product intent unclear | Reply; leave open |
| `resolved_with_reply` | Addressed with evidence | Reply + resolve |
| `disagree_with_evidence` | Claim doesn’t hold on tip | Reply with evidence; leave open or resolve per team norm |
| `defer` | Consciously postponed | Reply; usually leave open |

## Token diet

- One orchestrating agent by default
- No specialist sub-agent approval prompts unless user asks
- Targeted file reads; cap publishable findings
- STE-inspired short comments

## Safety

- Write tools require explicit confirmation flags
- Never commit secrets
- Never destructive git checkout over dirty trees
