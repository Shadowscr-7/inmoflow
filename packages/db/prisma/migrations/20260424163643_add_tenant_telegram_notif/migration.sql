-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "telegramNotifBotToken" TEXT,
ADD COLUMN     "telegramNotifChatId" TEXT,
ADD COLUMN     "telegramNotifEnabled" BOOLEAN NOT NULL DEFAULT false;
