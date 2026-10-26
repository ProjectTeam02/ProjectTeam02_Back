-- Non-destructive quiz submission idempotency upgrade.
ALTER TABLE "QuizAttempt"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "QuizAttempt_userId_quizId_idempotencyKey_key"
  ON "QuizAttempt" ("userId", "quizId", "idempotencyKey");
