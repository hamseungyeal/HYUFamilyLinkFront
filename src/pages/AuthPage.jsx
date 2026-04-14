import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function AuthPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState(''); // 4자리 숫자 PIN
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  // 음성 인식 설정 (Web Speech API) - 방 페이지 이식 예정 기능
  const handleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setName(transcript.replace(/\s/g, '')); // 공백 제거 후 성함 설정
    };
    recognition.start();
  };

  const handleNumberClick = (num) => {
    if (birthdate.length < 4) {
      setBirthdate((prev) => prev + num);
    }
  };

  const handleBackspace = () => {
    setBirthdate((prev) => prev.slice(0, -1));
  };

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (birthdate.length !== 4) {
      setError('생년월일 4자리를 모두 눌러주세요.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const payload = { 
        name, 
        password: birthdate, 
        role: 'phone' 
      };

      let data;
      // 로그인과 회원가입 모두 동일한 payload 형식을 사용합니다.
      if (mode === 'login') {
        data = await api.post('/api/auth/login', payload);
      } else {
        data = await api.post('/api/auth/register', payload);
      }

      setAuth(data.user, data.token);
      navigate('/');
    } catch (err) {
      console.error(err);
      setError(err.message || '접속에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🎤 FamilyLink 노래방</h1>
        <p style={styles.subtitle}>반가워요! 본인의 정보를 알려주세요.</p>

        <div style={styles.tabRow}>
          <button 
            onClick={() => { setMode('login'); setError(''); }} 
            style={{ ...styles.tab, color: mode === 'login' ? '#fff' : '#aaa', background: mode === 'login' ? '#e94560' : 'transparent' }}
          >로그인</button>
          <button 
            onClick={() => { setMode('register'); setError(''); }} 
            style={{ ...styles.tab, color: mode === 'register' ? '#fff' : '#aaa', background: mode === 'register' ? '#e94560' : 'transparent' }}
          >처음이에요</button>
        </div>

        <div style={styles.inputSection}>
          <label style={styles.label}>1. 성함</label>
          <div style={styles.voiceRow}>
            <input
              style={styles.largeInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력하세요"
            />
            <button onClick={handleVoiceInput} style={{...styles.voiceBtn, background: isListening ? '#ff4b2b' : '#30475e'}}>
              {isListening ? '듣고 있어요' : '🎤 말하기'}
            </button>
          </div>
        </div>

        <div style={styles.inputSection}>
          <label style={styles.label}>2. 생년월일 (4자리)</label>
          <div style={styles.pinDisplay}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={styles.pinDot}>
                {birthdate[i] ? '●' : '○'}
              </div>
            ))}
          </div>
          
          <div style={styles.keypad}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, '지우기', 0, '확인'].map((item) => (
              <button
                key={item}
                onClick={() => {
                  if (item === '지우기') handleBackspace();
                  else if (item === '확인') handleSubmit();
                  else handleNumberClick(item);
                }}
                style={{
                  ...styles.keyBtn,
                  background: item === '확인' ? '#e94560' : (item === '지우기' ? '#53354a' : 'rgba(255,255,255,0.1)')
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}
        {loading && <p style={styles.loading}>접속 중...</p>}
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
    background: '#1a1a2e',
    // 수정: % 대신 clamp를 사용하여 너무 커지거나 작아지지 않게 방어
    padding: 'clamp(1rem, 5vw, 2rem)', 
    boxSizing: 'border-box',
  },
  card: {
    background: 'rgba(255,255,255,0.05)',
    backdropFilter: 'blur(10px)',
    borderRadius: '1.5rem',
    // 수정: 카드 내부 패딩이 무한정 넓어져서 콘텐츠 영역을 침범하지 않도록 상한선(2.5rem) 설정
    padding: 'clamp(1.5rem, 5vw, 2.5rem)', 
    width: '100%',
    maxWidth: '32rem', 
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.1)',
    boxSizing: 'border-box',
  },
  title: { margin: '0 0 0.5rem', fontSize: 'clamp(1.5rem, 6vw, 2.25rem)', textAlign: 'center', fontWeight: 'bold' },
  subtitle: { margin: '0 0 2rem', textAlign: 'center', color: '#ccc', fontSize: 'clamp(1rem, 4vw, 1.25rem)' },
  
  tabRow: { display: 'flex', marginBottom: '2rem', borderRadius: '1rem', overflow: 'hidden', border: '2px solid #e94560' },
  tab: { flex: 1, padding: '1rem 0', border: 'none', cursor: 'pointer', fontSize: 'clamp(1.1rem, 4vw, 1.375rem)', fontWeight: 'bold', transition: '0.3s' },
  
  inputSection: { marginBottom: '2rem' },
  label: { display: 'block', marginBottom: '0.75rem', fontSize: 'clamp(1.2rem, 4.5vw, 1.5rem)', fontWeight: '600', color: '#e94560' },
  voiceRow: { display: 'flex', gap: '0.5rem', width: '100%' },
  largeInput: {
    flex: 1, padding: '1rem', borderRadius: '0.75rem', border: 'none',
    background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 'clamp(1.2rem, 4.5vw, 1.5rem)', outline: 'none',
    boxSizing: 'border-box', minWidth: 0 
  },
  voiceBtn: { 
    padding: '0 1rem', borderRadius: '0.75rem', border: 'none', color: '#fff', 
    fontSize: 'clamp(1rem, 3.5vw, 1.125rem)', cursor: 'pointer', fontWeight: 'bold', 
    whiteSpace: 'nowrap' 
  },
  
  pinDisplay: { display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1.25rem', fontSize: '2rem', color: '#e94560' },
  pinDot: { width: '2.5rem', textAlign: 'center' },
  
  keypad: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' },
  keyBtn: {
    padding: '1.25rem 0', borderRadius: '1rem', border: 'none', color: '#fff', 
    fontSize: 'clamp(1.2rem, 4.5vw, 1.6rem)', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s active',
  },
  
  error: { color: '#ff6b6b', fontSize: '1.125rem', textAlign: 'center', marginTop: '1.25rem', fontWeight: 'bold' },
  loading: { textAlign: 'center', marginTop: '1.25rem', fontSize: '1.25rem', color: '#aaa' }
};