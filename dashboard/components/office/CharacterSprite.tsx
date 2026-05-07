'use client'
import type { AgentId } from '@/lib/agents'

interface Props { id: AgentId; size?: number; speaking?: boolean; thinking?: boolean; walking?: boolean; sitting?: boolean; done?: boolean; error?: boolean }

export default function CharacterSprite({ id, size = 1, speaking, walking, sitting, done, error }: Props) {
  const cls = speaking ? 'animate-talk-bob' : error ? 'animate-error' : done ? 'animate-celebrate' : walking ? 'animate-walk' : sitting ? 'animate-seated' : 'animate-float'
  const W = 40, H = 72

  const sprites: Record<AgentId, React.ReactNode> = {

    // ─── Otto — Analítico: camisa social azul, óculos finos, cabelo penteado, tablet
    otto: (
      <svg width={W * size} height={H * size} viewBox="0 0 40 72" fill="none" className={cls}>
        {/* Cabelo penteado para trás */}
        <rect x="10" y="4" width="20" height="9" rx="4" fill="#1c1307"/>
        <rect x="10" y="4" width="20" height="5" rx="3" fill="#292010"/>
        {/* Ear */}
        <ellipse cx="9.5" cy="20" rx="2.5" ry="3.5" fill="#dba070"/>
        {/* Head */}
        <ellipse cx="20" cy="19" rx="11" ry="10.5" fill="#f5d0a9"/>
        {/* Óculos armação fina */}
        <rect x="11" y="14" width="7" height="5" rx="1.5" fill="none" stroke="#374151" strokeWidth="1.2"/>
        <rect x="22" y="14" width="7" height="5" rx="1.5" fill="none" stroke="#374151" strokeWidth="1.2"/>
        <line x1="18" y1="16.5" x2="22" y2="16.5" stroke="#374151" strokeWidth="1"/>
        <line x1="11" y1="16" x2="9" y2="15" stroke="#374151" strokeWidth="1"/>
        {/* Eyes */}
        <rect x="12" y="14.8" width="4" height="3.2" rx="0.5" fill="#1c1917"/>
        <rect x="23" y="14.8" width="4" height="3.2" rx="0.5" fill="#1c1917"/>
        <rect x="12.6" y="15.2" width="1.5" height="1.5" fill="white"/>
        <rect x="23.6" y="15.2" width="1.5" height="1.5" fill="white"/>
        {/* Nariz */}
        <circle cx="20" cy="23" r="1" fill="#c4845a"/>
        {/* Boca */}
        <path d="M15 26 Q20 28 25 26" stroke="#b06040" strokeWidth="0.9" fill="none" strokeLinecap="round"/>
        {/* Colarinho */}
        <rect x="14" y="28" width="12" height="4" rx="1" fill="#f1f5f9"/>
        {/* Camisa social azul marinho */}
        <rect x="8" y="30" width="24" height="20" rx="2" fill="#1e3a8a"/>
        <rect x="19" y="30" width="2" height="20" fill="#f1f5f9" opacity="0.25"/>
        <circle cx="20" cy="34" r="1" fill="#93c5fd"/>
        <circle cx="20" cy="38" r="1" fill="#93c5fd"/>
        <circle cx="20" cy="42" r="1" fill="#93c5fd"/>
        {/* Left arm */}
        <rect x="1" y="31" width="8" height="14" rx="3" fill="#1e3a8a"/>
        {/* Right arm */}
        <rect x="31" y="31" width="8" height="14" rx="3" fill="#1e3a8a"/>
        {/* Left hand */}
        <ellipse cx="5" cy="47" rx="4.5" ry="3.5" fill="#f5d0a9"/>
        {/* Right hand */}
        <ellipse cx="35" cy="47" rx="4.5" ry="3.5" fill="#f5d0a9"/>
        {/* Tablet na mão direita */}
        <rect x="29" y="43" width="13" height="9" rx="2" fill="#475569"/>
        <rect x="30" y="44" width="11" height="7" rx="1" fill="#93c5fd"/>
        <line x1="31" y1="46" x2="40" y2="46" stroke="#1e40af" strokeWidth="0.8"/>
        <line x1="31" y1="48" x2="38" y2="48" stroke="#1e40af" strokeWidth="0.8"/>
        <rect x="37" y="45" width="2.5" height="4" fill="#3b82f6" opacity="0.7"/>
        {/* Calça cinza */}
        <rect x="9" y="49" width="9" height="14" rx="2" fill="#4b5563"/>
        <rect x="22" y="49" width="9" height="14" rx="2" fill="#4b5563"/>
        {/* Sapatos escuros */}
        <rect x="7" y="61" width="13" height="9" rx="3" fill="#1c1917"/>
        <rect x="20" y="61" width="13" height="9" rx="3" fill="#1c1917"/>
        <rect x="7" y="61" width="13" height="2.5" rx="1" fill="#374151"/>
        <rect x="20" y="61" width="13" height="2.5" rx="1" fill="#374151"/>
      </svg>
    ),

    // ─── Heitor — Cauteloso: suéter tricô verde-musgo, óculos redondos, pasta
    heitor: (
      <svg width={W * size} height={H * size} viewBox="0 0 40 72" fill="none" className={cls}>
        {/* Cabelo grisalho desalinhado */}
        <rect x="9" y="4" width="22" height="10" rx="5" fill="#9ca3af"/>
        <rect x="9" y="4" width="7" height="8" rx="3" fill="#6b7280"/>
        <rect x="24" y="5" width="7" height="7" rx="3" fill="#6b7280"/>
        <rect x="14" y="3" width="12" height="5" rx="2" fill="#9ca3af"/>
        {/* Ear */}
        <ellipse cx="9.5" cy="20" rx="2.5" ry="3.5" fill="#dba070"/>
        {/* Head */}
        <ellipse cx="20" cy="19" rx="11" ry="10.5" fill="#f5d0a9"/>
        {/* Óculos redondos */}
        <circle cx="15" cy="17" r="4.2" fill="none" stroke="#78350f" strokeWidth="1.3"/>
        <circle cx="25" cy="17" r="4.2" fill="none" stroke="#78350f" strokeWidth="1.3"/>
        <line x1="19.2" y1="17" x2="20.8" y2="17" stroke="#78350f" strokeWidth="1"/>
        <line x1="9" y1="15" x2="10.8" y2="15.5" stroke="#78350f" strokeWidth="1"/>
        {/* Eyes */}
        <rect x="12.5" y="15" width="4" height="4" rx="0.5" fill="#1c1917"/>
        <rect x="22.5" y="15" width="4" height="4" rx="0.5" fill="#1c1917"/>
        <rect x="13.2" y="15.5" width="1.5" height="1.5" fill="white"/>
        <rect x="23.2" y="15.5" width="1.5" height="1.5" fill="white"/>
        {/* Nariz */}
        <circle cx="20" cy="23" r="1.1" fill="#c4845a"/>
        {/* Boca séria */}
        <rect x="16" y="25.5" width="8" height="1.8" rx="0.9" fill="#b06040"/>
        {/* Suéter verde-musgo com textura tricô */}
        <rect x="8" y="27" width="24" height="23" rx="3" fill="#4d7c0f"/>
        <line x1="8" y1="31" x2="32" y2="31" stroke="#3f6212" strokeWidth="0.8"/>
        <line x1="8" y1="35" x2="32" y2="35" stroke="#3f6212" strokeWidth="0.8"/>
        <line x1="8" y1="39" x2="32" y2="39" stroke="#3f6212" strokeWidth="0.8"/>
        <line x1="8" y1="43" x2="32" y2="43" stroke="#3f6212" strokeWidth="0.8"/>
        {/* Colarinho camisa por baixo */}
        <rect x="15" y="27" width="10" height="3" rx="1" fill="#e2e8f0"/>
        {/* Left arm */}
        <rect x="1" y="28" width="8" height="16" rx="3" fill="#4d7c0f"/>
        {/* Right arm */}
        <rect x="31" y="28" width="8" height="16" rx="3" fill="#4d7c0f"/>
        {/* Left hand */}
        <ellipse cx="5" cy="46" rx="4.5" ry="3.5" fill="#f5d0a9"/>
        {/* Right hand */}
        <ellipse cx="35" cy="46" rx="4.5" ry="3.5" fill="#f5d0a9"/>
        {/* Pasta de documentos */}
        <rect x="0" y="40" width="11" height="9" rx="1.5" fill="#d4a056"/>
        <rect x="0" y="40" width="11" height="2" rx="1" fill="#b88040"/>
        <rect x="0" y="47" width="11" height="2" rx="1" fill="#b88040"/>
        <rect x="3.5" y="43.5" width="4" height="1" fill="#8b5e28"/>
        <rect x="3.5" y="45" width="4" height="1" fill="#8b5e28"/>
        {/* Calça cáqui */}
        <rect x="9" y="49" width="9" height="14" rx="2" fill="#c9a850"/>
        <rect x="22" y="49" width="9" height="14" rx="2" fill="#c9a850"/>
        {/* Sapatos marrons */}
        <rect x="7" y="61" width="13" height="9" rx="3" fill="#78350f"/>
        <rect x="20" y="61" width="13" height="9" rx="3" fill="#78350f"/>
        <rect x="7" y="61" width="13" height="2.5" rx="1" fill="#92400e"/>
        <rect x="20" y="61" width="13" height="2.5" rx="1" fill="#92400e"/>
      </svg>
    ),

    // ─── Salles — Boêmio: BARBA GRANDE, cabelo despenteado, camisa aberta, caneca
    salles: (
      <svg width={W * size} height={H * size} viewBox="0 0 40 72" fill="none" className={cls}>
        {/* Cabelo despenteado marrom */}
        <rect x="9" y="3" width="22" height="10" rx="5" fill="#92400e"/>
        <rect x="8" y="5" width="6" height="9" rx="3" fill="#78350f"/>
        <rect x="26" y="4" width="6" height="8" rx="3" fill="#78350f"/>
        <rect x="11" y="2" width="9" height="6" rx="3" fill="#a16207"/>
        <rect x="22" y="3" width="7" height="5" rx="2" fill="#92400e"/>
        {/* Ear */}
        <ellipse cx="9.5" cy="20" rx="2.5" ry="3.5" fill="#dba070"/>
        {/* Head */}
        <ellipse cx="20" cy="18" rx="11" ry="10.5" fill="#f5d0a9"/>
        {/* Eyes */}
        <rect x="12" y="13.5" width="5.5" height="5.5" rx="1.5" fill="#1c1917"/>
        <rect x="22.5" y="13.5" width="5.5" height="5.5" rx="1.5" fill="#1c1917"/>
        <rect x="12.8" y="14.3" width="2" height="2" fill="white"/>
        <rect x="23.3" y="14.3" width="2" height="2" fill="white"/>
        {/* Nariz */}
        <circle cx="20" cy="21" r="1.2" fill="#c4845a"/>
        {/* BARBA GRANDE — feature principal do Salles */}
        <ellipse cx="20" cy="30" rx="11" ry="9" fill="#78350f"/>
        <ellipse cx="20" cy="27" rx="9.5" ry="6" fill="#92400e"/>
        <ellipse cx="12" cy="27" rx="4" ry="6" fill="#78350f"/>
        <ellipse cx="28" cy="27" rx="4" ry="6" fill="#78350f"/>
        {/* Bigode */}
        <ellipse cx="20" cy="23" rx="7.5" ry="2.8" fill="#92400e"/>
        {/* Boca entre bigode e barba */}
        <path d="M15 24 Q20 26 25 24" stroke="#b06040" strokeWidth="1" fill="none" strokeLinecap="round"/>
        {/* Camisa aberta vinho por cima */}
        <rect x="5" y="35" width="30" height="17" rx="3" fill="#7c2d12"/>
        {/* Camiseta creme por baixo */}
        <rect x="11" y="35" width="18" height="17" fill="#fef3c7"/>
        <rect x="5" y="35" width="7" height="17" fill="#7c2d12"/>
        <rect x="28" y="35" width="7" height="17" fill="#7c2d12"/>
        {/* Left arm */}
        <rect x="0" y="36" width="8" height="14" rx="3" fill="#7c2d12"/>
        {/* Right arm */}
        <rect x="32" y="36" width="8" height="14" rx="3" fill="#7c2d12"/>
        {/* Left hand */}
        <ellipse cx="4" cy="52" rx="4.5" ry="3.5" fill="#f5d0a9"/>
        {/* Right hand */}
        <ellipse cx="36" cy="52" rx="4.5" ry="3.5" fill="#f5d0a9"/>
        {/* Caneca de café com vapor */}
        <rect x="0" y="47" width="9" height="9" rx="2" fill="#f97316"/>
        <rect x="1" y="48" width="7" height="3" rx="1" fill="#c2410c" opacity="0.4"/>
        <path d="M9 49 Q13 49 13 52 Q13 55 9 55" stroke="#ea580c" strokeWidth="1.8" fill="none"/>
        <path d="M2 46 Q3 43 2 40" stroke="#d1d5db" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.7"/>
        <path d="M4.5 45 Q5.5 42 4.5 39" stroke="#d1d5db" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.5"/>
        <path d="M7 46 Q8 43 7 40" stroke="#d1d5db" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.7"/>
        {/* Bloco de notas */}
        <rect x="31" y="48" width="9" height="10" rx="1.5" fill="#fef9c3"/>
        <rect x="31" y="48" width="9" height="2.5" rx="1" fill="#fbbf24"/>
        <line x1="33" y1="52" x2="39" y2="52" stroke="#a16207" strokeWidth="0.8"/>
        <line x1="33" y1="53.5" x2="39" y2="53.5" stroke="#a16207" strokeWidth="0.8"/>
        <line x1="33" y1="55" x2="37" y2="55" stroke="#a16207" strokeWidth="0.8"/>
        {/* Calça escura */}
        <rect x="9" y="51" width="9" height="13" rx="2" fill="#451a03"/>
        <rect x="22" y="51" width="9" height="13" rx="2" fill="#451a03"/>
        {/* Coturnos */}
        <rect x="7" y="62" width="13" height="9" rx="3" fill="#1c1917"/>
        <rect x="20" y="62" width="13" height="9" rx="3" fill="#1c1917"/>
        <rect x="7" y="64" width="13" height="1.5" fill="#78350f"/>
        <rect x="20" y="64" width="13" height="1.5" fill="#78350f"/>
      </svg>
    ),

    // ─── Sônia — Energética: blazer roxo, fone sem fio, cabelo moderno, laptop c/ gráfico
    sonia: (
      <svg width={W * size} height={H * size} viewBox="0 0 40 72" fill="none" className={cls}>
        {/* Cabelo moderno */}
        <rect x="9" y="4" width="22" height="10" rx="5" fill="#1c1917"/>
        <rect x="9" y="4" width="22" height="6" rx="4" fill="#292524"/>
        <rect x="9" y="8" width="5" height="9" rx="2.5" fill="#1c1917"/>
        <rect x="10" y="9" width="14" height="4" rx="2" fill="#1c1917"/>
        {/* Ear */}
        <ellipse cx="9.5" cy="20" rx="2.5" ry="3.5" fill="#dba070"/>
        {/* Head */}
        <ellipse cx="20" cy="19" rx="11" ry="10.5" fill="#f5d0a9"/>
        {/* Eyes */}
        <rect x="12" y="14" width="5.5" height="5.5" rx="1.5" fill="#1c1917"/>
        <rect x="22.5" y="14" width="5.5" height="5.5" rx="1.5" fill="#1c1917"/>
        <rect x="12.8" y="14.8" width="2" height="2" fill="white"/>
        <rect x="23.3" y="14.8" width="2" height="2" fill="white"/>
        {/* Nariz */}
        <circle cx="20" cy="22" r="1.1" fill="#c4845a"/>
        {/* Sorriso ativo */}
        <path d="M14 25 Q20 29 26 25" stroke="#b06040" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
        {/* Fone de ouvido sem fio ao redor do pescoço */}
        <path d="M10 27 Q10 32 20 33 Q30 32 30 27" stroke="#0ea5e9" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
        <rect x="7" y="25" width="5" height="5" rx="2.5" fill="#0ea5e9"/>
        <rect x="28" y="25" width="5" height="5" rx="2.5" fill="#0ea5e9"/>
        {/* Blazer roxo */}
        <rect x="7" y="31" width="26" height="20" rx="3" fill="#7c3aed"/>
        {/* Lapelas */}
        <polygon points="20,31 14,40 20,37" fill="#6d28d9"/>
        <polygon points="20,31 26,40 20,37" fill="#6d28d9"/>
        {/* Camiseta rosa por baixo */}
        <rect x="17" y="31" width="6" height="20" fill="#ec4899" opacity="0.85"/>
        {/* Left arm */}
        <rect x="1" y="32" width="8" height="14" rx="3" fill="#7c3aed"/>
        {/* Right arm */}
        <rect x="31" y="32" width="8" height="14" rx="3" fill="#7c3aed"/>
        {/* Left hand */}
        <ellipse cx="5" cy="48" rx="4.5" ry="3.5" fill="#f5d0a9"/>
        {/* Right hand */}
        <ellipse cx="35" cy="48" rx="4.5" ry="3.5" fill="#f5d0a9"/>
        {/* Notebook com gráfico */}
        <rect x="29" y="44" width="13" height="9" rx="2" fill="#1e1b4b"/>
        <rect x="30" y="45" width="11" height="7" rx="1" fill="#0f172a"/>
        <polyline points="31,51 33,49 35,50 37,47 40,48" stroke="#a855f7" strokeWidth="1.2" fill="none"/>
        <polyline points="31,51 33,50 35,51 37,48 40,49" stroke="#ec4899" strokeWidth="0.7" fill="none" opacity="0.5"/>
        {/* Calça jeans */}
        <rect x="9" y="50" width="9" height="13" rx="2" fill="#1e3a8a"/>
        <rect x="22" y="50" width="9" height="13" rx="2" fill="#1e3a8a"/>
        {/* Tênis brancos */}
        <rect x="7" y="61" width="13" height="9" rx="3" fill="#f8fafc"/>
        <rect x="20" y="61" width="13" height="9" rx="3" fill="#f8fafc"/>
        <rect x="7" y="61" width="13" height="3" rx="1.5" fill="#7c3aed"/>
        <rect x="20" y="61" width="13" height="3" rx="1.5" fill="#7c3aed"/>
      </svg>
    ),

    // ─── Pedro Abrahão — Médico consultor: jaleco branco, cabelo castanho, estetoscópio
    pedro_abrahao: (
      <svg width={W * size} height={H * size} viewBox="0 0 40 72" fill="none" className={cls}>
        {/* Cabelo castanho curto */}
        <rect x="10" y="4" width="20" height="9" rx="4" fill="#6b3d1e"/>
        <rect x="10" y="4" width="20" height="5" rx="3" fill="#7c4a24"/>
        {/* Ear */}
        <ellipse cx="9.5" cy="20" rx="2.5" ry="3.5" fill="#dba070"/>
        {/* Head */}
        <ellipse cx="20" cy="19" rx="11" ry="10.5" fill="#f5d0a9"/>
        {/* Eyes */}
        <rect x="12" y="14" width="5" height="5" rx="1.5" fill="#1c1917"/>
        <rect x="23" y="14" width="5" height="5" rx="1.5" fill="#1c1917"/>
        <rect x="12.8" y="14.8" width="1.8" height="1.8" fill="white"/>
        <rect x="23.8" y="14.8" width="1.8" height="1.8" fill="white"/>
        {/* Nariz */}
        <circle cx="20" cy="22" r="1.1" fill="#c4845a"/>
        {/* Sorriso */}
        <path d="M15 25 Q20 28 25 25" stroke="#b06040" strokeWidth="1" fill="none" strokeLinecap="round"/>
        {/* Jaleco branco */}
        <rect x="7" y="28" width="26" height="23" rx="3" fill="#f8fafc"/>
        {/* Lapelas jaleco */}
        <polygon points="20,28 14,38 20,34" fill="#e2e8f0"/>
        <polygon points="20,28 26,38 20,34" fill="#e2e8f0"/>
        {/* Camisa teal por baixo */}
        <rect x="17" y="28" width="6" height="23" fill="#0f766e" opacity="0.9"/>
        {/* Bolso jaleco */}
        <rect x="8" y="34" width="7" height="6" rx="1" fill="none" stroke="#cbd5e1" strokeWidth="0.8"/>
        <rect x="9.5" y="33" width="1" height="3" rx="0.5" fill="#0f766e" opacity="0.7"/>
        <rect x="11" y="33" width="1" height="3" rx="0.5" fill="#ef4444" opacity="0.7"/>
        {/* Left arm */}
        <rect x="1" y="29" width="8" height="15" rx="3" fill="#f8fafc"/>
        {/* Right arm */}
        <rect x="31" y="29" width="8" height="15" rx="3" fill="#f8fafc"/>
        {/* Left hand */}
        <ellipse cx="5" cy="46" rx="4.5" ry="3.5" fill="#f5d0a9"/>
        {/* Right hand */}
        <ellipse cx="35" cy="46" rx="4.5" ry="3.5" fill="#f5d0a9"/>
        {/* Estetoscópio */}
        <path d="M12 28 Q8 35 10 42 Q12 48 17 46" stroke="#374151" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
        <path d="M28 28 Q32 35 30 42 Q28 48 23 46" stroke="#374151" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
        <circle cx="20" cy="46" r="3.5" fill="#374151"/>
        <circle cx="20" cy="46" r="2" fill="#6b7280"/>
        {/* Prancheta */}
        <rect x="29" y="41" width="11" height="13" rx="2" fill="#e2e8f0"/>
        <rect x="30" y="42" width="9" height="11" rx="1" fill="#f8fafc"/>
        <rect x="33" y="40" width="5" height="3" rx="1" fill="#94a3b8"/>
        <line x1="31" y1="45" x2="38" y2="45" stroke="#94a3b8" strokeWidth="0.8"/>
        <line x1="31" y1="47" x2="38" y2="47" stroke="#94a3b8" strokeWidth="0.8"/>
        <line x1="31" y1="49" x2="36" y2="49" stroke="#94a3b8" strokeWidth="0.8"/>
        {/* Calça cinza */}
        <rect x="9" y="50" width="9" height="13" rx="2" fill="#475569"/>
        <rect x="22" y="50" width="9" height="13" rx="2" fill="#475569"/>
        {/* Sapatos pretos */}
        <rect x="7" y="61" width="13" height="9" rx="3" fill="#1c1917"/>
        <rect x="20" y="61" width="13" height="9" rx="3" fill="#1c1917"/>
        <rect x="7" y="61" width="13" height="2.5" rx="1" fill="#374151"/>
        <rect x="20" y="61" width="13" height="2.5" rx="1" fill="#374151"/>
      </svg>
    ),

    // ─── Aya — Elegante: preto/branco minimalista, mecha azul, tablet holográfico
    aya: (
      <svg width={W * size} height={H * size} viewBox="0 0 40 72" fill="none" className={cls}>
        {/* Cabelo alinhado preto */}
        <rect x="9" y="4" width="22" height="11" rx="5" fill="#1c1917"/>
        <rect x="9" y="4" width="22" height="7" rx="4" fill="#292524"/>
        <rect x="9" y="7" width="6" height="10" rx="3" fill="#1c1917"/>
        {/* Franja reta */}
        <rect x="9" y="10" width="20" height="3.5" rx="1" fill="#1c1917"/>
        {/* Mecha azul — detalhe IA */}
        <rect x="26" y="4" width="4" height="13" rx="2" fill="#38bdf8"/>
        {/* Ear */}
        <ellipse cx="9.5" cy="20" rx="2.5" ry="3.5" fill="#dba070"/>
        {/* Head */}
        <ellipse cx="20" cy="19" rx="11" ry="10.5" fill="#f5d0a9"/>
        {/* Micro LED na têmpora — detalhe tech */}
        <circle cx="10.5" cy="18" r="1.8" fill="#38bdf8" opacity="0.85"/>
        <line x1="10.5" y1="16" x2="10.5" y2="20" stroke="#38bdf8" strokeWidth="0.6" opacity="0.5"/>
        {/* Eyes — brilho azul */}
        <rect x="12" y="14" width="5.5" height="5" rx="1.5" fill="#1c1917"/>
        <rect x="22.5" y="14" width="5.5" height="5" rx="1.5" fill="#1c1917"/>
        <rect x="12.8" y="14.8" width="2" height="2" fill="#60a5fa"/>
        <rect x="23.3" y="14.8" width="2" height="2" fill="#60a5fa"/>
        {/* Nariz */}
        <circle cx="20" cy="22" r="1" fill="#c4845a"/>
        {/* Sorriso sereno */}
        <path d="M15 25.5 Q20 27.5 25 25.5" stroke="#b06040" strokeWidth="0.8" fill="none" strokeLinecap="round"/>
        {/* Roupa minimalista preta */}
        <rect x="8" y="27" width="24" height="23" rx="3" fill="#1c1917"/>
        {/* Detalhes brancos sutis */}
        <rect x="19" y="27" width="2" height="23" fill="#f8fafc" opacity="0.1"/>
        {/* Linhas de circuito */}
        <line x1="10" y1="33" x2="30" y2="33" stroke="#38bdf8" strokeWidth="0.6" opacity="0.6"/>
        <line x1="10" y1="38" x2="30" y2="38" stroke="#38bdf8" strokeWidth="0.6" opacity="0.6"/>
        <circle cx="10" cy="33" r="1.2" fill="#38bdf8" opacity="0.7"/>
        <circle cx="30" cy="38" r="1.2" fill="#38bdf8" opacity="0.7"/>
        <line x1="10" y1="33" x2="10" y2="38" stroke="#38bdf8" strokeWidth="0.6" opacity="0.4"/>
        <line x1="30" y1="33" x2="30" y2="38" stroke="#38bdf8" strokeWidth="0.6" opacity="0.4"/>
        {/* Left arm */}
        <rect x="1" y="28" width="8" height="15" rx="3" fill="#1c1917"/>
        {/* Right arm */}
        <rect x="31" y="28" width="8" height="15" rx="3" fill="#1c1917"/>
        {/* Left hand */}
        <ellipse cx="5" cy="45" rx="4.5" ry="3.5" fill="#f5d0a9"/>
        {/* Right hand */}
        <ellipse cx="35" cy="45" rx="4.5" ry="3.5" fill="#f5d0a9"/>
        {/* Tablet holográfico */}
        <rect x="29" y="41" width="13" height="9" rx="2" fill="#0c4a6e" opacity="0.95"/>
        <rect x="30" y="42" width="11" height="7" rx="1" fill="#0ea5e9" opacity="0.25"/>
        <rect x="30" y="42" width="11" height="7" rx="1" fill="none" stroke="#38bdf8" strokeWidth="1"/>
        <line x1="31" y1="44" x2="40" y2="44" stroke="#38bdf8" strokeWidth="0.7"/>
        <line x1="31" y1="46" x2="38" y2="46" stroke="#38bdf8" strokeWidth="0.7"/>
        <line x1="31" y1="48" x2="40" y2="48" stroke="#38bdf8" strokeWidth="0.7"/>
        <circle cx="32" cy="44" r="1" fill="#60a5fa"/>
        <circle cx="37" cy="46" r="1" fill="#60a5fa"/>
        <circle cx="34" cy="48" r="1" fill="#60a5fa"/>
        {/* Calça branca */}
        <rect x="9" y="49" width="9" height="14" rx="2" fill="#f8fafc"/>
        <rect x="22" y="49" width="9" height="14" rx="2" fill="#f8fafc"/>
        {/* Sapatos pretos com detalhe azul */}
        <rect x="7" y="61" width="13" height="9" rx="3" fill="#1c1917"/>
        <rect x="20" y="61" width="13" height="9" rx="3" fill="#1c1917"/>
        <rect x="7" y="61" width="13" height="2" rx="1" fill="#38bdf8" opacity="0.7"/>
        <rect x="20" y="61" width="13" height="2" rx="1" fill="#38bdf8" opacity="0.7"/>
      </svg>
    ),

    // ─── Renata — Social Media: roupa coral, prancheta com post-its, cabelo solto
    renata: (
      <svg width={W * size} height={H * size} viewBox="0 0 40 72" fill="none" className={cls}>
        {/* Cabelo longo solto — castanho */}
        <rect x="8" y="3" width="24" height="16" rx="6" fill="#7c3d12"/>
        <rect x="6" y="10" width="5" height="20" rx="2.5" fill="#7c3d12"/>
        <rect x="29" y="10" width="5" height="20" rx="2.5" fill="#7c3d12"/>
        {/* Franja suave */}
        <rect x="9" y="10" width="22" height="4" rx="2" fill="#92400e"/>
        {/* Ear */}
        <ellipse cx="9.5" cy="20" rx="2.5" ry="3.5" fill="#f5c5a0"/>
        <ellipse cx="30.5" cy="20" rx="2.5" ry="3.5" fill="#f5c5a0"/>
        {/* Head */}
        <ellipse cx="20" cy="19" rx="11" ry="10.5" fill="#fde8d0"/>
        {/* Eyes — expressivos */}
        <ellipse cx="15" cy="17" rx="2.5" ry="2.8" fill="#1c1917"/>
        <ellipse cx="25" cy="17" rx="2.5" ry="2.8" fill="#1c1917"/>
        <circle cx="15.8" cy="16.2" r="0.9" fill="#fff"/>
        <circle cx="25.8" cy="16.2" r="0.9" fill="#fff"/>
        {/* Nariz */}
        <circle cx="20" cy="22" r="1" fill="#d4956a"/>
        {/* Sorriso — entusiasmado */}
        <path d="M14.5 25.5 Q20 29 25.5 25.5" stroke="#b06040" strokeWidth="1.1" fill="none" strokeLinecap="round"/>
        {/* Roupa coral (cor da Renata) */}
        <rect x="9" y="28" width="22" height="22" rx="3" fill="#e11d48"/>
        {/* Detalhe gola V */}
        <path d="M20 28 L16 34 M20 28 L24 34" stroke="#be123c" strokeWidth="1.2" fill="none"/>
        {/* Braço esquerdo */}
        <rect x="1" y="29" width="8" height="14" rx="3" fill="#e11d48"/>
        {/* Mão esquerda */}
        <ellipse cx="5" cy="44" rx="4" ry="3" fill="#fde8d0"/>
        {/* Braço direito — segura prancheta */}
        <rect x="31" y="27" width="8" height="14" rx="3" fill="#e11d48"/>
        {/* Mão direita */}
        <ellipse cx="35" cy="42" rx="4" ry="3" fill="#fde8d0"/>
        {/* Prancheta */}
        <rect x="28" y="22" width="14" height="18" rx="2" fill="#d6d3d1"/>
        <rect x="29" y="23" width="12" height="15" rx="1" fill="#fafaf9"/>
        {/* Clipe da prancheta */}
        <rect x="33" y="20" width="4" height="5" rx="1" fill="#78716c"/>
        {/* Post-its coloridos na prancheta */}
        <rect x="29.5" y="24" width="5" height="4" rx="0.5" fill="#fde047"/>
        <rect x="35" y="24" width="5" height="4" rx="0.5" fill="#86efac"/>
        <rect x="29.5" y="29" width="5" height="4" rx="0.5" fill="#f9a8d4"/>
        <rect x="35" y="29" width="5" height="4" rx="0.5" fill="#93c5fd"/>
        {/* Linhas simulando texto nos post-its */}
        <line x1="30" y1="25.5" x2="34" y2="25.5" stroke="#a16207" strokeWidth="0.5"/>
        <line x1="35.5" y1="25.5" x2="39.5" y2="25.5" stroke="#166534" strokeWidth="0.5"/>
        <line x1="30" y1="30.5" x2="34" y2="30.5" stroke="#9d174d" strokeWidth="0.5"/>
        <line x1="35.5" y1="30.5" x2="39.5" y2="30.5" stroke="#1e40af" strokeWidth="0.5"/>
        {/* Calça branca/creme */}
        <rect x="10" y="49" width="8" height="14" rx="2" fill="#f5f0eb"/>
        <rect x="22" y="49" width="8" height="14" rx="2" fill="#f5f0eb"/>
        {/* Sapatos coral escuro */}
        <rect x="8" y="61" width="12" height="8" rx="3" fill="#be123c"/>
        <rect x="20" y="61" width="12" height="8" rx="3" fill="#be123c"/>
        {/* Brilho sapato */}
        <rect x="8" y="61" width="12" height="2" rx="1" fill="#f43f5e" opacity="0.6"/>
        <rect x="20" y="61" width="12" height="2" rx="1" fill="#f43f5e" opacity="0.6"/>
      </svg>
    ),
  }

  return <>{sprites[id]}</>
}
