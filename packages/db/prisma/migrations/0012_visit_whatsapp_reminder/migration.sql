-- AlterTable: Visit — add sendWhatsappReminder flag for 1-hour-before WhatsApp confirmation
ALTER TABLE "Visit" ADD COLUMN "sendWhatsappReminder" BOOLEAN NOT NULL DEFAULT false;
