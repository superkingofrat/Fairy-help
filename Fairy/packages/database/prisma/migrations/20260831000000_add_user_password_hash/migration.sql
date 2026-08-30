-- AlterTable
-- "" means "no password set yet": bcrypt.compare always fails against an
-- empty hash, so rows without a seeded password simply cannot log in.
ALTER TABLE "users" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '';
