#!/usr/bin/env python3
"""Decide whether a pull-request comment can be replied to, and check the post.

Bitbucket list/detail: resolution null means open. Any object, including {},
means that comment is resolved. A reply often has resolution null while its
parent is resolved, so the whole parent chain counts.
"""

import argparse
import json
import sys
from pathlib import Path


def fail(message):
    sys.stdout.flush()
    print(message, file=sys.stderr)
    raise SystemExit(1)


def load_json(path):
    return json.loads(Path(path).read_text())


def snippet(text, limit=180):
    flat = " ".join((text or "").split())
    if len(flat) > limit:
        return flat[: limit - 1] + "…"
    return flat


def bitbucket_resolved(comment):
    return comment.get("resolution") is not None


def bitbucket_location(comment):
    inline = comment.get("inline") or {}
    path = inline.get("path") or ""
    line = inline.get("to")
    if line is None:
        line = inline.get("from")
    if path and line is not None:
        return "%s:%s" % (path, line)
    return path or "general"


def bitbucket_author(comment):
    user = comment.get("user") or {}
    return user.get("display_name") or user.get("nickname") or "?"


RESOLVED_REASON = "comment is on a resolved thread (pass --allow-resolved to reply anyway)"


def chain_block_reason(chain, pr_id):
    """chain[0] is the comment being replied to, followed by its parents."""
    if not chain:
        return "comment was not found"
    target = chain[0]
    if target.get("deleted"):
        return "comment is deleted"
    if target.get("pending"):
        return "comment is a pending draft"
    parent_pr = (target.get("pullrequest") or {}).get("id")
    if parent_pr is not None and pr_id and str(parent_pr) != str(pr_id):
        return "comment belongs to PR %s, not %s" % (parent_pr, pr_id)
    if any(bitbucket_resolved(comment) for comment in chain):
        return RESOLVED_REASON
    return None


def print_target(author, location, resolved, snippet_text, comment_id, serial=None):
    if serial is not None:
        print("serial: #%s" % serial)
    print("target: %s" % comment_id)
    print("author: %s" % author)
    print("location: %s" % location)
    print("resolved: %s" % ("yes" if resolved else "no"))
    print("snippet: %s" % (snippet_text or "(empty)"))


def read_body(path):
    text = Path(path).read_text()
    if not text.strip():
        fail("Reply body is empty")
    return text


def same_text(got, expected):
    return (got or "").replace("\r\n", "\n").rstrip("\n") == expected.replace("\r\n", "\n").rstrip("\n")


def github_thread_state(pages, comment_id):
    """Return open, resolved, missing, or truncated."""
    wanted = str(comment_id)
    found = None
    truncated = False
    last_threads = None
    for page in pages:
        if not isinstance(page, dict):
            fail("GitHub review threads: expected a JSON object per page")
        if page.get("errors"):
            err = page["errors"][0]
            message = err.get("message") if isinstance(err, dict) else err
            fail("GitHub GraphQL: %s" % message)
        if page.get("message") and "data" not in page:
            fail("GitHub GraphQL: %s" % page["message"])
        threads = (((page.get("data") or {}).get("repository") or {}).get("pullRequest") or {}).get("reviewThreads") or {}
        last_threads = threads
        for node in threads.get("nodes") or []:
            bucket = node.get("comments") or {}
            ids = []
            for comment in bucket.get("nodes") or []:
                if comment.get("databaseId") is not None:
                    ids.append(str(comment["databaseId"]))
            if wanted in ids:
                found = bool(node.get("isResolved"))
            elif (bucket.get("pageInfo") or {}).get("hasNextPage"):
                truncated = True
    if found is not None:
        return "resolved" if found else "open"
    if truncated or (last_threads is not None and (last_threads.get("pageInfo") or {}).get("hasNextPage")):
        return "truncated"
    return "missing"


def cmd_target_bitbucket(args):
    chain = [load_json(path) for path in args.chain]
    target = chain[0]
    resolved = any(bitbucket_resolved(comment) for comment in chain)
    print_target(
        bitbucket_author(target),
        bitbucket_location(target),
        resolved,
        snippet((target.get("content") or {}).get("raw") or ""),
        target.get("id"),
    )
    reason = chain_block_reason(chain, args.pr)
    if reason == RESOLVED_REASON and args.allow_resolved:
        reason = None
    if reason:
        fail(reason)


def cmd_target_github(args):
    comment = load_json(args.comment)
    state = github_thread_state(load_json(args.threads) if args.threads else [], args.comment_id)
    if state == "truncated":
        fail("Could not confirm whether this thread is resolved")
    if state == "missing":
        fail("Comment %s is not a review comment on PR %s" % (args.comment_id, args.pr))
    url = comment.get("pull_request_url") or ""
    suffix = "/pulls/%s" % args.pr
    if url and not url.rstrip("/").endswith(suffix):
        fail("Comment belongs to a different pull request")
    line = comment.get("line")
    if line is None:
        line = comment.get("original_line")
    path = comment.get("path") or ""
    location = "%s:%s" % (path, line) if path and line is not None else (path or "general")
    user = comment.get("user") or {}
    resolved = state == "resolved"
    print_target(user.get("login") or "?", location, resolved, snippet(comment.get("body") or ""), args.comment_id)
    if resolved and not args.allow_resolved:
        fail(RESOLVED_REASON)


def cmd_payload(args):
    raw = read_body(args.body_file)
    if args.host == "bitbucket":
        body = {"content": {"raw": raw}, "parent": {"id": int(args.comment)}}
    else:
        body = {"body": raw}
    Path(args.out).write_text(json.dumps(body))


def bitbucket_thread_root(chain_paths):
    chain = [load_json(path) for path in chain_paths]
    if not chain:
        fail("comment chain is empty")
    return chain[-1]


def cmd_root_bitbucket(args):
    root = bitbucket_thread_root(args.chain)
    root_id = root.get("id")
    if root_id is None:
        fail("thread root has no id")
    print("thread_root: %s" % root_id)
    if bitbucket_resolved(root):
        print("already_resolved: yes")
    else:
        print("already_resolved: no")


def github_thread_for_comment(pages, comment_id):
    """Return (thread_id, is_resolved) or (None, None) if missing/truncated."""
    wanted = str(comment_id)
    truncated = False
    for page in pages:
        if not isinstance(page, dict):
            fail("GitHub review threads: expected a JSON object per page")
        if page.get("errors"):
            err = page["errors"][0]
            message = err.get("message") if isinstance(err, dict) else err
            fail("GitHub GraphQL: %s" % message)
        threads = (
            (((page.get("data") or {}).get("repository") or {}).get("pullRequest") or {}).get(
                "reviewThreads"
            )
            or {}
        )
        for node in threads.get("nodes") or []:
            bucket = node.get("comments") or {}
            ids = []
            for comment in bucket.get("nodes") or []:
                if comment.get("databaseId") is not None:
                    ids.append(str(comment["databaseId"]))
            if wanted in ids:
                return node.get("id"), bool(node.get("isResolved"))
            if (bucket.get("pageInfo") or {}).get("hasNextPage"):
                truncated = True
        if (threads.get("pageInfo") or {}).get("hasNextPage"):
            truncated = True
    if truncated:
        fail("Could not find review thread for comment (GraphQL pagination)")
    return None, None


def cmd_thread_github(args):
    pages = load_json(args.threads) if args.threads else []
    thread_id, resolved = github_thread_for_comment(pages, args.comment_id)
    if thread_id is None:
        fail("Comment %s is not a review comment on this pull request" % args.comment_id)
    print("thread_id: %s" % thread_id)
    print("already_resolved: %s" % ("yes" if resolved else "no"))


def cmd_verify_resolve_bitbucket(args):
    posted = load_json(args.response)
    if not isinstance(posted, dict):
        fail("Resolve response was not an object")
    if posted.get("type") is None and posted.get("user") is None:
        fail("Unexpected Bitbucket resolve response")
    print("RESOLVED")


def cmd_verify_resolve_github(args):
    posted = load_json(args.response)
    thread = (((posted.get("data") or {}).get("resolveReviewThread") or {}).get("thread")) or {}
    if not thread.get("isResolved"):
        fail("GitHub did not mark the thread resolved")
    print("RESOLVED")
    print("thread_id: %s" % (thread.get("id") or ""))


def cmd_verify(args):
    raw = read_body(args.body_file)
    posted = load_json(args.response)
    if args.host == "bitbucket":
        got = ((posted.get("content") or {}).get("raw")) or ""
        new_id = posted.get("id")
        url = ((posted.get("links") or {}).get("html") or {}).get("href") or ""
        parent = (posted.get("parent") or {}).get("id")
    else:
        got = posted.get("body") or ""
        new_id = posted.get("id")
        url = posted.get("html_url") or ""
        parent = posted.get("in_reply_to_id")
    if not same_text(got, raw):
        fail("Posted reply text does not match the body file")
    if parent is not None and str(parent) != str(args.comment):
        fail("Posted reply parent was %s, expected %s" % (parent, args.comment))
    meta = load_json(args.meta) if args.meta else {}
    pr_url = meta.get("url") or ((meta.get("links") or {}).get("html") or {}).get("href") or ""
    print("REPLIED")
    print("pr: %s" % (meta.get("id") or meta.get("number") or ""))
    if pr_url:
        print("pr_url: %s" % pr_url)
    print("parent: %s" % args.comment)
    print("comment: %s" % new_id)
    if url:
        print("comment_url: %s" % url)


def self_check():
    open_comment = {
        "id": 3, "resolution": None, "deleted": False, "pending": False,
        "user": {"display_name": "Cara"}, "content": {"raw": "open note"},
        "inline": {"path": "b.py", "to": 9}, "pullrequest": {"id": 51},
    }
    assert chain_block_reason([open_comment], "51") is None
    resolved_root = {
        "id": 1, "resolution": {}, "deleted": False, "pending": False,
        "user": {"display_name": "Ann"}, "content": {"raw": "done"},
        "inline": {"path": "a.py", "to": 1}, "pullrequest": {"id": 51},
    }
    reply = {
        "id": 2, "resolution": None, "deleted": False, "pending": False,
        "parent": {"id": 1}, "user": {"display_name": "Bea"},
        "content": {"raw": "reply"}, "inline": {"path": "a.py", "to": 1},
        "pullrequest": {"id": 51},
    }
    assert "resolved" in chain_block_reason([resolved_root], "51")
    assert "resolved" in chain_block_reason([reply, resolved_root], "51")
    deleted = dict(open_comment, deleted=True)
    assert chain_block_reason([deleted], "51").startswith("comment is deleted")
    pending = dict(open_comment, pending=True)
    assert "pending" in chain_block_reason([pending], "51")
    other = dict(open_comment, pullrequest={"id": 9})
    assert "belongs to PR 9" in chain_block_reason([other], "51")

    pages = [{"data": {"repository": {"pullRequest": {"reviewThreads": {
        "pageInfo": {"hasNextPage": False},
        "nodes": [
            {"isResolved": True, "comments": {"pageInfo": {"hasNextPage": False}, "nodes": [{"databaseId": 10}]}},
            {"isResolved": False, "comments": {"pageInfo": {"hasNextPage": True}, "nodes": [{"databaseId": 12}]}},
        ],
    }}}}}]
    assert github_thread_state(pages, 10) == "resolved"
    assert github_thread_state(pages, 12) == "open"
    assert github_thread_state(pages, 99) == "truncated"
    closed = [{"data": {"repository": {"pullRequest": {"reviewThreads": {
        "pageInfo": {"hasNextPage": False},
        "nodes": [{"isResolved": False, "comments": {"pageInfo": {"hasNextPage": False}, "nodes": [{"databaseId": 12}]}}],
    }}}}}]
    assert github_thread_state(closed, 99) == "missing"

    assert same_text("hello\n", "hello")
    assert not same_text("hello", "hello!")
    print("ok")


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--self-check":
        self_check()
        return
    parser = argparse.ArgumentParser(description="Prepare or verify a PR comment reply")
    sub = parser.add_subparsers(dest="cmd", required=True)

    target = sub.add_parser("target-bitbucket")
    target.add_argument("--pr", required=True)
    target.add_argument("--chain", required=True, nargs="+")
    target.add_argument("--allow-resolved", action="store_true")
    target.set_defaults(func=cmd_target_bitbucket)

    gh = sub.add_parser("target-github")
    gh.add_argument("--pr", required=True)
    gh.add_argument("--comment-id", required=True)
    gh.add_argument("--comment", required=True)
    gh.add_argument("--threads", required=True)
    gh.add_argument("--allow-resolved", action="store_true")
    gh.set_defaults(func=cmd_target_github)

    payload = sub.add_parser("payload")
    payload.add_argument("--host", required=True, choices=("bitbucket", "github"))
    payload.add_argument("--comment", required=True)
    payload.add_argument("--body-file", required=True)
    payload.add_argument("--out", required=True)
    payload.set_defaults(func=cmd_payload)

    verify = sub.add_parser("verify")
    verify.add_argument("--host", required=True, choices=("bitbucket", "github"))
    verify.add_argument("--comment", required=True)
    verify.add_argument("--body-file", required=True)
    verify.add_argument("--response", required=True)
    verify.add_argument("--meta", required=True)
    verify.set_defaults(func=cmd_verify)

    root_bb = sub.add_parser("root-bitbucket")
    root_bb.add_argument("--chain", required=True, nargs="+")
    root_bb.set_defaults(func=cmd_root_bitbucket)

    thread_gh = sub.add_parser("thread-github")
    thread_gh.add_argument("--comment-id", required=True)
    thread_gh.add_argument("--threads", required=True)
    thread_gh.set_defaults(func=cmd_thread_github)

    vrb = sub.add_parser("verify-resolve-bitbucket")
    vrb.add_argument("--response", required=True)
    vrb.set_defaults(func=cmd_verify_resolve_bitbucket)

    vrg = sub.add_parser("verify-resolve-github")
    vrg.add_argument("--response", required=True)
    vrg.set_defaults(func=cmd_verify_resolve_github)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
