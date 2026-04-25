import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  or,
  limit,
  startAfter,
  getDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Message, Server, Channel, UserProfile, ServerMember, VoiceState, Notification } from '../types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const chatService = {
  // Servers
  async createServer(name: string, ownerId: string, iconURL?: string) {
    const path = 'servers';
    try {
      const serverData: any = {
        name,
        ownerId,
        memberIds: [ownerId],
        createdAt: new Date().toISOString()
      };
      if (iconURL) serverData.iconURL = iconURL;

      const serverRef = await addDoc(collection(db, path), serverData);
      // Add owner as member in subcollection too (for detailed membership info)
      await setDoc(doc(db, `servers/${serverRef.id}/members`, ownerId), {
        userId: ownerId,
        role: 'owner',
        joinedAt: new Date().toISOString()
      });
      // Create a default general channel
      await addDoc(collection(db, `servers/${serverRef.id}/channels`), {
        name: 'general',
        type: 'text',
        serverId: serverRef.id,
        createdAt: new Date().toISOString()
      });
      // Create a default voice channel
      await addDoc(collection(db, `servers/${serverRef.id}/channels`), {
        name: 'General Voice',
        type: 'voice',
        serverId: serverRef.id,
        createdAt: new Date().toISOString()
      });
      return serverRef.id;
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async joinServer(serverId: string, userId: string) {
    const path = `servers/${serverId}/members/${userId}`;
    try {
      // 1. Add to members subcollection
      await setDoc(doc(db, `servers/${serverId}/members`, userId), {
        userId,
        role: 'member',
        joinedAt: new Date().toISOString()
      });

      // 2. Update memberIds array for easier querying
      const serverRef = doc(db, 'servers', serverId);
      const serverSnap = await getDocs(query(collection(db, 'servers'), where('__name__', '==', serverId)));
      if (!serverSnap.empty) {
        const data = serverSnap.docs[0].data();
        const memberIds = data.memberIds || [];
        if (!memberIds.includes(userId)) {
          await updateDoc(serverRef, {
            memberIds: [...memberIds, userId]
          });
        }
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async updateServer(serverId: string, data: Partial<Server>) {
    const path = `servers/${serverId}`;
    try {
      // Filter out undefined values to avoid Firestore update errors
      const updateData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== undefined)
      );
      await updateDoc(doc(db, 'servers', serverId), updateData);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteServer(serverId: string) {
    const path = `servers/${serverId}`;
    try {
      // In a real app, we'd delete subcollections too, but for this demo:
      await deleteDoc(doc(db, 'servers', serverId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  listenToServers(userId: string | undefined, callback: (servers: Server[]) => void) {
    const path = 'servers';
    let q;
    
    // Admin override: naturally show all servers for the owner/admin to allow cleanup
    const isAdmin = auth.currentUser?.email === 'njarvis9516@gmail.com' && auth.currentUser?.emailVerified;

    if (isAdmin) {
      q = collection(db, path);
    } else if (userId) {
      // Listen to servers where user is either the owner OR a listed member
      q = query(
        collection(db, path), 
        or(
          where('ownerId', '==', userId),
          where('memberIds', 'array-contains', userId)
        )
      );
    } else {
      // Fallback to all (only for unauthenticated state or discovery)
      q = collection(db, path);
    }

    return onSnapshot(q, (snapshot) => {
      const servers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Server));
      callback(servers);
    }, (e) => handleFirestoreError(e, OperationType.LIST, path));
  },

  listenToAllPublicServers(callback: (servers: Server[]) => void) {
    const path = 'servers';
    return onSnapshot(collection(db, path), (snapshot) => {
      const servers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Server));
      callback(servers);
    }, (e) => handleFirestoreError(e, OperationType.LIST, path));
  },

  // Channels
  async createChannel(serverId: string, name: string, type: 'text' | 'voice' = 'text') {
    const path = `servers/${serverId}/channels`;
    try {
      const channelRef = await addDoc(collection(db, path), {
        name,
        type,
        serverId,
        createdAt: new Date().toISOString()
      });
      return channelRef.id;
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  listenToChannels(serverId: string, callback: (channels: Channel[]) => void) {
    const path = `servers/${serverId}/channels`;
    return onSnapshot(collection(db, path), (snapshot) => {
      const channels = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Channel));
      callback(channels);
    }, (e) => handleFirestoreError(e, OperationType.LIST, path));
  },

  // Messages
  async sendMessage(serverId: string, channelId: string, content: string, user: UserProfile) {
    const path = `channels/${channelId}/messages`;
    try {
      await addDoc(collection(db, path), {
        channelId,
        serverId,
        userId: user.uid,
        content,
        timestamp: serverTimestamp(),
        userDisplayName: user.displayName,
        userPhotoURL: user.photoURL
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async deleteMessage(channelId: string, messageId: string) {
    const path = `channels/${channelId}/messages/${messageId}`;
    try {
      await deleteDoc(doc(db, `channels/${channelId}/messages`, messageId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  async updateMessage(channelId: string, messageId: string, content: string) {
    const path = `channels/${channelId}/messages/${messageId}`;
    try {
      await updateDoc(doc(db, `channels/${channelId}/messages`, messageId), {
        content,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, path);
    }
  },

  async toggleReaction(channelId: string, messageId: string, emoji: string, userId: string) {
    const path = `channels/${channelId}/messages/${messageId}`;
    try {
      const messageRef = doc(db, `channels/${channelId}/messages`, messageId);
      const messageSnap = await getDoc(messageRef);
      
      if (!messageSnap.exists()) return;
      
      const data = messageSnap.data();
      const reactions: Record<string, string[]> = data.reactions || {};
      const emojiReactions = reactions[emoji] || [];
      
      let updatedEmojiReactions;
      if (emojiReactions.includes(userId)) {
        updatedEmojiReactions = emojiReactions.filter(id => id !== userId);
      } else {
        updatedEmojiReactions = [...emojiReactions, userId];
      }
      
      const updatedReactions = { ...reactions };
      if (updatedEmojiReactions.length === 0) {
        delete updatedReactions[emoji];
      } else {
        updatedReactions[emoji] = updatedEmojiReactions;
      }
      
      await updateDoc(messageRef, { reactions: updatedReactions });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, path);
    }
  },

  listenToMessages(channelId: string, limitCount: number | undefined, callback: (messages: Message[]) => void) {
    const path = `channels/${channelId}/messages`;
    let q = query(collection(db, path), orderBy('timestamp', 'desc'));
    if (limitCount) {
      q = query(q, limit(limitCount));
    }
    return onSnapshot(q, (snapshot) => {
      // Since we ordered by desc to get the latest ones, and limited, we need to reverse them for the UI
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)).reverse();
      callback(messages);
    }, (e) => handleFirestoreError(e, OperationType.LIST, path));
  },

  async fetchMessagesBefore(channelId: string, lastTimestamp: any, limitCount: number) {
    const path = `channels/${channelId}/messages`;
    try {
      const q = query(
        collection(db, path),
        orderBy('timestamp', 'desc'),
        startAfter(lastTimestamp),
        limit(limitCount)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)).reverse();
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, path);
      return [];
    }
  },

  // Users
  async isUsernameUnique(username: string, excludeUid?: string) {
    const path = 'users';
    try {
      const q = query(collection(db, path), where('username', '==', username.toLowerCase()));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return true;
      if (excludeUid && snapshot.docs.length === 1 && snapshot.docs[0].id === excludeUid) return true;
      return false;
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, path);
      return false;
    }
  },

  async updateUserProfile(uid: string, data: Partial<UserProfile>) {
    const path = `users/${uid}`;
    try {
      // If updating username, ensure it's lowercase for indexing
      const updateData = { ...data };
      if (updateData.username) {
        updateData.username = updateData.username.toLowerCase();
      }
      await updateDoc(doc(db, 'users', uid), updateData);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async updateUserStatus(uid: string, status: UserProfile['status']) {
    const path = `users/${uid}`;
    try {
      await updateDoc(doc(db, 'users', uid), { status });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  listenToUser(uid: string, callback: (profile: UserProfile) => void) {
    const path = `users/${uid}`;
    return onSnapshot(doc(db, 'users', uid), (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as UserProfile);
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, path));
  },

  listenToMembers(serverId: string, callback: (members: (ServerMember & { profile?: UserProfile })[]) => void) {
    const path = `servers/${serverId}/members`;
    return onSnapshot(collection(db, path), async (snapshot) => {
      const members = snapshot.docs.map(doc => ({ ...doc.data() } as any));
      // In a real app we'd join with user profiles. 
      // For simplicity in this demo, we'll just listen to the member objects.
      // But actually, we want the profiles to see statuses.
      callback(members);
    }, (e) => handleFirestoreError(e, OperationType.LIST, path));
  },

  listenToAllUsers(callback: (users: UserProfile[]) => void) {
    const path = 'users';
    return onSnapshot(collection(db, path), (snapshot) => {
      const users = snapshot.docs.map(doc => doc.data() as UserProfile);
      callback(users);
    }, (e) => handleFirestoreError(e, OperationType.LIST, path));
  },

  // Voice
  async joinVoice(serverId: string, channelId: string, userId: string) {
    const path = `voiceStates/${userId}`;
    try {
      await setDoc(doc(db, 'voiceStates', userId), {
        userId,
        serverId,
        channelId,
        mute: false,
        deaf: false,
        isSpeaking: false,
        joinedAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async leaveVoice(userId: string) {
    const path = `voiceStates/${userId}`;
    try {
      await deleteDoc(doc(db, 'voiceStates', userId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },

  async updateVoiceState(userId: string, data: Partial<{ mute: boolean; deaf: boolean; isSpeaking: boolean }>) {
    const path = `voiceStates/${userId}`;
    try {
      await updateDoc(doc(db, 'voiceStates', userId), data);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  listenToVoiceStates(serverId: string, callback: (states: VoiceState[]) => void) {
    const path = 'voiceStates';
    const q = query(collection(db, path), where('serverId', '==', serverId));
    return onSnapshot(q, (snapshot) => {
      const states = snapshot.docs.map(doc => doc.data() as VoiceState);
      callback(states);
    }, (e) => handleFirestoreError(e, OperationType.LIST, path));
  },

  // Notifications
  async sendNotification(notification: Omit<Notification, 'id'>) {
    const path = 'notifications';
    try {
      await addDoc(collection(db, path), {
        ...notification,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  listenToNotifications(userId: string, callback: (notifications: Notification[]) => void) {
    const path = 'notifications';
    const q = query(
      collection(db, path), 
      where('userId', '==', userId),
      where('read', '==', false),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      callback(notifications);
    }, (e) => handleFirestoreError(e, OperationType.LIST, path));
  },

  async markNotificationAsRead(notificationId: string) {
    const path = `notifications/${notificationId}`;
    try {
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },

  async markAllNotificationsAsRead(userId: string) {
    const path = 'notifications';
    try {
      const q = query(
        collection(db, path),
        where('userId', '==', userId),
        where('read', '==', false)
      );
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach(d => {
        batch.update(d.ref, { read: true });
      });
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  }
};
