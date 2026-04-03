import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useRoomStore } from '../store/roomStore';
import { getSocket } from '../hooks/useSocket';

export default function HomePage() {
  const [songs, setSongs] = useState([]);
  const [activeRooms, setActiveRooms] = useState([]); // 공개 방 목록
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const roomId = useRoomStore((s) => s.roomId);
  const navigate = useNavigate();

  useEffect(() => {
    if (roomId) {
      navigate('/room');
    }
  }, [roomId, navigate]);

  useEffect(() => {
    fetchSongs('');
    fetchActiveRooms();
    
    // 5초마다 방 목록을 새로 가져옵니다.
    const timer = setInterval(fetchActiveRooms, 5000);
    return () => clearInterval(timer);
  }, []);

  async function fetchSongs(q) {
    try {
      const data = await api.get(`/api/songs${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setSongs(data);
    } catch {}
  }

  async function fetchActiveRooms() {
    try {
      const data = await api.get('/api/rooms');
      setActiveRooms(data);
    } catch (err) {
      console.error("방 목록 로딩 실패", err);
    }
  }

  async function handleRandomMatch() {
    setError('');
    setLoading(true);
    const socket = getSocket();
    if (!socket) {
      setError('서버 연결 실패');
      setLoading(false);
      return;
    }
    socket.emit('room:match');
    setTimeout(() => {
      if (loading) setLoading(false);
    }, 5000);
  }

  const handleJoinByCode = (code) => {
    setError('');
    setLoading(true);
    getSocket()?.emit('room:join', { joinCode: code.toUpperCase() });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.userInfo}>🎤 {user?.nickname}님, 환영합니다!</span>
        <button onClick={logout} style={styles.logoutBtn}>로그아웃</button>
      </div>

      <div style={styles.mainButtons}>
        <button onClick={handleRandomMatch} style={styles.randomBtn} disabled={loading}>
          ⚡ 모르는 친구와 노래하기
        </button>
      </div>

      {/* 실시간 노래방 목록 섹션 */}
      <div style={styles.roomSection}>
        <h2 style={styles.sectionTitle}>지금 열려있는 노래방</h2>
        <div style={styles.scrollContainer}>
          {activeRooms.length === 0 ? (
            <div style={styles.emptyRooms}>현재 비어있는 노래방이 없습니다.</div>
          ) : (
            activeRooms.map((room) => (
              <div key={room.id} style={styles.roomCard}>
                <div style={styles.roomCardLeft}>
                  <div style={styles.hostName}>{room.hostName}님의 방</div>
                  <div style={styles.songInfo}>🎶 {room.currentSong}</div>
                </div>
                <div style={styles.roomCardRight}>
                  <div style={styles.countBadge}>{room.participantCount}명 대기 중</div>
                  <button 
                    onClick={() => handleJoinByCode(room.joinCode)} 
                    style={styles.cardJoinBtn}
                  >
                    입장하기
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>방 코드로 직접 들어가기</h2>
        <div style={styles.joinRow}>
          <input
            style={styles.input}
            placeholder="예: ABC12"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <button onClick={() => handleJoinByCode(joinCode)} style={styles.joinBtn}>입장</button>
        </div>
        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

const styles = {
  container: { maxWidth: 600, margin: '0 auto', padding: '24px 16px', color: '#fff', background: '#1a1a2e', minHeight: '100vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  userInfo: { fontSize: 24, fontWeight: 'bold' },
  logoutBtn: { background: 'transparent', border: '1px solid #aaa', color: '#aaa', padding: '8px 12px', borderRadius: 8, fontSize: 16 },
  
  mainButtons: { marginBottom: 40 },
  randomBtn: { 
    width: '100%', padding: '30px', borderRadius: 24, border: 'none', 
    background: 'linear-gradient(45deg, #e94560, #ff4b2b)', color: '#fff', 
    fontSize: 28, fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 8px 20px rgba(233, 69, 96, 0.4)' 
  },
  
  roomSection: { marginBottom: 40 },
  sectionTitle: { margin: '0 0 16px', fontSize: 22, fontWeight: 800, color: '#e94560' },
  scrollContainer: { 
    display: 'flex', flexDirection: 'column', gap: 15, 
    maxHeight: '400px', overflowY: 'auto', paddingRight: '5px' 
  },
  roomCard: { 
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
    padding: '25px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', 
    border: '1px solid rgba(255,255,255,0.1)' 
  },
  roomCardLeft: { display: 'flex', flexDirection: 'column', gap: 8 },
  hostName: { fontSize: 22, fontWeight: 'bold' },
  songInfo: { fontSize: 18, color: '#ffb3bd' },
  roomCardRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 },
  countBadge: { fontSize: 16, color: '#aaa' },
  cardJoinBtn: { 
    padding: '12px 24px', borderRadius: 12, border: 'none', 
    background: '#e94560', color: '#fff', fontSize: 18, fontWeight: 'bold' 
  },
  emptyRooms: { textAlign: 'center', padding: '40px', color: '#666', fontSize: 20 },

  section: { padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: 24 },
  joinRow: { display: 'flex', gap: 12 },
  input: { flex: 1, padding: '18px', borderRadius: 15, border: '1px solid #444', background: '#16213e', color: '#fff', fontSize: 20 },
  joinBtn: { padding: '0 30px', borderRadius: 15, border: 'none', background: '#e94560', color: '#fff', fontWeight: 'bold', fontSize: 20 },
  error: { color: '#ff6b6b', textAlign: 'center', marginTop: 12, fontSize: 18, fontWeight: 'bold' }
};