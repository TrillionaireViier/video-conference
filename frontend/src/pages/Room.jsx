import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import Peer from 'peerjs';
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Users, AlertCircle } from 'lucide-react';

const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL;

const Room = () => {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const [peers, setPeers] = useState({});
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const myVideoRef = useRef(null);
  const socketRef = useRef(null);
  const myPeerRef = useRef(null);
  const streamRef = useRef(null);
  const videoGridRef = useRef(null);
  const callsRef = useRef({});
  const pendingPeersRef = useRef(new Set());
  const joinedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!SIGNALING_SERVER_URL) {
      setConnectionError('Видеосервер не настроен. Укажите VITE_SIGNALING_SERVER_URL в настройках деплоя фронтенда.');
      return undefined;
    }

    const serverUrl = SIGNALING_SERVER_URL.replace(/\/$/, '');
    const socket = io(serverUrl, { transports: ['websocket', 'polling'], reconnection: true });
    socketRef.current = socket;
    const peer = new Peer(undefined, {
      host: new URL(serverUrl).hostname,
      secure: new URL(serverUrl).protocol === 'https:',
      port: new URL(serverUrl).port || (new URL(serverUrl).protocol === 'https:' ? 443 : 80),
      path: '/peerjs',
    });
    myPeerRef.current = peer;

    const addVideoStream = (video, stream, peerId) => {
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.onloadedmetadata = () => video.play().catch(() => {});
      const container = document.createElement('div');
      container.className = 'video-container';
      container.id = `video-${peerId}`;
      const label = document.createElement('div');
      label.className = 'video-label';
      label.innerText = `Guest (${peerId.slice(0, 4)})`;
      container.append(video, label);
      if (videoGridRef.current && !document.getElementById(container.id)) videoGridRef.current.append(container);
    };

    const connectToPeer = (peerId) => {
      if (!peerId || peerId === peer.id || callsRef.current[peerId]) return;
      const stream = streamRef.current;
      if (!stream || !peer.open) {
        pendingPeersRef.current.add(peerId);
        return;
      }
      const call = peer.call(peerId, stream);
      if (!call) return;
      callsRef.current[peerId] = call;
      setPeers(current => ({ ...current, [peerId]: call }));
      call.on('stream', remoteStream => addVideoStream(document.createElement('video'), remoteStream, peerId));
      call.on('close', () => {
        document.getElementById(`video-${peerId}`)?.remove();
        delete callsRef.current[peerId];
        setPeers(current => { const next = { ...current }; delete next[peerId]; return next; });
      });
      call.on('error', error => console.error('Peer call failed:', error));
    };

    const flushPendingPeers = () => {
      pendingPeersRef.current.forEach(connectToPeer);
      pendingPeersRef.current.clear();
    };

    const maybeJoinRoom = () => {
      if (joinedRef.current || !socket.connected || !peer.id || !streamRef.current) return;
      joinedRef.current = true;
      socket.emit('join-room', roomId, peer.id);
    };

    socket.on('connect', () => { setConnectionError(''); maybeJoinRoom(); });
    socket.on('connect_error', error => setConnectionError(`Не удалось подключиться к видеосерверу: ${error.message}`));
    socket.on('room-error', message => setConnectionError(message));
    socket.on('existing-users', userIds => userIds.forEach(connectToPeer));
    socket.on('user-connected', connectToPeer);
    socket.on('user-disconnected', peerId => {
      callsRef.current[peerId]?.close();
      document.getElementById(`video-${peerId}`)?.remove();
      delete callsRef.current[peerId];
      setPeers(current => { const next = { ...current }; delete next[peerId]; return next; });
    });

    peer.on('open', () => { maybeJoinRoom(); flushPendingPeers(); });
    peer.on('error', error => setConnectionError(`Не удалось подключиться к WebRTC-серверу: ${error.message}`));

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        if (myVideoRef.current) myVideoRef.current.srcObject = stream;
        peer.on('call', call => {
          call.answer(stream);
          const video = document.createElement('video');
          callsRef.current[call.peer] = call;
          setPeers(current => ({ ...current, [call.peer]: call }));
          call.on('stream', remoteStream => addVideoStream(video, remoteStream, call.peer));
          call.on('close', () => {
            document.getElementById(`video-${call.peer}`)?.remove();
            delete callsRef.current[call.peer];
            setPeers(current => { const next = { ...current }; delete next[call.peer]; return next; });
          });
        });
        maybeJoinRoom();
        flushPendingPeers();
      })
      .catch(error => {
        if (!cancelled) setConnectionError(`Не удалось получить доступ к камере/микрофону: ${error.message}`);
      });

    return () => {
      cancelled = true;
      joinedRef.current = false;
      Object.values(callsRef.current).forEach(call => call.close());
      callsRef.current = {};
      streamRef.current?.getTracks().forEach(track => track.stop());
      socket.disconnect();
      peer.destroy();
    };
  }, [roomId]);

  const toggleMute = () => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
  };

  const toggleVideo = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsVideoOff(!track.enabled);
  };

  const leaveRoom = () => navigate('/');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <div style={{ padding: '20px', background: 'var(--glass-bg)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', background: connectionError ? '#ef4444' : '#10b981', borderRadius: '50%' }} /> Room: {roomId}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
          <Users size={18} /><span style={{ fontWeight: '600' }}>{Object.keys(peers).length + 1} participants</span>
        </div>
      </div>
      {connectionError && <div role="alert" style={{ padding: '12px 20px', background: '#fee2e2', color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={18} />{connectionError}</div>}
      <div className="video-grid" ref={videoGridRef}>
        <div className="video-container" id="my-video-container"><video ref={myVideoRef} muted autoPlay playsInline /><div className="video-label">You</div></div>
      </div>
      <div className="controls-bar glass-panel">
        <button className={`btn-icon ${isMuted ? 'muted' : ''}`} onClick={toggleMute}>{isMuted ? <MicOff size={24} /> : <Mic size={24} />}</button>
        <button className={`btn-icon ${isVideoOff ? 'muted' : ''}`} onClick={toggleVideo}>{isVideoOff ? <VideoOff size={24} /> : <VideoIcon size={24} />}</button>
        <div style={{ width: '1px', background: 'var(--glass-border)', margin: '0 8px' }} />
        <button className="btn-icon muted" style={{ background: 'var(--danger-hover)' }} onClick={leaveRoom}><PhoneOff size={24} /></button>
      </div>
    </div>
  );
};

export default Room;
