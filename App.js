import React, { useEffect, useState } from 'react';
import { Alert, BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Login from './src/screens/Login';
import Voice from './src/screens/Voice';
import Review from './src/screens/Review';
import Notes from './src/screens/Notes';
import { sendHandoff } from './src/handoff';
import * as Location from 'expo-location';

export default function App() {
  const [screen, setScreen] = useState('login'); // login(A01) | voice(A02) | review(A03) | notes(A04)
  const [user, setUser] = useState(null);
  const [draft, setDraft] = useState(null);   // AI 가 정리한 초안
  const [report, setReport] = useState(null); // 사용자가 검수/수정한 보고서 (앱 메모리에만 존재, 저장 안 함)

  // 이전 화면으로 (왼쪽 상단 ← 버튼, 안드로이드 하드웨어 뒤로가기 공용)
  function goBack() {
    if (screen === 'voice') { setDraft(null); setReport(null); setScreen('login'); return true; }
    if (screen === 'review') { setScreen('voice'); return true; }
    if (screen === 'notes') { setScreen('review'); return true; }
    return false; // 로그인 화면에서는 기본 동작(앱 종료)
  }
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
  }, [screen]);

  async function handleHandoff(payload) {
    const sent = sendHandoff(payload);

    try {
      console.log("📍 구급차 현재 위치 파악 중...");

      // 1. 위치 권한 요청
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 오류', '위치 정보를 허용해야 가까운 병원을 찾을 수 있습니다.');
        return;
      }

      // 2. 버튼 누른 순간의 실시간 GPS 좌표 추출
      let location = await Location.getCurrentPositionAsync({});
      const finalPayload = {
        ...sent,
        lat: location.coords.latitude,
        lon: location.coords.longitude
      };

      console.log("🚀 B파트로 전송할 최종 데이터:", finalPayload);

      // 3. B파트 서버로 전송 (본인 컴퓨터의 IPv4 주소로 변경 필수)
      const BACKEND_URL = 'http://172.31.74.154:3000/api/match';
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalPayload)
      });

      

      const data = await response.json();

      if (data.success) {
        console.log("✅ 매칭된 Top 3 병원:", data.hospitals);

        const summary = data.hospitals
          .map((h, idx) => `${idx + 1}. ${h.dutyName}\n   (직선 ${h.distanceKm}km / 예상소요 ${h.etaMinutes}분 / 잔여병상 ${h.availableBeds}개)`)
          .join('\n\n');

        Alert.alert(
          `병원 매칭 완료 (반경 ${data.appliedRadiusKm}km)`,
          summary || '조건에 맞는 병원이 없습니다.'
        );
      }
    } catch (error) {
      console.error("B파트 서버 통신 실패:", error);
      Alert.alert("통신 오류", "병원 매칭 서버에 연결할 수 없습니다.");
    }
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {screen === 'login' && (
        <Login onLogin={(u) => { setUser(u); setScreen('voice'); }} />
      )}
      {screen === 'voice' && (
        <Voice
          teamName={user?.teamName}
          onBack={goBack}
          onDone={(text, d) => { setDraft(d); setReport(null); setScreen('review'); }}
        />
      )}
      {screen === 'review' && (
        <Review draft={draft} initial={report} onBack={goBack} onNext={(r) => { setReport(r); setScreen('notes'); }} />
      )}
      {screen === 'notes' && (
        <Notes
          report={report}
          onBack={(r) => { setReport(r); setScreen('review'); }}
          onHandoff={handleHandoff}
        />
      )}
    </SafeAreaProvider>
  );
}
