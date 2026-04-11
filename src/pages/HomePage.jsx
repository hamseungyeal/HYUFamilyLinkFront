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
        useRoomStore.setState({
          roomId: data.roomId,
          joinCode: data.joinCode,
          participants: data.participants,
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
        // 이미 있는 초대면 중복 추가 방지
        if (prev.some(inv => inv.id === inviteData.id)) return prev;
        return [{ ...inviteData, isInvite: true }, ...prev];
      });
    };

    socket.on('room:state', onRoomState);
    socket.on('friend:update', onFriendUpdate);
    socket.on('rooms:updated', onRoomsUpdated);
    socket.on('error', onSocketError);
    socket.on('room:invite', onRoomInvite); // 이벤트 추가
    
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
    const timer = setInterval(fetchActiveRooms, 5000);
    return () => clearInterval(timer);
  }, [fetchActiveRooms, refreshFriends]);

  const handleRandomMatch = () => {
    setError('');
    setLoadingType('match');
    getSocket()?.emit('room:match');
    setTimeout(() => setLoadingType(null), 5000); 
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

  // [초대 기능] 1. 방 만들기 버튼 클릭 시 모달 열기
  const openCreateRoomModal = () => {
    setSelectedFriends([]); // 선택 초기화
    setShowInviteModal(true);
  };

  // [초대 기능] 2. 모달 내 친구 선택 토글
  const toggleFriendSelect = (friendId) => {
    setSelectedFriends(prev => 
      prev.includes(friendId) ? prev.filter(id => id !== friendId) : [...prev, friendId]
    );
  };

  // [초대 기능] 3. 확인 버튼 누르면 실제 방 생성 (+초대명단 전송)
  const executeCreateRoom = () => {
    setError('');
    setLoadingType('create');
    setShowInviteModal(false);
    
    // 서버에 방 생성과 함께 초대할 친구 목록을 보냄
    getSocket()?.emit('room:create', { invitedFriends: selectedFriends });
    setTimeout(() => setLoadingType(null), 5000);
  };

  const handleFriendAccept = (targetId) => getSocket()?.emit('friend:accept', { targetId });
  
  // [수정] 친구 삭제, 거절, 취소 처리를 통합하여 핸들링
  const handleFriendRemove = (targetId, actionType) => {
    let confirmMsg = "정말 이 친구를 삭제하시겠습니까?"; // 기본값: 삭제 ('remove')
    
    if (actionType === 'reject') confirmMsg = "친구 요청을 거절하시겠습니까?";
    if (actionType === 'cancel') confirmMsg = "보낸 친구 요청을 취소하시겠습니까?";

    if (window.confirm(confirmMsg)) {
      console.log(`🗑️ 친구 ${actionType} 시도:`, targetId);
      // 백엔드는 삭제/거절/취소 모두 동일하게 friend:remove 이벤트를 사용하여 관계(row)를 지웁니다.
      getSocket()?.emit('friend:remove', { targetId });
    }
  };

  // [초대 기능] 초대받은 방과 일반 방 목록 병합 (초대받은 방이 맨 위로)
  const combinedRooms = [
    ...invitations,
    ...activeRooms.filter(ar => !invitations.some(inv => inv.id === ar.id)) // 중복 제거
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
        {/* 버튼 통합 및 명칭 변경 */}
        <button onClick={() => setShowFriendManager(!showFriendManager)} style={styles.friendSingBtn}>
          {showFriendManager ? '✕ 친구 관리창 닫기' : '👥 친구 관리 및 찾기'}
        </button>
      </div>

      {/* --- 친구 관리 패널 --- */}
      {showFriendManager && (
        <div style={styles.friendPanel}>
          <h3 style={styles.panelTitle}>내 친구 관리</h3>
          <div style={styles.friendList}>
            
            {/* 1. 받은 요청 목록 */}
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
            
            {/* 데이터가 비었을 때 */}
            {friends.length === 0 && !Object.values(friendStatuses).some(data => (data.status || data) === 'received' || (data.status || data) === 'sent') ? (
              <p style={{color: '#aaa', fontSize: 18}}>현재 등록된 친구가 없습니다.</p>
            ) : (
              <>
                {/* 2. 확정된 친구 목록 */}
                {friends.map(friend => (
                  <div key={friend.id} style={styles.friendItem}>
                    <div>
                      <span style={{fontSize: 18, fontWeight: 'bold'}}>{friend.nickname}</span>
                      <span style={{color: '#aaa', fontSize: 14, marginLeft: '8px'}}>✓ 내 친구</span>
                    </div>
                    <button onClick={() => handleFriendRemove(friend.id, 'remove')} style={styles.deleteBtn}>삭제</button>
                  </div>
                ))}
                
                {/* 3. 보낸 요청 목록 (취소 버튼 추가) */}
                {Object.entries(friendStatuses).filter(([_, data]) => (data.status || data) === 'sent').map(([id, data]) => (
                  <div key={id} style={{...styles.friendItem, opacity: 0.6}}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{color: '#aaa'}}>요청 대기 중...</span>
                      <span style={{fontSize: 13, marginTop: 4}}>{data.nickname ? `${data.nickname}님에게` : `ID: ${id.slice(0, 5)}`}</span>
                    </div>
                    {/* [추가] 취소 버튼 */}
                    <button onClick={() => handleFriendRemove(id, 'cancel')} style={styles.cancelReqBtn}>취소</button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* --- 방 목록 섹션 (초대 & 꽉 찬 방 UI 반영) --- */}
      <div style={styles.roomSection}>
        <h2 style={styles.sectionTitle}>지금 열려있는 노래방</h2>
        <div style={styles.scrollContainer}>
          {combinedRooms.length === 0 ? (
            <div style={styles.emptyRooms}>현재 열려있는 노래방이 없습니다.</div>
          ) : (
            combinedRooms.map((room) => {
              const isFull = room.participantCount >= 6; // 6명 제한 체크
              const isInvite = room.isInvite; // 초대 여부 체크

              return (
                <div 
                  key={room.id} 
                  style={{
                    ...styles.roomCard, 
                    // 초대받은 방은 반짝이는 이펙트, 꽉 찬 방은 반투명 처리
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

      {/* --- 방 만들기 & 입장 --- */}
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
        
        {/* [초대 기능] 클릭 시 모달 열기 및 버튼명 변경 */}
        <button onClick={openCreateRoomModal} style={styles.createBtn} disabled={!!loadingType}>
          🏠 {loadingType === 'create' ? '방 만드는 중...' : '초대하고 방 만들기'}
        </button>
      </div>

      {/* ========================================= */}
      {/* [초대 기능] 방 생성 전 친구 초대 모달 */}
      {/* ========================================= */}
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
  // [추가] 취소 버튼 스타일 (삭제 버튼과 동일하되 약간 덜 강렬하게)
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

  // 초대 모달 스타일 추가
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 },
  modal: { background: '#1a1a2e', padding: '30px', borderRadius: 20, width: '100%', maxWidth: 400, border: '1px solid #333' },
  inviteFriendList: { display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '300px', overflowY: 'auto', marginBottom: 20 },
  inviteItem: { display: 'flex', justifyContent: 'space-between', padding: '15px', borderRadius: 15, cursor: 'pointer', transition: 'all 0.2s ease' },
  cancelBtn: { flex: 1, padding: '15px', borderRadius: 10, border: 'none', background: '#444', color: '#fff', fontSize: 16, fontWeight: 'bold', cursor: 'pointer' },
  confirmBtn: { flex: 2, padding: '15px', borderRadius: 10, border: 'none', background: '#e94560', color: '#fff', fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }
};