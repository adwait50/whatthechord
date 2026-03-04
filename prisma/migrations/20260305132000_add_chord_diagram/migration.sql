-- CreateTable
CREATE TABLE "ChordDiagram" (
    "id" SERIAL NOT NULL,
    "chordId" INTEGER NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "dots" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'uberchord',
    "rawChordName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChordDiagram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChordDiagram_chordId_key" ON "ChordDiagram"("chordId");

-- CreateIndex
CREATE INDEX "ChordDiagram_normalizedName_idx" ON "ChordDiagram"("normalizedName");

-- AddForeignKey
ALTER TABLE "ChordDiagram" ADD CONSTRAINT "ChordDiagram_chordId_fkey" FOREIGN KEY ("chordId") REFERENCES "Chord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
