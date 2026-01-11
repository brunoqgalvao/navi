export interface Channel {
  id: string;
  name: string;
  description: string | null;
  workspace_access: 'selected' | 'all';
  settings: string;
  created_at: number;
  updated_at: number;
  workspace_ids?: string[];
}

export interface ChannelThread {
  id: string;
  channel_id: string;
  title: string | null;
  status: 'active' | 'resolved' | 'archived';
  workspace_id: string | null;
  branch_name: string | null;
  created_at: number;
  updated_at: number;
  message_count?: number;
  last_message_at?: number;
}

export interface ChannelMessage {
  id: string;
  thread_id: string;
  sender_type: 'user' | 'agent';
  sender_id: string;
  sender_name: string;
  content: string;
  mentions: string;
  agent_action: string | null;
  created_at: number;
}

export interface CreateChannelDTO {
  name: string;
  description?: string;
  workspaceAccess?: 'selected' | 'all';
  workspaceIds?: string[];
}

export interface UpdateChannelDTO {
  name?: string;
  description?: string;
  workspaceAccess?: 'selected' | 'all';
  workspaceIds?: string[];
}

export interface CreateThreadDTO {
  title?: string;
  workspaceId?: string;
}

export interface UpdateThreadDTO {
  title?: string;
  status?: 'active' | 'resolved' | 'archived';
  branchName?: string;
}

export interface CreateMessageDTO {
  senderType: 'user' | 'agent';
  senderId: string;
  senderName: string;
  content: string;
  mentions?: string[];
  agentAction?: any;
}
