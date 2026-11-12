/**
 * 보상 API 요청·응답 데이터 형식 파일
 * 백엔드 작업: 외부 데이터와 내부 모델의 변환 규칙을 관리
 * 주의: 기존 응답 필드명과 JSON 구조 유지
 * 성장·지갑·보상 원장의 공개 응답을 고정한다.
 */
const { growth, wallet, rewardCoin, rewardExp } = require('../../extended-api/dto/extendedResponse.dto');
module.exports = { growth, wallet, coin: rewardCoin, exp: rewardExp };
