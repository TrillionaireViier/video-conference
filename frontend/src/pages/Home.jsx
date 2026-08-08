import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Video, Plus, KeyRound } from 'lucide-react';

const Home = () => {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    const id = uuidv4();
    navigate(`/room/${id}`);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/room/${roomId}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '20px' }}>
      <div className="glass-panel" style={{ padding: '40px', maxWidth: '480px', width: '100%', textAlign: 'center' }}>
        <div style={{ background: 'rgba(59, 130, 246, 0.2)', width: '64px', height: '64px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto' }}>
          <Video size={32} color="var(--accent-color)" />
        </div>
        <h1 style={{ marginBottom: '12px', fontSize: '2rem' }}>Antigravity Meet</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Connect with anyone, anywhere, in stunning quality.</p>
        
        <button onClick={handleCreateRoom} className="btn btn-primary" style={{ width: '100%', marginBottom: '24px', padding: '16px' }}>
          <Plus size={20} /> New Meeting
        </button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '24px 0' }}>
          <div style={{ height: '1px', background: 'var(--glass-border)', flex: 1 }}></div>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>or join existing</span>
          <div style={{ height: '1px', background: 'var(--glass-border)', flex: 1 }}></div>
        </div>
        
        <form onSubmit={handleJoinRoom} style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <KeyRound size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              className="input-field" 
              placeholder="Enter Room Code" 
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              style={{ paddingLeft: '44px' }}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', boxShadow: 'none' }}>
            Join
          </button>
        </form>
      </div>
    </div>
  );
};

export default Home;
