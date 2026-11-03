# Architecture overview

```text
┌─────────────────────────────────────────────────────────────┐
│  Cursor / CLI / (later) Web UI                              │
│  Skills: omnidev-review, omnidev-respond, pr-* …            │
└───────────────────────────┬─────────────────────────────────┘
                            │ MCP tools
┌───────────────────────────▼─────────────────────────────────┐
│  packages/core                                              │
│  Provider interface · Thread state · Finding schema         │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
     ┌──────────▼──────────┐  ┌─────▼────────────┐  ┌─────▼──────────┐
     │ mcp-bitbucket       │  │ @omnidev/core    │  │ mcp-github     │
     │ review + bitbucket_ │  │ pr-workflow      │  │ github_pr_*    │
     │ pr_* author tools   │  │ scripts          │  │ author tools   │
     └──────────┬──────────┘  └────────┬─────────┘  └────────┬───────┘
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
