-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'PAYPAL', 'CRYPTO', 'MANUAL');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "paymentNotes" TEXT,
ADD COLUMN     "paymentProvider" "PaymentProvider",
ADD COLUMN     "paymentReference" TEXT,
ADD COLUMN     "subscriptionEndsAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionGraceDays" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "subscriptionStartedAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE';
