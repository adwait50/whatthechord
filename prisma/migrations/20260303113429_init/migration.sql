-- CreateTable
CREATE TABLE "Song" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'hindi',
    "decade" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artist" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongArtist" (
    "songId" INTEGER NOT NULL,
    "artistId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SongArtist_pkey" PRIMARY KEY ("songId","artistId")
);

-- CreateTable
CREATE TABLE "Chord" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Chord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongChord" (
    "songId" INTEGER NOT NULL,
    "chordId" INTEGER NOT NULL,

    CONSTRAINT "SongChord_pkey" PRIMARY KEY ("songId","chordId")
);

-- CreateTable
CREATE TABLE "LyricLine" (
    "id" SERIAL NOT NULL,
    "songId" INTEGER NOT NULL,
    "lineIndex" INTEGER NOT NULL,
    "lyric" TEXT NOT NULL,
    "chord" TEXT,
    "rawContent" TEXT,

    CONSTRAINT "LyricLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserKnownChord" (
    "userId" TEXT NOT NULL,
    "chordId" INTEGER NOT NULL,

    CONSTRAINT "UserKnownChord_pkey" PRIMARY KEY ("userId","chordId")
);

-- CreateTable
CREATE TABLE "SavedSong" (
    "userId" TEXT NOT NULL,
    "songId" INTEGER NOT NULL,

    CONSTRAINT "SavedSong_pkey" PRIMARY KEY ("userId","songId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Song_slug_key" ON "Song"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Song_sourceUrl_key" ON "Song"("sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Artist_slug_key" ON "Artist"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Chord_name_key" ON "Chord"("name");

-- AddForeignKey
ALTER TABLE "SongArtist" ADD CONSTRAINT "SongArtist_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongArtist" ADD CONSTRAINT "SongArtist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongChord" ADD CONSTRAINT "SongChord_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongChord" ADD CONSTRAINT "SongChord_chordId_fkey" FOREIGN KEY ("chordId") REFERENCES "Chord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LyricLine" ADD CONSTRAINT "LyricLine_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserKnownChord" ADD CONSTRAINT "UserKnownChord_chordId_fkey" FOREIGN KEY ("chordId") REFERENCES "Chord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSong" ADD CONSTRAINT "SavedSong_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
