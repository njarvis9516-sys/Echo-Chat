import { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import { chatService } from '../services/chatService';
import { VoiceState } from '../types';

export function useWebRTC(
  currentUserUid: string | undefined,
  currentChannelId: string | undefined,
  voiceStates: VoiceState[],
  isVideoEnabled: boolean,
  isMuted: boolean
) {
  const [peers, setPeers] = useState<{ [uid: string]: Peer.Instance }>({});
  const [remoteStreams, setRemoteStreams] = useState<{ [uid: string]: MediaStream }>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const peersRef = useRef<{ [uid: string]: Peer.Instance }>({});
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize local stream
  useEffect(() => {
    if ((isVideoEnabled || isMuted !== undefined) && !streamRef.current && currentChannelId) {
      // In a real app, we might always want audio when in a voice channel
      // For this feature, we'll request it when video is enabled or if we want to support voice-only via RTC later
      if (isVideoEnabled) {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          .then(stream => {
            setLocalStream(stream);
            streamRef.current = stream;
            // Apply initial mute state
            stream.getAudioTracks().forEach(track => track.enabled = !isMuted);
          })
          .catch(err => {
            console.error('Failed to get local stream', err);
            // Try audio only as fallback
            navigator.mediaDevices.getUserMedia({ audio: true })
              .then(stream => {
                setLocalStream(stream);
                streamRef.current = stream;
                stream.getAudioTracks().forEach(track => track.enabled = !isMuted);
              })
              .catch(e => console.error('Even audio failed', e));
          });
      }
    } else if (!isVideoEnabled && streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      setLocalStream(null);
      streamRef.current = null;
      // Clean up peers when video is disabled
      Object.values(peersRef.current).forEach((peer: any) => {
        if (peer && typeof peer.destroy === 'function') peer.destroy();
      });
      peersRef.current = {};
      setPeers({});
      setRemoteStreams({});
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isVideoEnabled, currentChannelId]);

  // Handle Mute
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted]);

  // Handle Peer Connections
  useEffect(() => {
    if (!currentUserUid || !currentChannelId || !isVideoEnabled || !localStream) return;

    // Filter peers in the same channel who have video enabled
    const otherVideoPeers = voiceStates.filter(s => s.userId !== currentUserUid && s.channelId === currentChannelId && s.video);

    otherVideoPeers.forEach(peerState => {
      const peerUid = peerState.userId;
      
      // If we don't have a peer for them yet, we initiate (only if we joined AFTER them or based on lexicographical order to prevent double initiation)
      // Actually, simple-peer needs one "initiator" and one not.
      // We'll use UID comparison to decide who initiates.
      const shouldInitiate = currentUserUid > peerUid;

      if (!peersRef.current[peerUid]) {
        createPeer(peerUid, shouldInitiate, localStream);
      }
    });

    // Clean up peers who left or turned off video
    Object.keys(peersRef.current).forEach(uid => {
      if (!otherVideoPeers.find(p => p.userId === uid)) {
        const peer = peersRef.current[uid] as any;
        if (peer && typeof peer.destroy === 'function') peer.destroy();
        delete peersRef.current[uid];
        setPeers(prev => {
          const next = { ...prev };
          delete next[uid];
          return next;
        });
        setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[uid];
          return next;
        });
      }
    });

  }, [currentUserUid, currentChannelId, voiceStates, isVideoEnabled, localStream]);

  // Listen for incoming signals
  useEffect(() => {
    if (!currentUserUid || !currentChannelId || !isVideoEnabled || !localStream) return;

    const unsubscribe = chatService.listenToSignals(currentUserUid, currentChannelId, async (signals) => {
      for (const signalDoc of signals) {
        const { from, type, signal, id } = signalDoc;
        const parsedSignal = JSON.parse(signal);

        let peer = peersRef.current[from];
        
        if (!peer) {
          // If we receive an offer but don't have a peer yet, create as non-initiator
          peer = createPeer(from, false, localStream);
        }

        peer.signal(parsedSignal);
        await chatService.clearSignal(id);
      }
    });

    return () => unsubscribe();
  }, [currentUserUid, currentChannelId, isVideoEnabled, localStream]);

  function createPeer(targetUid: string, initiator: boolean, stream: MediaStream) {
    console.log(`Creating peer for ${targetUid}, initiator: ${initiator}`);
    const peer = new Peer({
      initiator,
      trickle: false,
      stream
    });

    peer.on('signal', signal => {
      let type: 'offer' | 'answer' | 'candidate' = 'offer';
      if (signal.type === 'offer') type = 'offer';
      else if (signal.type === 'answer') type = 'answer';
      else type = 'candidate';

      chatService.sendSignal(currentUserUid!, targetUid, currentChannelId!, type, signal);
    });

    peer.on('stream', stream => {
      setRemoteStreams(prev => ({ ...prev, [targetUid]: stream }));
    });

    peer.on('close', () => {
      console.log(`Peer ${targetUid} closed`);
    });

    peer.on('error', err => {
      console.error(`Peer ${targetUid} error`, err);
    });

    peersRef.current[targetUid] = peer;
    setPeers(prev => ({ ...prev, [targetUid]: peer }));

    return peer;
  }

  return { remoteStreams, localStream };
}
