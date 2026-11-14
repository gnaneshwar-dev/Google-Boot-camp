import { useState } from 'react';
import { Play } from 'lucide-react';
import { LEVELS } from '../game/levels';
import { PingyHeroIcon } from './PingyBadgeSvg';

interface TitleOverlayProps {
  onStart: (startLevel: number) => void;
}

export function TitleOverlay({ onStart }: TitleOverlayProps) {
  const [selectedLevel, setSelectedLevel] = useState(1);
  const currentLvl = LEVELS[selectedLevel - 1] ?? LEVELS[0];

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0B0F19]/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-xl border border-[#3a4a46] bg-[#141B2D] p-6 md:p-8 shadow-2xl space-y-6">
        {/* Hero Header */}
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-xl border border-[#262a35] bg-[#0B0F19] shrink-0">
            <PingyHeroIcon className="w-14 h-14" />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-mono text-[#00F5D4]">
              DISTRIBUTED SYSTEMS ARCADE · 5 WAVES
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#dfe2f1]">
              Packet Panic!
            </h1>
            <p className="text-sm text-[#b9cac4] leading-relaxed">
              Pilot Pingy across live server clusters. Catch spilled packets before they 503,
              deploy scaling architectures under load, and hold SLA uptime above 80.0%.
            </p>
          </div>
        </div>

        {/* Starting Wave Selector */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-medium text-[#b9cac4]">
            <span>Select Starting Wave</span>
            <span className="font-mono text-[#83948f]">45s per wave</span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {LEVELS.map((lvl) => {
              const active = lvl.level === selectedLevel;
              return (
                <button
                  key={lvl.level}
                  type="button"
                  onClick={() => setSelectedLevel(lvl.level)}
                  className={`py-2 px-2 rounded-lg border text-center transition-colors cursor-pointer ${
                    active
                      ? 'border-[#00F5D4] bg-[#00F5D4]/15 text-[#d7fff3]'
                      : 'border-[#262a35] bg-[#0f131d] text-[#b9cac4] hover:border-[#3a4a46] hover:text-[#dfe2f1]'
                  }`}
                >
                  <div className="font-mono text-xs font-bold">W0{lvl.level}</div>
                  <div className="text-[11px] truncate mt-0.5">{lvl.title.split(' ').slice(-1)[0]}</div>
                </button>
              );
            })}
          </div>

          <div className="p-3.5 rounded-lg border border-[#262a35] bg-[#0f131d] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-[#dfe2f1]">
                Wave 0{currentLvl.level}: {currentLvl.title}
              </span>
              <span className="font-mono text-xs text-[#FFB703] shrink-0">
                {currentLvl.startingCredits} CR Start
              </span>
            </div>
            <p className="text-xs text-[#b9cac4] leading-relaxed">{currentLvl.objective}</p>
          </div>
        </div>

        {/* Controls Strip + Primary Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-[#262a35]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-[#83948f]">
            <span>
              <strong className="text-[#dfe2f1]">WASD / Arrows</strong> Move
            </span>
            <span>
              <strong className="text-[#dfe2f1]">Space</strong> Dash
            </span>
            <span>
              <strong className="text-[#dfe2f1]">E / Click</strong> Catch &amp; Ops
            </span>
          </div>

          <button
            type="button"
            onClick={() => onStart(selectedLevel)}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-[#00F5D4] text-[#00201a] font-bold text-sm hover:bg-[#26fedc] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Start Wave 0{selectedLevel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
