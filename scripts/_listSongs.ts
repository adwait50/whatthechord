import { prisma } from '../lib/prisma'

async function main(){
  const s = await prisma.song.findMany({ take: 5, orderBy: { id: 'desc' } })
  console.log(JSON.stringify(s.map(x => ({ id: x.id, slug: x.slug, title: x.title })), null, 2))
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1) })
