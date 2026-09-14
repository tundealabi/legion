export const testIds = {
  loginUsername: "login-username",
  loginPassword: "login-password",
  board: "board",
  issueTitle: "issue-title",
  issueRow: "issue-row",
  commentBody: "comment-body",
  commentList: "comment-list",
  issueStatus: "issue-status",
  columnTodo: "column-todo",
  columnInProgress: "column-in-progress",
  columnDone: "column-done",
} as const;

export const roles = {
  signIn: "Sign in",
  createIssue: "Create issue",
  saveIssue: "Save issue",
  addComment: "Add comment",
} as const;

export type IssueStatus = "todo" | "in_progress" | "done";

export const columnTestId: Readonly<Record<IssueStatus, string>> = {
  todo: testIds.columnTodo,
  in_progress: testIds.columnInProgress,
  done: testIds.columnDone,
};

export function issueTestId(issueId: string): string {
  return `issue-${issueId}`;
}

export function appUrl(targetUrl: string, path: string): string {
  const base = targetUrl.endsWith("/") ? targetUrl : `${targetUrl}/`;
  const relative = path.startsWith("/") ? path.slice(1) : path;
  return new URL(relative, base).toString();
}
