import { AlertTriangle } from 'lucide-react';
import { LEVELS } from '../game/levels';
import { ActionControl, HudSnapshot } from '../game/types';

interface TacticalSidebarProps {
  hud: HudSnapshot;
  onTriggerOp: (opId: string) => void;
}

export function TacticalSidebar({ hud, onTriggerOp }: TacticalSidebarProps) {
  const lvl = LEVELS[hud.level - 1] ?? LEVELS[0];
  const isOverheated = hud.maxNodeLoadPct >= 85;

  const getAccentClasses = (act: ActionControl) => {
    if (act.disabled && !act.active) {
      return 'border-[#262a35] bg-[#111726] text-[#83948f] opacity-60 cursor-not-allowed';
    }
    if (act.active) {
      if (act.accent === 'magenta') {
        return 'border-[#FF2A85] bg-[#FF2A85]/12 text-[#dfe2f1] hover:bg-[#FF2A85]/20 cursor-pointer';
      }
      if (act.accent === 'amber') {
        return 'border-[#FFB703] bg-[#FFB703]/12 text-[#dfe2f1] hover:bg-[#FFB703]/20 cursor-pointer';
      }
      if (act.accent === 'green') {
        return 'border-[#38B000] bg-[#38B000]/12 text-[#dfe2f1] hover:bg-[#38B000]/20 cursor-pointer';
      }
      return 'border-[#00F5D4] bg-[#00F5D4]/12 text-[#dfe2f1] hover:bg-[#00F5D4]/20 cursor-pointer';
    }
    return 'border-[#3a4a46] bg-[#141B2D] text-[#dfe2f1] hover:border-[#00F5D4] hover:bg-[#1c253c] cursor-pointer';
  };

  return (
    <aside className="w-full lg:w-[308px] shrink-0 border-t lg:border-t-0 lg:border-l border-[#262a35] bg-[#0f131d] p-4 flex flex-col gap-4 overflow-y-auto">
      {/* Level Briefing */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-mono text-[#83948f]">
          <span>WAVE 0{hud.level} OF 05</span>
          <span className="tabular-nums">
            {hud.packetsServed} OK / {hud.packetsDropped} ERR
          </span>
        </div>
        <h2 className="text-base font-bold text-[#dfe2f1] leading-snug">{lvl.title}</h2>
        <p className="text-xs text-[#b9cac4] leading-relaxed">{lvl.objective}</p>
      </div>

      {/* Live Critical Alert (only when real overheat or downstream outage occurs) */}
      {(isOverheated || (hud.level === 4 && hud.downstreamDown && hud.breakerState === 'CLOSED') || (hud.level === 2 && hud.cacheStale) || (hud.level === 5 && hud.splitConflicts >= 6)) && (
        <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#EF233C]/70 bg-[#93000a]/25 text-xs text-[#ffdad6]">
          <AlertTriangle className="w-4 h-4 text-[#EF233C] shrink-0 mt-0.5" />
          <div className="leading-snug">
            {hud.level === 4 && hud.downstreamDown && hud.breakerState === 'CLOSED'
              ? 'Downstream Payments API is hanging! Flip Circuit Breaker OPEN [1] now.'
              : hud.level === 2 && hud.cacheStale
              ? 'Cached keys are stale! Flush Redis Cache [3] or press [E] near Cache.'
              : hud.level === 5 && hud.splitConflicts >= 6
              ? `Split-brain conflict debt high (${hud.splitConflicts})! Merge CRDTs [2] immediately.`
              : `Node load at ${hud.maxNodeLoadPct}% — catch overflow packets [E] or scale cluster!`}
          </div>
        </div>
      )}

      {/* Architecture Ops */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-[#b9cac4]">
          <span>Architecture Ops</span>
          <span className="font-mono text-[#83948f]">Keys 1–3</span>
        </div>

        <div className="flex flex-col gap-2">
          {hud.actions.map((act) => (
            <button
              key={act.id}
              type="button"
              disabled={act.disabled && !act.active}
              onClick={() => onTriggerOp(act.id)}
              className={`w-full text-left p-2.5 rounded-lg border transition-colors ${getAccentClasses(
                act
              )}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-[#0B0F19] border border-[#3a4a46] font-mono text-[11px] font-bold text-[#00F5D4] shrink-0">
                    {act.key}
                  </span>
                  <span className="text-xs font-semibold truncate">{act.label}</span>
                </div>
                {act.cost !== undefined && (
                  <span className="font-mono text-[11px] font-bold text-[#FFB703] shrink-0 tabular-nums">
                    {act.cost} CR
                  </span>
                )}
              </div>
              <p className="mt-1 pl-7 text-[11px] text-[#b9cac4] truncate">{act.subtext}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Level-Specific Live Metrics */}
      {hud.level === 2 && hud.cacheDeployed && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#262a35] bg-[#141B2D] font-mono text-xs tabular-nums">
          <span className="text-[#83948f]">CACHE HIT RATIO</span>
          <span className="font-bold text-[#00F5D4]">{hud.cacheHitRate}%</span>
        </div>
      )}

      {/* Live Cluster Event Stream */}
      <div className="flex-1 min-h-[120px] flex flex-col gap-1.5 border-t border-[#262a35] pt-3">
        <span className="text-xs font-semibold text-[#b9cac4]">Cluster Event Stream</span>
        <div className="flex-1 rounded-lg border border-[#262a35] bg-[#0a0e18] p-2.5 font-mono text-[11px] space-y-1.5 overflow-y-auto max-h-[170px]">
          {hud.events.length === 0 ? (
            <p className="text-[#83948f]">Awaiting traffic telemetry...</p>
          ) : (
            hud.events.map((ev) => (
              <div key={ev.id} className="flex items-start gap-2 leading-tight">
                <span className="text-[#83948f] shrink-0">{ev.timestamp}</span>
                <span
                  className={
                    ev.severity === 'error'
                      ? 'text-[#ffb4ab]'
                      : ev.severity === 'warn'
                      ? 'text-[#ffd48b]'
                      : ev.severity === 'success'
                      ? 'text-[#00F5D4]'
                      : 'text-[#dfe2f1]'
                  }
                >
                  {ev.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Compact Control Legend */}
      <div className="border-t border-[#262a35] pt-2.5 text-[11px] font-mono text-[#83948f] flex flex-wrap gap-x-3 gap-y-1">
        <span>
          <strong className="text-[#dfe2f1]">WASD</strong> Move
        </span>
        <span>
          <strong className="text-[#dfe2f1]">Space</strong> Dash
        </span>
        <span>
          <strong className="text-[#dfe2f1]">E / Click</strong> Catch &amp; Interact
        </span>
      </div>
    </aside>
  );
}
