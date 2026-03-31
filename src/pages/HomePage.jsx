import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { getSocket } from '../hooks/useSocket';

export default function HomePage() {
  const [songs,     setSongs]     = useState([]);
  const [search,    setSearch]    = useState('');
  const [joinCode,  setJoinCode]  = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  const user     = useAuthStore((s) => s.user);
  const logout   = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSongs('');
  }, []);

  async function fetchSongs(q) {
    try {
      const data = await api.get(`/api/songs${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setSongs(data);
    } catch {
      /* 무시 */
    }
  }

  function handleSearch(e) {
    const q = e.target.value;
    setSearch(q);
    fetchSongs(q);
  }

  async function handleJoin(e) {
    e.preventDefault();
    setError('');
    if (!joinCode.trim()) return;

    setLoading(true);
    try {
      await api.get(`/api/rooms/${joinCode.toUpperCase()}`);
      const socket = getSocket();
      socket.emit('room:join', { joinCode: joinCode.toUpperCase() }, (ack) => {
        if (ack?.error) { setError(ack.error); setLoading(false); return; }
        navigate('/room');
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function handleCreateRoom() {
    setLoading(true);
    try {
      const room   = await api.post('/api/rooms', {});
      const socket = getSocket();
      socket.emit('room:join', { joinCode: room.join_code }, (ack) => {
        if (ack?.error) { setError(ack.error); setLoading(false); return; }
        navigate('/room');
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <span style={styles.logo}>🎤 FamilyLink</span>
        <div style={styles.headerRight}>
          <span style={styles.nickname}>{user?.nickname}</span>
          <motion.button
            style={styles.logoutBtn}
            onClick={() => { logout(); navigate('/auth'); }}
            whileTap={{ scale: 0.95 }}
          >
            로그아웃
          </motion.button>
        </div>
      </header>

      <main style={styles.main}>
        <motion.section
          style={styles.section}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          <h2 style={styles.sectionTitle}>방 입장</h2>
          <form onSubmit={handleJoin} style={styles.joinRow}>
            <input
              style={styles.input}
              placeholder="참여 코드 입력 (예: KL0A2G)"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={8}
            />
            <motion.button
              style={styles.joinBtn}
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.95 }}
            >
              입장
            </motion.button>
          </form>
          <AnimatePresence>
            {error && (
              <motion.p
                style={styles.error}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
          <motion.button
            style={styles.createBtn}
            onClick={handleCreateRoom}
            disabled={loading}
            whileTap={{ scale: 0.97 }}
          >
            + 새 방 만들기
          </motion.button>
        </motion.section>

        <motion.section
          style={styles.section}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut', delay: 0.1 }}
        >
          <h2 style={styles.sectionTitle}>노래 목록</h2>
          <input
            style={{ ...styles.input, marginBottom: 12 }}
            placeholder="제목 또는 아티스트 검색"
            value={search}
            onChange={handleSearch}
          />
          <div style={styles.songList}>
            {songs.length === 0 && (
              <p style={styles.empty}>등록된 노래가 없습니다.</p>
            )}
            {songs.map((song, i) => (
              <motion.div
                key={song.id}
                style={styles.songItem}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.04 }}
                whileTap={{ scale: 0.98 }}
              >
                {song.thumbnail && (
                  <img src={song.thumbnail} alt={song.title} style={styles.thumb} />
                )}
                <div style={styles.songInfo}>
                  <span style={styles.songTitle}>{song.title}</span>
                  <span style={styles.songArtist}>{song.artist}</span>
                </div>
                <span style={styles.duration}>{formatDuration(song.duration)}</span>
              </motion.div>
            ))}
          </div>
        </motion.section>
      </main>
    </div>
  );
}

function formatDuration(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const styles = {
  container: { minHeight: '100vh', background: '#0f0f1a', color: '#fff' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 24px', background: 'rgba(255,255,255,0.04)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  logo:        { fontSize: 20, fontWeight: 700 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  nickname:    { color: '#aaa', fontSize: 14 },
  logoutBtn: {
    padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)',
    background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 13,
  },
  main:         { maxWidth: 600, margin: '0 auto', padding: '24px 16px' },
  section:      { marginBottom: 36 },
  sectionTitle: { margin: '0 0 14px', fontSize: 18, fontWeight: 700 },
  joinRow:      { display: 'flex', gap: 8, marginBottom: 8 },
  input: {
    flex: 1, padding: '11px 14px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 15, outline: 'none',
  },
  joinBtn: {
    padding: '11px 20px', borderRadius: 10, border: 'none',
    background: '#e94560', color: '#fff', fontWeight: 700, cursor: 'pointer',
  },
  createBtn: {
    width: '100%', padding: '11px 0', borderRadius: 10,
    border: '1px dashed rgba(255,255,255,0.25)', background: 'transparent',
    color: '#aaa', cursor: 'pointer', fontSize: 14,
  },
  error:   { color: '#ff6b6b', fontSize: 13, margin: '4px 0 0' },
  songList: { display: 'flex', flexDirection: 'column', gap: 8 },
  songItem: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 14px', borderRadius: 12,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  thumb:      { width: 52, height: 38, objectFit: 'cover', borderRadius: 6 },
  songInfo:   { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  songTitle:  { fontSize: 14, fontWeight: 600 },
  songArtist: { fontSize: 12, color: '#aaa' },
  duration:   { fontSize: 12, color: '#666' },
  empty:      { color: '#555', textAlign: 'center', padding: '20px 0' },
};
