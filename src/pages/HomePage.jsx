import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useRoomStore } from '../store/roomStore';
import { getSocket } from '../hooks/useSocket';

export default function HomePage() {
  const [activeRooms, setActiveRooms] = useState([]); 
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showFriendManager, setShowFriendManager] = useState(false);

  const navigate = useNavigate();
  
  // 전역 Store 데이터 구독
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const friends = useAuthStore((s) => s.friends); 
  const friendStatuses = useAuthStore((s) => s.friendStatuses); 
  const refreshFriends = useAuthStore((s) => s.refreshFriends); 

  const roomId = useRoomStore((s) => s.roomId);

  // --- [디버깅 로그] 렌더링 시마다 데이터 상태 확인 ---
  console.group('🏠 HomePage Render Check');
  console.log('현재 로그인 유저:', user?.id, user?.nickname);
  console.log('Store 친구 명단(Array):', friends);
  console.log('Store 친구 상태(Object):', friendStatuses);
  console.groupEnd();

  // 1. 방 입장 감지
  useEffect(() => {
    if (roomId) navigate('/room');
  }, [roomId, navigate]);

  const fetchActiveRooms = useCallback(async () => {
    try {
      const res = await api.get('/api/rooms');
      const data = res.data ? res.data : res;
      setActiveRooms(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("방 목록 로딩 실패", err);
    }
  }, []);

  // [수정] 2. 소켓 리스너 전용 (소켓이 없을 땐 이것만 일찍 종료됨)
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onRoomState = (data) => {
      setLoading(false);
      if (data.roomId) {
        useRoomStore.setState({
          roomId: data.roomId,
          joinCode: data.joinCode,
          participants: data.participants,
          currentSong: data.currentSong || null
        });
      }
    };

    const onFriendUpdate = () => {
      console.log('🔔 실시간 친구 업데이트 수신');
      refreshFriends();
    };

    const onRoomsUpdated = (data) => setActiveRooms(data || []);

    const onSocketError = (msg) => {
      setLoading(false);
      setError(typeof msg === 'string' ? msg : '서버 오류가 발생했습니다.');
    };

    socket.on('room:state', onRoomState);
    socket.on('friend:update', onFriendUpdate);
    socket.on('rooms:updated', onRoomsUpdated);
    socket.on('error', onSocketError);
    
    return () => {
      socket.off('room:state', onRoomState);
      socket.off('friend:update', onFriendUpdate);
      socket.off('rooms:updated', onRoomsUpdated);
      socket.off('error', onSocketError);
    };
  }, [refreshFriends]);

  // [수정] 3. 데이터 로드 & 5초 갱신 전용 (소켓 유무와 관계없이 독립적으로 무조건 실행)
  useEffect(() => {
    console.log('🚀 초기 데이터 로드 시작');
    fetchActiveRooms();
    refreshFriends().then(() => console.log('✅ refreshFriends 완료'));

    const timer = setInterval(fetchActiveRooms, 5000);
    return () => clearInterval(timer);
  }, [fetchActiveRooms, refreshFriends]);

  const handleRandomMatch = () => {
    setError('');
    setLoading(true);
    getSocket()?.emit('room:match');
    setTimeout(() => setLoading(false), 5000); 
  };

  const handleJoinByCode = (code) => {
    if (!code) return;
    setError('');
    setLoading(true);
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
    
    // [수정됨] 빈 페이로드({})와 응답을 처리할 콜백 함수(res)를 추가
    getSocket()?.emit('room:create', {}, (res) => {
      // 1. 서버에서 에러를 반환한 경우
      if (res?.error) {
        setError(res.error);
        setLoading(false);
      } 
      // 2. 서버가 방 정보를 직접 콜백으로 돌려준 경우 즉시 스토어 업데이트 및 이동
      else if (res?.roomId) {
        useRoomStore.setState({
          roomId: res.roomId,
          joinCode: res.joinCode,
          participants: res.participants || [],
          currentSong: res.currentSong || null
        });
        setLoading(false);
      }
    });

    // [수정됨] 혹시라도 서버가 무응답일 경우 무한 로딩에 빠지지 않도록 5초 후 리셋
    setTimeout(() => setLoading(false), 5000);
  };

  // --- 친구 관리 핸들러 (기존 기능 그대로 포함) ---
  const handleFriendAccept = (targetId) => {
    console.log('🤝 친구 요청 수락 시도:', targetId);
    getSocket()?.emit('friend:accept', { targetId });
  };

  const handleFriendRemove = (targetId, isReject = false) => {
    const confirmMsg = isReject ? "친구 요청을 거절하시겠습니까?" : "정말 이 친구를 삭제하시겠습니까?";
    if (window.confirm(confirmMsg)) {
      console.log('🗑️ 친구 삭제/거절 시도:', targetId);
      getSocket()?.emit('friend:remove', { targetId });
    }
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
        {/* 버튼 스타일 변경 반영됨 */}
        <button onClick={() => setShowFriendManager(!showFriendManager)} style={styles.manageBtn}>
          {showFriendManager ? '✕ 관리창 닫기' : '⚙️ 친구 관리 및 찾기'}
        </button>
      </div>

      {showFriendManager && (
        <div style={styles.friendPanel}>
          <h3 style={styles.panelTitle}>내 친구 관리</h3>
          <div style={styles.friendList}>
            
            {/* 1. 받은 요청 목록 (닉네임 표시 및 거절 버튼) */}
            {Object.entries(friendStatuses).filter(([_, data]) => (data.status || data) === 'received').map(([id, data]) => (
              <div key={id} style={styles.friendItem}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{color: '#f9d423', fontWeight: 'bold'}}>🔔 새로운 친구 요청</span>
                  <span style={{fontSize: 15, marginTop: 4}}>{data.nickname ? `${data.nickname}님` : `ID: ${id.slice(0, 5)}...`}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleFriendAccept(id)} style={styles.acceptBtn}>수락</button>
                  <button onClick={() => handleFriendRemove(id, true)} style={styles.denyBtn}>거절</button>
                </div>
              </div>
            ))}
            
            {/* 2. 친구 명단 및 요청 중 상태 표시 */}
            {friends.length === 0 && 
             !Object.values(friendStatuses).some(data => (data.status || data) === 'received' || (data.status || data) === 'sent') ? (
              <p style={{color: '#aaa', fontSize: 18}}>현재 등록된 친구가 없습니다.</p>
            ) : (
              <>
                {/* 확정된 친구 (삭제 버튼 포함) */}
                {friends.map(friend => (
                  <div key={friend.id} style={styles.friendItem}>
                    <div>
                      <span style={{fontSize: 18, fontWeight: 'bold'}}>{friend.nickname}</span>
                      <span style={{color: '#aaa', fontSize: 14, marginLeft: '8px'}}>✓ 내 친구</span>
                    </div>
                    <button onClick={() => handleFriendRemove(friend.id, false)} style={styles.deleteBtn}>삭제</button>
                  </div>
                ))}

                {/* 3. 보낸 요청 표시 */}
                {Object.entries(friendStatuses).filter(([_, data]) => (data.status || data) === 'sent').map(([id, data]) => (
                  <div key={id} style={{...styles.friendItem, opacity: 0.6}}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{color: '#aaa'}}>요청 대기 중...</span>
                      <span style={{fontSize: 13, marginTop: 4}}>{data.nickname ? `${data.nickname}님에게` : `ID: ${id.slice(0, 5)}`}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* 방 목록 섹션 */}
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
                  <div style={styles.songInfo}>🎶 {room.currentSong || '대기 중'}</div>
                </div>
                <div style={styles.roomCardRight}>
                  <div style={styles.countBadge}>{room.participantCount}명 참여 중</div>
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
        <button onClick={handleCreateRoom} style={styles.createBtn} disabled={loading}>🏠 새 노래방 만들기</button>
      </div>
    </div>
  );
}

const styles = {
  container: { maxWidth: 600, margin: '0 auto', padding: '24px 16px', color: '#fff', background: '#1a1a2e', minHeight: '100vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  userInfo: { fontSize: 24, fontWeight: 'bold' },
  logoutBtn: { background: 'transparent', border: '1px solid #aaa', color: '#aaa', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' },
  mainButtons: { display: 'flex', flexDirection: 'column', gap: 15, marginBottom: 40 },
  
  // 메인 버튼 스타일들
  randomBtn: { padding: '30px', borderRadius: 24, border: 'none', background: 'linear-gradient(45deg, #e94560, #ff4b2b)', color: '#fff', fontSize: 28, fontWeight: 'bold', cursor: 'pointer' },
  friendSingBtn: { padding: '20px', borderRadius: 20, border: '2px solid #e94560', background: 'transparent', color: '#e94560', fontSize: 22, fontWeight: 'bold', cursor: 'pointer' },
  
  // [수정된 부분] 친구 관리 버튼을 위의 friendSingBtn과 동일한 규격의 대형 버튼으로 변경
  manageBtn: { padding: '20px', borderRadius: 20, border: '2px solid #aaa', background: 'transparent', color: '#aaa', fontSize: 22, fontWeight: 'bold', cursor: 'pointer' },
  
  friendPanel: { padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: 24, marginBottom: 25 },
  panelTitle: { margin: '0 0 10px', color: '#e94560', borderBottom: '1px solid #333', paddingBottom: 10 },
  friendList: { display: 'flex', flexDirection: 'column', gap: 12 },
  friendItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: 15 },
  
  acceptBtn: { padding: '8px 15px', background: '#f9d423', color: '#1a1a2e', border: 'none', borderRadius: 10, fontWeight: 'bold', cursor: 'pointer' },
  denyBtn: { padding: '8px 15px', background: '#444', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 'bold', cursor: 'pointer' },
  deleteBtn: { padding: '6px 12px', background: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' },
  
  roomSection: { marginBottom: 40 },
  sectionTitle: { margin: '0 0 16px', fontSize: 22, fontWeight: 800, color: '#e94560' },
  scrollContainer: { display: 'flex', flexDirection: 'column', gap: 15, maxHeight: '400px', overflowY: 'auto' },
  roomCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '25px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' },
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