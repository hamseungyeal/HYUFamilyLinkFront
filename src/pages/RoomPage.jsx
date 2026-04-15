import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoomStore } from '../store/roomStore';
import { useAuthStore } from '../store/authStore';
import { useVoice } from '../hooks/useVoice';
import { getSocket } from '../hooks/useSocket';
import { api } from '../api/client';

const EMOJIS = ['🎤', '👏', '🔥', '❤️', '😂', '🎵'];

export default function RoomPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  
  // [추가] 친구 명단 가져오기 (초대용)
  const friends = useAuthStore((s) => s.friends);
  const friendStatuses = useAuthStore((s) => s.friendStatuses);
  const refreshFriends = useAuthStore((s) => s.refreshFriends);

  const { roomId, joinCode, participants, currentSong } = useRoomStore();
  const { start, stop, toggleMute, muted } = useVoice();

  const [showSongPicker, setShowSongPicker] = useState(false);
  const [songSearch, setSongSearch] = useState('');
  const [songs, setSongs] = useState([]);
  
  const [activeReactions, setActiveReactions] = useState([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const isLeaving = useRef(false);

  // [초대 기능] 관련 상태 추가
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState([]);

  // [마이크 기능] 로컬 시각화 상태 추가 (훅이 더미라도 UI가 반응하도록)
  const [isMicOn, setIsMicOn] = useState(!muted);

  // 마이크 토글 핸들러
  const handleMicToggle = () => {
    if (toggleMute) toggleMute(); // 실제 훅 기능 실행
    setIsMicOn((prev) => !prev);  // UI 상태 즉각 변경
  };

  // 1. 방 관리 및 실시간 리스너
  useEffect(() => {
    const socket = getSocket();
    if (!socket || isLeaving.current) return;

    if (!roomId) {
      const savedCode = sessionStorage.getItem('lastJoinCode');
      if (savedCode) {
        socket.emit('room:join', { joinCode: savedCode }, async (res) => {
          if (res && res.error) {
            alert('방이 종료되었거나 입장할 수 없습니다.');
            sessionStorage.removeItem('lastJoinCode');
            useRoomStore.setState({ roomId: null, joinCode: null, participants: [], currentSong: null });
            navigate('/', { replace: true });
          } else if (res && res.roomId) {
            try {
              await start(res.roomId);
              await refreshFriends();
            } catch (err) {
              // Agora 오류는 무시하고 방은 유지
            }
            setIsInitialLoading(false);
          }
        });
        return;
      } else {
        navigate('/', { replace: true });
        return;
      }
    }

    sessionStorage.setItem('lastJoinCode', joinCode);

    const initData = async () => {
      try {
        await start(roomId);
        await refreshFriends(); 
        setIsInitialLoading(false);
      } catch (err) {
        setIsInitialLoading(false);
      }
    };
    initData();

    const onRoomState = async (data) => {
      if (isLeaving.current) return;
      await refreshFriends();
      
      useRoomStore.setState((state) => {
        const rawParticipants = data.participants || state.participants;
        const uniqueParticipants = Array.from(
          new Map(rawParticipants.map(p => [String(p.id).trim(), p])).values()
        );

        return {
          ...state,
          participants: uniqueParticipants,
          joinCode: data.joinCode || state.joinCode 
        };
      });
    };

    const onFriendUpdate = (payload) => {
      if (isLeaving.current) return;
      if (!payload || !payload.fromId) {
        refreshFriends(); 
        return;
      }
      useAuthStore.setState((prev) => {
        const existingData = prev.friendStatuses[payload.fromId] || {};
        return {
          friendStatuses: { 
            ...prev.friendStatuses, 
            [payload.fromId]: { ...existingData, status: payload.status } 
          }
        };
      });
    };

    const onReaction = (data) => {
      if (isLeaving.current) return;
      const rid = Date.now() + Math.random();
      setActiveReactions(prev => [...prev, { ...data, id: rid, left: Math.floor(Math.random() * 60) + 20 }]);
      setTimeout(() => setActiveReactions(prev => prev.filter(r => r.id !== rid)), 4000);
    };

    socket.on('room:state', onRoomState);
    socket.on('friend:update', onFriendUpdate);
    socket.on('user:reaction', onReaction);

    return () => { 
      socket.off('room:state', onRoomState);
      socket.off('friend:update', onFriendUpdate); 
      socket.off('user:reaction', onReaction);
    };
  }, [roomId, joinCode, navigate, start, refreshFriends]);

  const handleLeave = async () => {
    if (isLeaving.current) return;
    isLeaving.current = true; 
    const socket = getSocket();
    socket?.off('room:state');
    socket?.off('friend:update');
    sessionStorage.removeItem('lastJoinCode');
    useRoomStore.setState({ roomId: null, joinCode: null, participants: [], currentSong: null });
    navigate('/', { replace: true });
    try { socket?.emit('room:leave'); await stop(); } catch (err) {}
  };

  const handleFriendAction = (targetId) => {
    const socket = getSocket();
    const statusData = friendStatuses[targetId];
    const current = statusData?.status || statusData; 
    const event = current === 'received' ? 'friend:accept' : 'friend:request';
    
    useAuthStore.setState((prev) => ({
      friendStatuses: {
        ...prev.friendStatuses,
        [targetId]: { ...(prev.friendStatuses[targetId] || {}), status: current === 'received' ? 'friend' : 'sent' }
      }
    }));

    socket?.emit(event, { targetId });
  };

  const toggleFriendSelect = (friendId) => {
    setSelectedFriends(prev => 
      prev.includes(friendId) ? prev.filter(id => id !== friendId) : [...prev, friendId]
    );
  };

  const handleSendInvites = () => {
    if (selectedFriends.length === 0) return;
    
    getSocket()?.emit('room:send_invites', { 
      invitedFriends: selectedFriends,
      roomId: roomId,
      joinCode: joinCode,
      currentSong: currentSong?.title || '대기 중',
      participantCount: participants.length
    });
    
    alert('친구를 초대했습니다!');
    setShowInviteModal(false);
    setSelectedFriends([]);
  };

  const invitableFriends = friends?.filter(f => 
    !participants.some(p => String(p.id).trim() === String(f.id).trim())
  ) || [];

  const sendEmoji = (emoji) => { getSocket()?.emit('user:reaction', { emoji }); };
  
  const searchSongs = async (q) => {
    setSongSearch(q);
    if (!q) return;
    try { 
      const { data } = await api.get(`/api/songs?q=${encodeURIComponent(q)}`); 
      setSongs(data || []); 
    } catch {}
  };
  
  const reserveSong = (songId) => { getSocket()?.emit('queue:add', { songId }); setShowSongPicker(false); setSongSearch(''); };

  if (!roomId && !sessionStorage.getItem('lastJoinCode') && !isLeaving.current) return null;

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes bubbleUp { 0% { transform: translateY(0) scale(0.5); opacity: 0; } 20% { opacity: 1; transform: translateY(-50px) scale(1.2); } 100% { transform: translateY(-350px) scale(1); opacity: 0; } }
        @keyframes pulseGlow { 0% { box-shadow: 0 0 5px #f9d423; border: 2px solid #f9d423; } 50% { box-shadow: 0 0 20px #f9d423; border: 2px solid #fff; } 100% { box-shadow: 0 0 5px #f9d423; border: 2px solid #f9d423; } }
        @keyframes heartbeat { 0% { transform: scale(1); } 15% { transform: scale(1.1); } 30% { transform: scale(1); } 45% { transform: scale(1.15); } 60% { transform: scale(1); } }
      `}</style>

      <div style={styles.reactionLayer}>
        {activeReactions.map(r => (
          <div key={r.id} style={{...styles.reactionBubble, left: `${r.left}%`}}>
            <div style={styles.reactionUser}>{r.nickname === user?.nickname ? "나" : r.nickname}</div>
            <div style={styles.reactionEmoji}>{r.emoji}</div>
          </div>
        ))}
      </div>

      <header style={styles.header}>
        <button onClick={handleLeave} style={styles.leaveBtn}>나가기</button>
        <span style={styles.roomCode}>코드: {joinCode || '...'}</span>
        
        {/* 마이크 버튼 수정: 로그인창과 동일한 컬러 시스템 & 작동 보장 */}
        <button 
          onClick={handleMicToggle} 
          style={{...styles.muteBtn, background: isMicOn ? '#ff4b2b' : '#30475e'}}
        >
          {isMicOn ? '🎤 켜짐' : '🔇 꺼짐'}
        </button>
      </header>

      <div style={styles.mainDisplay}>
        {currentSong ? (
          <div style={styles.songCard}>
            <h2 style={styles.songTitle}>{currentSong.title}</h2>
            <p style={styles.songArtist}>{currentSong.artist}</p>
          </div>
        ) : (
          <div style={styles.emptyCard}>화면을 눌러 노래를 예약하세요</div>
        )}
      </div>

      <div style={styles.participantSection}>
        <div style={styles.participantHeader}>
          <h3 style={styles.subTitle}>참여자 ({participants.length}/6명)</h3>
          <button 
            onClick={() => { setSelectedFriends([]); setShowInviteModal(true); }} 
            style={styles.inviteBtn}
            disabled={participants.length >= 6}
          >
            {participants.length >= 6 ? '꽉 찬 방' : '+ 친구 초대'}
          </button>
        </div>

        <div style={styles.userList}>
          {participants.map((p) => {
            const isMe = String(p.id).trim() === String(user?.id).trim();
            const statusData = friendStatuses[p.id]; 
            const currentStatus = statusData?.status || statusData; 
            
            const isReceived = currentStatus === 'received';
            const isFriend = currentStatus === 'friend';
            const isSent = currentStatus === 'sent';

            let buttonText = '➕ 추가';
            if (isFriend) buttonText = '✓ 친구';
            else if (isSent) buttonText = '요청됨';
            else if (isReceived) buttonText = '수락하기';

            return (
              <div key={p.id} style={styles.userItem}>
                <div style={styles.userInfo}>
                  <div style={styles.avatar}>{p.nickname?.[0]}</div>
                  <span style={styles.userName}>{p.nickname} {isMe && "(나)"}</span>
                </div>
                {!isMe && (
                  <button
                    onClick={() => handleFriendAction(p.id)}
                    disabled={isInitialLoading || isFriend || isSent}
                    style={{
                      ...styles.friendBtn,
                      ...(isReceived ? styles.receivedThumpEffect : {}),
                      ...(isFriend ? styles.alreadyFriend : {}),
                      opacity: (isSent || isInitialLoading) ? 0.7 : 1
                    }}
                  >
                    {isInitialLoading ? '...' : buttonText}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <footer style={styles.footer}>
        <div style={styles.emojiRow}>
          {EMOJIS.map(e => (<button key={e} onClick={() => sendEmoji(e)} style={styles.emojiBtn}>{e}</button>))}
        </div>
        <button onClick={() => setShowSongPicker(true)} style={styles.addSongBtn}>🎶 노래 예약하기</button>
      </footer>

      {showSongPicker && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <header style={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '1.5rem' }}>노래 찾기</h3>
              <button onClick={() => setShowSongPicker(false)} style={styles.closeBtn}>X</button>
            </header>
            <input style={styles.searchInput} value={songSearch} onChange={(e) => searchSongs(e.target.value)} placeholder="제목이나 가수를 입력하세요" />
            <div style={styles.songList}>
              {songs.map(s => (
                <div key={s.id} style={styles.songItem} onClick={() => reserveSong(s.id)}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{s.title}</div>
                  <div style={{fontSize: '1rem', color: '#aaa', marginTop: '0.25rem'}}>{s.artist}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showInviteModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2 style={{color: '#e94560', margin: '0 0 1rem 0', fontSize: '1.75rem'}}>방으로 친구 초대</h2>
            <p style={{color: '#aaa', marginBottom: '1.5rem', fontSize: '1rem'}}>지금 바로 방에 참여할 친구를 선택하세요.</p>
            
            <div style={styles.inviteFriendList}>
              {invitableFriends.length === 0 ? (
                <div style={{textAlign: 'center', color: '#666', padding: '1.5rem 0', fontSize: '1.1rem'}}>초대할 수 있는 친구가 없습니다.</div>
              ) : (
                invitableFriends.map(friend => (
                  <div 
                    key={friend.id} 
                    style={{
                      ...styles.inviteItem,
                      border: selectedFriends.includes(friend.id) ? '2px solid #e94560' : '2px solid transparent',
                      background: selectedFriends.includes(friend.id) ? 'rgba(233, 69, 96, 0.2)' : 'rgba(255,255,255,0.05)'
                    }}
                    onClick={() => toggleFriendSelect(friend.id)}
                  >
                    <span style={{fontSize: '1.125rem', fontWeight: 'bold'}}>{friend.nickname}</span>
                    <div style={{
                      width: '1.5rem', height: '1.5rem', borderRadius: '50%', border: '2px solid #fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem',
                      background: selectedFriends.includes(friend.id) ? '#e94560' : 'transparent'
                    }}>
                      {selectedFriends.includes(friend.id) && '✓'}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={() => setShowInviteModal(false)} style={styles.cancelBtn}>취소</button>
              <button 
                onClick={handleSendInvites} 
                style={{...styles.confirmBtn, opacity: selectedFriends.length === 0 ? 0.5 : 1}}
                disabled={selectedFriends.length === 0}
              >
                {selectedFriends.length > 0 ? `${selectedFriends.length}명 초대` : '선택하세요'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 반응형 적용 (clamp, rem, vw)
const styles = {
  container: { height: '100vh', display: 'flex', flexDirection: 'column', background: '#1a1a2e', color: '#fff', padding: 'clamp(1rem, 4vw, 2rem)', position: 'relative', overflow: 'hidden', boxSizing: 'border-box' },
  reactionLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 100 },
  reactionBubble: { position: 'absolute', bottom: '15vh', display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'bubbleUp 4s ease-out forwards' },
  reactionUser: { background: 'rgba(233, 69, 96, 0.9)', padding: '0.25rem 0.75rem', borderRadius: '1rem', fontSize: 'clamp(0.8rem, 3vw, 1rem)', fontWeight: 'bold', marginBottom: '0.25rem', whiteSpace: 'nowrap', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' },
  reactionEmoji: { fontSize: 'clamp(2.5rem, 8vw, 3.5rem)' },
  
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', zIndex: 10, gap: '0.5rem' },
  leaveBtn: { padding: '0.6rem 1rem', borderRadius: '0.75rem', background: '#53354a', color: '#fff', border: 'none', fontSize: 'clamp(0.9rem, 3.5vw, 1.125rem)', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' },
  roomCode: { fontSize: 'clamp(1.1rem, 4vw, 1.5rem)', fontWeight: 'bold', color: '#e94560', whiteSpace: 'nowrap' },
  muteBtn: { padding: '0.6rem 1rem', borderRadius: '0.75rem', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 'clamp(0.9rem, 3.5vw, 1.125rem)', fontWeight: 'bold', transition: '0.3s', whiteSpace: 'nowrap' },
  
  mainDisplay: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 },
  songCard: { textAlign: 'center', padding: 'clamp(1.5rem, 6vw, 3rem)', background: 'rgba(233,69,96,0.1)', borderRadius: '1.5rem', border: '2px solid #e94560', width: '100%', boxSizing: 'border-box' },
  songTitle: { fontSize: 'clamp(1.8rem, 8vw, 3rem)', margin: '0 0 0.5rem', wordBreak: 'keep-all' },
  songArtist: { fontSize: 'clamp(1.2rem, 5vw, 1.5rem)', color: '#aaa', margin: 0 },
  emptyCard: { fontSize: 'clamp(1.2rem, 5vw, 1.5rem)', color: '#666', textAlign: 'center' },
  
  participantSection: { marginBottom: '1.5rem' },
  participantHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' },
  subTitle: { fontSize: 'clamp(1.1rem, 4vw, 1.25rem)', color: '#e94560', margin: 0 },
  inviteBtn: { padding: '0.5rem 0.75rem', background: 'transparent', border: '1px solid #e94560', color: '#e94560', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer', fontSize: 'clamp(0.85rem, 3vw, 1rem)' },
  
  userList: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  userItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '0.75rem 1rem', borderRadius: '1rem' },
  userInfo: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  avatar: { width: 'clamp(2.5rem, 10vw, 3rem)', height: 'clamp(2.5rem, 10vw, 3rem)', borderRadius: '50%', background: '#e94560', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'clamp(1.2rem, 4vw, 1.5rem)', fontWeight: 'bold' },
  userName: { fontSize: 'clamp(1rem, 4vw, 1.125rem)' },
  friendBtn: { padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: 'none', background: '#30475e', color: '#fff', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s ease', fontSize: 'clamp(0.85rem, 3vw, 1rem)', whiteSpace: 'nowrap' },
  receivedThumpEffect: { background: 'linear-gradient(45deg, #f9d423, #ff4e50)', color: '#1a1a2e', animation: 'heartbeat 1.2s infinite ease-in-out, pulseGlow 1.2s infinite' },
  alreadyFriend: { background: 'transparent', border: '2px solid #e94560', color: '#e94560' },
  
  footer: { display: 'flex', flexDirection: 'column', gap: '1rem', zIndex: 10 },
  emojiRow: { display: 'flex', justifyContent: 'space-between' },
  emojiBtn: { fontSize: 'clamp(2rem, 8vw, 2.5rem)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 },
  addSongBtn: { padding: '1rem', borderRadius: '1rem', background: '#e94560', color: '#fff', fontSize: 'clamp(1.2rem, 5vw, 1.5rem)', fontWeight: 'bold', border: 'none', cursor: 'pointer' },
  
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 200 },
  modal: { background: '#1a1a2e', width: '100%', maxWidth: '28rem', borderRadius: '1.25rem', padding: 'clamp(1.25rem, 6vw, 2rem)', display: 'flex', flexDirection: 'column', border: '1px solid #333', boxSizing: 'border-box' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  closeBtn: { background: 'transparent', color: '#fff', border: 'none', fontSize: '1.5rem', cursor: 'pointer' },
  searchInput: { padding: '1rem', borderRadius: '0.75rem', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '1.125rem', marginBottom: '1rem', width: '100%', boxSizing: 'border-box' },
  songList: { flex: 1, overflowY: 'auto', maxHeight: '40vh' },
  songItem: { padding: '1rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' },
  inviteFriendList: { display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '30vh', overflowY: 'auto', marginBottom: '1rem' },
  inviteItem: { display: 'flex', justifyContent: 'space-between', padding: '1rem', borderRadius: '1rem', cursor: 'pointer', transition: 'all 0.2s ease', alignItems: 'center' },
  cancelBtn: { flex: 1, padding: '1rem', borderRadius: '0.75rem', border: 'none', background: '#444', color: '#fff', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' },
  confirmBtn: { flex: 2, padding: '1rem', borderRadius: '0.75rem', border: 'none', background: '#e94560', color: '#fff', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }
};