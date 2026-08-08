import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import Peer from 'peerjs';
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Users } from 'lucide-react';

const Room = () => {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const [peers, setPeers] = useState({});
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  
  const myVideoRef = useRef(null);
  const socketRef = useRef(null);
  const myPeerRef = useRef(null);
  const streamRef = useRef(null);
  
  const videoGridRef = useRef(null);

  useEffect(() => {
    // 1. Connect Socket
    socketRef.current = io('http://localhost:5001');
    
    // 2. Setup Peer
    myPeerRef.current = new Peer(undefined, {
      host: 'localhost',
      port: 5001,
      path: '/myapp'
    });

    // 3. Get Media Stream
    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    }).then(stream => {
      streamRef.current = stream;
      
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream;
      }
      
      // Answer incoming calls
      myPeerRef.current.on('call', call => {
        call.answer(stream);
        const video = document.createElement('video');
        call.on('stream', userVideoStream => {
          addVideoStream(video, userVideoStream, call.peer);
        });
      });

      socketRef.current.on('user-connected', userId => {
        connectToNewUser(userId, stream);
      });
      
    }).catch(err => {
      console.error("Failed to get local stream", err);
    });

    socketRef.current.on('user-disconnected', userId => {
      if (peers[userId]) {
        peers[userId].close();
      }
      const videoEl = document.getElementById(`video-${userId}`);
      if (videoEl) videoEl.remove();
    });

    myPeerRef.current.on('open', id => {
      socketRef.current.emit('join-room', roomId, id);
    });

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      socketRef.current.disconnect();
      myPeerRef.current.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const connectToNewUser = (userId, stream) => {
    const call = myPeerRef.current.call(userId, stream);
    const video = document.createElement('video');
    
    call.on('stream', userVideoStream => {
      addVideoStream(video, userVideoStream, userId);
    });
    
    call.on('close', () => {
      video.remove();
    });

    setPeers(prev => ({ ...prev, [userId]: call }));
  };

  const addVideoStream = (video, stream, userId) => {
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => {
      video.play();
    });
    
    const container = document.createElement('div');
    container.className = 'video-container';
    container.id = `video-${userId}`;
    
    const label = document.createElement('div');
    label.className = 'video-label';
    label.innerText = `Guest (${userId.slice(0,4)})`;
    
    container.append(video);
    container.append(label);
    
    if (videoGridRef.current) {
      // Prevent duplicate videos for same peer
      if (!document.getElementById(`video-${userId}`)) {
        videoGridRef.current.append(container);
      }
    }
  };

  const toggleMute = () => {
    const enabled = streamRef.current.getAudioTracks()[0].enabled;
    streamRef.current.getAudioTracks()[0].enabled = !enabled;
    setIsMuted(enabled);
  };

  const toggleVideo = () => {
    const enabled = streamRef.current.getVideoTracks()[0].enabled;
    streamRef.current.getVideoTracks()[0].enabled = !enabled;
    setIsVideoOff(enabled);
  };

  const leaveRoom = () => {
    navigate('/');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <div style={{ padding: '20px', background: 'var(--glass-bg)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%', boxShadow: '0 0 10px #10b981' }}></div>
          Room: {roomId}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
          <Users size={18} />
          <span style={{ fontWeight: '600' }}>Live</span>
        </div>
      </div>

      <div className="video-grid" ref={videoGridRef}>
        <div className="video-container" id="my-video-container">
          <video ref={myVideoRef} muted autoPlay playsInline></video>
          <div className="video-label">You</div>
        </div>
      </div>

      <div className="controls-bar glass-panel">
        <button className={`btn-icon ${isMuted ? 'muted' : ''}`} onClick={toggleMute}>
          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        <button className={`btn-icon ${isVideoOff ? 'muted' : ''}`} onClick={toggleVideo}>
          {isVideoOff ? <VideoOff size={24} /> : <VideoIcon size={24} />}
        </button>
        <div style={{ width: '1px', background: 'var(--glass-border)', margin: '0 8px' }}></div>
        <button className="btn-icon muted" style={{ background: 'var(--danger-hover)' }} onClick={leaveRoom}>
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
};

export default Room;
