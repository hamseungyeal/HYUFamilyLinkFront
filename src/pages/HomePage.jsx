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
  const [loadingType, setLoadingType] = useState(null);
  
  const [showFriendManager, setShowFriendManager] = useState(false);
  
  // [초대 기능] 관련 상태
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState([]); // 선택된 친구 ID 배열
  const [invitations, setInvitations] = useState([]); // 나에게 온 초대 목록

  const navigate = useNavigate();
  
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const friends = useAuthStore((s) => s.friends); 
  const friendStatuses = useAuthStore((s) => s.friendStatuses); 
  const refreshFriends = useAuthStore((s) => s.refreshFriends); 

  const roomId = useRoomStore((s) => s.roomId);

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

 useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onRoomState = (data) => {
      setLoadingType(null); 
      if (data.roomId) {
        // [수정] 방에 성공적으로 입장하면, 해당 방에 대한 초대장은 목록에서 제거합니다.
        setInvitations(prev => prev.filter(inv => inv.roomId !== data.roomId));
        
        // ✨ [수정된 부분] 참가자 배열에서 고유 id를 기준으로 중복을 엄격하게 제거
        const uniqueParticipants = data.participants 
          ? Array.from(new Map(data.participants.map(p => [p.id, p])).values()) 
          : [];

        useRoomStore.setState({
          roomId: data.roomId,
          joinCode: data.joinCode,
          participants: uniqueParticipants, // 중복이 제거된 배열 할당
          currentSong: data.currentSong || null
        });
      }
    };

    const onFriendUpdate = () => refreshFriends();
    const onRoomsUpdated = (data) => setActiveRooms(data || []);

    const onSocketError = (msg) => {
      setLoadingType(null);
      setError(typeof msg === 'string' ? msg : '서버 오류가 발생했습니다.');
    };

    // [초대 수신] 서버에서 나를 초대했을 때
    const onRoomInvite = (inviteData) => {
      console.log("💌 방 초대 도착:", inviteData);
      setInvitations(prev => {
        // [수정] 중복 초대 방지: 같은 방(roomId)에서 온 초대가 이미 있다면 덮어쓰고, 없으면 맨 앞에 추가
        const filtered = prev.filter(inv => inv.roomId !== inviteData.roomId);
        return [{ ...inviteData, isInvite: true }, ...filtered];
      });
    };

    socket.on('room:state', onRoomState);
    socket.on('friend:update', onFriendUpdate);
    socket.on('rooms:updated', onRoomsUpdated);
    socket.on('error', onSocketError);
    socket.on('room:invite', onRoomInvite); 
    
    return () => {
      socket.off('room:state', onRoomState);
      socket.off('friend:update', onFriendUpdate);
      socket.off('rooms:updated', onRoomsUpdated);
      socket.off('error', onSocketError);
      socket.off('room:invite', onRoomInvite);
    };
  }, [refreshFriends]);

  useEffect(() => {
    fetchActiveRooms();
    refreshFriends();
    const timer = setInterval(fetchActiveRooms, 1000);
    return () => clearInterval(timer);
  }, [fetchActiveRooms, refreshFriends]);

  const handleRandomMatch = () => {
    setError('');
    setLoadingType('match');
    getSocket()?.emit('room:match');
    setTimeout(() => setLoadingType(null), 3000); 
  };

  const handleJoinByCode = (code) => {
    if (!code) return;
    setError('');
    setLoadingType('join');
    getSocket()?.emit('room:join', { joinCode: code.toUpperCase() }, (res) => {
      if (res?.error) { 
        setError(res.error); 
        setLoadingType(null); 
      }
    });
  };

  const openCreateRoomModal = () => {
    setSelectedFriends([]); 
    setShowInviteModal(true);
  };

  const toggleFriendSelect = (friendId) => {
    setSelectedFriends(prev => 
      prev.includes(friendId) ? prev.filter(id => id !== friendId) : [...prev, friendId]
    );
  };

  const executeCreateRoom = () => {
    setError('');
    setLoadingType('create');
    setShowInviteModal(false);
    
    getSocket()?.emit('room:create', { invitedFriends: selectedFriends });
    setTimeout(() => setLoadingType(null), 3000);
  };

  const handleFriendAccept = (targetId) => getSocket()?.emit('friend:accept', { targetId });
  const handleFriendRemove = (targetId, actionType) => {
    let confirmMsg = "정말 이 친구를 삭제하시겠습니까?"; 
    
    if (actionType === 'reject') confirmMsg = "친구 요청을 거절하시겠습니까?";
    if (actionType === 'cancel') confirmMsg = "보낸 친구 요청을 취소하시겠습니까?";

    if (window.confirm(confirmMsg)) {
      console.log(`🗑️ 친구 ${actionType} 시도:`, targetId);
      getSocket()?.emit('friend:remove', { targetId });
    }
  };

  // [수정] 방 목록 병합 (초대받은 방 최상단 유지 & 중복 노출 완벽 차단)
  // API로 불러온 activeRooms 중, invitations에 이미 존재하는 roomId는 걸러냅니다.
  const combinedRooms = [
    ...invitations,
    ...activeRooms.filter(ar => !invitations.some(inv => inv.roomId === ar.id)) 
  ];

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes inviteGlow {
          0% { box-shadow: 0 0 5px #f9d423, inset 0 0 10px rgba(249, 212, 35, 0.2); border-color: #f9d423; }
          50% { box-shadow: 0 0 25px #f9d423, inset 0 0 20px rgba(249, 212, 35, 0.4); border-color: #fff; }
          100% { box-shadow: 0 0 5px #f9d423, inset 0 0 10px rgba(249, 212, 35, 0.2); border-color: #f9d423; }
        }
      `}</style>

      <div style={styles.header}>
        <span style={styles.userInfo}>🎤 {user?.nickname || '손님'}님, 환영합니다!</span>
        <button onClick={logout} style={styles.logoutBtn}>로그아웃</button>
      </div>

      <div style={styles.mainButtons}>
        <button onClick={handleRandomMatch} style={styles.randomBtn} disabled={!!loadingType}>
          ⚡ {loadingType === 'match' ? '매칭 중...' : '모르는 친구와 노래하기'}
        </button>
        <button onClick={() => setShowFriendManager(!showFriendManager)} style={styles.friendSingBtn}>
          {showFriendManager ? '✕ 친구 관리창 닫기' : '👥 친구 관리 및 찾기'}
        </button>
      </div>

      {showFriendManager && (
        <div style={styles.friendPanel}>
          <h3 style={styles.panelTitle}>내 친구 관리</h3>
          <div style={styles.friendList}>
            {Object.entries(friendStatuses).filter(([_, data]) => (data.status || data) === 'received').map(([id, data]) => (
              <div key={id} style={styles.friendItem}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{color: '#f9d423', fontWeight: 'bold'}}>🔔 새로운 친구 요청</span>
                  <span style={{fontSize: 15, marginTop: 4}}>{data.nickname ? `${data.nickname}님` : `ID: ${id.slice(0, 5)}...`}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleFriendAccept(id)} style={styles.acceptBtn}>수락</button>
                  <button onClick={() => handleFriendRemove(id, 'reject')} style={styles.denyBtn}>거절</button>
                </div>
              </div>
            ))}
            {friends.length === 0 && !Object.values(friendStatuses).some(data => (data.status || data) === 'received' || (data.status || data) === 'sent') ? (
              <p style={{color: '#aaa', fontSize: 18}}>현재 등록된 친구가 없습니다.</p>
            ) : (
              <>
                {friends.map(friend => (
                  <div key={friend.id} style={styles.friendItem}>
                    <div>
                      <span style={{fontSize: 18, fontWeight: 'bold'}}>{friend.nickname}</span>
                      <span style={{color: '#aaa', fontSize: 14, marginLeft: '8px'}}>✓ 내 친구</span>
                    </div>
                    <button onClick={() => handleFriendRemove(friend.id, 'remove')} style={styles.deleteBtn}>삭제</button>
                  </div>
                ))}
                {Object.entries(friendStatuses).filter(([_, data]) => (data.status || data) === 'sent').map(([id, data]) => (
                  <div key={id} style={{...styles.friendItem, opacity: 0.6}}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{color: '#aaa'}}>요청 대기 중...</span>
                      <span style={{fontSize: 13, marginTop: 4}}>{data.nickname ? `${data.nickname}님에게` : `ID: ${id.slice(0, 5)}`}</span>
                    </div>
                    <button onClick={() => handleFriendRemove(id, 'cancel')} style={styles.cancelReqBtn}>취소</button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* --- 방 목록 섹션 --- */}
      <div style={styles.roomSection}>
        <h2 style={styles.sectionTitle}>지금 열려있는 노래방</h2>
        <div style={styles.scrollContainer}>
          {combinedRooms.length === 0 ? (
            <div style={styles.emptyRooms}>현재 열려있는 노래방이 없습니다.</div>
          ) : (
            combinedRooms.map((room) => {
              const isFull = room.participantCount >= 6; 
              const isInvite = room.isInvite; 

              return (
                <div 
                  key={room.id || room.roomId} 
                  style={{
                    ...styles.roomCard, 
                    ...(isInvite ? { animation: 'inviteGlow 1.5s infinite', border: '2px solid #f9d423' } : {}),
                    ...(isFull ? { opacity: 0.5, cursor: 'not-allowed' } : {})
                  }} 
                  onClick={() => !isFull && handleJoinByCode(room.joinCode || room.join_code)}
                >
                  <div style={styles.roomCardLeft}>
                    {isInvite && <div style={{ color: '#f9d423', fontWeight: 'bold', marginBottom: '5px' }}>✨ {room.hostName}님의 초대!</div>}
                    <div style={styles.hostName}>{room.hostName}님의 방</div>
                    <div style={styles.songInfo}>🎶 {room.currentSong || '대기 중'}</div>
                  </div>
                  <div style={styles.roomCardRight}>
                    <div style={{...styles.countBadge, color: isFull ? '#ff4b2b' : '#aaa'}}>
                      {room.participantCount} / 6명
                    </div>
                    {isFull ? (
                      <div style={{...styles.enterTag, color: '#ff4b2b'}}>꽉 찬 방 🔒</div>
                    ) : (
                      <div style={{...styles.enterTag, color: isInvite ? '#f9d423' : '#e94560'}}>
                        {isInvite ? '수락하고 입장 ▶' : '입장하기 ▶'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
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
          <button onClick={() => handleJoinByCode(joinCode)} style={styles.joinBtn} disabled={!!loadingType}>
            {loadingType === 'join' ? '입장 중...' : '입장'}
          </button>
        </div>
        {error && <p style={styles.error}>{error}</p>}
        
        <button onClick={openCreateRoomModal} style={styles.createBtn} disabled={!!loadingType}>
          🏠 {loadingType === 'create' ? '방 만드는 중...' : '초대하고 방 만들기'}
        </button>
      </div>

      {showInviteModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2 style={{color: '#e94560', margin: '0 0 15px 0'}}>초대할 친구 선택</h2>
            <p style={{color: '#aaa', marginBottom: '20px'}}>
              방에 초대할 친구를 선택하세요. (최대 5명)
            </p>
            
            <div style={styles.inviteFriendList}>
              {friends.length === 0 ? (
                <div style={{textAlign: 'center', color: '#666', padding: '20px 0'}}>
                  확정된 친구가 없습니다.
                </div>
              ) : (
                friends.map(friend => (
                  <div 
                    key={friend.id} 
                    style={{
                      ...styles.inviteItem,
                      border: selectedFriends.includes(friend.id) ? '2px solid #e94560' : '2px solid transparent',
                      background: selectedFriends.includes(friend.id) ? 'rgba(233, 69, 96, 0.2)' : 'rgba(255,255,255,0.05)'
                    }}
                    onClick={() => toggleFriendSelect(friend.id)}
                  >
                    <span style={{fontSize: 18, fontWeight: 'bold'}}>{friend.nickname}</span>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', border: '2px solid #fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: selectedFriends.includes(friend.id) ? '#e94560' : 'transparent'
                    }}>
                      {selectedFriends.includes(friend.id) && '✓'}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setShowInviteModal(false)} style={styles.cancelBtn}>
                취소
              </button>
              <button onClick={executeCreateRoom} style={styles.confirmBtn}>
                {selectedFriends.length > 0 ? `${selectedFriends.length}명 초대하고 방 만들기` : '선택 안 하고 방 만들기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 600, margin: '0 auto', padding: '24px 16px', color: '#fff', background: '#1a1a2e', minHeight: '100vh', position: 'relative' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  userInfo: { fontSize: 24, fontWeight: 'bold' },
  logoutBtn: { background: 'transparent', border: '1px solid #aaa', color: '#aaa', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' },
  mainButtons: { display: 'flex', flexDirection: 'column', gap: 15, marginBottom: 40 },
  randomBtn: { padding: '30px', borderRadius: 24, border: 'none', background: 'linear-gradient(45deg, #e94560, #ff4b2b)', color: '#fff', fontSize: 28, fontWeight: 'bold', cursor: 'pointer' },
  friendSingBtn: { padding: '20px', borderRadius: 20, border: '2px solid #e94560', background: 'transparent', color: '#e94560', fontSize: 22, fontWeight: 'bold', cursor: 'pointer' },
  manageBtn: { padding: '20px', borderRadius: 20, border: '2px solid #aaa', background: 'transparent', color: '#aaa', fontSize: 22, fontWeight: 'bold', cursor: 'pointer' },
  friendPanel: { padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: 24, marginBottom: 25 },
  panelTitle: { margin: '0 0 10px', color: '#e94560', borderBottom: '1px solid #333', paddingBottom: 10 },
  friendList: { display: 'flex', flexDirection: 'column', gap: 12 },
  friendItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: 15 },
  acceptBtn: { padding: '8px 15px', background: '#f9d423', color: '#1a1a2e', border: 'none', borderRadius: 10, fontWeight: 'bold', cursor: 'pointer' },
  denyBtn: { padding: '8px 15px', background: '#444', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 'bold', cursor: 'pointer' },
  deleteBtn: { padding: '6px 12px', background: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' },
  cancelReqBtn: { padding: '6px 12px', background: 'transparent', color: '#aaa', border: '1px solid #aaa', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' },
  roomSection: { marginBottom: 40 },
  sectionTitle: { margin: '0 0 16px', fontSize: 22, fontWeight: 800, color: '#e94560' },
  scrollContainer: { display: 'flex', flexDirection: 'column', gap: 15, maxHeight: '400px', overflowY: 'auto' },
  roomCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '25px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', transition: 'all 0.3s ease' },
  roomCardLeft: { display: 'flex', flexDirection: 'column', gap: 8 },
  hostName: { fontSize: 22, fontWeight: 'bold' },
  songInfo: { fontSize: 18, color: '#ffb3bd' },
  roomCardRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 },
  countBadge: { fontSize: 16, fontWeight: 'bold' },
  enterTag: { fontSize: 18, fontWeight: 'bold' },
  emptyRooms: { textAlign: 'center', padding: '40px', color: '#666', fontSize: 20 },
  section: { padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: 24 },
  joinRow: { display: 'flex', gap: 12, marginBottom: 15 },
  input: { flex: 1, padding: '18px', borderRadius: 15, border: '1px solid #444', background: '#16213e', color: '#fff', fontSize: 20 },
  joinBtn: { padding: '0 30px', borderRadius: 15, border: 'none', background: '#e94560', color: '#fff', fontWeight: 'bold', fontSize: 20 },
  createBtn: { width: '100%', padding: '15px', borderRadius: 15, border: '1px dashed #666', background: 'transparent', color: '#aaa', fontSize: 18, cursor: 'pointer' },
  error: { color: '#ff6b6b', textAlign: 'center', marginTop: 12, fontSize: 18, fontWeight: 'bold' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 },
  modal: { background: '#1a1a2e', padding: '30px', borderRadius: 20, width: '100%', maxWidth: 400, border: '1px solid #333' },
  inviteFriendList: { display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '300px', overflowY: 'auto', marginBottom: 20 },
  inviteItem: { display: 'flex', justifyContent: 'space-between', padding: '15px', borderRadius: 15, cursor: 'pointer', transition: 'all 0.2s ease' },
  cancelBtn: { flex: 1, padding: '15px', borderRadius: 10, border: 'none', background: '#444', color: '#fff', fontSize: 16, fontWeight: 'bold', cursor: 'pointer' },
  confirmBtn: { flex: 2, padding: '15px', borderRadius: 10, border: 'none', background: '#e94560', color: '#fff', fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }
};