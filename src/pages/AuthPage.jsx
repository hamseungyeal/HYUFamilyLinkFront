import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function AuthPage() {
  const [mode, setMode]         = useState('login');   // 'login' | 'register'
  const [nickname, setNickname] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const setAuth    = useAuthStore((s) => s.setAuth);
  const navigate   = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let data;
      if (mode === 'login') {
        data = await api.post('/api/auth/login', { email, password });
      } else {
        data = await api.post('/api/auth/register', { nickname, email, password, role: 'phone' });
      }
      setAuth(data.user, data.token);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🎤 FamilyLink</h1>
        <p style={styles.subtitle}>VR 노래방</p>

        <div style={styles.tabRow}>
          <button
            style={{ ...styles.tab, ...(mode === 'login' ? styles.tabActive : {}) }}
            onClick={() => { setMode('login'); setError(''); }}
          >로그인</button>
          <button
            style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : {}) }}
            onClick={() => { setMode('register'); setError(''); }}
          >회원가입</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {mode === 'register' && (
            <input
              style={styles.input}
              placeholder="닉네임"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
            />
          )}
          <input
            style={styles.input}
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  },
  card: {
    background: 'rgba(255,255,255,0.05)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: '40px 32px',
    width: '100%',
    maxWidth: 380,
    color: '#fff',
  },
  title:    { margin: 0, fontSize: 32, textAlign: 'center' },
  subtitle: { margin: '4px 0 24px', textAlign: 'center', color: '#aaa', fontSize: 14 },
  tabRow:   { display: 'flex', marginBottom: 24, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' },
  tab: {
    flex: 1, padding: '10px 0', background: 'transparent',
    border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 14,
  },
  tabActive: { background: '#e94560', color: '#fff', fontWeight: 700 },
  form:     { display: 'flex', flexDirection: 'column', gap: 12 },
  input: {
    padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 15, outline: 'none',
  },
  btn: {
    marginTop: 8, padding: '13px 0', borderRadius: 10, border: 'none',
    background: '#e94560', color: '#fff', fontSize: 16, fontWeight: 700,
    cursor: 'pointer',
  },
  error: { color: '#ff6b6b', fontSize: 13, margin: 0 },
};
