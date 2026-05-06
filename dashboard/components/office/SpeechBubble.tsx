export default function SpeechBubble({ text }: { text: string }) {
  const MAX_LINE = 20
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > MAX_LINE) { if (cur) lines.push(cur.trim()); cur = w }
    else cur = (cur + ' ' + w).trim()
  }
  if (cur) lines.push(cur.trim())
  const PH = 13, PAD = 7, bW = 116, bH = lines.length * PH + PAD * 2
  return (
    <g style={{ cursor: 'pointer' }} className="speech-bubble-group">
      <rect x={-bW / 2} y={-bH - 10} width={bW} height={bH} rx={7}
        fill="white" stroke="#d6d3d1" strokeWidth="1" opacity="0.97"
        className="speech-bubble-rect" />
      <polygon points={`-5,-10 5,-10 0,-3`} fill="white" stroke="#d6d3d1" strokeWidth="1" />
      {lines.map((line, i) => (
        <text key={i} x={0} y={-bH - 10 + PAD + (i + 1) * PH - 2}
          textAnchor="middle" fontSize="8.5" fill="#292524"
          fontFamily="JetBrains Mono, monospace">{line}</text>
      ))}
    </g>
  )
}
