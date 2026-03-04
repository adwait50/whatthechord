-- CreateTable
CREATE TABLE "ChordMetadata" (
    "chordId" INTEGER NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "root" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "extension" TEXT,
    "bassNote" TEXT,
    "alterations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "addTones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suspensions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSlash" BOOLEAN NOT NULL DEFAULT false,
    "isBasic" BOOLEAN NOT NULL DEFAULT false,
    "isAltered" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChordMetadata_pkey" PRIMARY KEY ("chordId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChordMetadata_normalizedName_key" ON "ChordMetadata"("normalizedName");

-- CreateIndex
CREATE INDEX "ChordMetadata_category_idx" ON "ChordMetadata"("category");

-- AddForeignKey
ALTER TABLE "ChordMetadata" ADD CONSTRAINT "ChordMetadata_chordId_fkey" FOREIGN KEY ("chordId") REFERENCES "Chord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
