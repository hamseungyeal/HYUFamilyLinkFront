import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useRoomStore } from '../store/roomStore';
import { getSocket } from '../hooks/useSocket';

export default function HomePage() {
  const [songs, setSongs] = useState([]);
  const [activeRooms, setActiveRooms] = useState([]); 
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showFriendManager, setShowFriendManager] = useState(false);

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const roomId = useRoomStore((s) => s.roomId);
  const navigate = useNavigate();

  // [수정] 1. 스토어의 roomId가 변경되면 즉시 방으로 이동
  useEffect(() => {
    if (roomId) {
      navigate('/room');
    }
  }, [roomId, navigate]);

  // [추가] 2. 서버에서 오는 방 상태(입장 성공) 리스너 등록
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // 서버가 방 입장을 승인하고 방 정보를 보낼 때 스토어를 업데이트합니다.
    const onRoomState = (data) => {
      if (data.roomId) {
        useRoomStore.setState({
          roomId: data.roomId,
          joinCode: data.joinCode,
          participants: data.participants,
          currentSong: data.currentSong || null
        });
      }
    };

    socket.on('room:state', onRoomState);
    
    return () => {
      socket.off('room:state', onRoomState);
    };
  }, []);

  useEffect(() => {
    fetchSongs('');
    fetchActiveRooms();
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

  const handleRandomMatch = () => {
    setError('');
    setLoading(true);
    getSocket()?.emit('room:match');
    // 로딩이 너무 길어지면 수동으로 해제
    setTimeout(() => setLoading(false), 5000);
  };

  const handleJoinByCode = (code) => {
    if (!code) return;
    setError('');
    setLoading(true);
    // [보강] 서버 응답(ack)을 처리하여 에러 발생 시 로딩 해제
    getSocket()?.emit('room:join', { joinCode: code.toUpperCase() }, (res) => {
      if (res?.error) {
        setError(res.error);
        setLoading(false);
      }
    });
  };

  const handleCreateRoom = () => {
    setError('');
    setLoading(true);
    getSocket()?.emit('room:create');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.userInfo}>🎤 {user?.nickname || '손님'}님, 환영합니다!</span>
        <button onClick={logout} style={styles.logoutBtn}>로그아웃</button>
      </div>

      <div style={styles.mainButtons}>
        <button onClick={handleRandomMatch} style={styles.randomBtn} disabled={loading}>
          ⚡ {loading ? '매칭 중...' : '모르는 친구와 노래하기'}
        </button>
        <button onClick={() => setShowFriendManager(!showFriendManager)} style={styles.friendSingBtn}>
          👥 아는 친구와 노래하기
        </button>
        <button onClick={() => setShowFriendManager(!showFriendManager)} style={styles.manageBtn}>
          {showFriendManager ? '✕ 관리창 닫기' : '⚙️ 친구 관리 및 찾기'}
        </button>
      </div>

      {showFriendManager && (
        <div style={styles.friendPanel}>
          <h3 style={{margin: '0 0 10px', color: '#e94560'}}>내 친구 목록</h3>
          <p style={{color: '#aaa', fontSize: 18}}>현재 접속 중인 친구가 없습니다.</p>
        </div>
      )}

      <div style={styles.roomSection}>
        <h2 style={styles.sectionTitle}>지금 열려있는 노래방</h2>
        <div style={styles.scrollContainer}>
          {activeRooms.length === 0 ? (
            <div style={styles.emptyRooms}>현재 비어있는 노래방이 없습니다.</div>
          ) : (
            activeRooms.map((room) => (
              <div key={room.id} style={styles.roomCard} onClick={() => handleJoinByCode(room.joinCode)}>
                <div style={styles.roomCardLeft}>
                  <div style={styles.hostName}>{room.hostName}님의 방</div>
                  <div style={styles.songInfo}>🎶 {room.currentSong}</div>
                </div>
                <div style={styles.roomCardRight}>
                  <div style={styles.countBadge}>{room.participantCount}명 대기 중</div>
                  <div style={styles.enterTag}>입장하기 ▶</div>
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
          <button onClick={() => handleJoinByCode(joinCode)} style={styles.joinBtn} disabled={loading}>입장</button>
        </div>
        {error && <p style={styles.error}>{error}</p>}
        <button onClick={handleCreateRoom} style={styles.createBtn} disabled={loading}>
          🏠 새 노래방 직접 만들기
        </button>
      </div>
    </div>
  );
}

// ... styles 객체는 기존과 동일
const styles = {
  container: { maxWidth: 600, margin: '0 auto', padding: '24px 16px', color: '#fff', background: '#1a1a2e', minHeight: '100vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  userInfo: { fontSize: 24, fontWeight: 'bold' },
  logoutBtn: { background: 'transparent', border: '1px solid #aaa', color: '#aaa', padding: '8px 12px', borderRadius: 8 },
  mainButtons: { display: 'flex', flexDirection: 'column', gap: 15, marginBottom: 40 },
  randomBtn: { 
    padding: '30px', borderRadius: 24, border: 'none', 
    background: 'linear-gradient(45deg, #e94560, #ff4b2b)', color: '#fff', 
    fontSize: 28, fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 8px 20px rgba(233, 69, 96, 0.4)' 
  },
  friendSingBtn: { 
    padding: '20px', borderRadius: 20, border: '2px solid #e94560', 
    background: 'transparent', color: '#e94560', fontSize: 22, fontWeight: 'bold', cursor: 'pointer'
  },
  manageBtn: { background: 'transparent', border: 'none', color: '#aaa', fontSize: 18, textDecoration: 'underline', cursor: 'pointer' },
  friendPanel: { padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: 24, marginBottom: 25, textAlign: 'center' },
  roomSection: { marginBottom: 40 },
  sectionTitle: { margin: '0 0 16px', fontSize: 22, fontWeight: 800, color: '#e94560' },
  scrollContainer: { display: 'flex', flexDirection: 'column', gap: 15, maxHeight: '400px', overflowY: 'auto' },
  roomCard: { 
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
    padding: '25px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' 
  },
  roomCardLeft: { display: 'flex', flexDirection: 'column', gap: 8 },
  hostName: { fontSize: 22, fontWeight: 'bold' },
  songInfo: { fontSize: 18, color: '#ffb3bd' },
  roomCardRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 },
  countBadge: { fontSize: 16, color: '#aaa' },
  enterTag: { fontSize: 18, fontWeight: 'bold', color: '#e94560' },
  emptyRooms: { textAlign: 'center', padding: '40px', color: '#666', fontSize: 20 },
  section: { padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: 24 },
  joinRow: { display: 'flex', gap: 12, marginBottom: 15 },
  input: { flex: 1, padding: '18px', borderRadius: 15, border: '1px solid #444', background: '#16213e', color: '#fff', fontSize: 20 },
  joinBtn: { padding: '0 30px', borderRadius: 15, border: 'none', background: '#e94560', color: '#fff', fontWeight: 'bold', fontSize: 20 },
  createBtn: { width: '100%', padding: '15px', borderRadius: 15, border: '1px dashed #666', background: 'transparent', color: '#aaa', fontSize: 18, cursor: 'pointer' },
  error: { color: '#ff6b6b', textAlign: 'center', marginTop: 12, fontSize: 18, fontWeight: 'bold' }
};