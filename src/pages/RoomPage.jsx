import { useState, useEffect, useCallback } from 'react';
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
  
  // Zustand 스토어 데이터
  const { roomId, joinCode, participants, currentSong } = useRoomStore();
  
  // 음성 관련 훅
  const { start, stop, toggleMute, muted } = useVoice();
  
  const [friendStatuses, setFriendStatuses] = useState({});

  // 1. 초기 입장 및 데이터 로드
  useEffect(() => {
    // roomId가 없으면 메인으로 튕김
    if (!roomId) {
      navigate('/', { replace: true });
      return;
    }

    const initRoom = async () => {
      try {
        await start(roomId); // 음성 엔진 시작
        const { data } = await api.get('/api/friends/statuses'); // 친구 상태 로드
        setFriendStatuses(data);
      } catch (err) {
        console.error("방 초기화 중 오류:", err);
      }
    };
    initRoom();

    const socket = getSocket();
    // 실시간 친구 상태 업데이트 수신
    socket?.on('friend:update', ({ fromId, status }) => {
      setFriendStatuses(prev => ({ ...prev, [fromId]: status }));
    });

    return () => {
      socket?.off('friend:update');
    };
  }, [roomId, navigate, start]);

  // 2. [수정] 나가기 버튼 로직 (무조건 나가기 보장)
  const handleLeave = async () => {
    console.log("퇴장 처리 시작...");
    const socket = getSocket();
    
    try {
      // 서버에 퇴장 알림
      socket?.emit('room:leave');

      // 음성 엔진 종료 (최대 1초 대기)
      await Promise.race([
        stop(),
        new Promise(resolve => setTimeout(resolve, 1000))
      ]);
    } catch (err) {
      console.error("퇴장 과정 중 오류:", err);
    } finally {
      // [중요] 전역 상태를 강제로 비워야 HomePage의 useEffect가 다시 방으로 안 던집니다.
      useRoomStore.setState({ 
        roomId: null, 
        joinCode: null, 
        participants: [], 
        currentSong: null 
      });

      // 메인으로 강제 이동
      navigate('/', { replace: true });
    }
  };

  // 3. 친구 요청/수락 핸들러
  const handleFriendRequest = (targetId) => {
    const socket = getSocket();
    const currentStatus = friendStatuses[targetId];
    
    // 상대가 보낸 상태면 accept, 아니면 request
    const eventType = currentStatus === 'received' ? 'friend:accept' : 'friend:request';
    socket?.emit(eventType, { targetId });

    // 화면 즉시 반영
    setFriendStatuses(prev => ({
      ...prev,
      [targetId]: currentStatus === 'received' ? 'friend' : 'sent'
    }));
  };

  // 4. 이모지 리액션 전송
  const sendReaction = useCallback((emoji) => {
    getSocket()?.emit('user:reaction', { emoji });
  }, []);

  // roomId가 비워지는 순간 컴포넌트 렌더링 중단
  if (!roomId) return null;

  return (
    <div style={styles.container}>
      {/* 상단 바 */}
      <header style={styles.header}>
        <button onClick={handleLeave} style={styles.leaveBtn}>나가기</button>
        <div style={styles.roomInfo}>
          <span style={styles.roomCode}>방 코드: {joinCode}</span>
        </div>
        <button 
          onClick={() => toggleMute()} 
          style={{...styles.muteBtn, background: muted ? '#ff4b2b' : 'transparent'}}
        >
          {muted ? '🔇 마이크 꺼짐' : '🎤 마이크 켜짐'}
        </button>
      </header>

      {/* 중앙: 현재 노래 정보 */}
      <div style={styles.mainDisplay}>
        {currentSong ? (
          <div style={styles.songCard}>
            <h2 style={styles.songTitle}>{currentSong.title}</h2>
            <p style={styles.songArtist}>{currentSong.artist}</p>
          </div>
        ) : (
          <div style={styles.emptyCard}>예약된 노래가 없습니다.</div>
        )}
      </div>

      {/* 참여자 목록 & 친구 버튼 */}
      <div style={styles.participantSection}>
        <h3 style={styles.subTitle}>함께 있는 친구들</h3>
        <div style={styles.userList}>
          {participants.map((p) => {
            const isMe = p.id === user?.id;
            const status = friendStatuses[p.id];
            const isReceived = status === 'received';
            const isActionDisabled = isMe || status === 'friend' || status === 'sent';

            return (
              <div key={p.id} style={styles.userItem}>
                <div style={styles.userInfo}>
                  <div style={styles.avatar}>{p.nickname?.[0]}</div>
                  <span style={styles.userName}>{p.nickname} {isMe && "(나)"}</span>
                </div>
                {!isMe && (
                  <button
                    onClick={() => handleFriendRequest(p.id)}
                    disabled={isActionDisabled}
                    style={{
                      ...styles.friendBtn,
                      ...(isReceived ? styles.receivedEffect : {}),
                      ...(status === 'friend' ? styles.alreadyFriend : {}),
                      opacity: isActionDisabled && status !== 'friend' ? 0.5 : 1
                    }}
                  >
                    {status === 'friend' ? '✓ 친구' : 
                     status === 'sent' ? '요청됨' : 
                     isReceived ? '🤝 친구 수락!' : '➕ 친구 추가'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 하단: 리액션 및 예약 */}
      <footer style={styles.footer}>
        <div style={styles.emojiRow}>
          {EMOJIS.map(e => (
            <button key={e} onClick={() => sendReaction(e)} style={styles.emojiBtn}>{e}</button>
          ))}
        </div>
        <button style={styles.addSongBtn}>🎶 노래 예약하기</button>
      </footer>
    </div>
  );
}

const styles = {
  container: { height: '100vh', display: 'flex', flexDirection: 'column', background: '#1a1a2e', color: '#fff', padding: '20px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  leaveBtn: { padding: '15px 25px', borderRadius: 12, background: '#53354a', color: '#fff', border: 'none', fontSize: 20, fontWeight: 'bold', cursor: 'pointer' },
  roomCode: { fontSize: 26, fontWeight: 'bold', color: '#e94560' },
  muteBtn: { padding: '15px 20px', borderRadius: 12, border: '2px solid #e94560', color: '#fff', fontSize: 18, fontWeight: 'bold', cursor: 'pointer' },
  mainDisplay: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '20px 0' },
  songCard: { textAlign: 'center', padding: '40px', background: 'rgba(233, 69, 96, 0.1)', borderRadius: 30, border: '2px solid #e94560', width: '100%' },
  songTitle: { fontSize: 42, margin: '0 0 10px' },
  songArtist: { fontSize: 24, color: '#aaa' },
  emptyCard: { fontSize: 24, color: '#666' },
  participantSection: { marginBottom: 30 },
  subTitle: { fontSize: 22, color: '#e94560', marginBottom: 15 },
  userList: { display: 'flex', flexDirection: 'column', gap: 12 },
  userItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '15px 20px', borderRadius: 20 },
  userInfo: { display: 'flex', alignItems: 'center', gap: 15 },
  avatar: { width: 50, height: 50, borderRadius: '50%', background: '#e94560', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 'bold' },
  userName: { fontSize: 22, fontWeight: '500' },
  friendBtn: { padding: '12px 20px', borderRadius: 12, border: 'none', background: '#30475e', color: '#fff', fontSize: 18, fontWeight: 'bold', cursor: 'pointer' },
  receivedEffect: { background: '#f9d423', color: '#1a1a2e', boxShadow: '0 0 15px #f9d423', animation: 'pulse 1.5s infinite' },
  alreadyFriend: { background: 'transparent', border: '2px solid #e94560', color: '#e94560' },
  footer: { display: 'flex', flexDirection: 'column', gap: 15 },
  emojiRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 10 },
  emojiBtn: { fontSize: 40, background: 'transparent', border: 'none', cursor: 'pointer' },
  addSongBtn: { padding: '20px', borderRadius: 20, background: '#e94560', color: '#fff', fontSize: 24, fontWeight: 'bold', border: 'none', cursor: 'pointer' }
};