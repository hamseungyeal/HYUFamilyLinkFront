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

  // 1. 방 관리 및 실시간 리스너
  useEffect(() => {
    const socket = getSocket();
    if (!socket || isLeaving.current) return;

    if (!roomId) {
      const savedCode = sessionStorage.getItem('lastJoinCode');
      if (savedCode) {
        socket.emit('room:join', { joinCode: savedCode });
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
      
      useRoomStore.setState((state) => ({
        ...state,
        participants: data.participants || state.participants,
        joinCode: data.joinCode || state.joinCode 
      }));
    };

    // [수정] 소켓 업데이트 시 객체 구조({status, nickname})를 유지하도록 보강
    const onFriendUpdate = (payload) => {
      if (isLeaving.current) return;
      if (!payload || !payload.fromId) {
        refreshFriends(); // 페이로드가 없으면 전체 새로고침
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
    // [수정] 현재 상태를 안전하게 추출
    const statusData = friendStatuses[targetId];
    const current = statusData?.status || statusData; // 객체면 .status, 아니면 문자열 자체
    const event = current === 'received' ? 'friend:accept' : 'friend:request';
    
    // [수정] 낙관적 업데이트를 객체 구조에 맞게 갱신
    useAuthStore.setState((prev) => ({
      friendStatuses: {
        ...prev.friendStatuses,
        [targetId]: { ...(prev.friendStatuses[targetId] || {}), status: current === 'received' ? 'friend' : 'sent' }
      }
    }));

    socket?.emit(event, { targetId });
  };

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
        <span style={styles.roomCode}>방 코드: {joinCode || '...'}</span>
        <button onClick={() => toggleMute()} style={{...styles.muteBtn, background: muted ? '#ff4b2b' : 'transparent'}}>{muted ? '🔇 마이크 꺼짐' : '🎤 마이크 켜짐'}</button>
      </header>

      <div style={styles.mainDisplay}>
        {currentSong ? (
          <div style={styles.songCard}><h2 style={styles.songTitle}>{currentSong.title}</h2><p style={styles.songArtist}>{currentSong.artist}</p></div>
        ) : (
          <div style={styles.emptyCard}>화면을 눌러 노래를 예약하세요</div>
        )}
      </div>

      <div style={styles.participantSection}>
        <h3 style={styles.subTitle}>함께 있는 친구들 ({participants.length}명)</h3>
        <div style={styles.userList}>
          {participants.map((p) => {
            const isMe = p.id === user?.id;
            
            // [수정] 객체 구조에서 상태 문자열만 안전하게 추출
            const statusData = friendStatuses[p.id]; 
            const currentStatus = statusData?.status || statusData; // 하위 호환성 보장
            
            const isReceived = currentStatus === 'received';
            const isFriend = currentStatus === 'friend';
            const isSent = currentStatus === 'sent';

            let buttonText = '➕ 친구 추가';
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
        <div style={styles.emojiRow}>{EMOJIS.map(e => (<button key={e} onClick={() => sendEmoji(e)} style={styles.emojiBtn}>{e}</button>))}</div>
        <button onClick={() => setShowSongPicker(true)} style={styles.addSongBtn}>🎶 노래 예약하기</button>
      </footer>

      {showSongPicker && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <header style={styles.modalHeader}><h3>노래 찾기</h3><button onClick={() => setShowSongPicker(false)} style={styles.closeBtn}>X</button></header>
            <input style={styles.searchInput} value={songSearch} onChange={(e) => searchSongs(e.target.value)} placeholder="제목이나 가수를 입력하세요" />
            <div style={styles.songList}>{songs.map(s => (<div key={s.id} style={styles.songItem} onClick={() => reserveSong(s.id)}><div>{s.title}</div><div style={{fontSize: 14, color: '#aaa'}}>{s.artist}</div></div>))}</div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { height: '100vh', display: 'flex', flexDirection: 'column', background: '#1a1a2e', color: '#fff', padding: '20px', position: 'relative', overflow: 'hidden' },
  reactionLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 100 },
  reactionBubble: { position: 'absolute', bottom: '150px', display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'bubbleUp 4s ease-out forwards' },
  reactionUser: { background: 'rgba(233, 69, 96, 0.9)', padding: '5px 12px', borderRadius: '12px', fontSize: '16px', fontWeight: 'bold', marginBottom: '5px', whiteSpace: 'nowrap', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' },
  reactionEmoji: { fontSize: '50px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, zIndex: 10 },
  leaveBtn: { padding: '12px 20px', borderRadius: 10, background: '#53354a', color: '#fff', border: 'none', fontSize: 18, fontWeight: 'bold', cursor: 'pointer' },
  roomCode: { fontSize: 24, fontWeight: 'bold', color: '#e94560' },
  muteBtn: { padding: '12px 20px', borderRadius: 10, border: '1px solid #e94560', color: '#fff', cursor: 'pointer' },
  mainDisplay: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  songCard: { textAlign: 'center', padding: '40px', background: 'rgba(233,69,96,0.1)', borderRadius: 30, border: '2px solid #e94560', width: '100%' },
  songTitle: { fontSize: 42, margin: '0 0 10px' },
  songArtist: { fontSize: 24, color: '#aaa' },
  emptyCard: { fontSize: 22, color: '#666' },
  participantSection: { marginBottom: 30 },
  subTitle: { fontSize: 20, color: '#e94560', marginBottom: 10 },
  userList: { display: 'flex', flexDirection: 'column', gap: 10 },
  userItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: 15 },
  userInfo: { display: 'flex', alignItems: 'center', gap: 12 },
  avatar: { width: 45, height: 45, borderRadius: '50%', background: '#e94560', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 'bold' },
  userName: { fontSize: 18 },
  friendBtn: { padding: '10px 15px', borderRadius: 8, border: 'none', background: '#30475e', color: '#fff', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s ease' },
  receivedThumpEffect: { background: 'linear-gradient(45deg, #f9d423, #ff4e50)', color: '#1a1a2e', animation: 'heartbeat 1.2s infinite ease-in-out, pulseGlow 1.2s infinite' },
  alreadyFriend: { background: 'transparent', border: '2px solid #e94560', color: '#e94560' },
  footer: { display: 'flex', flexDirection: 'column', gap: 15, zIndex: 10 },
  emojiRow: { display: 'flex', justifyContent: 'space-between' },
  emojiBtn: { fontSize: 40, background: 'transparent', border: 'none', cursor: 'pointer' },
  addSongBtn: { padding: '18px', borderRadius: 15, background: '#e94560', color: '#fff', fontSize: 22, fontWeight: 'bold', border: 'none', cursor: 'pointer' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 200 },
  modal: { background: '#16213e', width: '100%', maxWidth: 500, borderRadius: 20, padding: 20, maxHeight: '80vh', display: 'flex', flexDirection: 'column' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: 15 },
  closeBtn: { background: 'transparent', color: '#fff', border: 'none', fontSize: 20, cursor: 'pointer' },
  searchInput: { padding: 15, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 18, marginBottom: 15 },
  songList: { flex: 1, overflowY: 'auto' },
  songItem: { padding: 15, borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }
};