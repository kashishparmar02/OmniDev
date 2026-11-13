# Setup

This guide takes you from a fresh clone to reviewing a pull request from your
editor. It takes about five minutes.

## 1. Build

```bash
git clone https://github.com/kashishparmar02/OmniDev.git
cd OmniDev
npm install
npm run build
```

Node 20 or newer is required. The server is the file
`packages/server/dist/main.js`.

## 2. Create credentials

You only need credentials for the hosts you use.

**Bitbucket Cloud.** Create an API token at
<https://id.atlassian.com/manage-profile/security/api-tokens> with read and
write access to pull requests. You also need the email address of your
Atlassian account.

**GitHub.** Create a fine-grained personal access token at
<https://github.com/settings/personal-access-tokens> for the repositories you
work on, with read and write access to pull requests and read access to
contents.

Treat both like passwords. They go into your editor's own configuration in the
next step, never into a file inside this repository.

## 3. Register the server

The settings are passed as environment variables:

| Variable               | Purpose                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `BITBUCKET_EMAIL`      | Atlassian account email                                                  |
| `BITBUCKET_API_TOKEN`  | Bitbucket API token                                                      |
| `GITHUB_TOKEN`         | GitHub personal access token                                             |
| `OMNIDEV_REPO_ROOTS`   | Folders that hold your clones, separated by `:`. Searched one level deep |
| `OMNIDEV_WORKTREE_DIR` | Where review checkouts are created. Default: `~/.omnidev/worktrees`      |

`OMNIDEV_REPO_ROOTS` is what lets a review read the code around a change. With
`~/code` as a root, a clone at `~/code/sample-app` is found automatically.

### Cursor

Add this to `~/.cursor/mcp.json`, with your own paths and values:

```json
{
  "mcpServers": {
    "omnidev": {
      "command": "node",
      "args": ["/absolute/path/to/OmniDev/packages/server/dist/main.js"],
      "env": {
        "BITBUCKET_EMAIL": "<your-atlassian-email>",
        "BITBUCKET_API_TOKEN": "<your-bitbucket-api-token>",
        "GITHUB_TOKEN": "<your-github-token>",
        "OMNIDEV_REPO_ROOTS": "~/code"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add omnidev \
  --env BITBUCKET_EMAIL="<your-atlassian-email>" \
  --env BITBUCKET_API_TOKEN="<your-bitbucket-api-token>" \
  --env GITHUB_TOKEN="<your-github-token>" \
  --env OMNIDEV_REPO_ROOTS="~/code" \
  -- node /absolute/path/to/OmniDev/packages/server/dist/main.js
```

## 4. Install the playbooks

The folders under `skills/` are playbooks that tell an agent how to use the
tools. Link the ones you want into your agent's skills folder:

```bash
# Cursor
ln -s "$PWD/skills/review-pr" ~/.cursor/skills/review-pr

# Claude Code
ln -s "$PWD/skills/review-pr" ~/.claude/skills/review-pr
```

Repeat for `respond-to-review` and `write-pr-description`.

## 5. Try it

Restart your editor, then paste a pull request URL and ask for a review:

> Review https://github.com/acme/sample-app/pull/7

The agent reads the pull request, shows you its findings, and posts only the
ones you approve.

## Tools

| Tool                   | What it does                                                     | Changes the pull request |
| ---------------------- | ---------------------------------------------------------------- | ------------------------ |
| `pr_get`               | Title, description, state, branches and head commit              | No                       |
| `pr_get_diff`          | The changes as a unified diff                                    | No                       |
| `pr_list_threads`      | Comment threads, optionally only unresolved ones                 | No                       |
| `pr_prepare_workspace` | Checks the head commit out into a separate folder for reading    | No                       |
| `pr_publish_findings`  | Posts findings inline, skipping duplicates and lines not in diff | Yes                      |
| `pr_comment`           | Posts a general comment                                          | Yes                      |
| `pr_reply`             | Replies to a thread and optionally resolves it                   | Yes                      |
| `pr_set_resolved`      | Resolves or reopens a thread                                     | Yes                      |
| `pr_update`            | Changes the title or description                                 | Yes                      |
| `pr_create`            | Opens a pull request from a pushed branch                        | Yes                      |

Every tool in the last group refuses to run unless it is called with
`confirmed: true`, which the playbooks set only after you approve.

## Host differences

- **GitHub general comments** cannot be replied to or resolved. Those calls
  return `unsupported`, and the playbooks post a new comment instead.
- **GitHub threads** need a token even on public repositories, because GitHub
  only exposes them through its GraphQL API.
- **Review workspaces** need an existing local clone. OmniDev does not clone
  repositories for you.

## Troubleshooting

| Message starts with | Meaning                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `unauthorized`      | The token is missing, expired or lacks access to this repository        |
| `not_found`         | The pull request does not exist, or the token cannot see the repository |
| `rate_limited`      | The host is refusing calls for now; wait and try again                  |
| `unavailable`       | The host could not be reached or returned something unexpected          |
| `No local clone`    | Clone the repository into a folder listed in `OMNIDEV_REPO_ROOTS`       |
