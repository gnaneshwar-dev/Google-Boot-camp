import { useCallback, useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { PostmortemModal } from './components/PostmortemModal';
import { TacticalSidebar } from './components/TacticalSidebar';
import { TitleOverlay } from './components/TitleOverlay';
import { TopHud } from './components/TopHud';
import { UpgradeModal } from './components/UpgradeModal';
import { ARENA_H, ARENA_W, PacketPanicEngine } from './game/engine';
import { HudSnapshot, UpgradeLevels } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  gameState: 'TITLE_MENU',
  level: 1,
  waveTimeLeft: 45,
  waveDuration: 45,
  score: 0,
  combo: 1,
  peakCombo: 1,
  p99LatencyMs: 20,
  slaUptime: 100,
  credits: 100,
  packetsServed: 0,
  packetsDropped: 0,
  packetsCaught: 0,
  muted: false,
  victory: false,
  failureReason: '',
  maxNodeLoadPct: 0,
  lbDeployed: false,
  routingPolicy: 'ROUND_ROBIN',
  cacheDeployed: false,
  cacheTTL: 'BALANCED',
  cacheStale: false,
  cacheHitRate: 0,
  replicaDeployed: false,
  shardingDeployed: false,
  replicationLag: 0,
  breakerState: 'CLOSED',
  asyncQueueDeployed: false,
  asyncQueueCount: 0,
  downstreamDown: false,
  capMode: 'CP',
  partitionActive: true,
  splitConflicts: 0,
  upgrades: { sneakers: 0, capacitor: 0, overclock: 0, buffer: 0 },
  actions: [],
  events: [],
  nearbyPrompt: null
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<PacketPanicEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);

  useEffect(() => {
    const engine = new PacketPanicEngine((snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;
    if (canvasRef.current) {
      engine.attachCanvas(canvasRef.current);
    }
    engine.startLoop();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && engine.getGameState() === 'TITLE_MENU') {
        engine.startNewGame(1);
        return;
      }
      engine.handleKeyDown(e);
    };
    const onKeyUp = (e: KeyboardEvent) => engine.handleKeyUp(e);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      engine.stopLoop();
    };
  }, []);

  const handleStart = useCallback((startLevel: number) => {
    engineRef.current?.startNewGame(startLevel);
  }, []);

  const handleTogglePause = useCallback(() => {
    engineRef.current?.togglePause();
  }, []);

  const handleToggleMute = useCallback(() => {
    setHud((prev) => {
      const next = !prev.muted;
      engineRef.current?.setMuted(next);
      return { ...prev, muted: next };
    });
  }, []);

  const handleReturnTitle = useCallback(() => {
    engineRef.current?.returnToTitle();
  }, []);

  const handleTriggerOp = useCallback((opId: string) => {
    engineRef.current?.triggerOp(opId);
  }, []);

  const handleBuyUpgrade = useCallback((id: keyof UpgradeLevels | 'sla_patch') => {
    engineRef.current?.applyUpgrade(id);
  }, []);

  const handleNextWave = useCallback(() => {
    engineRef.current?.nextWave();
  }, []);

  const handleRetryWave = useCallback(() => {
    engineRef.current?.retryCurrentWave();
  }, []);

  const handlePlayAgain = useCallback(() => {
    engineRef.current?.startNewGame(1);
  }, []);

  const simulateKey = useCallback((key: string, down: boolean) => {
    const ev = { key, repeat: false, preventDefault: () => {} } as KeyboardEvent;
    if (down) engineRef.current?.handleKeyDown(ev);
    else engineRef.current?.handleKeyUp(ev);
  }, []);

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-[#0B0F19] text-[#dfe2f1] lg:overflow-hidden">
      <TopHud
        hud={hud}
        onTogglePause={handleTogglePause}
        onToggleMute={handleToggleMute}
        onReturnTitle={handleReturnTitle}
      />

      <main className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Dominant Arena Canvas Stage */}
        <section className="relative flex-1 flex flex-col items-center justify-center bg-[#0B0F19] p-3 lg:p-5 min-h-[360px] min-w-0">
          <div className="relative w-full max-w-[1060px] aspect-[960/580] max-h-full rounded-xl border border-[#262a35] bg-[#0B0F19] overflow-hidden shadow-2xl">
            <canvas
              ref={canvasRef}
              width={ARENA_W}
              height={ARENA_H}
              onClick={(e) => engineRef.current?.handleCanvasClick(e.clientX, e.clientY)}
              onMouseMove={(e) => engineRef.current?.handleCanvasPointerMove(e.clientX, e.clientY)}
              className="w-full h-full block cursor-crosshair select-none"
            />

            {/* Subtle Canvas-Bottom Packet Legend (non-intrusive, unboxed text) */}
            {hud.gameState === 'PLAYING' && (
              <div className="pointer-events-none absolute bottom-2.5 left-3.5 right-3.5 flex items-center justify-between text-[11px] font-mono text-[#83948f]">
                <div className="flex items-center gap-3.5">
                  <span className="text-[#00F5D4]">● GET</span>
                  <span className="text-[#FFB703]">● POST</span>
                  <span className="text-[#FF2A85]">◆ HEAVY</span>
                  {hud.level === 2 && <span className="text-[#FFE066]">● INVALIDATE</span>}
                  {hud.level === 4 && <span className="text-[#EF233C]">● TIMEOUT</span>}
                </div>
                {hud.nearbyPrompt && (
                  <span className="text-[#00F5D4] font-bold">{hud.nearbyPrompt}</span>
                )}
              </div>
            )}
          </div>

          {/* Mobile Touch Controls (shown only on small touch screens while playing) */}
          {hud.gameState === 'PLAYING' && (
            <div className="mt-3 flex md:hidden items-center justify-between w-full max-w-md px-2">
              <div className="grid grid-cols-3 gap-1.5 w-36">
                <div />
                <button
                  type="button"
                  onPointerDown={() => simulateKey('w', true)}
                  onPointerUp={() => simulateKey('w', false)}
                  onPointerLeave={() => simulateKey('w', false)}
                  className="h-11 rounded-md border border-[#3a4a46] bg-[#141B2D] font-mono text-xs font-bold active:bg-[#00F5D4]/20"
                >
                  W
                </button>
                <div />
                <button
                  type="button"
                  onPointerDown={() => simulateKey('a', true)}
                  onPointerUp={() => simulateKey('a', false)}
                  onPointerLeave={() => simulateKey('a', false)}
                  className="h-11 rounded-md border border-[#3a4a46] bg-[#141B2D] font-mono text-xs font-bold active:bg-[#00F5D4]/20"
                >
                  A
                </button>
                <button
                  type="button"
                  onPointerDown={() => simulateKey('s', true)}
                  onPointerUp={() => simulateKey('s', false)}
                  onPointerLeave={() => simulateKey('s', false)}
                  className="h-11 rounded-md border border-[#3a4a46] bg-[#141B2D] font-mono text-xs font-bold active:bg-[#00F5D4]/20"
                >
                  S
                </button>
                <button
                  type="button"
                  onPointerDown={() => simulateKey('d', true)}
                  onPointerUp={() => simulateKey('d', false)}
                  onPointerLeave={() => simulateKey('d', false)}
                  className="h-11 rounded-md border border-[#3a4a46] bg-[#141B2D] font-mono text-xs font-bold active:bg-[#00F5D4]/20"
                >
                  D
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => simulateKey(' ', true)}
                  className="h-12 px-4 rounded-lg border border-[#00F5D4] bg-[#00F5D4]/15 text-[#00F5D4] font-mono text-xs font-bold"
                >
                  DASH
                </button>
                <button
                  type="button"
                  onClick={() => simulateKey('e', true)}
                  className="h-12 px-4 rounded-lg bg-[#00F5D4] text-[#00201a] font-mono text-xs font-bold"
                >
                  CATCH [E]
                </button>
              </div>
            </div>
          )}

          {/* Modals & State Overlays */}
          {hud.gameState === 'TITLE_MENU' && <TitleOverlay onStart={handleStart} />}

          {hud.gameState === 'PAUSED' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0B0F19]/80 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-xl border border-[#3a4a46] bg-[#141B2D] p-6 text-center space-y-4 shadow-2xl">
                <div className="font-mono text-xs text-[#FFB703]">CLUSTER SIMULATION PAUSED</div>
                <h2 className="text-2xl font-bold text-[#dfe2f1]">Wave 0{hud.level} On Hold</h2>
                <p className="text-xs text-[#b9cac4]">
                  Press <strong className="text-[#dfe2f1]">Esc</strong> or click Resume to jump back
                  into traffic routing.
                </p>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleReturnTitle}
                    className="px-4 py-2 rounded-lg border border-[#3a4a46] bg-[#0f131d] text-xs font-semibold text-[#dfe2f1] hover:border-[#00F5D4] cursor-pointer"
                  >
                    Wave Select
                  </button>
                  <button
                    type="button"
                    onClick={handleTogglePause}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#00F5D4] text-[#00201a] text-sm font-bold hover:bg-[#26fedc] cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Resume</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {hud.gameState === 'ROUND_SUMMARY' && (
            <UpgradeModal
              hud={hud}
              onBuyUpgrade={handleBuyUpgrade}
              onNextWave={handleNextWave}
            />
          )}

          {hud.gameState === 'GAME_OVER' && (
            <PostmortemModal
              hud={hud}
              onPlayAgain={handlePlayAgain}
              onRetryWave={handleRetryWave}
            />
          )}
        </section>

        {/* Right Tactical Architecture Panel */}
        <TacticalSidebar hud={hud} onTriggerOp={handleTriggerOp} />
      </main>
    </div>
  );
}
