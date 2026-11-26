import fs from 'node:fs'
import path from 'node:path'

const pdfDir = path.resolve('NEW CAR DATA')
const outDir = path.resolve('app/public/cars')
fs.mkdirSync(outDir, { recursive: true })

const MAP = [
  ['glanza', 'Glanza New.pdf'],
  ['taisor', 'Taisor Price List - Oct 26.pdf'],
  ['urban-cruiser-hyryder', 'Hyryder Price List (1).pdf'],
  ['rumion', 'Rumion Oct - 26 Price list.pdf'],
  ['innova-hycross', 'Hycross Hybrid - Oct 26.pdf'],
  ['fortuner', 'Fortuner Price List (1).pdf'],
]

for (const [slug, file] of MAP) {
  const fullPath = path.join(pdfDir, file)
  if (!fs.existsSync(fullPath)) {
    console.log('MISSING_PDF', file)
    continue
  }
  const buf = fs.readFileSync(fullPath)
  const jpegs = []
  let idx = 0
  while (idx < buf.length) {
    const start = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]), idx)
    if (start === -1) break
    const end = buf.indexOf(Buffer.from([0xff, 0xd9]), start + 3)
    if (end === -1) break
    const slice = buf.subarray(start, end + 2)
    if (slice.length > 8000) jpegs.push(slice)
    idx = end + 2
  }
  jpegs.sort((a, b) => b.length - a.length)
  if (jpegs.length > 0) {
    fs.writeFileSync(path.join(outDir, `${slug}.jpg`), jpegs[0])
    console.log(`EXTRACTED ${slug}.jpg (${Math.round(jpegs[0].length / 1024)} KB, ${jpegs.length} found)`)
  } else {
    console.log(`NO_JPEG ${slug} (${file})`)
  }
}
