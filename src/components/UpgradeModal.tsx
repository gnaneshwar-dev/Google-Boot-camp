import { ArrowRight, Check } from 'lucide-react';
import { LEVELS, UPGRADES } from '../game/levels';
import { HudSnapshot, UpgradeLevels } from '../game/types';

interface UpgradeModalProps {
  hud: HudSnapshot;
  onBuyUpgrade: (id: keyof UpgradeLevels | 'sla_patch') => void;
  onNextWave: () => void;
}

export function UpgradeModal({ hud, onBuyUpgrade, onNextWave }: UpgradeModalProps) {
  const clearedLvl = LEVELS[hud.level - 1] ?? LEVELS[0];
  const nextLvl = LEVELS[hud.level] ?? LEVELS[0];

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0B0F19]/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl border border-[#3a4a46] bg-[#141B2D] p-6 space-y-5 shadow-2xl my-auto">
        {/* Wave Clear Summary Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#262a35] pb-4">
          <div>
            <div className="text-xs font-mono text-[#38B000] font-semibold">
              WAVE 0{hud.level} CLEARED · {clearedLvl.title.toUpperCase()}
            </div>
            <h2 className="text-2xl font-bold text-[#dfe2f1] mt-0.5">
              Cluster Upgrade Bay
            </h2>
          </div>

          <div className="flex items-center gap-5 font-mono tabular-nums text-xs">
            <div>
              <div className="text-[#83948f]">SLA</div>
              <div className="text-sm font-bold text-[#00F5D4]">{hud.slaUptime.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-[#83948f]">P99</div>
              <div className="text-sm font-bold text-[#dfe2f1]">{hud.p99LatencyMs}ms</div>
            </div>
            <div>
              <div className="text-[#83948f]">CREDITS</div>
              <div className="text-sm font-bold text-[#FFB703]">{hud.credits} CR</div>
            </div>
          </div>
        </div>

        {/* Upgrade Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {UPGRADES.map((up) => {
            const isPatch = up.id === 'sla_patch';
            const lvl = isPatch ? 0 : hud.upgrades[up.id as keyof UpgradeLevels];
            const maxed = !isPatch && lvl >= up.maxLevel;
            const cost = isPatch ? up.baseCost : up.baseCost + lvl * up.costStep;
            const cantAfford = hud.credits < cost || (isPatch && hud.slaUptime >= 99.9);

            return (
              <div
                key={up.id}
                className="flex flex-col justify-between gap-3 p-3.5 rounded-lg border border-[#262a35] bg-[#0f131d]"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#dfe2f1]">{up.name}</span>
                    {!isPatch && (
                      <span className="font-mono text-[11px] text-[#00F5D4]">
                        LV {lvl}/{up.maxLevel}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#b9cac4] leading-snug">{up.shortDesc}</p>
                  <div className="font-mono text-[11px] text-[#00dfc1] pt-0.5">
                    {up.effectLabel(lvl)}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={maxed || cantAfford}
                  onClick={() => onBuyUpgrade(up.id)}
                  className={`w-full py-1.5 px-3 rounded-md font-mono text-xs font-bold border transition-colors cursor-pointer ${
                    maxed
                      ? 'border-[#38B000]/40 bg-[#38B000]/10 text-[#38B000] cursor-default'
                      : cantAfford
                      ? 'border-[#262a35] bg-[#141B2D] text-[#83948f] cursor-not-allowed'
                      : 'border-[#00F5D4] bg-[#00F5D4]/15 text-[#00F5D4] hover:bg-[#00F5D4] hover:text-[#00201a]'
                  }`}
                >
                  {maxed ? (
                    <span className="inline-flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> MAXED
                    </span>
                  ) : isPatch && hud.slaUptime >= 99.9 ? (
                    'SLA AT 100%'
                  ) : (
                    `INSTALL · ${cost} CR`
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Next Wave Preview + Deploy CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-[#262a35]">
          <div className="space-y-0.5 min-w-0">
            <div className="text-xs font-mono text-[#FF2A85]">
              INCOMING WAVE 0{nextLvl.level}: {nextLvl.title}
            </div>
            <p className="text-xs text-[#b9cac4] truncate">{nextLvl.subtitle}</p>
          </div>

          <button
            type="button"
            onClick={onNextWave}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#00F5D4] text-[#00201a] font-bold text-sm hover:bg-[#26fedc] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Deploy Wave 0{nextLvl.level}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
