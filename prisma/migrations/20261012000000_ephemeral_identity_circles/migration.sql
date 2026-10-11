ALTER TABLE "Presence" ADD COLUMN "avatarTone" TEXT NOT NULL DEFAULT 'green';
ALTER TABLE "Presence" ADD COLUMN "identityMode" TEXT NOT NULL DEFAULT 'anonymous';
ALTER TABLE "Presence" ADD COLUMN "nickname" TEXT;
ALTER TABLE "Presence" ADD COLUMN "circleId" TEXT;
ALTER TABLE "Presence" ADD COLUMN "circleKeyword" TEXT;

CREATE INDEX "Presence_circleId_lastSeen_idx" ON "Presence"("circleId", "lastSeen");
CREATE INDEX "Presence_circleKeyword_lastSeen_idx" ON "Presence"("circleKeyword", "lastSeen");