/**
 * 학습 알림 문구 (고정 1개, E-2 결정)
 * 문구를 바꾸거나 여러 개로 늘릴 때는 이 파일만 고친다
 */
module.exports = Object.freeze({
  type: 'LEARNING_REMINDER',
  title: 'Leren',
  body: '오늘의 경제 학습, 잠깐 해볼까요?',
  // 앱이 알림을 눌렀을 때 구분할 값 (이동 화면은 앱이 정함)
  data: Object.freeze({ type: 'LEARNING_REMINDER' }),
  sound: 'default',
  channelId: 'default',
});
