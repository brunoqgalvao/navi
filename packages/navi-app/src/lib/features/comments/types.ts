// Message Comments types - Google Docs-style inline annotations
// @experimental

export interface MessageComment {
  id: string;
  message_id: string;
  session_id: string;
  thread_id: string;
  parent_comment_id: string | null;
  author: 'user' | 'assistant';
  content: string;
  selection_text: string | null;
  selection_start: number | null;
  selection_end: number | null;
  resolved: number;
  created_at: number;
}

export interface CommentThread {
  thread_id: string;
  message_id: string;
  session_id: string;
  selection_text: string | null;
  selection_start: number | null;
  selection_end: number | null;
  resolved: number;
  comments: MessageComment[];
  isLoading?: boolean; // For pending AI response
  isExpanded?: boolean; // UI state for expanded thread
}

export interface CreateCommentRequest {
  message_id: string;
  session_id: string;
  content: string;
  selection_text?: string;
  selection_start?: number;
  selection_end?: number;
  author?: 'user' | 'assistant';
}

export interface ReplyCommentRequest {
  content: string;
  author?: 'user' | 'assistant';
}
