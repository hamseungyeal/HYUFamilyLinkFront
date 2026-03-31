import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoomStore } from '../store/roomStore';
import { useAuthStore } from '../store/authStore';
import { useVoice } from '../hooks/useVoice';
import { getSocket } from '../hooks/useSocket';
import { api } from '../api/client';

const EMOJIS = ['🎤', '👏', '🔥', '❤️', '😂', '🎵'];

export default function RoomPage() {
  const navigate = useNavigate();
  const user     = useAuthStore((s) => s.user);

  const { roomId, joinCode, status, queue, currentSong, currentMs, reactions, lastScore } =
    useRoomStore();

  const { start, stop, toggleMute, connected, muted } = useVoice();

  const [songs,          setSongs]          = useState([]);
  const [songSearch,     setSongSearch]     = useState('');
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [tab,            setTab]            = useState('queue');

  if (!roomId) {
    navigate('/');
    return null;
  }

  async function handleLeave() {
    const socket = getSocket();
    socket?.emit('room:leave');
    stop();
    navigate('/');
  }

  async function openSongPicker() {
    const data = await api.get('/api/songs');
    setSongs(data);
    setSongSearch('');
    setShowSongPicker(true);
  }

  async function searchSongs(q) {
    setSongSearch(q);
    const data = await api.get(`/api/songs${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    setSongs(data);
  }

  function addToQueue(songId) {
    const socket = getSocket();
    socket?.emit('queue:add', { songId }, (ack) => {
      if (!ack?.error) setShowSongPicker(false);
    });
  }

  function sendReaction(emoji) {
    const socket = getSocket();
    socket?.emit('user:reaction', { emoji });
  }

  async function handleVoice() {
    if (connected) { stop(); } else { await start(); }
  }

  const statusLabel = { waiting: '대기 중', singing: '노래 중', result: '결과' }[status];
  const statusColor = { waiting: '#aaa', singing: '#e94560', result: '#f9ca24' }[status];

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <span style={styles.logo}>🎤 FamilyLink</span>
          <span style={{ ...styles.statusBadge, background: statusColor }}>{statusLabel}</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.codeLabel}>코드: <b>{joinCode}</b></span>
          <motion.button style={styles.leaveBtn} onClick={handleLeave} whileTap={{ scale: 0.95 }}>
            나가기
          </motion.button>
        </div>
      </header>

      <main style={styles.main}>
        {/* 현재 재생 중 */}
        <section style={styles.nowPlaying}>
          <AnimatePresence mode="wait">
            {currentSong ? (
              <motion.div
                key={currentSong.id}
                style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%' }}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3 }}
              >
                {currentSong.thumbnail && (
                  <img src={currentSong.thumbnail} alt="" style={styles.nowThumb} />
                )}
                <div style={styles.nowInfo}>
                  <p style={styles.nowTitle}>{currentSong.title}</p>
                  <p style={styles.nowArtist}>{currentSong.artist}</p>
                </div>
              </motion.div>
            ) : (
              <motion.p
                key="no-song"
                style={styles.noSong}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {status === 'result' ? '🏆 노래 종료' : '노래를 신청하거나 기다려주세요'}
              </motion.p>
            )}
          </AnimatePresence>
        </section>

        {/* 가사 싱크 */}
        {currentSong && (
          <div style={styles.lyricsBar}>
            <div
              style={{
                ...styles.lyricsProgress,
                width: `${Math.min((currentMs / ((currentSong.duration || 1) * 1000)) * 100, 100)}%`,
              }}
            />
            <span style={styles.lyricsTime}>{formatMs(currentMs)}</span>
          </div>
        )}

        {/* 점수 결과 */}
        <AnimatePresence>
          {status === 'result' && lastScore !== null && (
            <motion.div
              style={styles.scoreBox}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              🏆 점수: <strong>{lastScore}점</strong>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 리액션 */}
        <div style={styles.reactionRow}>
          {EMOJIS.map((emoji) => (
            <motion.button
              key={emoji}
              style={styles.emojiBtn}
              onClick={() => sendReaction(emoji)}
              whileTap={{ scale: 0.75 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            >
              {emoji}
            </motion.button>
          ))}
        </div>

        {/* 리액션 피드 */}
        <div style={styles.reactionFeed}>
          <AnimatePresence>
            {[...reactions].reverse().slice(0, 5).map((r, i) => (
              <motion.span
                key={`${r.nickname}-${i}`}
                style={styles.reactionItem}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.2 }}
              >
                {r.nickname}: {r.emoji}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        {/* 탭 */}
        <div style={styles.tabRow}>
          <motion.button
            style={{ ...styles.tab, ...(tab === 'queue' ? styles.tabActive : {}) }}
            onClick={() => setTab('queue')}
            whileTap={{ scale: 0.97 }}
          >
            대기열 ({queue.length})
          </motion.button>
          <motion.button
            style={{ ...styles.tab, ...(tab === 'score' ? styles.tabActive : {}) }}
            onClick={() => setTab('score')}
            whileTap={{ scale: 0.97 }}
          >
            점수판
          </motion.button>
        </div>

        {/* 대기열 */}
        {tab === 'queue' && (
          <div>
            <motion.button
              style={styles.addSongBtn}
              onClick={openSongPicker}
              whileTap={{ scale: 0.97 }}
            >
              + 노래 신청
            </motion.button>
            {queue.length === 0 && <p style={styles.empty}>대기열이 비어있습니다.</p>}
            {queue.map((item, idx) => (
              <motion.div
                key={item.id}
                style={styles.queueItem}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.04 }}
              >
                <span style={styles.queuePos}>{idx + 1}</span>
                <div style={styles.queueInfo}>
                  <span style={styles.queueTitle}>{item.title}</span>
                  <span style={styles.queueBy}>신청: {item.requested_by_nickname}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {tab === 'score' && (
          <p style={styles.empty}>이번 세션 점수가 여기에 표시됩니다.</p>
        )}

        {/* 음성 연결 */}
        <div style={styles.voiceArea}>
          <motion.button
            style={{ ...styles.voiceBtn, background: connected ? '#e94560' : '#0f3460' }}
            onClick={handleVoice}
            whileTap={{ scale: 0.96 }}
          >
            {connected ? (muted ? '🔇 음소거 해제' : '🎙️ 연결됨') : '🎙️ 음성 연결'}
          </motion.button>
          <AnimatePresence>
            {connected && (
              <motion.button
                style={styles.muteBtn}
                onClick={toggleMute}
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                whileTap={{ scale: 0.95 }}
              >
                {muted ? '음소거 해제' : '음소거'}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* 노래 선택 모달 */}
      <AnimatePresence>
        {showSongPicker && (
          <motion.div
            style={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSongPicker(false)}
          >
            <motion.div
              style={styles.modal}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={styles.modalTitle}>노래 신청</h3>
              <input
                style={styles.input}
                placeholder="검색"
                value={songSearch}
                onChange={(e) => searchSongs(e.target.value)}
                autoFocus
              />
              <div style={styles.modalList}>
                {songs.map((song, i) => (
                  <motion.div
                    key={song.id}
                    style={styles.modalItem}
                    onClick={() => addToQueue(song.id)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: i * 0.03 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div>
                      <p style={styles.modalSongTitle}>{song.title}</p>
                      <p style={styles.modalSongArtist}>{song.artist}</p>
                    </div>
                    <span style={styles.modalAdd}>+</span>
                  </motion.div>
                ))}
              </div>
              <motion.button
                style={styles.closeBtn}
                onClick={() => setShowSongPicker(false)}
                whileTap={{ scale: 0.97 }}
              >
                닫기
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

const styles = {
  container:   { minHeight: '100vh', background: '#0f0f1a', color: '#fff' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px', background: 'rgba(255,255,255,0.04)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  logo:        { fontSize: 18, fontWeight: 700, marginRight: 10 },
  statusBadge: { fontSize: 11, padding: '3px 8px', borderRadius: 20, color: '#fff' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  codeLabel:   { fontSize: 13, color: '#aaa' },
  leaveBtn: {
    padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)',
    background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 13,
  },
  main:        { maxWidth: 600, margin: '0 auto', padding: '16px' },
  nowPlaying: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '16px',
    borderRadius: 14, background: 'rgba(233,69,96,0.1)',
    border: '1px solid rgba(233,69,96,0.3)', marginBottom: 12,
    minHeight: 76,
  },
  nowThumb:    { width: 64, height: 46, objectFit: 'cover', borderRadius: 8 },
  nowInfo:     { flex: 1 },
  nowTitle:    { margin: 0, fontWeight: 700, fontSize: 16 },
  nowArtist:   { margin: '2px 0 0', color: '#aaa', fontSize: 13 },
  noSong:      { color: '#555', margin: 0, flex: 1, textAlign: 'center' },
  lyricsBar: {
    position: 'relative', height: 6, background: 'rgba(255,255,255,0.1)',
    borderRadius: 3, marginBottom: 8, overflow: 'hidden',
  },
  lyricsProgress: { position: 'absolute', left: 0, top: 0, height: '100%', background: '#e94560', transition: 'width 0.1s linear' },
  lyricsTime:     { display: 'block', textAlign: 'right', fontSize: 11, color: '#666', marginTop: 2 },
  scoreBox: {
    padding: '12px 16px', borderRadius: 12, background: 'rgba(249,202,36,0.15)',
    border: '1px solid rgba(249,202,36,0.3)', textAlign: 'center', marginBottom: 12, fontSize: 18,
  },
  reactionRow:  { display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  emojiBtn: {
    padding: '8px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.05)', fontSize: 20, cursor: 'pointer',
  },
  reactionFeed: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  reactionItem: { fontSize: 12, color: '#aaa', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 10 },
  tabRow:   { display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', marginBottom: 14 },
  tab: {
    flex: 1, padding: '10px 0', background: 'transparent',
    border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 14,
    transition: 'background 0.2s, color 0.2s',
  },
  tabActive: { background: '#e94560', color: '#fff', fontWeight: 700 },
  addSongBtn: {
    width: '100%', padding: '11px 0', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.2)',
    background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: 14, marginBottom: 10,
  },
  queueItem: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
    borderRadius: 10, background: 'rgba(255,255,255,0.04)', marginBottom: 6,
  },
  queuePos:   { fontSize: 14, color: '#666', minWidth: 20, textAlign: 'center' },
  queueInfo:  { flex: 1 },
  queueTitle: { display: 'block', fontSize: 14, fontWeight: 600 },
  queueBy:    { display: 'block', fontSize: 12, color: '#aaa' },
  empty:      { color: '#555', textAlign: 'center', padding: '20px 0' },
  voiceArea:  { display: 'flex', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' },
  voiceBtn: {
    flex: 1, padding: '13px 0', borderRadius: 12, border: 'none',
    color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
  },
  muteBtn: {
    padding: '13px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)',
    background: 'transparent', color: '#fff', cursor: 'pointer', overflow: 'hidden',
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    background: '#1a1a2e', borderRadius: '20px 20px 0 0',
    padding: '24px 16px', width: '100%', maxWidth: 500,
    maxHeight: '75vh', display: 'flex', flexDirection: 'column', gap: 12,
  },
  modalTitle:      { margin: 0, fontSize: 18, fontWeight: 700 },
  modalList:       { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 },
  modalItem: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', cursor: 'pointer',
  },
  modalSongTitle:  { margin: 0, fontSize: 14, fontWeight: 600 },
  modalSongArtist: { margin: '2px 0 0', fontSize: 12, color: '#aaa' },
  modalAdd:        { fontSize: 22, color: '#e94560' },
  closeBtn: {
    padding: '11px 0', borderRadius: 10, border: 'none',
    background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer',
  },
  input: {
    padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 15, outline: 'none',
  },
};
