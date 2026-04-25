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
  writeBatch
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
        createdAt: new Date().toISOString()
      };
      if (iconURL) serverData.iconURL = iconURL;

      const serverRef = await addDoc(collection(db, path), serverData);
      // Add owner as member
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

  listenToServers(callback: (servers: Server[]) => void) {
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

  listenToMessages(channelId: string, callback: (messages: Message[]) => void) {
    const path = `channels/${channelId}/messages`;
    const q = query(collection(db, path), orderBy('timestamp', 'asc'));
    return onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      callback(messages);
    }, (e) => handleFirestoreError(e, OperationType.LIST, path));
  },

  // Users
  async updateUserProfile(profile: UserProfile) {
    const path = `users/${profile.uid}`;
    try {
      await setDoc(doc(db, 'users', profile.uid), profile, { merge: true });
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
