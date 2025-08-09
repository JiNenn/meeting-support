/*
  Warnings:

  - Added the required column `purpose` to the `Meeting` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Meeting" ADD COLUMN     "purpose" TEXT NOT NULL;
