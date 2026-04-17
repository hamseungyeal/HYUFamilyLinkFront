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
        // ✨ [핵심 해결] 현재 내가 참가자 목록에 있는지 검사합니다. (Stale Closure 방지를 위해 getState 사용)
        const currentUser = useAuthStore.getState().user;
        const amIInRoom = data.participants?.some(
          (p) => String(p.id).trim() === String(currentUser?.id).trim()
        );

        // 내가 명단에 없다면 (방에서 막 나온 직후라면) 서버의 전체 알림을 무시합니다. (부메랑 현상 차단)
        if (!amIInRoom) {
          return;
        }

        setInvitations(prev => prev.filter(inv => inv.roomId !== data.roomId));
        
        const uniqueParticipants = data.participants 
          ? Array.from(new Map(data.participants.map(p => [p.id, p])).values()) 
          : [];

        useRoomStore.setState({
          roomId: data.roomId,
          joinCode: data.joinCode,
          participants: uniqueParticipants,
          currentSong: data.currentSong || null,
          currentTurnId: data.currentTurnId || null
        });
      }
    };

    const onFriendUpdate = () => refreshFriends();
    const onRoomsUpdated = (data) => setActiveRooms(data || []);

    const onSocketError = (msg) => {
      setLoadingType(null);
      setError(typeof msg === 'string' ? msg : '서버 오류가 발생했습니다.');
    };

    const onRoomInvite = (inviteData) => {
      console.log("💌 방 초대 도착:", inviteData);
      setInvitations(prev => {
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
    const timer = setInterval(fetchActiveRooms, 5000);
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

  // 모달 바깥쪽(오버레이) 클릭 시 닫히도록 처리하는 함수
  const handleModalOutsideClick = (e, setter) => {
    if (e.target === e.currentTarget) {
      setter(false);
    }
  };

  const combinedRooms = [
    ...invitations,
    ...activeRooms.filter(ar => !invitations.some(inv => inv.roomId === ar.id)) 
  ];

  const receivedRequestsCount = Object.values(friendStatuses).filter(data => (data.status || data) === 'received').length;
  const hasNewFriendRequest = receivedRequestsCount > 0;

  return (
    <div style={styles.pageWrapper}>
      <style>{`
        @keyframes inviteGlow {
          0% { box-shadow: 0 0 5px #f9d423, inset 0 0 10px rgba(249, 212, 35, 0.2); border-color: #f9d423; }
          50% { box-shadow: 0 0 25px #f9d423, inset 0 0 20px rgba(249, 212, 35, 0.4); border-color: #fff; }
          100% { box-shadow: 0 0 5px #f9d423, inset 0 0 10px rgba(249, 212, 35, 0.2); border-color: #f9d423; }
        }
        .custom-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scroll::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05); 
          border-radius: 10px;
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: rgba(233, 69, 96, 0.8); 
          border-radius: 10px;
        }
        .custom-scroll::-webkit-scrollbar-thumb:hover {
          background: #e94560; 
        }
      `}</style>

      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.userInfo}>🎤 {user?.nickname || '손님'}님, 환영합니다!</span>
          <button onClick={logout} style={styles.logoutBtn}>로그아웃</button>
        </div>

        <div style={styles.mainButtons}>
          <button onClick={handleRandomMatch} style={styles.randomBtn} disabled={!!loadingType}>
            ⚡ {loadingType === 'match' ? '매칭 중...' : '모르는 친구와 노래하기'}
          </button>
          
          <button onClick={openCreateRoomModal} style={styles.createBtn} disabled={!!loadingType}>
            🏠 {loadingType === 'create' ? '방 만드는 중...' : '초대하고 방 만들기'}
          </button>

          <button 
            onClick={() => setShowFriendManager(true)} 
            style={{
              ...styles.friendSingBtn,
              ...(hasNewFriendRequest ? { animation: 'inviteGlow 1.5s infinite', border: '2px solid #f9d423', color: '#f9d423' } : {})
            }}
          >
            {hasNewFriendRequest ? `🔔 ${receivedRequestsCount}개의 새 친구 요청 확인하기` : '👥 친구 관리 및 찾기'}
          </button>
        </div>

        {/* --- 친구 관리창 팝업(모달) --- */}
        {showFriendManager && (
          <div style={styles.modalOverlay} onClick={(e) => handleModalOutsideClick(e, setShowFriendManager)}>
            <div style={styles.friendModal}>
              <div style={styles.modalHeader}>
                <h3 style={styles.panelTitle}>내 친구 관리</h3>
                <button onClick={() => setShowFriendManager(false)} style={styles.closeBtn}>✕</button>
              </div>
              
              <div className="custom-scroll" style={styles.friendList}>
                {Object.entries(friendStatuses).filter(([_, data]) => (data.status || data) === 'received').map(([id, data]) => (
                  <div key={id} style={styles.friendItem}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{color: '#f9d423', fontWeight: 'bold', fontSize: 'clamp(1rem, 4vw, 1.25rem)'}}>🔔 새로운 친구 요청</span>
                      <span style={{fontSize: 'clamp(1rem, 3.5vw, 1.125rem)', marginTop: '0.25rem'}}>{data.nickname ? `${data.nickname}님` : `ID: ${id.slice(0, 5)}...`}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => handleFriendAccept(id)} style={styles.acceptBtn}>수락</button>
                      <button onClick={() => handleFriendRemove(id, 'reject')} style={styles.denyBtn}>거절</button>
                    </div>
                  </div>
                ))}
                {friends.length === 0 && !Object.values(friendStatuses).some(data => (data.status || data) === 'received' || (data.status || data) === 'sent') ? (
                  <p style={{color: '#aaa', fontSize: 'clamp(1.1rem, 4vw, 1.25rem)', textAlign: 'center', padding: '2.5rem 0'}}>현재 등록된 친구가 없습니다.</p>
                ) : (
                  <>
                    {friends.map(friend => (
                      <div key={friend.id} style={styles.friendItem}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{fontSize: 'clamp(1.1rem, 4vw, 1.3rem)', fontWeight: 'bold'}}>{friend.nickname}</span>
                          <span style={{color: '#aaa', fontSize: 'clamp(0.9rem, 3vw, 1rem)', marginLeft: '0.75rem'}}>✓ 내 친구</span>
                        </div>
                        <button onClick={() => handleFriendRemove(friend.id, 'remove')} style={styles.deleteBtn}>삭제</button>
                      </div>
                    ))}
                    {Object.entries(friendStatuses).filter(([_, data]) => (data.status || data) === 'sent').map(([id, data]) => (
                      <div key={id} style={{...styles.friendItem, opacity: 0.6}}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{color: '#aaa', fontSize: 'clamp(1rem, 3.5vw, 1.125rem)'}}>요청 대기 중...</span>
                          <span style={{fontSize: 'clamp(0.85rem, 3vw, 1rem)', marginTop: '0.25rem'}}>{data.nickname ? `${data.nickname}님에게` : `ID: ${id.slice(0, 5)}`}</span>
                        </div>
                        <button onClick={() => handleFriendRemove(id, 'cancel')} style={styles.cancelReqBtn}>취소</button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div style={styles.roomSection}>
          <h2 style={styles.sectionTitle}>지금 열려있는 노래방</h2>
          <div className="custom-scroll" style={styles.scrollContainer}>
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
                      {isInvite && <div style={{ color: '#f9d423', fontWeight: 'bold', marginBottom: '0.25rem', fontSize: 'clamp(0.9rem, 3.5vw, 1rem)' }}>✨ {room.hostName}님의 초대!</div>}
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
                          {isInvite ? '수락 ▶' : '입장 ▶'}
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
        </div>

        {/* --- 초대 모달 --- */}
        {showInviteModal && (
          <div style={styles.modalOverlay} onClick={(e) => handleModalOutsideClick(e, setShowInviteModal)}>
            <div style={styles.modal}>
              <h2 style={{color: '#e94560', margin: '0 0 1rem 0', fontSize: 'clamp(1.75rem, 6vw, 2.2rem)'}}>초대할 친구 선택</h2>
              <p style={{color: '#aaa', marginBottom: '1.5rem', fontSize: 'clamp(1rem, 3.5vw, 1.2rem)'}}>
                방에 초대할 친구를 선택하세요. (최대 5명)
              </p>
              
              <div className="custom-scroll" style={styles.inviteFriendList}>
                {friends.length === 0 ? (
                  <div style={{textAlign: 'center', color: '#666', padding: '1.5rem 0', fontSize: 'clamp(1.1rem, 4vw, 1.3rem)'}}>
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
                      <span style={{fontSize: 'clamp(1.1rem, 4vw, 1.3rem)', fontWeight: 'bold'}}>{friend.nickname}</span>
                      <div style={{
                        width: '1.75rem', height: '1.75rem', borderRadius: '50%', border: '2px solid #fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
                        background: selectedFriends.includes(friend.id) ? '#e94560' : 'transparent'
                      }}>
                        {selectedFriends.includes(friend.id) && '✓'}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button onClick={() => setShowInviteModal(false)} style={styles.cancelBtn}>
                  취소
                </button>
                <button onClick={executeCreateRoom} style={styles.confirmBtn}>
                  {selectedFriends.length > 0 ? `${selectedFriends.length}명 초대` : '선택 없이 만들기'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 반응형 유동 레이아웃 스타일 적용
const styles = {
  pageWrapper: { width: '100vw', minHeight: '100vh', background: '#1a1a2e', display: 'flex', justifyContent: 'center', overflowX: 'hidden' },
  container: { width: '100%', maxWidth: '40rem', padding: 'clamp(1.5rem, 5vw, 2.5rem) clamp(1rem, 4vw, 1.5rem)', color: '#fff', position: 'relative', boxSizing: 'border-box' },
  
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', gap: '0.5rem' },
  userInfo: { fontSize: 'clamp(1.2rem, 5vw, 1.5rem)', fontWeight: 'bold', wordBreak: 'keep-all' },
  logoutBtn: { background: 'transparent', border: '1px solid #aaa', color: '#aaa', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: 'clamp(0.85rem, 3.5vw, 1rem)', whiteSpace: 'nowrap' },
  
  mainButtons: { display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' },
  randomBtn: { padding: 'clamp(1.5rem, 6vw, 2rem)', borderRadius: '1.5rem', border: 'none', background: 'linear-gradient(45deg, #e94560, #ff4b2b)', color: '#fff', fontSize: 'clamp(1.5rem, 6vw, 1.75rem)', fontWeight: 'bold', cursor: 'pointer' },
  createBtn: { width: '100%', padding: 'clamp(1.25rem, 5vw, 1.5rem)', borderRadius: '1.25rem', border: 'none', background: '#4a4e69', color: '#fff', fontSize: 'clamp(1.3rem, 5.5vw, 1.5rem)', fontWeight: 'bold', cursor: 'pointer', boxSizing: 'border-box', transition: '0.2s ease' },
  friendSingBtn: { padding: 'clamp(1.25rem, 5vw, 1.5rem)', borderRadius: '1.25rem', border: '2px solid #e94560', background: 'transparent', color: '#e94560', fontSize: 'clamp(1.3rem, 5.5vw, 1.5rem)', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s ease' },
  
  // 친구 관리 모달 및 초대 모달: 최대 크기와 내부 글씨 크기 확장
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem', cursor: 'pointer' }, // 오버레이 클릭 가능하도록
  friendModal: { background: '#1a1a2e', padding: 'clamp(1.5rem, 6vw, 2.5rem)', borderRadius: '1.5rem', width: '100%', maxWidth: '36rem', border: '1px solid #333', boxSizing: 'border-box', position: 'relative', cursor: 'default' }, // 내부 요소 클릭 시 이벤트 전파 방지
  modal: { background: '#1a1a2e', padding: 'clamp(1.5rem, 6vw, 2.5rem)', borderRadius: '1.5rem', width: '100%', maxWidth: '32rem', border: '1px solid #333', boxSizing: 'border-box', cursor: 'default' },
  
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '1rem' },
  panelTitle: { margin: 0, color: '#e94560', fontSize: 'clamp(1.4rem, 6vw, 1.8rem)' },
  closeBtn: { background: 'transparent', border: 'none', color: '#fff', fontSize: '1.8rem', cursor: 'pointer', padding: '0.5rem' },
  
  friendList: { display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '50vh', overflowY: 'auto', paddingRight: '0.5rem' },
  friendItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem', background: 'rgba(255,255,255,0.05)', borderRadius: '1rem' },
  acceptBtn: { padding: '0.6rem 1rem', background: '#f9d423', color: '#1a1a2e', border: 'none', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer', fontSize: 'clamp(0.95rem, 3.5vw, 1.1rem)' },
  denyBtn: { padding: '0.6rem 1rem', background: '#444', color: '#fff', border: 'none', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer', fontSize: 'clamp(0.95rem, 3.5vw, 1.1rem)' },
  deleteBtn: { padding: '0.5rem 1rem', background: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer', fontSize: 'clamp(0.9rem, 3.5vw, 1rem)' },
  cancelReqBtn: { padding: '0.5rem 1rem', background: 'transparent', color: '#aaa', border: '1px solid #aaa', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer', fontSize: 'clamp(0.9rem, 3.5vw, 1rem)' },
  
  roomSection: { marginBottom: '2.5rem' },
  sectionTitle: { margin: '0 0 1rem', fontSize: 'clamp(1.2rem, 5vw, 1.4rem)', fontWeight: 800, color: '#e94560' },
  scrollContainer: { display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '23rem', overflowY: 'auto', paddingRight: '0.5rem' },
  roomCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: 'clamp(1rem, 4vw, 1.5rem)', borderRadius: '1.25rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', transition: 'all 0.3s ease' },
  roomCardLeft: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  hostName: { fontSize: 'clamp(1.2rem, 5vw, 1.4rem)', fontWeight: 'bold' },
  songInfo: { fontSize: 'clamp(1rem, 4vw, 1.125rem)', color: '#ffb3bd' },
  roomCardRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' },
  countBadge: { fontSize: 'clamp(0.9rem, 3.5vw, 1rem)', fontWeight: 'bold' },
  enterTag: { fontSize: 'clamp(1rem, 4vw, 1.125rem)', fontWeight: 'bold', whiteSpace: 'nowrap' },
  emptyRooms: { textAlign: 'center', padding: '2.5rem 0', color: '#666', fontSize: 'clamp(1.1rem, 4vw, 1.25rem)' },
  
  section: { padding: 'clamp(1rem, 4vw, 1.5rem)', background: 'rgba(255,255,255,0.03)', borderRadius: '1.5rem', boxSizing: 'border-box' },
  joinRow: { display: 'flex', gap: '0.75rem', marginBottom: '1rem' },
  input: { flex: 1, padding: '1rem', borderRadius: '1rem', border: '1px solid #444', background: '#16213e', color: '#fff', fontSize: 'clamp(1.1rem, 4vw, 1.25rem)', boxSizing: 'border-box', minWidth: 0 },
  joinBtn: { padding: '0 1.5rem', borderRadius: '1rem', border: 'none', background: '#e94560', color: '#fff', fontWeight: 'bold', fontSize: 'clamp(1.1rem, 4vw, 1.25rem)', whiteSpace: 'nowrap' },
  error: { color: '#ff6b6b', textAlign: 'center', marginTop: '0.75rem', fontSize: 'clamp(1rem, 4vw, 1.125rem)', fontWeight: 'bold' },
  
  inviteFriendList: { display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '40vh', overflowY: 'auto', marginBottom: '1.5rem', paddingRight: '0.5rem' },
  inviteItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem', borderRadius: '1rem', cursor: 'pointer', transition: 'all 0.2s ease' },
  cancelBtn: { flex: 1, padding: '1.25rem', borderRadius: '1rem', border: 'none', background: '#444', color: '#fff', fontSize: 'clamp(1rem, 4vw, 1.2rem)', fontWeight: 'bold', cursor: 'pointer' },
  confirmBtn: { flex: 2, padding: '1.25rem', borderRadius: '1rem', border: 'none', background: '#e94560', color: '#fff', fontSize: 'clamp(1rem, 4vw, 1.2rem)', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }
};