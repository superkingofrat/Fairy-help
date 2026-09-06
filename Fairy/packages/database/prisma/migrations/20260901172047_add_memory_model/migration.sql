-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('PREFERENCE', 'FACT', 'INTENT');

-- CreateTable
CREATE TABLE "memories" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "sessionId" TEXT,
    "kind" "MemoryKind" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memories_profileId_kind_idx" ON "memories"("profileId", "kind");

-- CreateIndex
CREATE INDEX "memories_profileId_createdAt_idx" ON "memories"("profileId", "createdAt");

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
