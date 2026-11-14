import { RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { LEVELS } from '../game/levels';
import { HudSnapshot } from '../game/types';

interface PostmortemModalProps {
  hud: HudSnapshot;
  onPlayAgain: () => void;
  onRetryWave: () => void;
}

export function PostmortemModal({ hud, onPlayAgain, onRetryWave }: PostmortemModalProps) {
  const lvl = LEVELS[hud.level - 1] ?? LEVELS[0];
  const isWin = hud.victory;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0B0F19]/88 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl border border-[#3a4a46] bg-[#141B2D] p-6 md:p-7 space-y-5 shadow-2xl my-auto">
        {/* Status Header */}
        <div className="flex items-start gap-3.5 border-b border-[#262a35] pb-4">
          <div
            className={`p-2.5 rounded-lg border shrink-0 ${
              isWin
                ? 'border-[#00F5D4]/50 bg-[#00F5D4]/10 text-[#00F5D4]'
                : 'border-[#EF233C]/60 bg-[#93000a]/25 text-[#EF233C]'
            }`}
          >
            {isWin ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
          </div>
          <div className="space-y-1">
            <div
              className={`font-mono text-xs font-bold ${
                isWin ? 'text-[#00F5D4]' : 'text-[#EF233C]'
              }`}
            >
              {isWin
                ? 'POSTMORTEM REPORT · ALL 5 WAVES DEFENDED'
                : `INCIDENT 503 · SERVICE UNAVAILABLE AT WAVE 0${hud.level}`}
            </div>
            <h2 className="text-2xl font-bold text-[#dfe2f1]">
              {isWin ? 'Cluster Mastered!' : `${lvl.title} Meltdown`}
            </h2>
            {!isWin && hud.failureReason && (
              <p className="text-xs text-[#ffb4ab]">{hud.failureReason}</p>
            )}
          </div>
        </div>

        {/* 4-Column Tabular Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
          <div className="p-3 rounded-lg border border-[#262a35] bg-[#0f131d]">
            <div className="text-[11px] text-[#83948f]">FINAL SCORE</div>
            <div className="text-lg font-bold text-[#dfe2f1] mt-0.5">
              {hud.score.toLocaleString()}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-[#262a35] bg-[#0f131d]">
            <div className="text-[11px] text-[#83948f]">SLA UPTIME</div>
            <div
              className={`text-lg font-bold mt-0.5 ${
                isWin ? 'text-[#00F5D4]' : 'text-[#EF233C]'
              }`}
            >
              {hud.slaUptime.toFixed(1)}%
            </div>
          </div>
          <div className="p-3 rounded-lg border border-[#262a35] bg-[#0f131d]">
            <div className="text-[11px] text-[#83948f]">PEAK COMBO</div>
            <div className="text-lg font-bold text-[#FF2A85] mt-0.5">x{hud.peakCombo}</div>
          </div>
          <div className="p-3 rounded-lg border border-[#262a35] bg-[#0f131d]">
            <div className="text-[11px] text-[#83948f]">PACKETS OK / ERR</div>
            <div className="text-lg font-bold text-[#dfe2f1] mt-0.5">
              {hud.packetsServed} / {hud.packetsDropped}
            </div>
          </div>
        </div>

        {/* 3 Level-Specific Distributed Systems Takeaways */}
        <div className="space-y-2.5">
          <div className="text-xs font-semibold text-[#b9cac4]">
            Engineering Takeaways · Wave 0{hud.level} ({lvl.title})
          </div>
          <ol className="space-y-2">
            {lvl.takeaways.map((lesson, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 p-3 rounded-lg border border-[#262a35] bg-[#0f131d] text-xs text-[#dfe2f1] leading-relaxed"
              >
                <span className="font-mono font-bold text-[#00F5D4] shrink-0">
                  0{idx + 1}.
                </span>
                <span>{lesson}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-[#262a35]">
          {!isWin && hud.level > 1 && (
            <button
              type="button"
              onClick={onRetryWave}
              className="px-4 py-2.5 rounded-lg border border-[#3a4a46] bg-[#0f131d] text-xs font-semibold text-[#dfe2f1] hover:border-[#00F5D4] hover:text-[#00F5D4] transition-colors cursor-pointer whitespace-nowrap"
            >
              Retry Wave 0{hud.level}
            </button>
          )}
          <button
            type="button"
            onClick={onPlayAgain}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#00F5D4] text-[#00201a] font-bold text-sm hover:bg-[#26fedc] transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Play Again</span>
          </button>
        </div>
      </div>
    </div>
  );
}
