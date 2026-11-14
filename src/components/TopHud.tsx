import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { LEVELS } from '../game/levels';
import { HudSnapshot } from '../game/types';
import { PingyHeroIcon } from './PingyBadgeSvg';

interface TopHudProps {
  hud: HudSnapshot;
  onTogglePause: () => void;
  onToggleMute: () => void;
  onReturnTitle: () => void;
}

export function TopHud({ hud, onTogglePause, onToggleMute, onReturnTitle }: TopHudProps) {
  const lvlCfg = LEVELS[hud.level - 1] ?? LEVELS[0];
  const slaColor =
    hud.slaUptime >= 95
      ? 'text-[#00F5D4]'
      : hud.slaUptime >= 88
      ? 'text-[#FFB703]'
      : 'text-[#EF233C]';

  const p99Color =
    hud.p99LatencyMs <= 45
      ? 'text-[#00F5D4]'
      : hud.p99LatencyMs <= 120
      ? 'text-[#FFB703]'
      : 'text-[#EF233C]';

  return (
    <header className="w-full border-b border-[#262a35] bg-[#0f131d] px-4 lg:px-6 h-14 flex items-center justify-between gap-6 shrink-0">
      {/* Zone 1: Brand + Active Level */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onReturnTitle}
          className="flex items-center gap-2.5 text-left hover:opacity-90 transition-opacity focus-visible:outline-2 focus-visible:outline-[#00F5D4] rounded cursor-pointer whitespace-nowrap shrink-0"
          title="Return to Title Screen"
        >
          <PingyHeroIcon className="w-7 h-7 shrink-0" />
          <span className="font-bold text-base tracking-tight text-[#dfe2f1]">Packet Panic!</span>
        </button>
        <span className="hidden xl:inline text-[#3a4a46] select-none" aria-hidden="true">
          /
        </span>
        <span className="hidden xl:inline text-xs font-mono text-[#b9cac4] truncate">
          Wave 0{hud.level} · {lvlCfg.title}
        </span>
      </div>

      {/* Zone 2: Live Tabular Telemetry Strip */}
      <div className="flex items-center gap-4 lg:gap-6 font-mono tabular-nums text-xs overflow-x-auto">
        <div className="flex items-baseline gap-1.5 whitespace-nowrap shrink-0">
          <span className="text-[#83948f]">SCORE</span>
          <span className="text-sm font-bold text-[#dfe2f1]">
            {hud.score.toLocaleString()}
          </span>
          {hud.combo > 1 && (
            <span className="text-[#FF2A85] font-bold">x{hud.combo}</span>
          )}
        </div>

        <span className="h-3.5 w-px bg-[#262a35] shrink-0" aria-hidden="true" />

        <div className="flex items-baseline gap-1.5 whitespace-nowrap shrink-0">
          <span className="text-[#83948f]">P99</span>
          <span className={`text-sm font-bold ${p99Color}`}>{hud.p99LatencyMs}ms</span>
        </div>

        <span className="h-3.5 w-px bg-[#262a35] shrink-0" aria-hidden="true" />

        <div className="flex items-baseline gap-1.5 whitespace-nowrap shrink-0">
          <span className="text-[#83948f]">SLA</span>
          <span className={`text-sm font-bold ${slaColor}`}>{hud.slaUptime.toFixed(1)}%</span>
        </div>

        <span className="h-3.5 w-px bg-[#262a35] shrink-0" aria-hidden="true" />

        <div className="flex items-baseline gap-1.5 whitespace-nowrap shrink-0">
          <span className="text-[#83948f]">CREDITS</span>
          <span className="text-sm font-bold text-[#FFB703]">{hud.credits} CR</span>
        </div>

        <span className="h-3.5 w-px bg-[#262a35] shrink-0" aria-hidden="true" />

        <div className="flex items-baseline gap-1.5 whitespace-nowrap shrink-0">
          <span className="text-[#83948f]">TIMER</span>
          <span
            className={`text-sm font-bold ${
              hud.waveTimeLeft <= 8 && hud.gameState === 'PLAYING'
                ? 'text-[#FF2A85]'
                : 'text-[#dfe2f1]'
            }`}
          >
            00:{String(hud.waveTimeLeft).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Zone 3: Functional Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {(hud.gameState === 'PLAYING' || hud.gameState === 'PAUSED') && (
          <button
            type="button"
            onClick={onTogglePause}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#262a35] bg-[#141B2D] text-[#dfe2f1] hover:border-[#00F5D4]/60 hover:text-[#00F5D4] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {hud.gameState === 'PAUSED' ? (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Resume</span>
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </>
            )}
          </button>
        )}

        {hud.gameState !== 'TITLE_MENU' && (
          <button
            type="button"
            onClick={onReturnTitle}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#262a35] bg-[#141B2D] text-[#b9cac4] hover:border-[#3a4a46] hover:text-[#dfe2f1] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Exit to Wave Select"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Menu</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={hud.muted ? 'Unmute Arcade Audio' : 'Mute Arcade Audio'}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            hud.muted
              ? 'border-[#3a4a46] bg-[#141B2D] text-[#83948f] hover:text-[#dfe2f1]'
              : 'border-[#00F5D4]/40 bg-[#141B2D] text-[#00F5D4] hover:bg-[#00F5D4]/10'
          }`}
        >
          {hud.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          <span className="hidden md:inline">{hud.muted ? 'Muted' : 'Audio'}</span>
        </button>
      </div>
    </header>
  );
}
