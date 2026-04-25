export interface UserProfile {
  uid: string;
  username: string; // Unique identifier/handle
  displayName: string;
  email: string;
  photoURL: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  customStatus?: string;
  createdAt: string;
}

export interface Server {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  iconURL?: string;
  createdAt: string;
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: 'text' | 'voice';
  createdAt: string;
}

export interface Message {
  id: string;
  channelId: string;
  serverId: string;
  userId: string;
  content: string;
  timestamp: any;
  userDisplayName: string;
  userPhotoURL: string;
  updatedAt?: any;
  reactions?: Record<string, string[]>;
}

export interface ServerMember {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
}

export interface VoiceState {
  userId: string;
  channelId: string;
  serverId: string;
  mute: boolean;
  deaf: boolean;
  isSpeaking: boolean;
  joinedAt: any;
}

export interface Notification {
  id?: string;
  userId: string;
  type: 'mention';
  fromUserId: string;
  fromUserName: string;
  serverId: string;
  channelId: string;
  messageId: string;
  content: string;
  read: boolean;
  createdAt: any;
}
