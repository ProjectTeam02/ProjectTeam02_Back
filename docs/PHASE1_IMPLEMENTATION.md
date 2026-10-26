# 1차 USECASE 구현 상태

## 구현 완료 범위

- Auth: signup, login, logout, refresh, Kakao profile verification
- Users: `GET /api/v1/users/me`, 알림 설정 PATCH
- Tutor: conversation 생성·목록·메시지 목록·메시지 전송·사용량 조회
- Quizzes: 승인 문제 조회, 선택지 정답 비노출, 제출·채점 트랜잭션
- Health: process, PostgreSQL, FastAPI 연결 상태
- Swagger: `/api-docs`, `/api-docs.json`, Bearer Authorize, Try it out

## 로컬 연결 확인

로컬 개발 환경에서는 백엔드와 AI가 `127.0.0.1:5432`의 `leren` 데이터베이스를
공유하고, FastAPI는 `127.0.0.1:8000`에서 실행한다. `/api/v1/health/ready`가
`READY`, `database: CONNECTED`, `fastapi: CONNECTED`를 반환해야 한다.

JWT Secret과 FastAPI 내부 토큰은 저장소에 포함하지 않는 로컬 `.env`에서만 설정한다.

## 저장 책임

Node.js/Prisma가 사용자, 세션, AI conversation/message/request/source, quiz와
attempt를 저장한다. FastAPI는 RAG 검색·생성·citation·usage를 반환하며 Node.js가
결과를 저장한다. FastAPI 내부 테이블을 Node.js에서 생성하지 않는다.

## 미검증 또는 후속 협의

- 실제 PostgreSQL migration 적용과 운영 credentials
- 실제 Node.js ↔ FastAPI 통합 호출 및 내부 service token
- Kakao OAuth 운영 앱 키와 redirect 정책
- AI 사용량 예약의 고동시성 원자성 및 Redis rate limit
- EXP/Gold 보상 ledger와 기존 ERD의 정확한 컬럼 매핑
- 프론트엔드와 request/response 필드 및 오류 문구 확정

DB나 FastAPI가 실행되지 않은 환경에서 API가 성공한 것처럼 응답하지 않도록
연결 오류는 `503`으로 처리한다.
