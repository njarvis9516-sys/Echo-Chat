import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Hash, 
  Volume2, 
  Plus, 
  Settings, 
  Mic, 
  MicOff,
  Headphones, 
  Send,
  MoreVertical,
  LogOut,
  Server as ServerIcon,
  Search,
  Users,
  PhoneOff,
  ChevronDown,
  Bell,
  Trash2,
  Pencil,
  Smile,
  X,
  Compass,
  Search as SearchIcon,
  Globe,
  Video,
  VideoOff
} from 'lucide-react';
import { format } from 'date-fns';
import EmojiPicker, { Theme, EmojiClickData } from 'emoji-picker-react';
import { useAuth } from './hooks/useAuth';
import { signInWithGoogle, logOut } from './lib/firebase';
import { chatService } from './services/chatService';
import { Server, Channel, Message, UserProfile, VoiceState, Notification } from './types';
import { cn } from './lib/utils';
import { useWebRTC } from './hooks/useWebRTC';

const StatusBadge = ({ status, className }: { status: UserProfile['status'], className?: string }) => {
  const colors = {
    online: 'bg-[#23a559]',
    idle: 'bg-[#f0b232]',
    dnd: 'bg-[#f23f43]',
    offline: 'bg-[#80848e]'
  };

  return (
    <div className={cn("w-3 h-3 rounded-full border-2 border-[#232428]", colors[status] || colors.offline, className)} />
  );
};

export default function App() {
  const { user, profile, loading } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageLimit, setMessageLimit] = useState(50);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [messageInput, setMessageInput] = useState('');
  const [isCreatingServer, setIsCreatingServer] = useState(false);
  const [isCreatingServerLoading, setIsCreatingServerLoading] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newServerDescription, setNewServerDescription] = useState('');
  const [newServerIconURL, setNewServerIconURL] = useState('');
  const [isNewServerDiscoverable, setIsNewServerDiscoverable] = useState(true);
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);
  const [editServerName, setEditServerName] = useState('');
  const [editServerDescription, setEditServerDescription] = useState('');
  const [editServerIconURL, setEditServerIconURL] = useState('');
  const [isEditServerDiscoverable, setIsEditServerDiscoverable] = useState(true);
  
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPhotoURL, setEditPhotoURL] = useState('');
  const [editCustomStatus, setEditCustomStatus] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [voiceStates, setVoiceStates] = useState<VoiceState[]>([]);
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [isDeletingServer, setIsDeletingServer] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<UserProfile[]>([]);
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isUserListOpen, setIsUserListOpen] = useState(true);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null);
  const [reactionPickerRef, setReactionPickerRef] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useState<'chat' | 'discovery'>('chat');
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);

  const { remoteStreams, localStream } = useWebRTC(
    user?.uid,
    selectedChannelId || undefined,
    voiceStates,
    isVideoEnabled,
    isMuted
  );
  
  const [serverSearchQuery, setServerSearchQuery] = useState('');

  const [discoverableServers, setDiscoverableServers] = useState<Server[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const filteredServers = servers.filter(s => 
    s.name.toLowerCase().includes(serverSearchQuery.toLowerCase())
  );

  const handleJoinServer = async (serverId: string) => {
    if (!user) return;
    try {
      await chatService.joinServer(serverId, user.uid);
      setSelectedServerId(serverId);
      setView('chat');
    } catch (error) {
      console.error('Failed to join server:', error);
    }
  };

  useEffect(() => {
    const unsub = chatService.listenToDiscoverableServers(setDiscoverableServers);
    return () => unsub();
  }, []);

  // Activity Tracking
  useEffect(() => {
    if (!profile) return;

    let timeout: any;
    const updateActivity = () => {
      if (profile.status !== 'online') {
        chatService.updateUserStatus(profile.uid, 'online');
      }
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        chatService.updateUserStatus(profile.uid, 'idle');
      }, 1000 * 60 * 5); // 5 minutes idle
    };

    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    
    updateActivity();

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      clearTimeout(timeout);
    };
  }, [profile?.uid]);

  // Click outside to close emoji picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setIsEmojiPickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Listen to all users (for status tracking in this demo)
  useEffect(() => {
    if (user) {
      const unsub = chatService.listenToAllUsers(setAllUsers);
      return unsub;
    }
  }, [user]);

  // Listen to servers
  useEffect(() => {
    if (user) {
      const unsub = chatService.listenToServers(user.uid, (data) => {
        setServers(data);
        if (data.length > 0 && !selectedServerId) {
          setSelectedServerId(data[0].id);
        }
      });
      return unsub;
    }
  }, [user]);

  // Listen to channels
  useEffect(() => {
    if (selectedServerId) {
      const unsub = chatService.listenToChannels(selectedServerId, (data) => {
        setChannels(data);
        if (data.length > 0) {
          setSelectedChannelId(data[0].id);
        }
      });
      return unsub;
    }
  }, [selectedServerId]);

  // Listen to messages
  useEffect(() => {
    if (selectedChannelId) {
      setMessages([]);
      setMessageLimit(50);
      setHasMoreMessages(true);
      setIsInitialLoad(true);
      
      const unsub = chatService.listenToMessages(selectedChannelId, messageLimit, (data) => {
        setMessages(data);
        if (data.length < messageLimit) {
          setHasMoreMessages(false);
        }
        setIsInitialLoad(false);
      });
      return unsub;
    }
  }, [selectedChannelId, messageLimit]);

  // Listen to voice states
  useEffect(() => {
    if (selectedServerId) {
      const unsub = chatService.listenToVoiceStates(selectedServerId, setVoiceStates);
      return unsub;
    }
  }, [selectedServerId]);

  // Cleanup voice on unmount
  useEffect(() => {
    return () => {
      if (user) chatService.leaveVoice(user.uid);
    };
  }, [user]);

  // Listen to notifications
  useEffect(() => {
    if (user) {
      const unsub = chatService.listenToNotifications(user.uid, setNotifications);
      return unsub;
    }
  }, [user]);

  // Scroll to bottom functionality
  useEffect(() => {
    if (scrollRef.current && (isInitialLoad || isNearBottom())) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isInitialLoad]);

  const isNearBottom = () => {
    if (!scrollRef.current) return false;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    return scrollHeight - scrollTop - clientHeight < 150;
  };

  const handleLoadMore = () => {
    if (!hasMoreMessages || isLoadingMore) return;
    setIsLoadingMore(true);
    // Just increase limit, the listener will handle the rest
    setMessageLimit(prev => prev + 50);
    setIsLoadingMore(false);
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    const emoji = emojiData.emoji;
    const start = messageInput.substring(0, inputRef.current?.selectionStart || 0);
    const end = messageInput.substring(inputRef.current?.selectionEnd || 0);
    
    const newValue = start + emoji + end;
    setMessageInput(newValue);
    
    // Focus back to input
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newPos = start.length + emoji.length;
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!selectedChannelId || !user) return;
    try {
      await chatService.toggleReaction(selectedChannelId, messageId, emoji, user.uid);
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
    }
  };

  const onReactionEmojiClick = (emojiData: EmojiClickData, messageId: string) => {
    handleToggleReaction(messageId, emojiData.emoji);
    setReactionMessageId(null);
  };

  const activeServer = servers.find(s => s.id === selectedServerId);
  const activeChannel = channels.find(c => c.id === selectedChannelId);

  useEffect(() => {
    if (activeServer && isServerSettingsOpen) {
      setEditServerName(activeServer.name);
      setEditServerDescription(activeServer.description || '');
      setEditServerIconURL(activeServer.iconURL || '');
      setIsEditServerDiscoverable(activeServer.isDiscoverable !== false);
    }
  }, [isServerSettingsOpen, activeServer]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!messageInput.trim() || !selectedServerId || !selectedChannelId || !profile) return;
    
    const content = messageInput;
    try {
      setMessageInput('');
      await chatService.sendMessage(selectedServerId, selectedChannelId, content, profile);

      // Check for mentions
      const mentionRegex = /@(\w+)/g;
      const mentions = content.match(mentionRegex);
      if (mentions) {
        mentions.forEach(async (mention) => {
          const userName = mention.substring(1);
          const mentionedUser = allUsers.find(u => u.displayName.toLowerCase() === userName.toLowerCase());
          if (mentionedUser && mentionedUser.uid !== user?.uid) {
            await chatService.sendNotification({
              userId: mentionedUser.uid,
              type: 'mention',
              fromUserId: profile.uid,
              fromUserName: profile.displayName,
              serverId: selectedServerId,
              channelId: selectedChannelId,
              messageId: 'temp', // We'd need the real ID, but for this demo:
              content: content,
              read: false,
              createdAt: new Date()
            });
          }
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Restore input if failed
      setMessageInput(content);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!selectedChannelId) return;
    try {
      await chatService.deleteMessage(selectedChannelId, messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  const handleEditMessage = async (messageId: string) => {
    if (!selectedChannelId || !editInput.trim()) return;
    try {
      await chatService.updateMessage(selectedChannelId, messageId, editInput);
      setEditingMessageId(null);
      setEditInput('');
    } catch (error) {
      console.error('Failed to edit message:', error);
    }
  };

  const startEditing = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditInput(msg.content);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.target;
    const value = target.value;
    setMessageInput(value);

    // Auto-resize textarea
    if (target instanceof HTMLTextAreaElement) {
      target.style.height = 'auto';
      target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
    }

    const cursorPosition = target.selectionStart || 0;
    const lastAtPos = value.lastIndexOf('@', cursorPosition - 1);

    if (lastAtPos !== -1) {
      const query = value.substring(lastAtPos + 1, cursorPosition);
      if (!query.includes(' ')) {
        const matches = allUsers.filter(u => 
          u.displayName.toLowerCase().includes(query.toLowerCase())
        );
        setMentionSuggestions(matches);
        setMentionTriggerIndex(lastAtPos);
      } else {
        setMentionSuggestions([]);
        setMentionTriggerIndex(null);
      }
    } else {
      setMentionSuggestions([]);
      setMentionTriggerIndex(null);
    }
  };

  const insertMention = (userProfile: UserProfile) => {
    if (mentionTriggerIndex === null) return;
    const value = messageInput;
    const before = value.substring(0, mentionTriggerIndex);
    const mention = `@${userProfile.displayName} `;
    
    // Find where the query ends (next space or end of string)
    let endOfQuery = value.indexOf(' ', mentionTriggerIndex);
    if (endOfQuery === -1) endOfQuery = value.length;
    
    const after = value.substring(endOfQuery);
    setMessageInput(before + mention + after);
    setMentionSuggestions([]);
    setMentionTriggerIndex(null);
  };

  const renderMessageContent = (content: string) => {
    return content.split(/(\s+)/).map((part, i) => {
      if (part.match(/^https?:\/\/[^\s$.?#].[^\s]*$/i)) {
        return (
          <a 
            key={i} 
            href={part} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-[#00a8fc] hover:underline"
          >
            {part}
          </a>
        );
      }
      if (part.startsWith('@')) {
        const userName = part.substring(1);
        const isMentioned = allUsers.some(u => u.displayName.toLowerCase() === userName.toLowerCase());
        if (isMentioned) {
          return (
            <span key={i} className="bg-[#5865f2]/30 text-[#e9ebff] px-1 rounded font-medium cursor-pointer hover:bg-[#5865f2]/50 transition-colors">
              {part}
            </span>
          );
        }
      }
      return part;
    });
  };
  const handleCreateServer = async () => {
    if (!newServerName.trim() || !user || isCreatingServerLoading) return;
    setIsCreatingServerLoading(true);
    try {
      const serverId = await chatService.createServer(
        newServerName.trim(), 
        user.uid, 
        newServerIconURL.trim() || undefined,
        newServerDescription.trim() || undefined
      );
      // Update discoverability separately if needed or handle it in createServer
      if (serverId && !isNewServerDiscoverable) {
        await chatService.updateServer(serverId, { isDiscoverable: false });
      }
      if (serverId) {
        setSelectedServerId(serverId);
        setNewServerName('');
        setNewServerDescription('');
        setNewServerIconURL('');
        setIsCreatingServer(false);
        setView('chat');
      }
    } catch (error) {
      console.error('Failed to create server:', error);
    } finally {
      setIsCreatingServerLoading(false);
    }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !selectedServerId) return;
    await chatService.createChannel(selectedServerId, newChannelName, newChannelType);
    setNewChannelName('');
    setNewChannelType('text');
    setIsCreatingChannel(false);
  };

  const handleJoinVoice = async (channelId: string) => {
    if (!selectedServerId || !user) return;
    await chatService.joinVoice(selectedServerId, channelId, user.uid);
    setSelectedChannelId(channelId);
  };

  const handleLeaveVoice = async () => {
    if (!user) return;
    setIsVideoEnabled(false);
    await chatService.leaveVoice(user.uid);
  };

  const toggleMute = async () => {
    if (!user) return;
    const newMute = !isMuted;
    setIsMuted(newMute);
    await chatService.updateVoiceState(user.uid, { mute: newMute });
  };

  const toggleDeaf = async () => {
    if (!user) return;
    const newDeaf = !isDeafened;
    setIsDeafened(newDeaf);
    await chatService.updateVoiceState(user.uid, { deaf: newDeaf, mute: newDeaf || isMuted });
  };

  const toggleVideo = async () => {
    if (!user) return;
    const newVideo = !isVideoEnabled;
    setIsVideoEnabled(newVideo);
    await chatService.updateVoiceState(user.uid, { video: newVideo });
  };

  const handleUpdateServer = async () => {
    if (!selectedServerId || !editServerName.trim()) return;
    await chatService.updateServer(selectedServerId, {
      name: editServerName.trim(),
      description: editServerDescription.trim(),
      iconURL: editServerIconURL.trim() || undefined,
      isDiscoverable: isEditServerDiscoverable
    });
    setIsServerSettingsOpen(false);
  };

  useEffect(() => {
    if (profile && isUserSettingsOpen) {
      setEditDisplayName(profile.displayName);
      setEditUsername(profile.username || '');
      setEditPhotoURL(profile.photoURL);
      setEditCustomStatus(profile.customStatus || '');
      setUsernameError('');
    }
  }, [isUserSettingsOpen, profile]);

  const handleUpdateProfile = async () => {
    if (!user || !profile) return;
    if (!editDisplayName.trim() || !editUsername.trim()) return;
    
    setIsSavingProfile(true);
    setUsernameError('');
    
    try {
      // Check username uniqueness if changed
      if (editUsername.toLowerCase() !== profile.username?.toLowerCase()) {
        const isUnique = await chatService.isUsernameUnique(editUsername, user.uid);
        if (!isUnique) {
          setUsernameError('Username is already taken');
          setIsSavingProfile(false);
          return;
        }
      }
      
      await chatService.updateUserProfile(user.uid, {
        displayName: editDisplayName,
        username: editUsername,
        photoURL: editPhotoURL,
        customStatus: editCustomStatus
      });
      
      setIsUserSettingsOpen(false);
    } catch (error) {
      console.error('Failed to update profile:', error);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDeleteServer = async () => {
    if (!selectedServerId || !isDeletingServer) return;
    try {
      await chatService.deleteServer(selectedServerId);
      const remainingServers = servers.filter(s => s.id !== selectedServerId);
      setSelectedServerId(remainingServers.length > 0 ? remainingServers[0].id : null);
      setIsDeletingServer(false);
      setIsServerSettingsOpen(false);
    } catch (error) {
      console.error('Failed to delete server:', error);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in certain elements unless it's Escape/Alt/Ctrl combo
      const isTyping = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName);

      // ESC: Close UI elements
      if (e.key === 'Escape') {
        setMentionSuggestions([]);
        setMentionTriggerIndex(null);
        setIsNotificationsOpen(false);
        setIsCreatingServer(false);
        setIsCreatingChannel(false);
        setIsServerSettingsOpen(false);
        setIsDeletingServer(false);
        setIsUserSettingsOpen(false);
        return;
      }

      // Settings (Ctrl + ,)
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        setIsUserSettingsOpen(true);
      }

      // Voice Controls (Ctrl + Shift + ...)
      if (e.ctrlKey && e.shiftKey) {
        if (e.key.toLowerCase() === 'm') {
          e.preventDefault();
          toggleMute();
        }
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          toggleDeaf();
        }
      }

      // Navigation (Alt + ...)
      if (e.altKey) {
        // Channel Navigation
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          if (channels.length > 0) {
            const currentIndex = channels.findIndex(c => c.id === selectedChannelId);
            let nextIndex = currentIndex;
            if (e.key === 'ArrowUp') {
              nextIndex = currentIndex <= 0 ? channels.length - 1 : currentIndex - 1;
            } else {
              nextIndex = currentIndex >= channels.length - 1 ? 0 : currentIndex + 1;
            }
            setSelectedChannelId(channels[nextIndex].id);
          }
        }
        // Server Navigation
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          if (servers.length > 0) {
            const currentIndex = servers.findIndex(s => s.id === selectedServerId);
            let nextIndex = currentIndex;
            if (e.key === 'ArrowLeft') {
              nextIndex = currentIndex <= 0 ? servers.length - 1 : currentIndex - 1;
            } else {
              nextIndex = currentIndex >= servers.length - 1 ? 0 : currentIndex + 1;
            }
            setSelectedServerId(servers[nextIndex].id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    user, 
    channels, 
    selectedChannelId, 
    servers, 
    selectedServerId, 
    isMuted, 
    isDeafened,
    toggleMute, // These are dependencies now
    toggleDeaf
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#313338] text-white">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 bg-[#5865f2] rounded-full mb-4" />
          <p className="text-sm font-medium opacity-50">Waking up the hamsters...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1e1f22]">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#313338] p-8 rounded-lg shadow-2xl w-full max-w-md text-center border border-white/5"
        >
          <div className="w-20 h-20 bg-[#5865f2] rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-[#5865f2]/20">
            <ServerIcon className="text-white w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Welcome to Echo Chat</h1>
          <p className="text-[#b5bac1] mb-8">Reconnect with your community in a safe, real-time workspace.</p>
          <button 
            onClick={signInWithGoogle}
            className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white py-3 px-4 rounded-md font-medium transition-colors flex items-center justify-center gap-3"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/layout/google.svg" alt="Google" className="w-5 h-5 bg-white rounded-full p-1" />
            Continue with Google
          </button>
        </motion.div>
      </div>
    );
  }

  const isOwner = user && activeServer?.ownerId === user.uid;
  const textChannels = channels.filter(c => c.type === 'text');
  const voiceChannels = channels.filter(c => c.type === 'voice');
  const activeVoiceState = user ? voiceStates.find(vs => vs.userId === user.uid) : null;
  const connectedChannel = activeVoiceState ? channels.find(c => c.id === activeVoiceState.channelId) : null;

  return (
    <div className="flex h-screen bg-[#313338] text-[#dbdee1] overflow-hidden font-sans">
      {/* 1. Server List */}
      <div className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 gap-2 flex-shrink-0 overflow-y-auto no-scrollbar relative group/sidebar">
        {/* Server Search Trigger */}
        <div className="w-12 h-12 bg-[#313338] rounded-[24px] hover:rounded-[16px] hover:bg-[#5865f2] hover:text-white transition-all flex flex-col items-center justify-center cursor-pointer mb-2 group relative overflow-hidden">
          <input
            type="text"
            value={serverSearchQuery}
            onChange={(e) => setServerSearchQuery(e.target.value)}
            placeholder="Search..."
            className="absolute inset-0 bg-transparent opacity-0 focus:opacity-100 focus:bg-[#313338] w-full h-full text-xs px-2 outline-none transition-all z-20 text-white placeholder:text-gray-500"
            title="Search servers"
          />
          <Search size={20} className="z-10 pointer-events-none group-focus-within:opacity-0 transition-opacity" />
        </div>

        <div 
          onClick={() => {
            setSelectedServerId('');
            setView('chat');
          }}
          className="w-12 h-12 bg-[#313338] rounded-[24px] hover:rounded-[16px] hover:bg-[#5865f2] hover:text-white transition-all flex items-center justify-center cursor-pointer mb-2 group relative"
        >
          <div className="absolute -left-1 w-1 h-2 bg-white rounded-r-full hidden group-hover:block" />
          <ServerIcon size={24} />
        </div>
        <div className="w-8 h-[2px] bg-[#35363c] mb-2" />
        
        {filteredServers.map((server) => (
          <div 
            key={server.id}
            onClick={() => {
              setSelectedServerId(server.id);
              setView('chat');
            }}
            className={cn(
              "w-12 h-12 bg-[#313338] transition-all flex items-center justify-center cursor-pointer group relative overflow-hidden",
              selectedServerId === server.id ? "rounded-[16px] bg-[#5865f2] text-white" : "rounded-[24px] hover:rounded-[16px] hover:bg-[#5865f2] hover:text-white"
            )}
          >
            {selectedServerId === server.id && (
              <div className="absolute -left-1 w-2 h-10 bg-white rounded-r-full" />
            )}
            {server.iconURL ? (
              <img src={server.iconURL} alt={server.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-bold">{server.name[0].toUpperCase()}</span>
            )}
            <div className="absolute left-16 bg-black px-3 py-1.5 rounded-md text-sm font-bold text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
              {server.name}
            </div>
          </div>
        ))}

        <div 
          onClick={() => setIsCreatingServer(true)}
          className="w-12 h-12 bg-[#313338] rounded-[24px] hover:rounded-[16px] hover:bg-[#23a559] hover:text-white transition-all flex items-center justify-center cursor-pointer mb-2"
        >
          <Plus size={24} />
        </div>

        <div className="mt-auto pb-4 flex flex-col gap-2">
          <div 
            onClick={() => {
              setView('discovery');
              setSelectedServerId(null);
            }}
            className={cn(
              "w-12 h-12 transition-all flex items-center justify-center cursor-pointer group relative",
              view === 'discovery' ? "rounded-[16px] bg-[#23a559] text-white" : "bg-[#313338] rounded-[24px] hover:rounded-[16px] hover:bg-[#23a559] hover:text-white"
            )}
          >
            {view === 'discovery' && (
              <div className="absolute -left-1 w-2 h-10 bg-white rounded-r-full" />
            )}
            <Compass size={24} />
            <div className="absolute left-16 bg-black px-3 py-1.5 rounded-md text-sm font-bold text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
              Explore Discoverable Servers
            </div>
          </div>
        </div>
      </div>

      {/* 2. Channel List */}
      <div className="w-60 bg-[#2b2d31] flex flex-col flex-shrink-0">
        <div 
          onClick={() => isOwner && setIsServerSettingsOpen(true)}
          className={cn(
            "h-12 px-4 flex items-center justify-between border-b border-[#1e1f22] shadow-sm cursor-pointer hover:bg-white/[0.04]",
            isOwner && "hover:bg-white/[0.08]"
          )}
        >
          <h2 className="font-bold text-white truncate max-w-[140px]">
            {activeServer?.name || 'Home'}
          </h2>
          {isOwner ? <Settings size={16} className="opacity-60" /> : <MoreVertical size={16} className="opacity-60" />}
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          <div>
            <div className="flex items-center justify-between px-2 mb-1 group">
              <span className="text-xs font-bold uppercase opacity-60 tracking-wider">Text Channels</span>
              <Plus 
                size={14} 
                className="opacity-60 cursor-pointer hover:opacity-100" 
                onClick={() => {
                  setNewChannelType('text');
                  setIsCreatingChannel(true);
                }}
              />
            </div>
            <div className="space-y-0.5">
              {textChannels.map((channel) => (
                <div 
                  key={channel.id}
                  onClick={() => setSelectedChannelId(channel.id)}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer group",
                    selectedChannelId === channel.id 
                      ? "bg-[#3f4147] text-white" 
                      : "hover:bg-[#35373c] hover:text-[#dbdee1]"
                  )}
                >
                  <Hash size={20} className="opacity-40" />
                  <span className={cn("flex-1 truncate text-sm font-medium", selectedChannelId === channel.id ? "text-white" : "opacity-70")}>
                    {channel.name}
                  </span>
                  <Settings size={14} className="opacity-0 group-hover:opacity-60 hover:opacity-100" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between px-2 mb-1 group">
              <span className="text-xs font-bold uppercase opacity-60 tracking-wider">Voice Channels</span>
              <Plus 
                size={14} 
                className="opacity-60 cursor-pointer hover:opacity-100" 
                onClick={() => {
                  setNewChannelType('voice');
                  setIsCreatingChannel(true);
                }}
              />
            </div>
            <div className="space-y-1">
              {voiceChannels.map((channel) => {
                const participants = voiceStates.filter(vs => vs.channelId === channel.id);
                return (
                  <div key={channel.id} className="space-y-1">
                    <div 
                      onClick={() => handleJoinVoice(channel.id)}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer group",
                        selectedChannelId === channel.id 
                          ? "bg-[#3f4147] text-white" 
                          : "hover:bg-[#35373c] hover:text-[#dbdee1]"
                      )}
                    >
                      <Volume2 size={20} className="opacity-40" />
                      <span className={cn("flex-1 truncate text-sm font-medium", selectedChannelId === channel.id ? "text-white" : "opacity-70")}>
                        {channel.name}
                      </span>
                    </div>
                    {participants.length > 0 && (
                      <div className="pl-8 space-y-1">
                        {participants.map(vs => {
                          const participantProfile = allUsers.find(u => u.uid === vs.userId);
                          return (
                            <div key={vs.userId} className="flex items-center gap-2 py-0.5">
                              <img src={participantProfile?.photoURL || null} alt="" className="w-5 h-5 rounded-full" />
                              <span className="text-sm opacity-70 truncate">{participantProfile?.displayName}</span>
                              <div className="flex items-center gap-1 ml-auto mr-2">
                                {vs.mute && <MicOff size={12} className="text-red-400" />}
                                {vs.deaf && <Headphones size={12} className="text-red-400" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Voice Control Bar */}
        {activeVoiceState && connectedChannel && (
          <div className="bg-[#232428] border-b border-black/20 p-2 text-white">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <Volume2 size={16} className="text-[#23a559]" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-[#23a559] truncate leading-tight">Voice Connected</span>
                  <span className="text-[10px] opacity-60 truncate leading-tight">{connectedChannel.name} / {activeServer?.name}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={toggleVideo}
                  className={cn("p-1.5 rounded transition-colors", isVideoEnabled ? "bg-[#23a559] text-white" : "hover:bg-white/10 text-[#dbdee1]")}
                  title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
                >
                  {isVideoEnabled ? <Video size={16} /> : <VideoOff size={16} />}
                </button>
                <button className="p-1.5 hover:bg-white/10 rounded transition-colors" title="Noise Suppression">
                  <Search size={14} className="opacity-60" />
                </button>
                <button 
                  onClick={handleLeaveVoice}
                  className="p-1.5 hover:bg-red-500/20 text-red-500 rounded transition-colors" 
                  title="Disconnect"
                >
                  <PhoneOff size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* User bar */}
        <div className="bg-[#232428] p-2 flex items-center gap-2 mt-auto">
          <div className="relative group cursor-pointer">
            <img src={profile?.photoURL || null} alt="User" className="w-10 h-10 rounded-full" />
            <StatusBadge status={profile?.status || 'offline'} className="absolute -bottom-0.5 -right-0.5 border-[#232428]" />
          </div>
          <div className="flex-1 truncate">
            <p className="text-sm font-bold text-white leading-tight truncate">{profile?.displayName}</p>
            <p className="text-xs opacity-60 leading-tight capitalize">{profile?.status || 'online'}</p>
          </div>
          <div className="flex items-center gap-1">
            <div 
              onClick={toggleVideo}
              className={cn("p-1.5 hover:bg-white/10 rounded-md cursor-pointer transition-colors", isVideoEnabled && "text-[#23a559]")} 
              title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
            >
              {isVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            </div>
            <div 
              onClick={toggleMute}
              className={cn("p-1.5 hover:bg-white/10 rounded-md cursor-pointer transition-colors", isMuted && "text-red-400")} 
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </div>
            <div 
              onClick={toggleDeaf}
              className={cn("p-1.5 hover:bg-white/10 rounded-md cursor-pointer transition-colors", isDeafened && "text-red-400")} 
              title={isDeafened ? "Undeafen" : "Deafen"}
            >
              <Headphones size={18} />
            </div>
            <div className="p-1.5 hover:bg-white/10 rounded-md cursor-pointer transition-colors" title="Settings" onClick={() => setIsUserSettingsOpen(true)}>
              <Settings size={18} />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Content Area */}
      <div className="flex-1 flex flex-col bg-[#313338]">
        {view === 'discovery' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Discovery Header */}
            <div className="h-12 px-6 flex items-center justify-between border-b border-[#1e1f22] bg-[#2b2d31]">
              <div className="flex items-center gap-2">
                <Compass size={20} className="text-[#dbdee1] opacity-60" />
                <h3 className="font-bold text-white">Discovery</h3>
              </div>
            </div>
            
            {/* Discovery Content */}
            <div className="flex-1 overflow-y-auto bg-[#313338]">
              {/* Hero Section */}
              <div className="relative h-72 w-full overflow-hidden mb-8">
                <img 
                  src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2000&auto=format&fit=crop" 
                  alt="Discovery Hero" 
                  className="w-full h-full object-cover opacity-50"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#313338] to-transparent" />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                  <h1 className="text-4xl font-extrabold text-white mb-4 drop-shadow-xl">Find your community on Echo</h1>
                  <p className="text-xl text-[#dbdee1] max-w-xl mx-auto drop-shadow-md mb-8">From gaming, to music, to learning, there's a place for you.</p>
                  
                  <div className="relative w-full max-w-2xl group">
                    <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[#949ba4] group-focus-within:text-white transition-colors" size={24} />
                    <input 
                      type="text" 
                      placeholder="Explore communities..."
                      className="w-full bg-[#1e1f22] text-white text-lg rounded-lg pl-14 pr-6 py-4 outline-none focus:ring-4 focus:ring-[#5865f2]/20 transition-all placeholder:text-[#949ba4]"
                    />
                  </div>
                </div>
              </div>

              {/* Server Grid */}
              <div className="px-8 pb-12 max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white">Featured Communities</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {discoverableServers.length > 0 ? (
                    discoverableServers.map((s) => {
                      const isMember = user && s.memberIds?.includes(user.uid);
                      return (
                        <motion.div 
                          key={s.id}
                          whileHover={{ y: -4 }}
                          className="bg-[#2b2d31] rounded-lg overflow-hidden group cursor-pointer shadow-lg hover:shadow-2xl transition-all border border-white/5"
                        >
                          <div className="h-32 w-full relative">
                            <img src={s.bannerURL || "https://images.unsplash.com/photo-1511447333035-4d398108cd4e?q=80&w=800&auto=format&fit=crop"} className="w-full h-full object-cover" alt="" />
                            <div className="absolute -bottom-10 left-4 w-16 h-16 rounded-2xl bg-[#313338] p-1 shadow-xl">
                              {s.iconURL ? (
                                <img src={s.iconURL} className="w-full h-full rounded-xl object-cover" alt="" />
                              ) : (
                                <div className="w-full h-full rounded-xl bg-[#5865f2] flex items-center justify-center text-white font-bold text-xl uppercase">
                                  {s.name.substring(0, 1)}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="pt-12 p-5">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-bold text-white text-lg group-hover:text-[#00a8fc] transition-colors">{s.name}</h3>
                              {s.memberIds && s.memberIds.length > 10 && <div className="bg-[#23a559]/20 text-[#23a559] text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Popular</div>}
                            </div>
                            <p className="text-sm text-[#b5bac1] line-clamp-2 mb-6 h-10 leading-relaxed">
                              {s.description || "A community waiting for you to join."}
                            </p>
                            <div className="flex items-center justify-between pt-4 border-t border-white/5">
                              <div className="flex items-center gap-2 text-xs font-medium text-[#949ba4]">
                                <div className="w-2 h-2 rounded-full bg-[#23a559]" />
                                {s.memberIds?.length || 0} Members
                              </div>
                              {isMember ? (
                                <button 
                                  onClick={() => {
                                    setSelectedServerId(s.id);
                                    setView('chat');
                                  }}
                                  className="bg-[#23a559] hover:bg-[#1a8b47] text-white text-xs font-bold px-4 py-2 rounded transition-colors"
                                >
                                  View Server
                                </button>
                              ) : (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleJoinServer(s.id);
                                  }}
                                  className="bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-bold px-4 py-2 rounded transition-colors"
                                >
                                  Join Server
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    // Initial seed servers if database is empty
                    [
                      { id: ' Gaming Hub', name: 'Gaming Hub', description: 'The best place for competitive and casual gaming alike.', members: '125k', banner: 'https://images.unsplash.com/photo-1542751371-adc38448a05e' },
                      { id: ' anime', name: 'Anime World', description: 'Discuss your favorite seasonal anime and classic series.', members: '82k', banner: 'https://images.unsplash.com/photo-1578632292335-df3abbb0d586' },
                      { id: ' dev', name: 'Developer Den', description: 'Tech talks, coding help, and project showcases.', members: '45k', banner: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6' }
                    ].map(s => (
                      <div key={s.id} className="bg-[#2b2d31] rounded-lg overflow-hidden border border-white/5 opacity-80 grayscale-[0.5]">
                        <div className="h-32 w-full bg-[#1e1f22] overflow-hidden">
                          <img src={`${s.banner}?q=80&w=400&auto=format&fit=crop`} className="w-full h-full object-cover" />
                        </div>
                        <div className="p-5">
                          <h3 className="font-bold text-white mb-2">{s.name}</h3>
                          <p className="text-xs text-[#b5bac1] mb-4">{s.description}</p>
                          <button className="w-full py-2 bg-[#313338] text-white text-xs font-bold rounded cursor-not-allowed">Coming Soon</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                {/* Visualizer placeholder matching drawing */}
                <div className="mt-12 bg-[#2b2d31] rounded-xl p-8 border border-dashed border-white/10 flex flex-col items-center justify-center text-center opacity-40">
                  <Globe size={48} className="mb-4" />
                  <h3 className="text-lg font-bold">More servers coming soon</h3>
                  <p className="text-sm">We're expanding our community every day. Stay tuned!</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="h-12 px-4 flex items-center justify-between border-b border-[#1e1f22] shadow-sm">
          <div className="flex items-center gap-2">
            {activeChannel?.type === 'voice' ? <Volume2 size={24} className="opacity-40" /> : <Hash size={24} className="opacity-40" />}
            <h3 className="font-bold text-white">{activeChannel?.name || 'general'}</h3>
          </div>
          <div className="flex items-center gap-4 text-[#b5bac1]">
            <div className="relative">
              <Bell 
                size={20} 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className={cn("cursor-pointer hover:text-white transition-colors", notifications.length > 0 ? "text-[#f23f43]" : "")} 
              />
              {notifications.length > 0 && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#f23f43] text-white text-[10px] font-bold rounded-full flex items-center justify-center pointer-events-none">
                  {notifications.length}
                </div>
              )}
              
              {isNotificationsOpen && (
                <div className="absolute top-full right-0 mt-8 w-80 bg-[#1e1f22] border border-black/20 rounded-lg shadow-2xl z-50 overflow-hidden text-[#dbdee1]">
                  <div className="p-3 border-b border-white/5 flex items-center justify-between bg-[#2b2d31]">
                    <span className="text-xs font-bold uppercase opacity-60">Notifications</span>
                    {notifications.length > 0 && (
                      <button 
                        onClick={() => user && chatService.markAllNotificationsAsRead(user.uid)}
                        className="text-[10px] text-[#00a8fc] hover:underline cursor-pointer"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center opacity-40 text-sm italic">No new notifications</div>
                    ) : (
                      notifications.map(n => (
                        <div 
                          key={n.id} 
                          onClick={() => {
                            if (n.id) chatService.markNotificationAsRead(n.id);
                            setSelectedServerId(n.serverId);
                            setSelectedChannelId(n.channelId);
                            setIsNotificationsOpen(false);
                          }}
                          className="p-3 hover:bg-white/[0.04] cursor-pointer transition-colors border-b border-white/5 last:border-0"
                        >
                          <p className="text-sm text-white mb-1">
                            <span className="font-bold">{n.fromUserName}</span> mentioned you
                          </p>
                          <p className="text-xs opacity-60 truncate">"{n.content}"</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <Search size={20} className="cursor-pointer hover:text-white" />
            <Users size={20} className={cn("cursor-pointer hover:text-white", isUserListOpen && "text-white")} onClick={() => setIsUserListOpen(!isUserListOpen)} />
            <Plus size={20} className="cursor-pointer hover:text-white" />
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0">
            {activeChannel?.type === 'voice' ? (
              <div className="flex-1 bg-[#2b2d31] p-8 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {/* Local Video */}
                  {isVideoEnabled && (
                    <div className="relative aspect-video bg-[#1e1f22] rounded-xl overflow-hidden flex items-center justify-center border-2 border-[#5865f2] shadow-2xl">
                      <video 
                        ref={(ref) => { if (ref && localStream) ref.srcObject = localStream; }}
                        autoPlay 
                        muted 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-sm text-white font-bold border border-white/10">
                        <div className="w-2 h-2 bg-[#23a559] rounded-full animate-pulse" />
                        <span>{profile?.displayName} (You)</span>
                      </div>
                    </div>
                  )}

                  {/* Remote Videos */}
                  {voiceStates.filter(vs => vs.channelId === activeChannel.id && vs.userId !== user?.uid).map(vs => {
                    const p = allUsers.find(u => u.uid === vs.userId);
                    const stream = remoteStreams[vs.userId];
                    
                    return (
                      <div key={vs.userId} className={cn(
                        "relative aspect-video bg-[#1e1f22] rounded-xl overflow-hidden flex items-center justify-center border-2 transition-all duration-300 group shadow-xl",
                        vs.isSpeaking ? "border-[#23a559]" : "border-white/5 hover:border-[#5865f2]"
                      )}>
                        {vs.video && stream ? (
                          <video 
                            ref={(ref) => { if (ref) ref.srcObject = stream; }}
                            autoPlay 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-4">
                            <img 
                              src={p?.photoURL || null} 
                              alt="" 
                              className={cn(
                                "w-24 h-24 rounded-full transition-all duration-500",
                                vs.isSpeaking ? "scale-110 ring-4 ring-[#23a559]" : "opacity-40 grayscale-[0.5]"
                              )} 
                            />
                            {vs.video && (
                              <div className="flex flex-col items-center gap-1">
                                <div className="text-xs text-white/40 font-medium animate-pulse">Establishing connection...</div>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-sm text-white font-bold border border-white/10">
                          {p?.displayName}
                          {vs.mute && <MicOff size={14} className="text-red-400" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
          <>
            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
            >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-40 text-center px-10">
              <div className="w-20 h-20 bg-[#3f4147] rounded-full flex items-center justify-center mb-4">
                <Hash size={40} />
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Welcome to #{activeChannel?.name || 'this channel'}!</h4>
              <p>This is the start of the #{activeChannel?.name || 'this channel'} channel.</p>
            </div>
          ) : (
            <>
              {hasMoreMessages && (
                <div className="flex justify-center py-4">
                  <button 
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="text-sm font-medium text-[#00a8fc] hover:underline flex items-center gap-2"
                  >
                    {isLoadingMore && <div className="w-3 h-3 border-2 border-[#00a8fc]/20 border-t-[#00a8fc] rounded-full animate-spin" />}
                    Load more messages
                  </button>
                </div>
              )}
              {messages.map((msg, index) => {
              const msgUser = allUsers.find(u => u.uid === msg.userId);
              const prevMsg = messages[index - 1];
              const isContinuation = prevMsg && prevMsg.userId === msg.userId && 
                (new Date(msg.timestamp?.toDate()).getTime() - new Date(prevMsg.timestamp?.toDate()).getTime() < 1000 * 60 * 5);

              if (isContinuation) {
                return (
                  <div key={msg.id} className="relative group pl-[52px] -mt-3 py-1 hover:bg-black/10 -mx-4 px-4 transition-colors">
                    <span className="absolute left-4 top-2 text-[10px] font-medium opacity-0 group-hover:opacity-40 text-center w-8">
                      {msg.timestamp ? format(msg.timestamp.toDate(), 'HH:mm') : ''}
                    </span>
                    <div className="flex-1 min-w-0">
                      {editingMessageId === msg.id ? (
                        <div className="mt-1">
                          <textarea
                            value={editInput}
                            onChange={(e) => setEditInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleEditMessage(msg.id);
                              } else if (e.key === 'Escape') {
                                setEditingMessageId(null);
                              }
                            }}
                            className="w-full bg-[#383a40] text-[#dbdee1] rounded-md p-2 outline-none focus:ring-1 focus:ring-[#00a8fc] resize-none"
                            autoFocus
                          />
                          <p className="text-[11px] text-[#dbdee1]/60 mt-1">
                            escape to <span className="text-[#00a8fc] cursor-pointer hover:underline" onClick={() => setEditingMessageId(null)}>cancel</span> • enter to <span className="text-[#00a8fc] cursor-pointer hover:underline" onClick={() => handleEditMessage(msg.id)}>save</span>
                          </p>
                        </div>
                      ) : (
                        <p className="text-[15px] text-[#dbdee1] leading-[1.375rem] break-words">
                          {renderMessageContent(msg.content)}
                          {msg.updatedAt && (
                            <span className="text-[10px] text-[#949ba4] ml-1">(edited)</span>
                          )}
                        </p>
                      )}

                      {/* Reactions */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Object.entries(msg.reactions).map(([emoji, userIdsValue]) => {
                            const userIds = userIdsValue as string[];
                            const hasReacted = userIds.includes(user.uid);
                            return (
                              <button
                                key={emoji}
                                onClick={() => handleToggleReaction(msg.id, emoji)}
                                className={cn(
                                  "flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border text-sm transition-colors",
                                  hasReacted 
                                    ? "bg-[#5865f2]/10 border-[#5865f2] text-[#00a8fc]" 
                                    : "bg-[#2b2d31] border-transparent hover:border-[#4e5058] text-[#dbdee1]"
                                )}
                                title={userIds.length === 1 ? "1 person reacted" : `${userIds.length} people reacted`}
                              >
                                <span>{emoji}</span>
                                <span className={cn("text-[11px] font-bold", hasReacted ? "text-[#00a8fc]" : "text-[#949ba4]")}>
                                  {userIds.length}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    
                    {/* Message Actions */}
                    <div className="absolute right-4 top-1 hidden group-hover:flex items-center gap-1 bg-[#2b2d31] border border-white/10 rounded overflow-hidden shadow-lg z-10">
                      <button 
                        onClick={() => setReactionMessageId(msg.id)}
                        className="p-1.5 hover:bg-white/10 text-[#dbdee1] transition-colors"
                        title="Add Reaction"
                      >
                        <Smile size={16} />
                      </button>
                      {(msg.userId === profile?.uid || profile?.email === 'njarvis9516@gmail.com') && (
                        <>
                          <button 
                            onClick={() => startEditing(msg)}
                            className="p-1.5 hover:bg-white/10 text-[#dbdee1] transition-colors"
                            title="Edit Message"
                          >
                            <Pencil size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="p-1.5 hover:bg-red-500/10 text-red-500 transition-colors"
                            title="Delete Message"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className="flex gap-4 group -mx-4 px-4 py-1 hover:bg-black/10 transition-colors relative">
                  <div className="relative flex-shrink-0 mt-1">
                    <img src={msg.userPhotoURL || null} alt={msg.userDisplayName} className="w-10 h-10 rounded-full cursor-pointer hover:shadow-lg transition-shadow" />
                    <StatusBadge status={msgUser?.status || 'offline'} className="absolute -bottom-0.5 -right-0.5 border-[#313338] w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white hover:underline cursor-pointer">{msg.userDisplayName}</span>
                      <span className="text-xs opacity-50 font-medium">
                        {msg.timestamp ? format(msg.timestamp.toDate(), 'MM/dd/yyyy HH:mm') : 'Sending...'}
                      </span>
                    </div>
                    {editingMessageId === msg.id ? (
                      <div className="mt-1">
                        <textarea
                          value={editInput}
                          onChange={(e) => setEditInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleEditMessage(msg.id);
                            } else if (e.key === 'Escape') {
                              setEditingMessageId(null);
                            }
                          }}
                          className="w-full bg-[#383a40] text-[#dbdee1] rounded-md p-2 outline-none focus:ring-1 focus:ring-[#00a8fc] resize-none"
                          autoFocus
                        />
                        <p className="text-[11px] text-[#dbdee1]/60 mt-1">
                          escape to <span className="text-[#00a8fc] cursor-pointer hover:underline" onClick={() => setEditingMessageId(null)}>cancel</span> • enter to <span className="text-[#00a8fc] cursor-pointer hover:underline" onClick={() => handleEditMessage(msg.id)}>save</span>
                        </p>
                      </div>
                    ) : (
                      <p className="text-[15px] text-[#dbdee1] leading-[1.375rem] break-words">
                        {renderMessageContent(msg.content)}
                        {msg.updatedAt && (
                          <span className="text-[10px] text-[#949ba4] ml-1">(edited)</span>
                        )}
                      </p>
                    )}

                    {/* Reactions */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(msg.reactions).map(([emoji, userIdsValue]) => {
                          const userIds = userIdsValue as string[];
                          const hasReacted = userIds.includes(user.uid);
                          return (
                            <button
                              key={emoji}
                              onClick={() => handleToggleReaction(msg.id, emoji)}
                              className={cn(
                                "flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border text-sm transition-colors",
                                hasReacted 
                                  ? "bg-[#5865f2]/10 border-[#5865f2] text-[#00a8fc]" 
                                  : "bg-[#2b2d31] border-transparent hover:border-[#4e5058] text-[#dbdee1]"
                              )}
                              title={userIds.length === 1 ? "1 person reacted" : `${userIds.length} people reacted`}
                            >
                              <span>{emoji}</span>
                              <span className={cn("text-[11px] font-bold", hasReacted ? "text-[#00a8fc]" : "text-[#949ba4]")}>
                                {userIds.length}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Message Actions */}
                  <div className="absolute right-4 top-2 hidden group-hover:flex items-center gap-1 bg-[#2b2d31] border border-white/10 rounded overflow-hidden shadow-lg z-10">
                    <button 
                      onClick={() => setReactionMessageId(msg.id)}
                      className="p-1.5 hover:bg-white/10 text-[#dbdee1] transition-colors"
                      title="Add Reaction"
                    >
                      <Smile size={16} />
                    </button>
                    {(msg.userId === profile?.uid || profile?.email === 'njarvis9516@gmail.com') && (
                      <>
                        <button 
                          onClick={() => startEditing(msg)}
                          className="p-1.5 hover:bg-white/10 text-[#dbdee1] transition-colors"
                          title="Edit Message"
                        >
                          <Pencil size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="p-1.5 hover:bg-red-500/10 text-red-500 transition-colors"
                          title="Delete Message"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

        {/* Chat Input */}
        <div className="px-4 pb-6 relative">
          {mentionSuggestions.length > 0 && (
            <div className="absolute bottom-full left-4 mb-2 bg-[#2b2d31] border border-black/20 rounded-lg shadow-2xl w-60 overflow-hidden z-50">
              <div className="px-3 py-2 border-b border-white/5 bg-[#1e1f22]">
                <span className="text-[10px] font-bold uppercase opacity-60">Mentions</span>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {mentionSuggestions.map(u => (
                  <div 
                    key={u.uid}
                    onClick={() => insertMention(u)}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] cursor-pointer transition-colors"
                  >
                    <img src={u.photoURL || null} alt="" className="w-5 h-5 rounded-full" />
                    <span className="text-sm font-medium">{u.displayName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <form 
            onSubmit={handleSendMessage}
            className="bg-[#383a40] rounded-lg px-4 py-3 flex items-center gap-4 transition-all focus-within:shadow-lg"
          >
            <div className="p-1 bg-[#404249] rounded-full cursor-pointer hover:bg-[#4d4f58] transition-colors">
              <Plus size={20} />
            </div>
            <textarea 
              ref={inputRef}
              value={messageInput}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                  // Reset height after sending
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                }
              }}
              placeholder={`Message #${activeChannel?.name || 'channel'}`}
              className="flex-1 bg-transparent border-none outline-none text-[#dbdee1] placeholder:text-[#949ba4] text-[15px] resize-none py-1 max-h-[200px] overflow-y-auto"
              rows={1}
            />
            <div className="flex items-center gap-3 opacity-60">
              <div className="relative" ref={emojiPickerRef}>
                <Smile 
                  size={22} 
                  className={cn("cursor-pointer hover:text-white transition-colors", isEmojiPickerOpen ? "text-white opacity-100" : "")} 
                  onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
                />
                <AnimatePresence>
                  {isEmojiPickerOpen && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="absolute bottom-full right-0 mb-4 z-50 shadow-2xl"
                    >
                      <EmojiPicker 
                        theme={Theme.DARK}
                        onEmojiClick={onEmojiClick}
                        autoFocusSearch={false}
                        width={350}
                        height={400}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <Send 
                size={22} 
                className={cn("cursor-pointer hover:text-white transition-colors", messageInput.trim() ? "text-[#5865f2] opacity-100" : "")} 
                onClick={handleSendMessage}
              />
            </div>
          </form>
        </div>
      </>
    )}
          </div>
        </div>
      </>
    )}
</div>

  {/* 4. Member Sidebar */}
  {view === 'chat' && (
    <AnimatePresence>
      {isUserListOpen && (
        <motion.div 
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 240, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          className="w-60 bg-[#2b2d31] border-l border-[#1e1f22] flex flex-col flex-shrink-0"
        >
          <div className="h-12 px-4 flex items-center border-b border-[#1e1f22] shadow-sm">
            <span className="text-xs font-bold uppercase opacity-60 tracking-wider">Members — {allUsers.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase opacity-60 px-2 mb-2">Users</h4>
              <div className="space-y-0.5">
                {allUsers.map((u) => (
                  <div key={u.uid} className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-white/[0.04] cursor-pointer group">
                    <div className="relative flex-shrink-0">
                      <img src={u.photoURL || null} alt={u.displayName} className="w-8 h-8 rounded-full" />
                      <StatusBadge status={u.status || 'offline'} className="absolute -bottom-0.5 -right-0.5 border-[#2b2d31]" />
                    </div>
                    <div className="flex-1 truncate">
                      <p className={cn("text-sm font-medium transition-colors", u.status === 'offline' ? "opacity-30" : "text-[#dbdee1] group-hover:text-white")}>
                        {u.displayName}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )}

  {/* Message Reaction Picker */}
  <AnimatePresence>
    {reactionMessageId && (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div 
          className="absolute inset-0 bg-black/40" 
          onClick={() => setReactionMessageId(null)}
        />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative z-10 shadow-2xl"
        >
          <EmojiPicker 
            theme={Theme.DARK}
            onEmojiClick={(data) => onReactionEmojiClick(data, reactionMessageId)}
            autoFocusSearch={true}
            width={350}
            height={400}
          />
        </motion.div>
      </div>
    )}
  </AnimatePresence>

  {/* Create Server Modal */}
  <AnimatePresence>
    {isCreatingServer && (
          <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#313338] w-full max-w-md rounded-lg overflow-hidden flex flex-col"
            >
              <div className="p-8 text-center">
                <h2 className="text-2xl font-bold text-white mb-2">Create a Server</h2>
                <p className="text-[#b5bac1] mb-6">Your server is where you and your friends hang out. Make yours and start talking.</p>
                
                <div className="flex flex-col items-center mb-6">
                  <div className="w-20 h-20 bg-[#1e1f22] rounded-full border-2 border-dashed border-[#5865f2] flex items-center justify-center overflow-hidden mb-2 group relative cursor-pointer">
                    {newServerIconURL ? (
                      <img src={newServerIconURL} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center opacity-60">
                        <Plus size={24} />
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-bold uppercase opacity-60 tracking-wider">Icon Preview</span>
                </div>

                <div className="space-y-4 text-left">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase opacity-60">Server Name</label>
                    <input 
                      autoFocus
                      value={newServerName}
                      onChange={(e) => setNewServerName(e.target.value)}
                      placeholder="My awesome server"
                      className="bg-[#1e1f22] p-3 rounded-md outline-none text-white focus:ring-2 ring-[#5865f2] transition-shadow"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase opacity-60">Description</label>
                    <textarea 
                      value={newServerDescription}
                      onChange={(e) => setNewServerDescription(e.target.value)}
                      placeholder="What is your server about?"
                      className="bg-[#1e1f22] p-3 rounded-md outline-none text-white focus:ring-2 ring-[#5865f2] transition-shadow h-20 resize-none text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase opacity-60">Icon URL (Optional)</label>
                    <input 
                      value={newServerIconURL}
                      onChange={(e) => setNewServerIconURL(e.target.value)}
                      placeholder="https://example.com/icon.png"
                      className="bg-[#1e1f22] p-3 rounded-md outline-none text-white focus:ring-2 ring-[#5865f2] transition-shadow"
                    />
                  </div>

                  <div 
                    onClick={() => setIsNewServerDiscoverable(!isNewServerDiscoverable)}
                    className="flex items-center justify-between p-3 bg-[#1e1f22] rounded-md cursor-pointer hover:bg-[#2b2d31] transition-colors"
                  >
                    <div>
                      <div className="text-sm font-bold text-white">Discoverable Server</div>
                      <div className="text-[10px] uppercase font-bold text-[#23a559] mt-0.5">Recommended</div>
                      <div className="text-xs opacity-60 mt-1">Allow anyone to find and join this server in Discovery.</div>
                    </div>
                    <div className={cn(
                      "w-10 h-6 rounded-full transition-colors relative flex items-center",
                      isNewServerDiscoverable ? "bg-[#23a559]" : "bg-white/10"
                    )}>
                      <div className={cn(
                        "w-4 h-4 bg-white rounded-full shadow-lg transition-transform",
                        isNewServerDiscoverable ? "translate-x-5" : "translate-x-1"
                      )} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-[#2b2d31] p-4 flex items-center justify-between">
                <button 
                  onClick={() => setIsCreatingServer(false)}
                  className="px-6 py-2.5 text-sm font-medium hover:underline"
                >
                  Back
                </button>
                <button 
                  onClick={handleCreateServer}
                  disabled={!newServerName.trim() || isCreatingServerLoading}
                  className="bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 disabled:hover:bg-[#5865f2] text-white px-8 py-2.5 rounded-md font-medium transition-colors flex items-center gap-2"
                >
                  {isCreatingServerLoading && <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                  {isCreatingServerLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Channel Modal */}
      <AnimatePresence>
        {isCreatingChannel && (
          <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#313338] w-full max-w-md rounded-lg overflow-hidden flex flex-col"
            >
              <div className="p-8">
                <h2 className="text-2xl font-bold text-white mb-2">Create Channel</h2>
                <p className="text-[#b5bac1] mb-6 text-sm">Create a place for your team to talk.</p>
                
                <div className="space-y-6">
                  <div className="flex flex-col gap-3">
                    <label className="text-xs font-bold uppercase opacity-60">Channel Type</label>
                    <div className="grid grid-cols-1 gap-2">
                       <div 
                        onClick={() => setNewChannelType('text')}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-md cursor-pointer bg-[#2b2d31] hover:bg-[#35373c] transition-colors border-2",
                          newChannelType === 'text' ? "border-[#5865f2]" : "border-transparent"
                        )}
                       >
                         <Hash size={24} className="opacity-60" />
                         <div className="flex flex-col">
                           <span className="font-bold text-white">Text</span>
                           <span className="text-xs opacity-60">Send messages, images, and links.</span>
                         </div>
                       </div>
                       <div 
                        onClick={() => setNewChannelType('voice')}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-md cursor-pointer bg-[#2b2d31] hover:bg-[#35373c] transition-colors border-2",
                          newChannelType === 'voice' ? "border-[#5865f2]" : "border-transparent"
                        )}
                       >
                         <Volume2 size={24} className="opacity-60" />
                         <div className="flex flex-col">
                           <span className="font-bold text-white">Voice</span>
                           <span className="text-xs opacity-60">Hang out with voice, video, and screen share.</span>
                         </div>
                       </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase opacity-60">Channel Name</label>
                    <div className="relative">
                      {newChannelType === 'text' ? <Hash size={18} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60" /> : <Volume2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />}
                      <input 
                        autoFocus
                        value={newChannelName}
                        onChange={(e) => {
                          const val = e.target.value.toLowerCase();
                          setNewChannelName(newChannelType === 'text' ? val.replace(/\s/g, '-') : val);
                        }}
                        placeholder="new-channel"
                        className="w-full bg-[#1e1f22] p-2.5 pl-10 rounded-md outline-none text-white focus:ring-2 ring-[#5865f2] transition-shadow text-[15px]"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-[#2b2d31] p-4 flex items-center justify-end gap-4">
                <button 
                  onClick={() => setIsCreatingChannel(false)}
                  className="px-4 py-2.5 text-sm font-medium hover:underline"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreateChannel}
                  disabled={!newChannelName.trim()}
                  className="bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 disabled:hover:bg-[#5865f2] text-white px-8 py-2.5 rounded-md font-medium transition-colors"
                >
                  Create Channel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Server Settings Modal */}
      <AnimatePresence>
        {isServerSettingsOpen && activeServer && (
          <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#313338] w-full max-w-md rounded-lg overflow-hidden flex flex-col"
            >
              <div className="p-8">
                <h2 className="text-2xl font-bold text-white mb-2">Server Settings</h2>
                <p className="text-[#b5bac1] mb-6 text-sm">Customize your server's look and feel.</p>
                
                <div className="flex flex-col items-center mb-6">
                  <div className="w-20 h-20 bg-[#1e1f22] rounded-full border-2 border-dashed border-[#5865f2] flex items-center justify-center overflow-hidden mb-2">
                    {editServerIconURL ? (
                      <img src={editServerIconURL} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-[#5865f2]">{editServerName[0]?.toUpperCase()}</span>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase opacity-60">Server Name</label>
                    <input 
                      value={editServerName}
                      onChange={(e) => setEditServerName(e.target.value)}
                      className="bg-[#1e1f22] p-3 rounded-md outline-none text-white focus:ring-2 ring-[#5865f2] transition-shadow"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase opacity-60">Description</label>
                    <textarea 
                      value={editServerDescription}
                      onChange={(e) => setEditServerDescription(e.target.value)}
                      placeholder="About this server..."
                      className="bg-[#1e1f22] p-3 rounded-md outline-none text-white focus:ring-2 ring-[#5865f2] transition-shadow h-20 resize-none text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase opacity-60">Icon URL</label>
                    <input 
                      value={editServerIconURL}
                      onChange={(e) => setEditServerIconURL(e.target.value)}
                      placeholder="https://example.com/icon.png"
                      className="bg-[#1e1f22] p-3 rounded-md outline-none text-white focus:ring-2 ring-[#5865f2] transition-shadow"
                    />
                  </div>

                  <div 
                    onClick={() => setIsEditServerDiscoverable(!isEditServerDiscoverable)}
                    className="flex items-center justify-between p-3 bg-[#1e1f22] rounded-md cursor-pointer hover:bg-[#2b2d31] transition-colors"
                  >
                    <div>
                      <div className="text-sm font-bold text-white">Discoverable Server</div>
                      <div className="text-xs opacity-60">Visible in the community Discovery tab.</div>
                    </div>
                    <div className={cn(
                      "w-10 h-6 rounded-full transition-colors relative flex items-center",
                      isEditServerDiscoverable ? "bg-[#23a559]" : "bg-white/10"
                    )}>
                      <div className={cn(
                        "w-4 h-4 bg-white rounded-full shadow-lg transition-transform",
                        isEditServerDiscoverable ? "translate-x-5" : "translate-x-1"
                      )} />
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5">
                  {!isDeletingServer ? (
                    <button 
                      onClick={() => setIsDeletingServer(true)}
                      className="w-full flex items-center justify-between p-3 rounded-md hover:bg-red-500/10 text-red-400 font-medium transition-colors border border-red-400/20"
                    >
                      <span>Delete Server</span>
                      <LogOut size={18} />
                    </button>
                  ) : (
                    <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 space-y-3">
                      <p className="text-sm font-medium text-red-400">Are you absolutely sure? This cannot be undone.</p>
                      <div className="flex gap-2">
                        <button 
                          onClick={handleDeleteServer}
                          className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-md font-bold transition-colors"
                        >
                          Yes, Delete Server
                        </button>
                        <button 
                          onClick={() => setIsDeletingServer(false)}
                          className="flex-1 bg-white/10 hover:bg-white/20 text-white py-2 rounded-md font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-[#2b2d31] p-4 flex items-center justify-end gap-4">
                <button 
                  onClick={() => {
                    setIsServerSettingsOpen(false);
                    setIsDeletingServer(false);
                  }}
                  className="px-4 py-2.5 text-sm font-medium hover:underline"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleUpdateServer}
                  disabled={!editServerName.trim()}
                  className="bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white px-8 py-2.5 rounded-md font-medium transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* User Settings Modal */}
      <AnimatePresence>
        {isUserSettingsOpen && profile && (
          <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#313338] w-full max-w-lg rounded-lg overflow-hidden flex flex-col shadow-2xl border border-white/5"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">User Profile</h2>
                    <p className="text-[#b5bac1] text-sm">Customize how you appear to others.</p>
                  </div>
                  <button 
                    onClick={() => setIsUserSettingsOpen(false)}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <Plus className="rotate-45" size={24} />
                  </button>
                </div>
                
                <div className="flex gap-8">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="relative group">
                      <div className="w-24 h-24 bg-[#1e1f22] rounded-full overflow-hidden border-4 border-[#2b2d31] shadow-xl mb-4 group-hover:opacity-80 transition-opacity">
                        <img src={editPhotoURL || null} alt="Avatar" className="w-full h-full object-cover" />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                        <span className="bg-black/60 px-2 py-1 rounded text-[10px] font-bold uppercase text-white shadow-lg">Change</span>
                      </div>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden bg-[#23a559] relative mb-2">
                       <StatusBadge status={profile.status} className="static border-0 w-full h-full" />
                    </div>
                  </div>

                  <div className="flex-1 space-y-5">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold uppercase opacity-60">Display Name</label>
                      <input 
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        placeholder="What should we call you?"
                        className="bg-[#1e1f22] p-3 rounded-md outline-none text-white focus:ring-2 ring-[#5865f2] transition-shadow w-full"
                      />
                    </div>
                    <div className="flex flex-col gap-2 relative">
                      <label className="text-xs font-bold uppercase opacity-60">Username (Unique)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40">@</span>
                        <input 
                          value={editUsername}
                          onChange={(e) => {
                             setEditUsername(e.target.value.toLowerCase().replace(/\s+/g, ''));
                             setUsernameError('');
                          }}
                          placeholder="unique_handle"
                          className={cn(
                            "bg-[#1e1f22] p-3 pl-8 rounded-md outline-none text-white focus:ring-2 transition-shadow w-full",
                            usernameError ? "ring-2 ring-red-500" : "ring-[#5865f2]"
                          )}
                        />
                      </div>
                      {usernameError && <p className="text-[10px] text-red-400 font-medium absolute -bottom-4">{usernameError}</p>}
                    </div>
                    <div className="flex flex-col gap-2 pt-2">
                      <label className="text-xs font-bold uppercase opacity-60">Avatar URL</label>
                      <input 
                        value={editPhotoURL}
                        onChange={(e) => setEditPhotoURL(e.target.value)}
                        placeholder="https://example.com/avatar.png"
                        className="bg-[#1e1f22] p-3 rounded-md outline-none text-white focus:ring-2 ring-[#5865f2] transition-shadow w-full"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold uppercase opacity-60">Custom Status Message</label>
                      <textarea 
                        value={editCustomStatus}
                        onChange={(e) => setEditCustomStatus(e.target.value.slice(0, 100))}
                        placeholder="What's on your mind?"
                        rows={2}
                        className="bg-[#1e1f22] p-3 rounded-md outline-none text-white focus:ring-2 ring-[#5865f2] transition-shadow w-full resize-none"
                      />
                      <p className="text-[10px] text-right opacity-40">{editCustomStatus.length}/100</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-[#2b2d31] p-4 flex items-center justify-between gap-4">
                <button 
                  onClick={() => setIsUserSettingsOpen(false)}
                  className="px-4 py-2.5 text-sm font-medium hover:underline text-[#b5bac1]"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleUpdateProfile}
                  disabled={isSavingProfile || !editDisplayName.trim() || !editUsername.trim()}
                  className="bg-[#23a559] hover:bg-[#1a8344] disabled:opacity-50 text-white px-8 py-2.5 rounded-md font-medium transition-all flex items-center gap-2"
                >
                  {isSavingProfile ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : 'Update Profile'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
