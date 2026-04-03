import { useEffect } from 'react'; // useEffect 추가
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useSocket } from './hooks/useSocket';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import RoomPage from './pages/RoomPage';

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  return token ? children : <Navigate to="/auth" replace />;
}

function AppRoutes() {
  // authStore에서 user와 refreshFriends 함수를 가져옵니다.
  const user = useAuthStore((s) => s.user);
  const refreshFriends = useAuthStore((s) => s.refreshFriends);
  
  useSocket(); // 로그인 상태이면 소켓 자동 연결

  // [핵심 추가] 앱 실행 시 또는 로그인 직후 친구 목록을 미리 로드
  useEffect(() => {
    if (user) {
      refreshFriends();
    }
  }, [user, refreshFriends]);

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/" element={<PrivateRoute><HomePage /></PrivateRoute>} />
      <Route path="/room" element={<PrivateRoute><RoomPage /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}