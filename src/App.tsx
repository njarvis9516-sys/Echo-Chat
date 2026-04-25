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
  Bell
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from './hooks/useAuth';
import { signInWithGoogle, logOut } from './lib/firebase';
import { chatService } from './services/chatService';
import { Server, Channel, Message, UserProfile, VoiceState, Notification } from './types';
import { cn } from './lib/utils';

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
  const [messageInput, setMessageInput] = useState('');
  const [isCreatingServer, setIsCreatingServer] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newServerIconURL, setNewServerIconURL] = useState('');
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);
  const [editServerName, setEditServerName] = useState('');
  const [editServerIconURL, setEditServerIconURL] = useState('');
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [voiceStates, setVoiceStates] = useState<VoiceState[]>([]);
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<UserProfile[]>([]);
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  
  const [serverSearchQuery, setServerSearchQuery] = useState('');
  
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredServers = servers.filter(s => 
    s.name.toLowerCase().includes(serverSearchQuery.toLowerCase())
  );

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
      const unsub = chatService.listenToServers((data) => {
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
      const unsub = chatService.listenToMessages(selectedChannelId, setMessages);
      return unsub;
    }
  }, [selectedChannelId]);

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

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const activeServer = servers.find(s => s.id === selectedServerId);
  const activeChannel = channels.find(c => c.id === selectedChannelId);

  useEffect(() => {
    if (activeServer && isServerSettingsOpen) {
      setEditServerName(activeServer.name);
      setEditServerIconURL(activeServer.iconURL || '');
    }
  }, [isServerSettingsOpen, activeServer]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setMessageInput(value);

    const cursorPosition = e.target.selectionStart || 0;
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
    if (!newServerName.trim() || !user) return;
    await chatService.createServer(newServerName, user.uid, newServerIconURL.trim() || undefined);
    setNewServerName('');
    setNewServerIconURL('');
    setIsCreatingServer(false);
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

  const handleUpdateServer = async () => {
    if (!selectedServerId || !editServerName.trim()) return;
    await chatService.updateServer(selectedServerId, {
      name: editServerName,
      iconURL: editServerIconURL.trim() || undefined
    });
    setIsServerSettingsOpen(false);
  };

  const handleDeleteServer = async () => {
    if (!selectedServerId) return;
    if (confirm('Are you sure you want to delete this server? This action is permanent.')) {
      await chatService.deleteServer(selectedServerId);
      setSelectedServerId(servers.find(s => s.id !== selectedServerId)?.id || null);
      setIsServerSettingsOpen(false);
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
        return;
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
          onClick={() => setSelectedServerId('')}
          className="w-12 h-12 bg-[#313338] rounded-[24px] hover:rounded-[16px] hover:bg-[#5865f2] hover:text-white transition-all flex items-center justify-center cursor-pointer mb-2 group relative"
        >
          <div className="absolute -left-1 w-1 h-2 bg-white rounded-r-full hidden group-hover:block" />
          <ServerIcon size={24} />
        </div>
        <div className="w-8 h-[2px] bg-[#35363c] mb-2" />
        
        {filteredServers.map((server) => (
          <div 
            key={server.id}
            onClick={() => setSelectedServerId(server.id)}
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
          className="w-12 h-12 bg-[#313338] rounded-[24px] hover:rounded-[16px] hover:bg-[#23a559] hover:text-white transition-all flex items-center justify-center cursor-pointer"
        >
          <Plus size={24} />
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
                              <img src={participantProfile?.photoURL} alt="" className="w-5 h-5 rounded-full" />
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
            <img src={profile?.photoURL} alt="User" className="w-10 h-10 rounded-full" />
            <StatusBadge status={profile?.status || 'offline'} className="absolute -bottom-0.5 -right-0.5 border-[#232428]" />
          </div>
          <div className="flex-1 truncate">
            <p className="text-sm font-bold text-white leading-tight truncate">{profile?.displayName}</p>
            <p className="text-xs opacity-60 leading-tight capitalize">{profile?.status || 'online'}</p>
          </div>
          <div className="flex items-center gap-1">
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
            <div className="p-1.5 hover:bg-white/10 rounded-md cursor-pointer transition-colors" title="Settings">
              <Settings size={18} />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Chat/Voice Area */}
      <div className="flex-1 flex flex-col bg-[#313338]">
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
            <Users size={20} className="cursor-pointer hover:text-white" />
            <Plus size={20} className="cursor-pointer hover:text-white" />
          </div>
        </div>

        {activeChannel?.type === 'voice' ? (
          <div className="flex-1 bg-[#2b2d31] p-8 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {voiceStates.filter(vs => vs.channelId === activeChannel.id).map(vs => {
                const p = allUsers.find(u => u.uid === vs.userId);
                return (
                  <div key={vs.userId} className="relative aspect-video bg-[#1e1f22] rounded-lg overflow-hidden flex items-center justify-center group border-2 border-transparent hover:border-[#5865f2] transition-colors shadow-xl">
                    <img src={p?.photoURL} alt="" className={cn("w-20 h-20 rounded-full transition-all duration-300", vs.isSpeaking ? "ring-4 ring-[#23a559]" : "opacity-60")} />
                    <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/40 px-2 py-1 rounded text-sm text-white">
                      <span>{p?.displayName}</span>
                      {vs.mute && <MicOff size={14} className="text-red-400" />}
                      {vs.deaf && <Headphones size={14} className="text-red-400" />}
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
            messages.map((msg, index) => {
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
                    <p className="text-[15px] text-[#dbdee1] leading-[1.375rem] break-words">
                      {renderMessageContent(msg.content)}
                    </p>
                  </div>
                );
              }

              return (
                <div key={msg.id} className="flex gap-4 group -mx-4 px-4 py-1 hover:bg-black/10 transition-colors">
                  <div className="relative flex-shrink-0 mt-1">
                    <img src={msg.userPhotoURL} alt={msg.userDisplayName} className="w-10 h-10 rounded-full cursor-pointer hover:shadow-lg transition-shadow" />
                    <StatusBadge status={msgUser?.status || 'offline'} className="absolute -bottom-0.5 -right-0.5 border-[#313338] w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white hover:underline cursor-pointer">{msg.userDisplayName}</span>
                      <span className="text-xs opacity-50 font-medium">
                        {msg.timestamp ? format(msg.timestamp.toDate(), 'MM/dd/yyyy HH:mm') : 'Sending...'}
                      </span>
                    </div>
                    <p className="text-[15px] text-[#dbdee1] leading-[1.375rem] break-words">
                      {renderMessageContent(msg.content)}
                    </p>
                  </div>
                </div>
              );
            })
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
                    <img src={u.photoURL} alt="" className="w-5 h-5 rounded-full" />
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
            <input 
              value={messageInput}
              onChange={handleInputChange}
              placeholder={`Message #${activeChannel?.name || 'channel'}`}
              className="flex-1 bg-transparent border-none outline-none text-[#dbdee1] placeholder:text-[#949ba4] text-[15px]"
            />
            <div className="flex items-center gap-3 opacity-60">
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

      {/* 4. Member Sidebar */}
      <div className="w-60 bg-[#2b2d31] border-l border-[#1e1f22] flex flex-col flex-shrink-0 hidden xl:flex">
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
                     <img src={u.photoURL} alt={u.displayName} className="w-8 h-8 rounded-full" />
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
      </div>

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
                    <label className="text-xs font-bold uppercase opacity-60">Icon URL (Optional)</label>
                    <input 
                      value={newServerIconURL}
                      onChange={(e) => setNewServerIconURL(e.target.value)}
                      placeholder="https://example.com/icon.png"
                      className="bg-[#1e1f22] p-3 rounded-md outline-none text-white focus:ring-2 ring-[#5865f2] transition-shadow"
                    />
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
                  disabled={!newServerName.trim()}
                  className="bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 disabled:hover:bg-[#5865f2] text-white px-8 py-2.5 rounded-md font-medium transition-colors"
                >
                  Create
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
                    <label className="text-xs font-bold uppercase opacity-60">Icon URL</label>
                    <input 
                      value={editServerIconURL}
                      onChange={(e) => setEditServerIconURL(e.target.value)}
                      placeholder="https://example.com/icon.png"
                      className="bg-[#1e1f22] p-3 rounded-md outline-none text-white focus:ring-2 ring-[#5865f2] transition-shadow"
                    />
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5">
                  <button 
                    onClick={handleDeleteServer}
                    className="w-full flex items-center justify-between p-3 rounded-md hover:bg-red-500/10 text-red-400 font-medium transition-colors border border-red-400/20"
                  >
                    <span>Delete Server</span>
                    <LogOut size={18} />
                  </button>
                </div>
              </div>
              <div className="bg-[#2b2d31] p-4 flex items-center justify-end gap-4">
                <button 
                  onClick={() => setIsServerSettingsOpen(false)}
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
    </div>
  );
}
