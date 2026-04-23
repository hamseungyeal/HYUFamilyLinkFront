import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRoomStore } from '../store/roomStore';
import { useAuthStore } from '../store/authStore';
import { useVoice } from '../hooks/useVoice';
import { getSocket } from '../hooks/useSocket';
import { api } from '../api/client';
import YouTube from 'react-youtube'; 

const EMOJIS = ['🎤', '👏', '🔥', '❤️', '😂', '🎵'];

export default function RoomPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  
  const friends = useAuthStore((s) => s.friends);
  const friendStatuses = useAuthStore((s) => s.friendStatuses);
  const refreshFriends = useAuthStore((s) => s.refreshFriends);

  const { roomId, joinCode, participants, currentTurnId } = useRoomStore();
  const { start, stop, toggleMute, muted } = useVoice();

  const [showSongPicker, setShowSongPicker] = useState(false);
  const [songSearch, setSongSearch] = useState('');
  const [songs, setSongs] = useState([]);
  
  const [activeReactions, setActiveReactions] = useState([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const isLeaving = useRef(false);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState([]);

  const [isMicOn, setIsMicOn] = useState(!muted);
  
  const [playingVideo, setPlayingVideo] = useState(null);
  
  const [isVideoPlaying, setIsVideoPlaying] = useState(false); 

  const playingVideoRef = useRef(playingVideo);
  const userRef = useRef(user);
  const ytPlayerRef = useRef(null); 

  useEffect(() => {
    playingVideoRef.current = playingVideo;
    userRef.current = user;
  }, [playingVideo, user]);

  const isMyTurn = currentTurnId ? String(user?.id).trim() === String(currentTurnId).trim() : false;
  const amISinging = playingVideo?.singerId ? String(user?.id).trim() === String(playingVideo.singerId).trim() : false;

  const handleMicToggle = () => {
    if (toggleMute) toggleMute(); 
    setIsMicOn((prev) => !prev); 
  };

  useEffect(() => {
    const socket = getSocket();
    
    if (!socket || !roomId || isLeaving.current) {
      useRoomStore.setState({ roomId: null, joinCode: null, participants: [], currentSong: null, currentTurnId: null });
      navigate('/', { replace: true });
      return; 
    }

    const initData = async () => {
      try {
        await start(roomId);
        await refreshFriends(); 
        getSocket()?.emit('room:request_state', { roomId });
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
          roomId: data.roomId || state.roomId,
          participants: uniqueParticipants,
          joinCode: data.joinCode || state.joinCode,
          currentTurnId: data.currentTurnId !== undefined ? data.currentTurnId : state.currentTurnId
        };
      });

      if (data.playingVideo) {
        if (!playingVideoRef.current) setIsVideoPlaying(false);
        setPlayingVideo(data.playingVideo);
      } else {
        setPlayingVideo(null);
        setIsVideoPlaying(false);
      }
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

    const onSongPlay = (data) => {
      if (!isLeaving.current) {
        setPlayingVideo(data);
        setIsVideoPlaying(false); // 재생 명령이 오면 일단 화면 가리기 (로딩 중)
        setShowSongPicker(false);
      }
    };

    const onSongStop = () => {
      if (!isLeaving.current) {
        setPlayingVideo(null);
        setIsVideoPlaying(false);
      }
    };

    const onRequestSync = async () => {
      const currentVideo = playingVideoRef.current;
      const currentUser = userRef.current;
      if (currentVideo && currentUser && String(currentUser.id).trim() === String(currentVideo.singerId).trim()) {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
          const time = await ytPlayerRef.current.getCurrentTime();
          socket.emit('song:send_sync', { time });
        }
      }
    };

    const onReceiveSync = async ({ time }) => {
      const currentVideo = playingVideoRef.current;
      const currentUser = userRef.current;
      if (currentVideo && currentUser && String(currentUser.id).trim() !== String(currentVideo.singerId).trim()) {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
          const myTime = await ytPlayerRef.current.getCurrentTime();
          if (Math.abs(myTime - time) > 0.1) { 
            ytPlayerRef.current.seekTo(time, true);
          }
        }
        setIsVideoPlaying(true);
      }
    };

    socket.on('room:state', onRoomState);
    socket.on('friend:update', onFriendUpdate);
    socket.on('user:reaction', onReaction);
    socket.on('song:play', onSongPlay); 
    socket.on('song:stop', onSongStop); 
    socket.on('song:request_sync', onRequestSync);
    socket.on('song:receive_sync', onReceiveSync);

    return () => { 
      socket.off('room:state', onRoomState);
      socket.off('friend:update', onFriendUpdate); 
      socket.off('user:reaction', onReaction);
      socket.off('song:play', onSongPlay);
      socket.off('song:stop', onSongStop);
      socket.off('song:request_sync', onRequestSync);
      socket.off('song:receive_sync', onReceiveSync);
    };
  }, [roomId, navigate, start, refreshFriends]); 

  const onPlayerReady = (event) => {
    ytPlayerRef.current = event.target;
    const currentVideo = playingVideoRef.current;
    const currentUser = userRef.current;
    if (currentVideo && currentUser && String(currentUser.id).trim() !== String(currentVideo.singerId).trim()) {
      getSocket()?.emit('song:request_sync');
    }
  };

  const onPlayerStateChange = (event) => {
    const PLAYING = 1;
    const ENDED = 0;
    const BUFFERING = 3;
    const CUED = 5; // 영상 로드 완료 상태

    const currentVideo = playingVideoRef.current;
    const currentUser = userRef.current;
    if (!currentVideo || !currentUser) return;

    const amISingingNow = String(currentUser.id).trim() === String(currentVideo.singerId).trim();

    // 1. 재생 시작 또는 버퍼링 후 재개 시
    if (event.data === PLAYING) {
      if (amISingingNow) {
        setIsVideoPlaying(true); 
        event.target.getCurrentTime().then(time => {
          console.log(`[Sync] 가수 재생 재개 - 기준점 발송: ${time}s`);
          getSocket()?.emit('song:send_sync', { time });
        });
      } else {
        console.log("[Sync] 관객 재생 재개 - 싱크 요청");
        getSocket()?.emit('song:request_sync');
      }
    } 
    
    else if (event.data === BUFFERING) {
      setIsVideoPlaying(false);
    }

    else if (event.data === ENDED) {
      if (amISingingNow) {
        getSocket()?.emit('song:end');
        setPlayingVideo(null);
        setIsVideoPlaying(false);
      }
    }
  };


  const handleLeave = async () => {
    if (isLeaving.current) return;
    isLeaving.current = true; 

    const socket = getSocket();
    
    const currentVideo = playingVideoRef.current;
    const currentUser = userRef.current;
    if (currentVideo && currentUser && String(currentUser.id).trim() === String(currentVideo.singerId).trim()) {
      socket?.emit('song:end');
    }
    
    socket?.off('room:state');
    
    useRoomStore.setState({ roomId: null, joinCode: null, participants: [], currentSong: null, currentTurnId: null });
    navigate('/', { replace: true });

    try { 
      socket?.emit('room:leave'); 
      await stop(); 
    } catch (err) {}
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
    setSelectedFriends(prev => prev.includes(friendId) ? prev.filter(id => id !== friendId) : [...prev, friendId]);
  };

  const handleSendInvites = () => {
    if (selectedFriends.length === 0) return;
    getSocket()?.emit('room:send_invites', { 
      invitedFriends: selectedFriends,
      roomId: roomId,
      joinCode: joinCode,
      currentSong: playingVideoRef.current?.title || '대기 중',
      participantCount: participants.length
    });
    alert('친구를 초대했습니다!');
    setShowInviteModal(false);
    setSelectedFriends([]);
  };

  const handleModalOutsideClick = (e, setter) => {
    if (e.target === e.currentTarget) {
      setter(false);
    }
  };

  const invitableFriends = friends?.filter(f => 
    !participants.some(p => String(p.id).trim() === String(f.id).trim())
  ) || [];

  const sendEmoji = (emoji) => { getSocket()?.emit('user:reaction', { emoji }); };
  
  const executeSearch = async () => {
    if (!songSearch.trim()) return;
    try { 
      const data = await api.get(`/api/songs?q=${encodeURIComponent(songSearch)}`); 
      setSongs(data || []); 
    } catch (err) {
      console.error("검색 오류:", err);
    }
  };
  
  const reserveSong = (song) => { 
    getSocket()?.emit('song:select', { videoId: song.video_id || song.id, title: song.title, artist: song.artist }); 
    setShowSongPicker(false); 
    setSongSearch(''); 
    setSongs([]);
  };

  const handleSkipTurn = () => {
    getSocket()?.emit('turn:skip');
    setPlayingVideo(null); 
    setIsVideoPlaying(false);
  };

  if (!roomId && !isLeaving.current) return null;

  const currentTurnUser = participants.find(p => String(p.id).trim() === String(currentTurnId).trim());

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes bubbleUp { 0% { transform: translateY(0) scale(0.5); opacity: 0; } 20% { opacity: 1; transform: translateY(-50px) scale(1.2); } 100% { transform: translateY(-350px) scale(1); opacity: 0; } }
        @keyframes pulseGlow { 0% { box-shadow: 0 0 5px #f9d423; border: 2px solid #f9d423; } 50% { box-shadow: 0 0 20px #f9d423; border: 2px solid #fff; } 100% { box-shadow: 0 0 5px #f9d423; border: 2px solid #f9d423; } }
        @keyframes heartbeat { 0% { transform: scale(1); } 15% { transform: scale(1.1); } 30% { transform: scale(1); } 45% { transform: scale(1.15); } 60% { transform: scale(1); } }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        
        .youtube-video-container {
          position: relative;
          width: 100%;
          flex: 1; 
          min-height: 0;
          border-radius: 0.75rem;
          overflow: hidden;
        }
        .youtube-video-container iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
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
        
        <button 
          onClick={handleMicToggle} 
          style={{...styles.muteBtn, background: isMicOn ? '#ff4b2b' : '#30475e'}}
        >
          {isMicOn ? '🎤 켜짐' : '🔇 꺼짐'}
        </button>
      </header>

      <div style={styles.mainDisplay}>
        {playingVideo ? (
          <div style={{...styles.songCard, position: 'relative', pointerEvents: 'none' }}>
            
            {/* ✨ 진짜 재생이 시작되기 전까지만 띄워두는 가짜 로딩 화면 */}
            {!isVideoPlaying && (
              <div style={styles.loadingOverlay}>
                <div style={styles.loadingSpinner}></div>
                <p>영상을 불러오고 동기화하는 중...</p>
              </div>
            )}

            <div className="youtube-video-container">
              <YouTube 
                videoId={playingVideo.videoId} 
                opts={{ 
                  playerVars: { autoplay: 1, controls: 0 , disablekb: 1 } 
                }}
                host="https://www.youtube-nocookie.com"
                onReady={onPlayerReady}
                onStateChange={onPlayerStateChange} 
              />
            </div>
            <h2 style={{...styles.songTitle, marginTop: '0.75rem'}}>{playingVideo.title}</h2>
            <p style={styles.songArtist}>{playingVideo.artist}</p>
          </div>
        ) : (
          <div style={styles.songCard}>
             <h2 style={styles.songTitle}>대기 중</h2>
             <p style={styles.emptyCard}>
               {currentTurnUser ? `현재 차례: ${currentTurnUser.nickname}` : '참여자를 기다리는 중...'}
             </p>
          </div>
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

        <div className="custom-scroll" style={styles.userList}>
          {participants.map((p) => {
            const isMe = String(p.id).trim() === String(user?.id).trim();
            const isThisUserTurn = currentTurnId ? String(p.id).trim() === String(currentTurnId).trim() : false; 
            
            const statusData = friendStatuses[p.id]; 
            const currentStatus = statusData?.status || statusData; 
            
            const isReceived = currentStatus === 'received';
            const isFriend = currentStatus === 'friend';
            const isSent = currentStatus === 'sent';
            const avatarPath = p.profileImage > 0 ? `/avatars/${p.profileImage}.jpg` : '/avatars/default.jpg';
            let buttonText = '➕ 추가';
            if (isFriend) buttonText = '✓ 친구';
            else if (isSent) buttonText = '요청됨';
            else if (isReceived) buttonText = '수락하기';

            return (
              <div key={p.id} style={{
                ...styles.userItem,
                border: isThisUserTurn ? '2px solid #f9d423' : 'none' 
              }}>
                <div style={styles.userInfo}>
                  <div style={{...styles.avatar, background: 'transparent', overflow: 'hidden'}}>
                    <img 
                      src={avatarPath} 
                      alt="프로필" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  </div>
                  <span style={styles.userName}>
                    {p.nickname} {isMe && "(나)"} {isThisUserTurn && " 🎤"} 
                  </span>
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
        
        {amISinging ? (
          <button 
            onClick={handleSkipTurn} 
            style={{...styles.addSongBtn, background: '#f9d423', color: '#1a1a2e'}}
          >
            차례 넘기기 ⏭️
          </button>
        ) : (
          <button 
            onClick={() => setShowSongPicker(true)} 
            style={{
              ...styles.addSongBtn,
              background: isMyTurn ? '#e94560' : '#444',
              cursor: isMyTurn ? 'pointer' : 'not-allowed'
            }}
            disabled={!isMyTurn}
          >
            {isMyTurn ? '🎶 노래 고르기' : '차례 대기'}
          </button>
        )}
      </footer>

      {showSongPicker && (
        <div style={styles.modalOverlay} onClick={(e) => handleModalOutsideClick(e, setShowSongPicker)}>
          <div style={styles.modal}>
            <header style={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: 'clamp(1.2rem, 5vw, 1.5rem)' }}>노래 찾기 (MR 전용)</h3>
              <button onClick={() => setShowSongPicker(false)} style={styles.closeBtn}>X</button>
            </header>
            
            <div style={styles.searchContainer}>
              <input 
                style={styles.searchInput} 
                value={songSearch} 
                onChange={(e) => setSongSearch(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
                placeholder="제목이나 가수 검색" 
              />
              <button onClick={executeSearch} style={styles.searchSubmitBtn}>검색</button>
            </div>

            <div className="custom-scroll" style={styles.songList}>
              {songs.length === 0 && songSearch && (
                <div style={{ textAlign: 'center', color: '#666', marginTop: '1.5rem', fontSize: '1rem' }}>
                  검색 결과가 없거나 검색 버튼을 눌러주세요.
                </div>
              )}
              {songs.map(s => (
    <div key={s.id} style={styles.songItem} onClick={() => reserveSong(s)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 'clamp(1.1rem, 4vw, 1.25rem)', fontWeight: 'bold' }}>{s.title}</div>
        
        {s.tags && s.tags.map((tag, index) => (
          <span key={index} style={styles.tagBadge}>
            {tag}
          </span>
        ))}
      </div>
      <div style={{fontSize: 'clamp(0.9rem, 3.5vw, 1rem)', color: '#aaa', marginTop: '0.25rem'}}>{s.artist}</div>
    </div>
  ))}
</div>
          </div>
        </div>
      )}

      {showInviteModal && (
        <div style={styles.modalOverlay} onClick={(e) => handleModalOutsideClick(e, setShowInviteModal)}>
          <div style={styles.modal}>
            <h2 style={{color: '#e94560', margin: '0 0 1rem 0', fontSize: 'clamp(1.5rem, 6vw, 1.75rem)'}}>방으로 친구 초대</h2>
            <p style={{color: '#aaa', marginBottom: '1.5rem', fontSize: 'clamp(0.9rem, 3.5vw, 1rem)'}}>지금 바로 방에 참여할 친구를 선택하세요.</p>
            
            <div className="custom-scroll" style={styles.inviteFriendList}>
              {invitableFriends.length === 0 ? (
                <div style={{textAlign: 'center', color: '#666', padding: '1.5rem 0', fontSize: 'clamp(1rem, 4vw, 1.125rem)'}}>초대할 수 있는 친구가 없습니다.</div>
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
                    <span style={{fontSize: 'clamp(1rem, 4vw, 1.125rem)', fontWeight: 'bold'}}>{friend.nickname}</span>
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

const styles = {
  container: { height: '100vh', display: 'flex', flexDirection: 'column', background: '#1a1a2e', color: '#fff', padding: 'clamp(1rem, 4vw, 2rem)', position: 'relative', overflow: 'hidden', boxSizing: 'border-box' },
  reactionLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 100 },
  reactionBubble: { position: 'absolute', bottom: '15vh', display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'bubbleUp 4s ease-out forwards' },
  reactionUser: { background: 'rgba(233, 69, 96, 0.9)', padding: '0.25rem 0.75rem', borderRadius: '1rem', fontSize: 'clamp(0.8rem, 3vw, 1rem)', fontWeight: 'bold', marginBottom: '0.25rem', whiteSpace: 'nowrap', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' },
  reactionEmoji: { fontSize: 'clamp(2.5rem, 8vw, 3.5rem)' },
  
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', zIndex: 10, gap: '0.5rem' },
  leaveBtn: { padding: '0.5rem 1rem', borderRadius: '0.75rem', background: '#53354a', color: '#fff', border: 'none', fontSize: 'clamp(0.9rem, 3vw, 1.1rem)', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' },
  roomCode: { fontSize: 'clamp(1.1rem, 4vw, 1.5rem)', fontWeight: 'bold', color: '#e94560', whiteSpace: 'nowrap' },
  muteBtn: { padding: '0.5rem 1rem', borderRadius: '0.75rem', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 'clamp(0.9rem, 3vw, 1.1rem)', fontWeight: 'bold', transition: '0.3s', whiteSpace: 'nowrap' },
  
  mainDisplay: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, width: '100%', marginBottom: '1rem' },
  
  songCard: { 
    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    textAlign: 'center', padding: 'clamp(0.75rem, 2vw, 1.25rem)', background: 'rgba(233,69,96,0.1)', 
    borderRadius: '1.5rem', border: '2px solid #e94560', width: '100%', maxWidth: '34rem', 
    height: 'clamp(14rem, 35vh, 20rem)', boxSizing: 'border-box' 
  },
  
  tagBadge: {
    background: '#e94560',
    color: '#fff',
    fontSize: '0.75rem',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: 'bold',
    display: 'inline-block',
    verticalAlign: 'middle'
  },
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(26, 26, 46, 0.85)', pointerEvents: 'none',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    zIndex: 10, borderRadius: '1.5rem', color: '#fff', fontWeight: 'bold'
  },
  loadingSpinner: {
    width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.3)',
    borderTop: '4px solid #e94560', borderRadius: '50%',
    animation: 'spin 1s linear infinite', marginBottom: '10px'
  },

  songTitle: { fontSize: 'clamp(1rem, 3.5vw, 1.25rem)', margin: '0 0 0.25rem', wordBreak: 'keep-all', color: '#fff' },
  songArtist: { fontSize: 'clamp(0.85rem, 3.5vw, 1rem)', color: '#aaa', margin: 0 },
  emptyCard: { fontSize: 'clamp(1rem, 4vw, 1.25rem)', color: '#666', textAlign: 'center' },
  
  participantSection: { marginBottom: '1rem' },
  participantHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' },
  subTitle: { fontSize: 'clamp(1rem, 3.5vw, 1.15rem)', color: '#e94560', margin: 0 },
  inviteBtn: { padding: '0.4rem 0.6rem', background: 'transparent', border: '1px solid #e94560', color: '#e94560', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer', fontSize: 'clamp(0.8rem, 2.5vw, 0.9rem)' },
  
  userList: { display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '12rem', overflowY: 'auto', paddingRight: '0.5rem' },
  userItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '0.6rem 0.8rem', borderRadius: '0.75rem' },
  userInfo: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  avatar: { width: 'clamp(2rem, 8vw, 2.5rem)', height: 'clamp(2rem, 8vw, 2.5rem)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'clamp(1rem, 3.5vw, 1.25rem)', fontWeight: 'bold', color: '#fff' },
  userName: { fontSize: 'clamp(0.9rem, 3.5vw, 1rem)' },
  friendBtn: { padding: '0.4rem 0.6rem', borderRadius: '0.5rem', border: 'none', background: '#30475e', color: '#fff', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s ease', fontSize: 'clamp(0.8rem, 2.5vw, 0.9rem)', whiteSpace: 'nowrap' },
  receivedThumpEffect: { background: 'linear-gradient(45deg, #f9d423, #ff4e50)', color: '#1a1a2e', animation: 'heartbeat 1.2s infinite ease-in-out, pulseGlow 1.2s infinite' },
  alreadyFriend: { background: 'transparent', border: '2px solid #e94560', color: '#e94560' },
  
  footer: { display: 'flex', flexDirection: 'column', gap: '0.75rem', zIndex: 10 },
  emojiRow: { display: 'flex', justifyContent: 'space-between' },
  emojiBtn: { fontSize: 'clamp(1.8rem, 7vw, 2.2rem)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 },
  
  addSongBtn: { padding: '0.75rem', borderRadius: '0.75rem', color: '#fff', fontSize: 'clamp(1.1rem, 4vw, 1.25rem)', fontWeight: 'bold', border: 'none', transition: '0.3s' },
  
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 200, cursor: 'pointer' },
  modal: { background: '#1a1a2e', width: '100%', maxWidth: '28rem', borderRadius: '1.25rem', padding: 'clamp(1.25rem, 6vw, 2rem)', display: 'flex', flexDirection: 'column', border: '1px solid #333', boxSizing: 'border-box', cursor: 'default' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  closeBtn: { background: 'transparent', color: '#fff', border: 'none', fontSize: '1.5rem', cursor: 'pointer' },
  
  searchContainer: { display: 'flex', gap: '0.5rem', marginBottom: '1rem', width: '100%' },
  searchInput: { flex: 1, padding: '1rem', borderRadius: '0.75rem', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 'clamp(1rem, 4vw, 1.125rem)', boxSizing: 'border-box', outline: 'none', minWidth: 0 },
  searchSubmitBtn: { padding: '0 1.25rem', borderRadius: '0.75rem', border: 'none', background: '#e94560', color: '#fff', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' },
  
  songList: { flex: 1, overflowY: 'auto', maxHeight: '40vh', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.5rem' },
  songItem: { padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.75rem', cursor: 'pointer', transition: 'background 0.2s ease' },
  
  inviteFriendList: { display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '30vh', overflowY: 'auto', marginBottom: '1rem', paddingRight: '0.5rem' },
  inviteItem: { display: 'flex', justifyContent: 'space-between', padding: '1rem', borderRadius: '1rem', cursor: 'pointer', transition: 'all 0.2s ease', alignItems: 'center' },
  cancelBtn: { flex: 1, padding: '1rem', borderRadius: '0.75rem', border: 'none', background: '#444', color: '#fff', fontSize: 'clamp(0.9rem, 3.5vw, 1.1rem)', fontWeight: 'bold', cursor: 'pointer' },
  confirmBtn: { flex: 2, padding: '1rem', borderRadius: '0.75rem', border: 'none', background: '#e94560', color: '#fff', fontSize: 'clamp(0.9rem, 3.5vw, 1.1rem)', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }
};