#!/usr/bin/env python3
"""Normalize Bitbucket or GitHub pull request comments and print the open ones.

Bitbucket's comment list returns "resolution": {} for a resolved thread and
null for an open one. An empty object is resolved. A reply often keeps
resolution null; it is resolved when any parent in the chain is resolved.
"""

import argparse
import json
import sys
from pathlib import Path


def load_json(path):
    text = Path(path).read_text().strip()
    if not text:
        return None
    return json.loads(text)


def fail(message):
    print(message, file=sys.stderr)
    raise SystemExit(1)


def flatten_pages(data, label):
    """Accept one JSON array or a gh --slurp array of page arrays."""
    if data is None:
        return []
    if isinstance(data, dict):
        message = data.get("message") or data.get("error") or "unexpected object"
        fail(f"{label}: {message}")
    if not isinstance(data, list):
        fail(f"{label}: expected a JSON array")
    if data and isinstance(data[0], list):
        rows = []
        for page in data:
            if isinstance(page, dict):
                message = page.get("message") or "unexpected object"
                fail(f"{label}: {message}")
            rows.extend(page)
        return rows
    return data


def author_name(user, *keys):
    user = user or {}
    for key in keys:
        value = user.get(key)
        if value:
            return value
    return "?"


def bitbucket_resolved_ids(comments):
    resolved = set()
    for comment in comments:
        if comment.get("resolution") is not None:
            resolved.add(str(comment.get("id")))
    changed = True
    while changed:
        changed = False
        for comment in comments:
            cid = str(comment.get("id"))
            parent = (comment.get("parent") or {}).get("id")
            if parent is not None and str(parent) in resolved and cid not in resolved:
                resolved.add(cid)
                changed = True
    return resolved


def comment_record(cid, author, body, created, url, path, line, reply_to, resolved):
    return {
        "id": str(cid),
        "author": author or "?",
        "body": body or "",
        "created": created or "",
        "url": url or "",
        "path": path or "",
        "line": line,
        "reply_to": "" if reply_to is None else str(reply_to),
        "resolved": bool(resolved),
        "deleted": False,
        "pending": False,
    }


def normalize_bitbucket(meta, pages):
    comments = []
    for page in pages:
        comments.extend(page.get("values") or [])
    resolved_ids = bitbucket_resolved_ids(comments)
    items = []
    for comment in comments:
        inline = comment.get("inline") or {}
        line = inline.get("to")
        if line is None:
            line = inline.get("from")
        parent = (comment.get("parent") or {}).get("id")
        cid = str(comment.get("id"))
        item = comment_record(
            cid,
            author_name(comment.get("user"), "display_name", "nickname"),
            (comment.get("content") or {}).get("raw") or "",
            comment.get("created_on"),
            (comment.get("links") or {}).get("html", {}).get("href"),
            inline.get("path") or "",
            line,
            parent,
            cid in resolved_ids,
        )
        item["deleted"] = bool(comment.get("deleted"))
        item["pending"] = bool(comment.get("pending"))
        items.append(item)
    source = (meta.get("source") or {}).get("branch") or {}
    dest = (meta.get("destination") or {}).get("branch") or {}
    return {
        "id": meta.get("id"),
        "title": meta.get("title") or "",
        "url": (meta.get("links") or {}).get("html", {}).get("href") or "",
        "state": meta.get("state") or "",
        "head": source.get("name") or "",
        "base": dest.get("name") or "",
        "comments": items,
        "threads_truncated": False,
    }


def github_resolved_ids(thread_pages):
    """Return (ids, truncated). Only the last page's hasNextPage means the walk stopped early."""
    resolved = set()
    truncated = False
    last_threads = None
    for page in thread_pages:
        if not isinstance(page, dict):
            fail("GitHub review threads: expected a JSON object per page")
        if page.get("errors"):
            message = page["errors"][0].get("message") if isinstance(page["errors"][0], dict) else page["errors"][0]
            fail(f"GitHub GraphQL: {message}")
        if page.get("message"):
            fail(f"GitHub GraphQL: {page['message']}")
        threads = (((page.get("data") or {}).get("repository") or {}).get("pullRequest") or {}).get("reviewThreads") or {}
        last_threads = threads
        for node in threads.get("nodes") or []:
            bucket = node.get("comments") or {}
            if (bucket.get("pageInfo") or {}).get("hasNextPage"):
                truncated = True
            if not node.get("isResolved"):
                continue
            for comment in bucket.get("nodes") or []:
                if comment.get("databaseId") is not None:
                    resolved.add(str(comment["databaseId"]))
    if last_threads is not None and (last_threads.get("pageInfo") or {}).get("hasNextPage"):
        truncated = True
    return resolved, truncated


def normalize_github(meta, review_comments, issue_comments, reviews, thread_pages):
    resolved_ids, truncated = github_resolved_ids(thread_pages)
    items = []
    for comment in review_comments:
        line = comment.get("line")
        if line is None:
            line = comment.get("original_line")
        cid = comment.get("id")
        items.append(comment_record(
            cid,
            author_name(comment.get("user"), "login"),
            comment.get("body") or "",
            comment.get("created_at"),
            comment.get("html_url"),
            comment.get("path") or "",
            line,
            comment.get("in_reply_to_id"),
            str(cid) in resolved_ids,
        ))
    for comment in issue_comments:
        items.append(comment_record(
            comment.get("id"),
            author_name(comment.get("user"), "login"),
            comment.get("body") or "",
            comment.get("created_at"),
            comment.get("html_url"),
            "",
            None,
            None,
            False,
        ))
    for review in reviews:
        if (review.get("state") or "") == "PENDING":
            continue
        body = (review.get("body") or "").strip()
        if not body:
            continue
        items.append(comment_record(
            f"review-{review.get('id')}",
            author_name(review.get("user"), "login"),
            review.get("body") or "",
            review.get("submitted_at"),
            review.get("html_url"),
            "",
            None,
            None,
            False,
        ))
    return {
        "id": meta.get("number"),
        "title": meta.get("title") or "",
        "url": meta.get("url") or "",
        "state": meta.get("state") or "",
        "head": meta.get("headRefName") or "",
        "base": meta.get("baseRefName") or "",
        "comments": items,
        "threads_truncated": truncated,
    }


def visible(doc, include_resolved):
    open_items = []
    resolved_items = []
    skipped_resolved = 0
    skipped_deleted = 0
    skipped_pending = 0
    for item in doc["comments"]:
        if item["deleted"]:
            skipped_deleted += 1
            continue
        if item["pending"]:
            skipped_pending += 1
            continue
        if item["resolved"]:
            skipped_resolved += 1
            if include_resolved:
                resolved_items.append(item)
            continue
        open_items.append(item)
    open_items.sort(key=lambda item: (item["created"], item["id"]))
    resolved_items.sort(key=lambda item: (item["created"], item["id"]))
    return open_items, resolved_items, skipped_resolved, skipped_deleted, skipped_pending


def author_line(items):
    counts = {}
    order = []
    for item in items:
        name = item["author"]
        if name not in counts:
            order.append(name)
            counts[name] = 0
        counts[name] += 1
    return ", ".join(f"{name} ({counts[name]})" for name in order)


def location(item):
    if item["path"] and item["line"] is not None:
        return f"{item['path']}:{item['line']}"
    if item["path"]:
        return item["path"]
    return "general"


def assign_serials(open_items, resolved_items):
    for index, item in enumerate(open_items, start=1):
        item["serial"] = index
    for index, item in enumerate(resolved_items, start=1):
        item["serial"] = f"R{index}"


def open_comment_id_for_serial(open_items, serial):
    for item in open_items:
        if item.get("serial") == serial:
            return item["id"]
    return None


def print_comment(item):
    reply = f" | reply to {item['reply_to']}" if item["reply_to"] else ""
    serial = item.get("serial")
    prefix = f"#{serial} | " if serial is not None else ""
    print(f"{prefix}{item['author']} | {location(item)}{reply} | id {item['id']}")
    if item["url"]:
        print(item["url"])
    body = item["body"].strip()
    print(body if body else "(empty)")
    print("---")


def render(doc, include_resolved):
    open_items, resolved_items, skipped_resolved, skipped_deleted, skipped_pending = visible(
        doc, include_resolved
    )
    assign_serials(open_items, resolved_items)
    print(f"PR {doc['id']} | {doc['state']}")
    print(f"title: {doc['title']}")
    if doc["url"]:
        print(f"url: {doc['url']}")
    print(f"branches: {doc['head']} -> {doc['base']}")
    print(f"open: {len(open_items)}")
    if open_items:
        print(f"open_serials: #1-#{len(open_items)} (use with pr-comment-reply --serial N)")
    print(f"skipped_resolved: {skipped_resolved}")
    if skipped_deleted:
        print(f"skipped_deleted: {skipped_deleted}")
    if skipped_pending:
        print(f"skipped_pending: {skipped_pending}")
    if doc.get("threads_truncated"):
        print("warning: thread lookup stopped before every comment was checked")
    print(f"authors: {author_line(open_items) or '(none)'}")
    print("---")
    for item in open_items:
        print_comment(item)
    if include_resolved and resolved_items:
        print("RESOLVED")
        print(f"resolved_authors: {author_line(resolved_items)}")
        print("---")
        for item in resolved_items:
            print_comment(item)


def self_check():
    comments = [
        {"id": 1, "resolution": {}, "deleted": False, "pending": False, "user": {"display_name": "Ann"},
         "content": {"raw": "resolved root"}, "inline": {"path": "a.py", "to": 1}, "created_on": "t1"},
        {"id": 2, "resolution": None, "deleted": False, "pending": False, "parent": {"id": 1},
         "user": {"display_name": "Bea"}, "content": {"raw": "reply on resolved"},
         "inline": {"path": "a.py", "to": 1}, "created_on": "t2"},
        {"id": 3, "resolution": None, "deleted": False, "pending": False,
         "user": {"display_name": "Cara"}, "content": {"raw": "open"},
         "inline": {"path": "b.py", "to": 9}, "created_on": "t3"},
        {"id": 7, "resolution": None, "deleted": False, "pending": False, "parent": {"id": 3},
         "user": {"display_name": "Cara"}, "content": {"raw": "open reply"},
         "inline": {"path": "b.py", "to": 9}, "created_on": "t7"},
        {"id": 4, "resolution": {"type": "comment_resolution"}, "deleted": False, "pending": False,
         "user": {"display_name": "Dee"}, "content": {"raw": "resolved full"}, "created_on": "t4"},
        {"id": 5, "resolution": None, "deleted": True, "pending": False,
         "user": {"display_name": "Eve"}, "content": {"raw": "gone"}, "created_on": "t5"},
        {"id": 6, "resolution": None, "deleted": False, "pending": True,
         "user": {"display_name": "Fay"}, "content": {"raw": "draft"}, "created_on": "t6"},
    ]
    meta = {
        "id": 9, "title": "t", "state": "OPEN",
        "source": {"branch": {"name": "feature/x"}},
        "destination": {"branch": {"name": "development"}},
        "links": {"html": {"href": "https://example.test/9"}},
    }
    doc = normalize_bitbucket(meta, [{"values": comments}])
    open_items, resolved_items, skipped_resolved, skipped_deleted, skipped_pending = visible(doc, False)
    assign_serials(open_items, resolved_items)
    open_ids = [item["id"] for item in open_items]
    assert open_ids == ["3", "7"], open_ids
    assert open_items[0]["serial"] == 1 and open_items[1]["serial"] == 2
    assert open_comment_id_for_serial(open_items, 2) == "7"
    assert skipped_resolved == 3, skipped_resolved
    assert skipped_deleted == 1
    assert skipped_pending == 1
    _, resolved_items, _, _, _ = visible(doc, True)
    assert [item["id"] for item in resolved_items] == ["1", "2", "4"], resolved_items

    gql = {"data": {"repository": {"pullRequest": {"reviewThreads": {
        "pageInfo": {"hasNextPage": False, "endCursor": None},
        "nodes": [
            {"isResolved": True, "comments": {"pageInfo": {"hasNextPage": False}, "nodes": [{"databaseId": 10}, {"databaseId": 11}]}},
            {"isResolved": False, "comments": {"pageInfo": {"hasNextPage": False}, "nodes": [{"databaseId": 12}]}},
        ],
    }}}}}
    ids, truncated = github_resolved_ids([gql])
    assert ids == {"10", "11"}, ids
    assert truncated is False
    gh_doc = normalize_github(
        {"number": 3, "title": "g", "url": "https://github.com/o/r/pull/3", "state": "OPEN",
         "headRefName": "feature/y", "baseRefName": "main"},
        [
            {"id": 10, "user": {"login": "ann"}, "body": "old", "path": "a.py", "line": 4, "created_at": "t1", "html_url": "u10"},
            {"id": 12, "user": {"login": "cara"}, "body": "open", "path": "b.py", "line": 8, "created_at": "t2", "html_url": "u12", "in_reply_to_id": None},
        ],
        [{"id": 20, "user": {"login": "gus"}, "body": "general", "created_at": "t3", "html_url": "u20"}],
        [{"id": 30, "user": {"login": "ann"}, "body": " ", "state": "APPROVED", "submitted_at": "t4"},
         {"id": 31, "user": {"login": "bea"}, "body": "looks fine", "state": "COMMENTED", "submitted_at": "t5", "html_url": "u31"}],
        [gql],
    )
    open_items, _, skipped_resolved, _, _ = visible(gh_doc, False)
    assert [item["id"] for item in open_items] == ["12", "20", "review-31"], open_items
    assert skipped_resolved == 1
    print("ok")


def doc_open_items(doc, include_resolved):
    open_items, resolved_items, skipped_resolved, skipped_deleted, skipped_pending = visible(
        doc, include_resolved
    )
    assign_serials(open_items, resolved_items)
    return open_items, resolved_items, skipped_resolved, skipped_deleted, skipped_pending


def maybe_print_serial_id(open_items, serial, pr_id):
    if serial is None:
        return False
    comment_id = open_comment_id_for_serial(open_items, serial)
    if comment_id is None:
        fail(f"No open comment #{serial} on PR {pr_id} ({len(open_items)} open)")
    print(comment_id)
    return True


def cmd_bitbucket(args):
    meta = load_json(args.meta)
    if not isinstance(meta, dict):
        fail("Bitbucket PR metadata was not a JSON object")
    pages = []
    for path in args.pages:
        page = load_json(path)
        if isinstance(page, dict) and page.get("error"):
            fail(f"Bitbucket: {page['error'].get('message', page['error'])}")
        if not isinstance(page, dict):
            fail(f"Bitbucket comments page was not a JSON object: {path}")
        pages.append(page)
    doc = normalize_bitbucket(meta, pages)
    if args.serial is not None:
        open_items, _, _, _, _ = doc_open_items(doc, args.include_resolved)
        maybe_print_serial_id(open_items, args.serial, doc["id"])
        return
    render(doc, args.include_resolved)


def cmd_github(args):
    meta = load_json(args.meta)
    if not isinstance(meta, dict):
        fail("GitHub PR metadata was not a JSON object")
    threads = load_json(args.threads)
    if threads is None:
        threads = []
    if isinstance(threads, dict):
        threads = [threads]
    doc = normalize_github(
        meta,
        flatten_pages(load_json(args.review_comments), "review comments"),
        flatten_pages(load_json(args.issue_comments), "issue comments"),
        flatten_pages(load_json(args.reviews), "reviews"),
        threads,
    )
    if args.serial is not None:
        open_items, _, _, _, _ = doc_open_items(doc, args.include_resolved)
        maybe_print_serial_id(open_items, args.serial, doc["id"])
        return
    render(doc, args.include_resolved)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--self-check":
        self_check()
        return
    parser = argparse.ArgumentParser(description="Print pull request comments")
    sub = parser.add_subparsers(dest="cmd", required=True)

    bitbucket = sub.add_parser("bitbucket")
    bitbucket.add_argument("--meta", required=True)
    bitbucket.add_argument("--pages", required=True, nargs="+")
    bitbucket.add_argument("--include-resolved", action="store_true")
    bitbucket.add_argument("--serial", type=int, metavar="N")
    bitbucket.set_defaults(func=cmd_bitbucket, serial=None)

    github = sub.add_parser("github")
    github.add_argument("--meta", required=True)
    github.add_argument("--review-comments", required=True)
    github.add_argument("--issue-comments", required=True)
    github.add_argument("--reviews", required=True)
    github.add_argument("--threads", required=True)
    github.add_argument("--include-resolved", action="store_true")
    github.add_argument("--serial", type=int, metavar="N")
    github.set_defaults(func=cmd_github, serial=None)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
