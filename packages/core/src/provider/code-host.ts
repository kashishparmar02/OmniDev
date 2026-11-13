// The contract between OmniDev and a code host such as Bitbucket or GitHub.
//
// Capabilities (review, replying to threads, and so on) are written against
// ICodeHostProvider and never call a host API directly. Each host package
// implements the interface once, and the shared contract tests in ../testing
// prove that every implementation behaves the same way.
//
// The data shapes here are OmniDev's own. A provider translates the host's
// response into them, so nothing host-specific leaks into a capability.

/** Which version of a file a line number refers to: before or after the change. */
export type DiffSide = "old" | "new";

/** Identifies one repository. `owner` is a GitHub owner or a Bitbucket workspace. */
export interface RepoRef {
  owner: string;
  repo: string;
}

/** Identifies one pull request. */
export interface PullRequestRef extends RepoRef {
  number: number;
}

export interface PullRequest {
  ref: PullRequestRef;
  title: string;
  description: string;
  state: "open" | "merged" | "closed";
  author: string;
  sourceBranch: string;
  targetBranch: string;
  /** Commit at the tip of the source branch. Inline comments attach to this commit. */
  headCommit: string;
  url: string;
}

export interface NewPullRequest {
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
}

/** The fields of a pull request that can be edited. Omitted fields are left as they are. */
export interface PullRequestChanges {
  title?: string;
  description?: string;
}

/** A position in the pull request diff that an inline comment attaches to. */
export interface InlineAnchor {
  path: string;
  line: number;
  side: DiffSide;
}

export interface Comment {
  id: string;
  author: string;
  body: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/**
 * A conversation on a pull request: a first comment followed by its replies,
 * oldest first. A thread without an anchor is a general comment on the pull
 * request; a thread with one is attached to a line of the diff.
 */
export interface ReviewThread {
  id: string;
  anchor?: InlineAnchor;
  resolved: boolean;
  comments: Comment[];
}

export interface NewThread {
  body: string;
  anchor?: InlineAnchor;
}

/**
 * Everything OmniDev needs from a code host.
 *
 * Every method rejects with a ProviderError; implementations must not let
 * host-specific errors escape. Methods that change the host perform the change
 * immediately, so asking the user for approval is the caller's job, not the
 * provider's.
 */
export interface ICodeHostProvider {
  getPullRequest(ref: PullRequestRef): Promise<PullRequest>;

  /** Opens a pull request from the source branch, which must already be pushed. */
  createPullRequest(repo: RepoRef, pullRequest: NewPullRequest): Promise<PullRequest>;

  updatePullRequest(ref: PullRequestRef, changes: PullRequestChanges): Promise<PullRequest>;

  /** Returns the pull request's changes as one unified diff in git format. */
  getDiff(ref: PullRequestRef): Promise<string>;

  /** Returns every thread, oldest first, including resolved ones. */
  listThreads(ref: PullRequestRef): Promise<ReviewThread[]>;

  /**
   * Starts a new thread. The anchor is passed to the host as given; the caller
   * must first check that it points at a line present in the diff, because
   * hosts differ in how they treat an anchor outside it.
   */
  createThread(ref: PullRequestRef, thread: NewThread): Promise<ReviewThread>;

  /**
   * Adds a reply to a thread. Every host supports this for inline threads. A
   * host that cannot reply to a general thread rejects with `unsupported`.
   */
  replyToThread(ref: PullRequestRef, threadId: string, body: string): Promise<Comment>;

  /**
   * Resolves or reopens a thread. Setting the state a thread already has is
   * not an error. A host that cannot resolve a general thread rejects with
   * `unsupported`.
   */
  setThreadResolved(ref: PullRequestRef, threadId: string, resolved: boolean): Promise<void>;
}
