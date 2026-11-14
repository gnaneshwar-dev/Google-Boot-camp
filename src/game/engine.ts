import { soundEngine } from '../audio/soundEngine';
import { LEVELS, UPGRADES } from './levels';
import {
  ActionControl,
  BreakerState,
  CacheTTL,
  CapMode,
  ClusterEvent,
  ClusterNode,
  DashGhost,
  FloatingText,
  GameState,
  HudSnapshot,
  PacketEntity,
  PacketKind,
  Particle,
  PingyState,
  RoutingPolicy,
  UpgradeLevels
} from './types';

export const ARENA_W = 960;
export const ARENA_H = 580;

const COLORS = {
  bg: '#0B0F19',
  surface: '#141B2D',
  surfaceHigh: '#1c1f2a',
  border: '#262a35',
  cyan: '#00F5D4',
  cyanDim: '#00dfc1',
  magenta: '#FF2A85',
  amber: '#FFB703',
  green: '#38B000',
  red: '#EF233C',
  text: '#dfe2f1',
  muted: '#83948f'
};

interface Edge {
  from: string;
  to: string;
  color?: string;
  dashed?: boolean;
}

export class PacketPanicEngine {
  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private lastHudPushTime = 0;

  // Core game state
  private gameState: GameState = 'TITLE_MENU';
  private level = 1;
  private waveTimeLeft = 45;
  private waveDuration = 45;
  private score = 0;
  private combo = 1;
  private peakCombo = 1;
  private credits = 100;
  private slaUptime = 100;
  private packetsServed = 0;
  private packetsDropped = 0;
  private packetsCaught = 0;
  private victory = false;
  private failureReason = '';

  // Latency rolling window
  private latencySamples: number[] = [14, 18, 22];
  private p99LatencyMs = 20;

  // Entities
  private nodes: ClusterNode[] = [];
  private edges: Edge[] = [];
  private packets: PacketEntity[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private dashGhosts: DashGhost[] = [];
  private events: ClusterEvent[] = [];
  private nextId = 1;

  // Pingy
  private pingy: PingyState = {
    x: 240,
    y: 430,
    vx: 0,
    vy: 0,
    facingX: 1,
    facingY: 0,
    dashTimer: 0,
    dashCooldown: 0,
    dashMaxCooldown: 0.85,
    interactPulse: 0,
    walkPhase: 0,
    mood: 'CHILL',
    steamPhase: 0
  };

  // Input state
  private keys = new Set<string>();
  private pointerX = 0;
  private pointerY = 0;

  // Upgrades
  private upgrades: UpgradeLevels = {
    sneakers: 0,
    capacitor: 0,
    overclock: 0,
    buffer: 0
  };

  // Spawners & Level Mechanics
  private spawnTimer = 0;
  private waveElapsed = 0;
  private roundRobinCursor = 0;
  private totalTime = 0;

  // Level 1
  private lbDeployed = false;
  private routingPolicy: RoutingPolicy = 'ROUND_ROBIN';

  // Level 2
  private cacheDeployed = false;
  private cacheTTL: CacheTTL = 'BALANCED';
  private cacheStale = false;
  private cacheStaleTimer = 0;
  private cacheHits = 0;
  private cacheLookups = 0;
  private invalidateTimer = 7;

  // Level 3
  private replicaDeployed = false;
  private shardingDeployed = false;
  private replicationLag = 0;
  private shardCursor = 0;

  // Level 4
  private breakerState: BreakerState = 'CLOSED';
  private asyncQueueDeployed = false;
  private asyncQueueBuffer: PacketEntity[] = [];
  private downstreamDown = false;
  private downstreamCycleTimer = 5;

  // Level 5
  private capMode: CapMode = 'CP';
  private partitionActive = true;
  private partitionCycleTimer = 11;
  private splitConflicts = 0;

  constructor(onHudUpdate: (snapshot: HudSnapshot) => void) {
    this.onHudUpdate = onHudUpdate;
    this.setupDemoScene();
  }

  public startLoop() {
    if (this.rafId !== null) return;
    this.lastFrameTime = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
      this.lastFrameTime = now;
      this.totalTime += dt;

      if (this.gameState === 'PLAYING') {
        this.updateSimulation(dt);
      } else if (this.gameState === 'TITLE_MENU') {
        this.updateTitleAmbient(dt);
      }

      this.draw();

      if (now - this.lastHudPushTime >= 95) {
        this.lastHudPushTime = now;
        this.pushHud();
      }

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
    this.pushHud();
  }

  public stopLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private canvas: HTMLCanvasElement | null = null;
  public attachCanvas(canvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
  }

  public getGameState(): GameState {
    return this.gameState;
  }

  // ==================== PUBLIC CONTROLS ====================

  public startNewGame(startLevel = 1) {
    soundEngine.unlock();
    this.score = 0;
    this.combo = 1;
    this.peakCombo = 1;
    this.slaUptime = 100;
    this.packetsServed = 0;
    this.packetsDropped = 0;
    this.packetsCaught = 0;
    this.victory = false;
    this.failureReason = '';
    this.upgrades = { sneakers: 0, capacitor: 0, overclock: 0, buffer: 0 };
    const cfg = LEVELS[startLevel - 1] ?? LEVELS[0];
    this.credits = cfg.startingCredits;
    this.events = [];
    this.setupLevel(startLevel);
    this.gameState = 'PLAYING';
    this.pushHud();
  }

  public nextWave() {
    soundEngine.unlock();
    if (this.level >= LEVELS.length) {
      this.victory = true;
      this.gameState = 'GAME_OVER';
      soundEngine.playWaveClear();
      this.pushHud();
      return;
    }
    this.setupLevel(this.level + 1);
    this.gameState = 'PLAYING';
    this.pushHud();
  }

  public retryCurrentWave() {
    soundEngine.unlock();
    this.slaUptime = Math.max(92, this.slaUptime);
    if (this.slaUptime < 85) this.slaUptime = 100;
    this.combo = 1;
    this.victory = false;
    this.failureReason = '';
    const cfg = LEVELS[this.level - 1] ?? LEVELS[0];
    this.credits = Math.max(this.credits, cfg.startingCredits);
    this.setupLevel(this.level);
    this.gameState = 'PLAYING';
    this.pushHud();
  }

  public togglePause() {
    if (this.gameState === 'PLAYING') {
      this.gameState = 'PAUSED';
      this.keys.clear();
      this.pushHud();
    } else if (this.gameState === 'PAUSED') {
      this.gameState = 'PLAYING';
      this.lastFrameTime = performance.now();
      this.pushHud();
    }
  }

  public returnToTitle() {
    this.gameState = 'TITLE_MENU';
    this.keys.clear();
    this.setupDemoScene();
    this.pushHud();
  }

  public setMuted(muted: boolean) {
    soundEngine.setMuted(muted);
    this.pushHud();
  }

  public applyUpgrade(upgradeId: keyof UpgradeLevels | 'sla_patch') {
    const def = UPGRADES.find((u) => u.id === upgradeId);
    if (!def) return;

    if (upgradeId === 'sla_patch') {
      if (this.credits < def.baseCost || this.slaUptime >= 99.9) return;
      this.credits -= def.baseCost;
      this.slaUptime = Math.min(100, this.slaUptime + 12);
      soundEngine.playInteract();
      this.logEvent('Applied Emergency SLA Hotfix (+12% buffer)', 'success');
      this.pushHud();
      return;
    }

    const currentLvl = this.upgrades[upgradeId];
    if (currentLvl >= def.maxLevel) return;
    const cost = def.baseCost + currentLvl * def.costStep;
    if (this.credits < cost) return;

    this.credits -= cost;
    this.upgrades[upgradeId] = currentLvl + 1;
    soundEngine.playInteract();
    this.logEvent(`Installed ${def.name} Lv.${currentLvl + 1}`, 'success');
    this.pushHud();
  }

  public handleKeyDown(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
      if (this.gameState === 'PLAYING') {
        e.preventDefault();
      }
    }

    if (key === 'escape' || key === 'p') {
      if (this.gameState === 'PLAYING' || this.gameState === 'PAUSED') {
        this.togglePause();
        return;
      }
    }

    if (this.gameState !== 'PLAYING') return;

    this.keys.add(key);

    if (key === ' ' && !e.repeat) {
      this.triggerDash();
    } else if (key === 'e' && !e.repeat) {
      this.triggerInteract(this.pingy.x, this.pingy.y, true);
    } else if (key === '1' && !e.repeat) {
      this.triggerOpByIndex(0);
    } else if (key === '2' && !e.repeat) {
      this.triggerOpByIndex(1);
    } else if (key === '3' && !e.repeat) {
      this.triggerOpByIndex(2);
    }
  }

  public handleKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.key.toLowerCase());
  }

  public handleCanvasClick(clientX: number, clientY: number) {
    if (!this.canvas || this.gameState !== 'PLAYING') return;
    soundEngine.unlock();
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * ARENA_W;
    const y = ((clientY - rect.top) / rect.height) * ARENA_H;
    this.pointerX = x;
    this.pointerY = y;

    // 1. Check if clicking directly on an interactive node
    const clickedNode = this.nodes.find(
      (n) => x >= n.x - n.w / 2 - 12 && x <= n.x + n.w / 2 + 12 && y >= n.y - n.h / 2 - 12 && y <= n.y + n.h / 2 + 12
    );
    if (clickedNode) {
      const handled = this.interactWithNode(clickedNode);
      if (handled) {
        this.spawnRing(clickedNode.x, clickedNode.y, COLORS.cyan);
        this.pushHud();
        return;
      }
    }

    // 2. Otherwise trigger catch pulse at both Pingy and click point (if near overflow packets)
    this.triggerInteract(x, y, false);
  }

  public handleCanvasPointerMove(clientX: number, clientY: number) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointerX = ((clientX - rect.left) / rect.width) * ARENA_W;
    this.pointerY = ((clientY - rect.top) / rect.height) * ARENA_H;
  }

  public triggerOp(opId: string) {
    if (this.gameState !== 'PLAYING') return;
    soundEngine.unlock();

    switch (opId) {
      // Level 1
      case 'l1_deploy_lb': {
        if (this.lbDeployed) return;
        const cost = 80;
        if (this.credits < cost) {
          this.addFloat(this.pingy.x, this.pingy.y - 30, `NEED ${cost} CR`, COLORS.amber);
          soundEngine.play503();
          return;
        }
        this.credits -= cost;
        this.deployLevel1LB();
        break;
      }
      case 'l1_toggle_policy': {
        if (!this.lbDeployed) return;
        this.routingPolicy = this.routingPolicy === 'ROUND_ROBIN' ? 'LEAST_CONN' : 'ROUND_ROBIN';
        soundEngine.playInteract();
        const lb = this.getNode('lb');
        if (lb) {
          lb.sublabel = this.routingPolicy === 'ROUND_ROBIN' ? 'ROUND ROBIN' : 'LEAST CONN';
          lb.highlightTimer = 0.45;
          this.addFloat(lb.x, lb.y - 36, lb.sublabel, COLORS.cyan);
        }
        this.logEvent(`LB policy -> ${this.routingPolicy}`, 'info');
        break;
      }

      // Level 2
      case 'l2_deploy_cache': {
        if (this.cacheDeployed) return;
        const cost = 100;
        if (this.credits < cost) {
          this.addFloat(this.pingy.x, this.pingy.y - 30, `NEED ${cost} CR`, COLORS.amber);
          soundEngine.play503();
          return;
        }
        this.credits -= cost;
        this.deployLevel2Cache();
        break;
      }
      case 'l2_cycle_ttl': {
        if (!this.cacheDeployed) return;
        const order: CacheTTL[] = ['SHORT', 'BALANCED', 'LONG'];
        const next = order[(order.indexOf(this.cacheTTL) + 1) % order.length];
        this.cacheTTL = next;
        soundEngine.playInteract();
        const cache = this.getNode('cache');
        if (cache) {
          cache.sublabel = `TTL: ${this.getTtlSeconds()}s`;
          cache.highlightTimer = 0.4;
          this.addFloat(cache.x, cache.y - 36, `TTL ${this.getTtlSeconds()}s`, COLORS.cyan);
        }
        this.logEvent(`Cache TTL tuned to ${next} (${this.getTtlSeconds()}s)`, 'info');
        break;
      }
      case 'l2_flush_cache': {
        if (!this.cacheDeployed) return;
        this.cacheStale = false;
        this.cacheStaleTimer = 0;
        soundEngine.playCacheHit();
        const cache = this.getNode('cache');
        if (cache) {
          cache.staleKeys = false;
          cache.highlightTimer = 0.5;
          this.burstParticles(cache.x, cache.y, COLORS.cyan, 16);
          this.addFloat(cache.x, cache.y - 38, 'CACHE FLUSHED!', COLORS.cyan);
        }
        this.logEvent('Flushed stale keys from Redis cache', 'success');
        break;
      }

      // Level 3
      case 'l3_deploy_replica': {
        if (this.replicaDeployed) return;
        const cost = 100;
        if (this.credits < cost) {
          this.addFloat(this.pingy.x, this.pingy.y - 30, `NEED ${cost} CR`, COLORS.amber);
          soundEngine.play503();
          return;
        }
        this.credits -= cost;
        this.deployLevel3Replica();
        break;
      }
      case 'l3_deploy_sharding': {
        if (this.shardingDeployed) return;
        const cost = 140;
        if (this.credits < cost) {
          this.addFloat(this.pingy.x, this.pingy.y - 30, `NEED ${cost} CR`, COLORS.amber);
          soundEngine.play503();
          return;
        }
        this.credits -= cost;
        this.deployLevel3Sharding();
        break;
      }
      case 'l3_sync_replica': {
        if (!this.replicaDeployed) return;
        this.replicationLag = Math.max(0, this.replicationLag - 65);
        soundEngine.playInteract();
        const rep = this.getNode('replica');
        if (rep) {
          rep.replicationLag = this.replicationLag;
          rep.highlightTimer = 0.5;
          this.burstParticles(rep.x, rep.y, COLORS.cyan, 14);
          this.addFloat(rep.x, rep.y - 36, 'REPLICA SYNCED!', COLORS.cyan);
        }
        this.logEvent('Synced Read Replica WAL offset', 'success');
        break;
      }

      // Level 4
      case 'l4_toggle_breaker': {
        this.breakerState = this.breakerState === 'CLOSED' ? 'OPEN' : 'CLOSED';
        soundEngine.playBreakerSnap();
        const brk = this.getNode('breaker');
        if (brk) {
          brk.sublabel = this.breakerState;
          brk.highlightTimer = 0.45;
          this.burstParticles(
            brk.x,
            brk.y,
            this.breakerState === 'OPEN' ? COLORS.amber : COLORS.green,
            12
          );
          this.addFloat(
            brk.x,
            brk.y - 36,
            `BREAKER ${this.breakerState}`,
            this.breakerState === 'OPEN' ? COLORS.amber : COLORS.green
          );
        }
        this.logEvent(`Circuit Breaker flipped ${this.breakerState}`, 'warn');
        break;
      }
      case 'l4_deploy_queue': {
        if (this.asyncQueueDeployed) return;
        const cost = 120;
        if (this.credits < cost) {
          this.addFloat(this.pingy.x, this.pingy.y - 30, `NEED ${cost} CR`, COLORS.amber);
          soundEngine.play503();
          return;
        }
        this.credits -= cost;
        this.deployLevel4Queue();
        break;
      }
      case 'l4_drain_queue': {
        if (!this.asyncQueueDeployed || this.asyncQueueBuffer.length === 0) return;
        const drained = Math.min(4, this.asyncQueueBuffer.length);
        for (let i = 0; i < drained; i++) {
          this.asyncQueueBuffer.shift();
          this.recordSuccess(80, 38);
        }
        soundEngine.playCacheHit();
        const q = this.getNode('async_queue');
        if (q) {
          q.highlightTimer = 0.45;
          this.burstParticles(q.x, q.y, COLORS.cyan, 14);
          this.addFloat(q.x, q.y - 36, `DRAINED x${drained}`, COLORS.cyan);
        }
        break;
      }

      // Level 5
      case 'l5_toggle_cap': {
        this.capMode = this.capMode === 'CP' ? 'AP' : 'CP';
        soundEngine.playBreakerSnap();
        const bridge = this.getNode('cap_bridge');
        if (bridge) {
          bridge.sublabel = this.capMode === 'CP' ? 'CP: CONSISTENCY' : 'AP: AVAILABILITY';
          bridge.highlightTimer = 0.45;
          this.addFloat(
            bridge.x,
            bridge.y - 40,
            this.capMode === 'CP' ? 'CP QUORUM MODE' : 'AP AVAILABLE MODE',
            this.capMode === 'CP' ? COLORS.cyan : COLORS.magenta
          );
        }
        this.logEvent(`Switched cluster CAP policy -> ${this.capMode}`, 'info');
        break;
      }
      case 'l5_reconcile': {
        if (this.splitConflicts <= 0) return;
        const merged = this.splitConflicts;
        this.splitConflicts = 0;
        this.score += merged * 90;
        this.credits += merged * 6;
        soundEngine.playWaveClear();
        const bridge = this.getNode('cap_bridge');
        if (bridge) {
          bridge.conflicts = 0;
          bridge.highlightTimer = 0.6;
          this.burstParticles(bridge.x, bridge.y, COLORS.cyan, 20);
          this.addFloat(bridge.x, bridge.y - 42, `MERGED ${merged} CRDTs!`, COLORS.cyan);
        }
        this.logEvent(`Reconciled ${merged} split-brain conflicts`, 'success');
        break;
      }
    }

    this.pushHud();
  }

  private triggerOpByIndex(idx: number) {
    const actions = this.getActionControls();
    const act = actions[idx];
    if (act && !act.disabled) {
      this.triggerOp(act.id);
    }
  }

  // ==================== LEVEL SETUP ====================

  private setupDemoScene() {
    this.level = 1;
    this.nodes = [
      this.makeNode('ingress', 'INGRESS', 'TRAFFIC GATEWAY', 'INGRESS', 100, 290, 108, 72, 99, 99),
      this.makeNode('lb', 'LOAD BALANCER', 'LEAST CONN', 'LOAD_BALANCER', 330, 290, 126, 74, 12, 12),
      this.makeNode('w1', 'WORKER-01', 'STATELESS', 'WORKER', 580, 145, 118, 66, 8, 4.5),
      this.makeNode('w2', 'WORKER-02', 'STATELESS', 'WORKER', 580, 290, 118, 66, 8, 4.5),
      this.makeNode('w3', 'WORKER-03', 'STATELESS', 'WORKER', 580, 435, 118, 66, 8, 4.5),
      this.makeNode('db', 'CORE DB', 'POSTGRES', 'PRIMARY_DB', 835, 290, 122, 84, 16, 9)
    ];
    this.edges = [
      { from: 'ingress', to: 'lb' },
      { from: 'lb', to: 'w1' },
      { from: 'lb', to: 'w2' },
      { from: 'lb', to: 'w3' },
      { from: 'w1', to: 'db' },
      { from: 'w2', to: 'db' },
      { from: 'w3', to: 'db' }
    ];
    this.packets = [];
    this.particles = [];
    this.floatingTexts = [];
    this.dashGhosts = [];
    this.pingy.x = 225;
    this.pingy.y = 435;
  }

  private setupLevel(lvl: number) {
    this.level = lvl;
    const cfg = LEVELS[lvl - 1] ?? LEVELS[0];
    this.waveDuration = cfg.durationSec;
    this.waveTimeLeft = cfg.durationSec;
    this.waveElapsed = 0;
    this.spawnTimer = 0.4;
    this.packets = [];
    this.particles = [];
    this.floatingTexts = [];
    this.dashGhosts = [];
    this.roundRobinCursor = 0;
    this.shardCursor = 0;
    this.latencySamples = [15, 18, 22];
    this.p99LatencyMs = 21;

    // Reset level flags
    this.lbDeployed = lvl > 1;
    this.routingPolicy = lvl === 1 ? 'ROUND_ROBIN' : 'LEAST_CONN';
    this.cacheDeployed = lvl > 2;
    this.cacheTTL = 'BALANCED';
    this.cacheStale = false;
    this.cacheStaleTimer = 0;
    this.cacheHits = 0;
    this.cacheLookups = 0;
    this.invalidateTimer = 6.5;
    this.replicaDeployed = false;
    this.shardingDeployed = false;
    this.replicationLag = 0;
    this.breakerState = 'CLOSED';
    this.asyncQueueDeployed = false;
    this.asyncQueueBuffer = [];
    this.downstreamDown = false;
    this.downstreamCycleTimer = 5.5;
    this.capMode = 'CP';
    this.partitionActive = true;
    this.partitionCycleTimer = 11;
    this.splitConflicts = 0;

    this.pingy.x = 250;
    this.pingy.y = 430;
    this.pingy.vx = 0;
    this.pingy.vy = 0;

    if (lvl === 1) {
      this.nodes = [
        this.makeNode('ingress', 'INGRESS', 'EDGE ROUTER', 'INGRESS', 100, 290, 110, 74, 99, 99),
        this.makeNode('monolith', 'MONOLITH-01', 'SINGLE SERVER', 'MONOLITH', 475, 290, 146, 92, 6, 2.2),
        this.makeNode('db', 'CORE DB', 'STORAGE', 'PRIMARY_DB', 835, 290, 124, 84, 12, 6.5)
      ];
      this.nodes[1].interactiveHint = '[E] DEPLOY LB + WORKERS (80 CR)';
      this.edges = [
        { from: 'ingress', to: 'monolith' },
        { from: 'monolith', to: 'db' }
      ];
      this.logEvent('Wave 1 started: Monolith CPU spiking!', 'warn');
    } else if (lvl === 2) {
      this.nodes = [
        this.makeNode('ingress', 'INGRESS', '90% GET SURGE', 'INGRESS', 95, 290, 108, 74, 99, 99),
        this.makeNode('lb', 'LOAD BALANCER', 'LEAST CONN', 'LOAD_BALANCER', 275, 290, 122, 72, 14, 14),
        this.makeNode('w1', 'WORKER-01', 'APP NODE', 'WORKER', 475, 145, 114, 64, 7, 4.4),
        this.makeNode('w2', 'WORKER-02', 'APP NODE', 'WORKER', 475, 290, 114, 64, 7, 4.4),
        this.makeNode('w3', 'WORKER-03', 'APP NODE', 'WORKER', 475, 435, 114, 64, 7, 4.4),
        this.makeNode('db', 'CORE DB', 'READ BOTTLENECK', 'PRIMARY_DB', 840, 290, 126, 86, 6, 3.3)
      ];
      this.edges = [
        { from: 'ingress', to: 'lb' },
        { from: 'lb', to: 'w1' },
        { from: 'lb', to: 'w2' },
        { from: 'lb', to: 'w3' },
        { from: 'w1', to: 'db' },
        { from: 'w2', to: 'db' },
        { from: 'w3', to: 'db' }
      ];
      this.logEvent('Wave 2: Viral Read Storm! DB reads saturating.', 'warn');
    } else if (lvl === 3) {
      this.nodes = [
        this.makeNode('ingress', 'INGRESS', '65% POST WRITES', 'INGRESS', 95, 290, 108, 74, 99, 99),
        this.makeNode('lb', 'LOAD BALANCER', 'LEAST CONN', 'LOAD_BALANCER', 265, 290, 118, 72, 16, 16),
        this.makeNode('w1', 'WORKER-01', 'APP NODE', 'WORKER', 455, 150, 112, 64, 8, 4.8),
        this.makeNode('w2', 'WORKER-02', 'APP NODE', 'WORKER', 455, 290, 112, 64, 8, 4.8),
        this.makeNode('w3', 'WORKER-03', 'APP NODE', 'WORKER', 455, 430, 112, 64, 8, 4.8),
        this.makeNode('cache', 'REDIS CACHE', 'IN-MEMORY', 'CACHE', 640, 150, 116, 64, 14, 14),
        this.makeNode('db', 'PRIMARY DB', 'WRITE LOCK', 'PRIMARY_DB', 835, 290, 130, 86, 6, 3.2)
      ];
      this.edges = [
        { from: 'ingress', to: 'lb' },
        { from: 'lb', to: 'w1' },
        { from: 'lb', to: 'w2' },
        { from: 'lb', to: 'w3' },
        { from: 'w1', to: 'cache' },
        { from: 'w2', to: 'db' },
        { from: 'w3', to: 'db' },
        { from: 'cache', to: 'db' }
      ];
      this.logEvent('Wave 3: Heavy POST surge locking Primary DB!', 'warn');
    } else if (lvl === 4) {
      this.nodes = [
        this.makeNode('ingress', 'INGRESS', 'MIXED TRAFFIC', 'INGRESS', 95, 290, 106, 74, 99, 99),
        this.makeNode('lb', 'LOAD BALANCER', 'LEAST CONN', 'LOAD_BALANCER', 255, 290, 116, 70, 16, 16),
        this.makeNode('w1', 'WORKER-01', 'THREAD POOL', 'WORKER', 435, 155, 112, 64, 7, 4.6),
        this.makeNode('w2', 'WORKER-02', 'THREAD POOL', 'WORKER', 435, 290, 112, 64, 7, 4.6),
        this.makeNode('w3', 'WORKER-03', 'THREAD POOL', 'WORKER', 435, 425, 112, 64, 7, 4.6),
        this.makeNode('breaker', 'CIRCUIT BREAKER', 'CLOSED', 'BREAKER', 645, 185, 128, 70, 20, 20),
        this.makeNode('downstream', 'PAYMENTS API', 'HEALTHY', 'DOWNSTREAM_API', 845, 185, 128, 78, 8, 5.2),
        this.makeNode('db', 'SHARDED DB', 'CORE STORE', 'PRIMARY_DB', 845, 415, 128, 78, 14, 9.0)
      ];
      this.nodes[5].interactiveHint = '[E] FLIP BREAKER';
      this.edges = [
        { from: 'ingress', to: 'lb' },
        { from: 'lb', to: 'w1' },
        { from: 'lb', to: 'w2' },
        { from: 'lb', to: 'w3' },
        { from: 'w1', to: 'breaker' },
        { from: 'w2', to: 'breaker' },
        { from: 'w3', to: 'db' },
        { from: 'breaker', to: 'downstream' }
      ];
      this.logEvent('Wave 4: Downstream Payments API shows jitter!', 'warn');
    } else if (lvl === 5) {
      this.nodes = [
        this.makeNode('ingress_a', 'EAST INGRESS', 'ZONE A EDGE', 'INGRESS', 95, 165, 112, 70, 99, 99),
        this.makeNode('ingress_b', 'WEST INGRESS', 'ZONE B EDGE', 'INGRESS', 95, 415, 112, 70, 99, 99),
        this.makeNode('w_east', 'EAST WORKER', 'QUORUM NODE', 'WORKER', 310, 165, 122, 70, 9, 5.2),
        this.makeNode('w_west', 'WEST WORKER', 'MINORITY NODE', 'WORKER', 310, 415, 122, 70, 9, 5.2),
        this.makeNode('cap_bridge', 'CAP BRIDGE', 'CP: CONSISTENCY', 'CAP_BRIDGE', 515, 290, 134, 78, 20, 20),
        this.makeNode('zone_a_db', 'ZONE-A DB', 'PRIMARY QUORUM', 'ZONE_A_DB', 805, 165, 132, 82, 11, 5.4),
        this.makeNode('zone_b_db', 'ZONE-B DB', 'REPLICA PARTITION', 'ZONE_B_DB', 805, 415, 132, 82, 11, 5.4)
      ];
      this.nodes[4].interactiveHint = '[E] TOGGLE CP/AP OR MERGE';
      this.edges = [
        { from: 'ingress_a', to: 'w_east' },
        { from: 'ingress_b', to: 'w_west' },
        { from: 'w_east', to: 'zone_a_db' },
        { from: 'w_west', to: 'zone_b_db' },
        { from: 'zone_a_db', to: 'cap_bridge', dashed: true },
        { from: 'zone_b_db', to: 'cap_bridge', dashed: true }
      ];
      this.logEvent('BOSS WAVE 5: Network Partition detected across zones!', 'error');
    }
  }

  private deployLevel1LB() {
    this.lbDeployed = true;
    const oldMono = this.getNode('monolith');
    const savedPackets = oldMono ? oldMono.queue : [];

    this.nodes = [
      this.makeNode('ingress', 'INGRESS', 'EDGE ROUTER', 'INGRESS', 95, 290, 108, 74, 99, 99),
      this.makeNode('lb', 'LOAD BALANCER', 'ROUND ROBIN', 'LOAD_BALANCER', 300, 290, 128, 76, 16, 16),
      this.makeNode('w1', 'WORKER-01', 'STATELESS', 'WORKER', 570, 135, 118, 66, 6, 3.2),
      this.makeNode('w2', 'WORKER-02', 'STATELESS', 'WORKER', 570, 290, 118, 66, 6, 3.2),
      this.makeNode('w3', 'WORKER-03', 'STATELESS', 'WORKER', 570, 445, 118, 66, 6, 3.2),
      this.makeNode('db', 'CORE DB', 'STORAGE', 'PRIMARY_DB', 840, 290, 122, 84, 16, 9.0)
    ];
    this.nodes[1].interactiveHint = '[E] TOGGLE ROUTING POLICY';
    this.edges = [
      { from: 'ingress', to: 'lb' },
      { from: 'lb', to: 'w1' },
      { from: 'lb', to: 'w2' },
      { from: 'lb', to: 'w3' },
      { from: 'w1', to: 'db' },
      { from: 'w2', to: 'db' },
      { from: 'w3', to: 'db' }
    ];
    // Re-distribute saved packets across workers
    savedPackets.forEach((p, idx) => {
      const targetId = ['w1', 'w2', 'w3'][idx % 3];
      const w = this.getNode(targetId);
      if (w) {
        p.targetNodeId = targetId;
        w.queue.push(p);
      }
    });
    soundEngine.playInteract();
    this.burstParticles(300, 290, COLORS.cyan, 18);
    this.burstParticles(570, 135, COLORS.cyan, 10);
    this.burstParticles(570, 445, COLORS.cyan, 10);
    this.addFloat(300, 240, 'LB + 3 WORKERS ONLINE!', COLORS.cyan);
    this.logEvent('Deployed Load Balancer + 3 Stateless Workers', 'success');
  }

  private deployLevel2Cache() {
    this.cacheDeployed = true;
    const cacheNode = this.makeNode('cache', 'REDIS CACHE', 'TTL: 8s', 'CACHE', 665, 290, 122, 76, 16, 16);
    cacheNode.interactiveHint = '[E] FLUSH STALE CACHE';
    this.nodes.splice(5, 0, cacheNode);
    this.edges = [
      { from: 'ingress', to: 'lb' },
      { from: 'lb', to: 'w1' },
      { from: 'lb', to: 'w2' },
      { from: 'lb', to: 'w3' },
      { from: 'w1', to: 'cache' },
      { from: 'w2', to: 'cache' },
      { from: 'w3', to: 'cache' },
      { from: 'cache', to: 'db' }
    ];
    soundEngine.playInteract();
    this.burstParticles(665, 290, COLORS.cyan, 20);
    this.addFloat(665, 240, 'REDIS CACHE DEPLOYED!', COLORS.cyan);
    this.logEvent('Deployed In-Memory Redis Cache in front of DB', 'success');
  }

  private deployLevel3Replica() {
    this.replicaDeployed = true;
    const rep = this.makeNode('replica', 'READ REPLICA', 'LAG: 0%', 'READ_REPLICA', 835, 445, 128, 72, 10, 5.2);
    rep.interactiveHint = '[E] SYNC WAL LAG';
    rep.replicationLag = 0;
    this.nodes.push(rep);
    this.edges.push({ from: 'cache', to: 'replica' });
    this.edges.push({ from: 'db', to: 'replica', dashed: true, color: COLORS.amber });
    soundEngine.playInteract();
    this.burstParticles(835, 445, COLORS.cyan, 18);
    this.addFloat(835, 395, 'READ REPLICA ONLINE!', COLORS.cyan);
    this.logEvent('Deployed Read Replica for GET offloading', 'success');
  }

  private deployLevel3Sharding() {
    this.shardingDeployed = true;
    // Replace single Primary DB with Shard A & Shard B
    this.nodes = this.nodes.filter((n) => n.id !== 'db');
    const shardA = this.makeNode('shard_a', 'SHARD A (0-7)', 'PARTITION 1', 'SHARD_A', 835, 145, 130, 74, 8, 4.4);
    const shardB = this.makeNode('shard_b', 'SHARD B (8-F)', 'PARTITION 2', 'SHARD_B', 835, 295, 130, 74, 8, 4.4);
    this.nodes.push(shardA, shardB);
    this.edges = this.edges.filter((e) => e.from !== 'db' && e.to !== 'db');
    this.edges.push(
      { from: 'w2', to: 'shard_a' },
      { from: 'w3', to: 'shard_b' },
      { from: 'cache', to: 'shard_a' },
      { from: 'cache', to: 'shard_b' }
    );
    if (this.replicaDeployed) {
      this.edges.push({ from: 'shard_b', to: 'replica', dashed: true, color: COLORS.amber });
    }
    soundEngine.playInteract();
    this.burstParticles(835, 145, COLORS.amber, 16);
    this.burstParticles(835, 295, COLORS.amber, 16);
    this.addFloat(835, 100, 'HORIZONTAL SHARDING ACTIVE!', COLORS.amber);
    this.logEvent('Sharded Primary DB into Shard A + Shard B', 'success');
  }

  private deployLevel4Queue() {
    this.asyncQueueDeployed = true;
    const q = this.makeNode('async_queue', 'ASYNC QUEUE', 'BUFFER: 0', 'ASYNC_QUEUE', 645, 335, 128, 70, 18, 18);
    q.interactiveHint = '[E] DRAIN RETRY QUEUE';
    this.nodes.push(q);
    this.edges.push({ from: 'breaker', to: 'async_queue', dashed: true, color: COLORS.cyan });
    this.edges.push({ from: 'async_queue', to: 'downstream', dashed: true, color: COLORS.cyan });
    soundEngine.playInteract();
    this.burstParticles(645, 335, COLORS.cyan, 18);
    this.addFloat(645, 290, 'ASYNC RETRY QUEUE READY!', COLORS.cyan);
    this.logEvent('Deployed Async Message Queue for retries', 'success');
  }

  private makeNode(
    id: string,
    label: string,
    sublabel: string,
    kind: ClusterNode['kind'],
    x: number,
    y: number,
    w: number,
    h: number,
    baseCapacity: number,
    baseProcessRate: number
  ): ClusterNode {
    const capBonus = kind === 'WORKER' || kind === 'MONOLITH' || kind === 'PRIMARY_DB' || kind.startsWith('SHARD') || kind.includes('DB')
      ? this.upgrades.buffer * 2
      : 0;
    const rateMult = 1 + this.upgrades.overclock * 0.18;
    return {
      id,
      label,
      sublabel,
      kind,
      x,
      y,
      w,
      h,
      load: 0,
      capacity: baseCapacity + capBonus,
      queue: [],
      processRate: baseProcessRate * rateMult,
      heat: 0,
      highlightTimer: 0
    };
  }

  private getNode(id: string): ClusterNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }

  // ==================== SIMULATION UPDATE ====================

  private updateTitleAmbient(dt: number) {
    this.pingy.steamPhase += dt * 4;
    this.pingy.walkPhase += dt * 5;
    this.pingy.x = 240 + Math.sin(this.totalTime * 0.9) * 55;
    this.pingy.y = 430 + Math.cos(this.totalTime * 1.4) * 18;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.48;
      const targets = ['w1', 'w2', 'w3'];
      const target = targets[Math.floor(Math.random() * targets.length)];
      this.packets.push({
        id: this.nextId++,
        kind: Math.random() < 0.75 ? 'GET' : 'POST',
        x: 100,
        y: 290,
        vx: 0,
        vy: 0,
        fromNodeId: 'ingress',
        targetNodeId: 'lb',
        progress: 0,
        speed: 1.5,
        weight: 1,
        processRemaining: 0.25,
        overflow: false,
        ttl: 5,
        maxTtl: 5,
        radius: 9,
        hanging: false,
        zone: target === 'w1' ? 'A' : 'B'
      });
    }

    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i];
      const from = this.getNode(p.fromNodeId);
      const to = p.targetNodeId ? this.getNode(p.targetNodeId) : undefined;
      if (!from || !to) {
        this.packets.splice(i, 1);
        continue;
      }
      p.progress += dt * p.speed;
      p.x = from.x + (to.x - from.x) * p.progress;
      p.y = from.y + (to.y - from.y) * p.progress;
      if (p.progress >= 1) {
        if (to.id === 'lb') {
          p.fromNodeId = 'lb';
          p.targetNodeId = ['w1', 'w2', 'w3'][Math.floor(Math.random() * 3)];
          p.progress = 0;
        } else if (to.id.startsWith('w')) {
          p.fromNodeId = to.id;
          p.targetNodeId = 'db';
          p.progress = 0;
        } else {
          this.burstParticles(to.x, to.y, COLORS.cyan, 4);
          this.packets.splice(i, 1);
        }
      }
    }

    this.updateParticles(dt);
  }

  private updateSimulation(dt: number) {
    this.waveTimeLeft = Math.max(0, this.waveTimeLeft - dt);
    this.waveElapsed += dt;

    // 1. Update Pingy movement & dash
    this.updatePingy(dt);

    // 2. Level-specific timers
    this.updateLevelMechanics(dt);

    // 3. Spawn incoming packets
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const cfg = LEVELS[this.level - 1] ?? LEVELS[0];
      const progress = Math.min(1, this.waveElapsed / this.waveDuration);
      const rate = cfg.packetRateBase + (cfg.packetRatePeak - cfg.packetRateBase) * progress;
      this.spawnTimer = 1 / rate;
      this.spawnIncomingPacket();
    }

    // 4. Move packets along edges & handle overflow packets
    this.updatePackets(dt);

    // 5. Process queued packets inside nodes
    this.updateNodes(dt);

    // 6. Particles, floating texts, ghosts
    this.updateParticles(dt);

    // 7. Check Wave Clear / Game Over
    if (this.slaUptime < 80) {
      this.slaUptime = Math.max(0, this.slaUptime);
      this.victory = false;
      this.failureReason = 'SLA Uptime dropped below 80.0% — Cascading 503 Service Unavailable!';
      this.gameState = 'GAME_OVER';
      soundEngine.playGameOver();
      this.pushHud();
      return;
    }

    if (this.waveTimeLeft <= 0) {
      // Wave survived!
      const waveBonus = 110 + this.level * 25;
      this.credits += waveBonus;
      this.score += Math.round(this.slaUptime * 15);
      if (this.level >= LEVELS.length) {
        this.victory = true;
        this.gameState = 'GAME_OVER';
        soundEngine.playWaveClear();
      } else {
        this.gameState = 'ROUND_SUMMARY';
        soundEngine.playWaveClear();
      }
      this.pushHud();
    }
  }

  private updatePingy(dt: number) {
    const p = this.pingy;
    p.steamPhase += dt * 4.5;
    if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    if (p.interactPulse > 0) p.interactPulse = Math.max(0, p.interactPulse - dt * 3.4);

    let ax = 0;
    let ay = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) ay -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) ay += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) ax -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) ax += 1;

    if (ax !== 0 || ay !== 0) {
      const len = Math.hypot(ax, ay);
      ax /= len;
      ay /= len;
      p.facingX = ax;
      p.facingY = ay;
      p.walkPhase += dt * 16;
    }

    const speedMult = 1 + this.upgrades.sneakers * 0.16;
    const maxSpeed = 305 * speedMult;

    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.mood = 'DASH';
      this.dashGhosts.push({ x: p.x, y: p.y, life: 0.22, maxLife: 0.22 });
      if (this.dashGhosts.length > 14) this.dashGhosts.shift();
    } else {
      const targetVx = ax * maxSpeed;
      const targetVy = ay * maxSpeed;
      const lerp = 1 - Math.exp(-16 * dt);
      p.vx += (targetVx - p.vx) * lerp;
      p.vy += (targetVy - p.vy) * lerp;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Arena bounds
    p.x = Math.max(28, Math.min(ARENA_W - 28, p.x));
    p.y = Math.max(36, Math.min(ARENA_H - 36, p.y));

    // Mood based on cluster health
    if (p.dashTimer <= 0) {
      const hottest = this.getMaxNodeLoadPct();
      if (hottest >= 85) p.mood = 'ALERT';
      else if (this.combo >= 4) p.mood = 'HYPE';
      else p.mood = 'CHILL';
    }
  }

  private triggerDash() {
    const p = this.pingy;
    if (p.dashCooldown > 0) return;
    const cdMult = Math.max(0.4, 1 - this.upgrades.capacitor * 0.18);
    p.dashMaxCooldown = 0.85 * cdMult;
    p.dashCooldown = p.dashMaxCooldown;
    p.dashTimer = 0.15;

    const dirX = p.facingX || 1;
    const dirY = p.facingY || 0;
    const dashSpeed = 740 * (1 + this.upgrades.sneakers * 0.1);
    p.vx = dirX * dashSpeed;
    p.vy = dirY * dashSpeed;
    soundEngine.playDash();
    this.burstParticles(p.x, p.y, COLORS.cyan, 10);
  }

  private triggerInteract(targetX: number, targetY: number, checkNearbyNode: boolean) {
    const p = this.pingy;
    p.interactPulse = 1;
    const catchRadius = 96 * (1 + this.upgrades.capacitor * 0.2);

    // 1. Catch any overflow packets within Pingy radius OR click radius
    let caughtCount = 0;
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const pkt = this.packets[i];
      if (!pkt.overflow) continue;
      const distPingy = Math.hypot(pkt.x - p.x, pkt.y - p.y);
      const distTarget = Math.hypot(pkt.x - targetX, pkt.y - targetY);
      if (distPingy <= catchRadius || (!checkNearbyNode && distTarget <= 74)) {
        this.packets.splice(i, 1);
        caughtCount++;
        this.packetsCaught++;
        this.packetsServed++;
        this.combo = Math.min(12, this.combo + 1);
        this.peakCombo = Math.max(this.peakCombo, this.combo);
        const pts = 140 * this.combo;
        this.score += pts;
        this.credits += 14;
        this.slaUptime = Math.min(100, this.slaUptime + 0.45);
        this.burstParticles(pkt.x, pkt.y, COLORS.cyan, 12);
        this.addFloat(pkt.x, pkt.y - 16, `CATCH +${pts}`, COLORS.cyan);
      }
    }

    if (caughtCount > 0) {
      soundEngine.playCombo(this.combo);
    }

    // 2. Also interact with nearest interactive node if Pingy is close (when pressing E)
    if (checkNearbyNode) {
      const nearby = this.getNearbyInteractiveNode();
      if (nearby) {
        this.interactWithNode(nearby);
      }
    }
  }

  private getNearbyInteractiveNode(): ClusterNode | null {
    let best: ClusterNode | null = null;
    let bestDist = 128;
    for (const n of this.nodes) {
      if (!this.isNodeInteractive(n)) continue;
      const d = Math.hypot(n.x - this.pingy.x, n.y - this.pingy.y);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best;
  }

  private isNodeInteractive(n: ClusterNode): boolean {
    if (this.level === 1) {
      return (n.kind === 'MONOLITH' && !this.lbDeployed) || n.kind === 'LOAD_BALANCER';
    }
    if (this.level === 2) {
      return n.kind === 'CACHE' || (n.kind === 'PRIMARY_DB' && !this.cacheDeployed);
    }
    if (this.level === 3) {
      return n.kind === 'READ_REPLICA' || n.kind === 'PRIMARY_DB';
    }
    if (this.level === 4) {
      return n.kind === 'BREAKER' || n.kind === 'ASYNC_QUEUE';
    }
    if (this.level === 5) {
      return n.kind === 'CAP_BRIDGE';
    }
    return false;
  }

  private interactWithNode(n: ClusterNode): boolean {
    if (this.level === 1) {
      if (n.kind === 'MONOLITH' && !this.lbDeployed) {
        this.triggerOp('l1_deploy_lb');
        return true;
      }
      if (n.kind === 'LOAD_BALANCER') {
        this.triggerOp('l1_toggle_policy');
        return true;
      }
    } else if (this.level === 2) {
      if (n.kind === 'PRIMARY_DB' && !this.cacheDeployed) {
        this.triggerOp('l2_deploy_cache');
        return true;
      }
      if (n.kind === 'CACHE') {
        this.triggerOp('l2_flush_cache');
        return true;
      }
    } else if (this.level === 3) {
      if (n.kind === 'PRIMARY_DB' && !this.replicaDeployed) {
        this.triggerOp('l3_deploy_replica');
        return true;
      }
      if (n.kind === 'READ_REPLICA') {
        this.triggerOp('l3_sync_replica');
        return true;
      }
    } else if (this.level === 4) {
      if (n.kind === 'BREAKER') {
        this.triggerOp('l4_toggle_breaker');
        return true;
      }
      if (n.kind === 'ASYNC_QUEUE') {
        this.triggerOp('l4_drain_queue');
        return true;
      }
    } else if (this.level === 5) {
      if (n.kind === 'CAP_BRIDGE') {
        if (this.splitConflicts > 0) {
          this.triggerOp('l5_reconcile');
        } else {
          this.triggerOp('l5_toggle_cap');
        }
        return true;
      }
    }
    return false;
  }

  private updateLevelMechanics(dt: number) {
    // Level 2: Cache TTL decay & invalidation bursts
    if (this.level === 2 && this.cacheDeployed) {
      if (this.cacheStale) {
        this.cacheStaleTimer -= dt;
        if (this.cacheStaleTimer <= 0) {
          this.cacheStale = false;
          const cache = this.getNode('cache');
          if (cache) cache.staleKeys = false;
        }
      }
    }

    // Level 3: Replication lag growth
    if (this.level === 3 && this.replicaDeployed) {
      this.replicationLag = Math.min(100, this.replicationLag + dt * 4.5);
      const rep = this.getNode('replica');
      if (rep) {
        rep.replicationLag = this.replicationLag;
        rep.sublabel = `LAG: ${Math.round(this.replicationLag)}%`;
      }
    }

    // Level 4: Downstream outage cycles + Async Queue drain when healthy
    if (this.level === 4) {
      this.downstreamCycleTimer -= dt;
      if (this.downstreamCycleTimer <= 0) {
        this.downstreamDown = !this.downstreamDown;
        this.downstreamCycleTimer = this.downstreamDown ? 6.5 : 8.0;
        const ds = this.getNode('downstream');
        if (ds) {
          ds.degraded = this.downstreamDown;
          ds.sublabel = this.downstreamDown ? 'HANGING / 504' : 'HEALTHY';
          ds.highlightTimer = 0.6;
        }
        this.logEvent(
          this.downstreamDown
            ? 'ALERT: Downstream Payments API hanging!'
            : 'RECOVERED: Downstream Payments API healthy.',
          this.downstreamDown ? 'error' : 'success'
        );
        if (this.downstreamDown) soundEngine.playKlaxon();
      }

      if (!this.downstreamDown && this.asyncQueueDeployed && this.asyncQueueBuffer.length > 0) {
        // Slowly auto-drain buffered retries
        if (Math.random() < dt * 2.1) {
          this.asyncQueueBuffer.shift();
          this.recordSuccess(65, 36);
        }
      }
      const qNode = this.getNode('async_queue');
      if (qNode) {
        qNode.sublabel = `QUEUED: ${this.asyncQueueBuffer.length}`;
        qNode.load = this.asyncQueueBuffer.length;
      }
    }

    // Level 5: Network Partition cycle & conflict drift
    if (this.level === 5) {
      this.partitionCycleTimer -= dt;
      if (this.partitionCycleTimer <= 0) {
        this.partitionActive = !this.partitionActive;
        this.partitionCycleTimer = this.partitionActive ? 11.5 : 4.2;
        this.logEvent(
          this.partitionActive
            ? 'PARTITION SPLIT: US-EAST & US-WEST isolated!'
            : 'PARTITION HEALED: Cluster link restored temporarily.',
          this.partitionActive ? 'error' : 'success'
        );
        if (!this.partitionActive && this.splitConflicts > 0) {
          // Auto-help partial merge on heal
          const merged = Math.ceil(this.splitConflicts * 0.5);
          this.splitConflicts -= merged;
          this.addFloat(515, 240, `AUTO-SYNCED ${merged}`, COLORS.cyan);
        }
      }
      const bridge = this.getNode('cap_bridge');
      if (bridge) {
        bridge.conflicts = this.splitConflicts;
      }
      if (this.splitConflicts >= 10) {
        // Too much divergence damages SLA!
        this.slaUptime -= dt * 3.8;
        soundEngine.playKlaxon();
      }
    }
  }

  private getTtlSeconds(): number {
    if (this.cacheTTL === 'SHORT') return 3;
    if (this.cacheTTL === 'BALANCED') return 8;
    return 15;
  }

  private spawnIncomingPacket() {
    let kind: PacketKind = 'GET';
    const r = Math.random();

    if (this.level === 1) {
      kind = r < 0.24 ? 'HEAVY' : r < 0.5 ? 'POST' : 'GET';
    } else if (this.level === 2) {
      this.invalidateTimer -= 0.15;
      if (r < 0.1) kind = 'INVALIDATE';
      else if (r < 0.15) kind = 'POST';
      else kind = 'GET';
    } else if (this.level === 3) {
      kind = r < 0.64 ? 'POST' : 'GET';
    } else if (this.level === 4) {
      if (this.downstreamDown && r < 0.58) kind = 'TIMEOUT';
      else if (r < 0.35) kind = 'POST';
      else kind = 'GET';
    } else if (this.level === 5) {
      if (r < 0.2) kind = 'HEAVY';
      else if (r < 0.62) kind = 'POST';
      else kind = 'GET';
    }

    const weight = kind === 'HEAVY' ? 2.6 : kind === 'POST' ? 1.35 : 1.0;

    if (this.level === 5) {
      const zone: 'A' | 'B' = Math.random() < 0.52 ? 'A' : 'B';
      const ingressId = zone === 'A' ? 'ingress_a' : 'ingress_b';
      const ingress = this.getNode(ingressId);
      const targetId = zone === 'A' ? 'w_east' : 'w_west';
      this.packets.push({
        id: this.nextId++,
        kind,
        x: ingress?.x ?? 95,
        y: ingress?.y ?? 200,
        vx: 0,
        vy: 0,
        fromNodeId: ingressId,
        targetNodeId: targetId,
        progress: 0,
        speed: 1.75,
        weight,
        processRemaining: 0.25 * weight,
        overflow: false,
        ttl: 5,
        maxTtl: 5,
        radius: kind === 'HEAVY' ? 12 : 9,
        hanging: false,
        zone
      });
      return;
    }

    const firstTarget = this.lbDeployed ? 'lb' : 'monolith';
    const ingress = this.getNode('ingress');
    this.packets.push({
      id: this.nextId++,
      kind,
      x: ingress?.x ?? 95,
      y: ingress?.y ?? 290,
      vx: 0,
      vy: 0,
      fromNodeId: 'ingress',
      targetNodeId: firstTarget,
      progress: 0,
      speed: 1.75,
      weight,
      processRemaining: 0.24 * weight,
      overflow: false,
      ttl: 5,
      maxTtl: 5,
      radius: kind === 'HEAVY' ? 12 : 9,
      hanging: kind === 'TIMEOUT'
    });
  }

  private updatePackets(dt: number) {
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i];

      if (p.overflow) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.pow(0.28, dt);
        p.vy *= Math.pow(0.28, dt);

        // Bounce inside arena
        if (p.x < 32 || p.x > ARENA_W - 32) {
          p.vx *= -0.8;
          p.x = Math.max(32, Math.min(ARENA_W - 32, p.x));
        }
        if (p.y < 38 || p.y > ARENA_H - 38) {
          p.vy *= -0.8;
          p.y = Math.max(38, Math.min(ARENA_H - 38, p.y));
        }

        p.ttl -= dt;
        if (p.ttl <= 0) {
          this.packets.splice(i, 1);
          this.recordDrop(p.x, p.y, '503 TIMEOUT');
        }
        continue;
      }

      const from = this.getNode(p.fromNodeId);
      const to = p.targetNodeId ? this.getNode(p.targetNodeId) : undefined;
      if (!from || !to) {
        this.packets.splice(i, 1);
        continue;
      }

      p.progress += dt * p.speed;
      p.x = from.x + (to.x - from.x) * Math.min(1, p.progress);
      p.y = from.y + (to.y - from.y) * Math.min(1, p.progress);

      if (p.progress >= 1) {
        this.packets.splice(i, 1);
        this.arriveAtNode(p, to);
      }
    }
  }

  private arriveAtNode(p: PacketEntity, node: ClusterNode) {
    // Load balancer routes immediately without queuing heavily
    if (node.kind === 'LOAD_BALANCER') {
      const workers = this.nodes.filter((n) => n.kind === 'WORKER');
      if (workers.length === 0) return;

      let chosen = workers[0];
      if (this.routingPolicy === 'ROUND_ROBIN') {
        chosen = workers[this.roundRobinCursor % workers.length];
        this.roundRobinCursor++;
      } else {
        // Least Connections: choose worker with lowest queue load
        chosen = workers.reduce((best, curr) =>
          curr.queue.length < best.queue.length ? curr : best
        );
      }

      p.fromNodeId = node.id;
      p.targetNodeId = chosen.id;
      p.progress = 0;
      p.speed = 2.05;
      this.packets.push(p);
      return;
    }

    // Level 2 Cache logic
    if (node.kind === 'CACHE') {
      if (p.kind === 'INVALIDATE') {
        this.cacheStale = true;
        this.cacheStaleTimer = this.getTtlSeconds();
        node.staleKeys = true;
        node.highlightTimer = 0.35;
        this.addFloat(node.x, node.y - 34, 'KEY MUTATED!', COLORS.amber);
        // Forward mutation to DB
        p.fromNodeId = node.id;
        p.targetNodeId = this.pickDbTarget(p);
        p.progress = 0;
        this.packets.push(p);
        return;
      }

      if (p.kind === 'GET') {
        this.cacheLookups++;
        const hitChance =
          this.cacheTTL === 'LONG' ? 0.92 : this.cacheTTL === 'BALANCED' ? 0.8 : 0.56;
        if (Math.random() < hitChance) {
          this.cacheHits++;
          if (this.cacheStale && this.cacheTTL !== 'SHORT') {
            // Stale read!
            this.slaUptime -= 0.75;
            this.combo = 1;
            this.addFloat(node.x, node.y - 32, 'STALE READ!', COLORS.amber);
            this.burstParticles(node.x, node.y, COLORS.amber, 5);
            soundEngine.playKlaxon();
          } else {
            this.recordSuccess(55, 4);
            soundEngine.playCacheHit();
            this.burstParticles(node.x, node.y, COLORS.cyan, 4);
            if (Math.random() < 0.25) {
              this.addFloat(node.x, node.y - 26, 'CACHE HIT 4ms', COLORS.cyan);
            }
          }
          return;
        }
      }

      // Cache miss or POST -> forward to DB / Replica
      p.fromNodeId = node.id;
      p.targetNodeId = this.pickDbTarget(p);
      p.progress = 0;
      this.packets.push(p);
      return;
    }

    // Level 4 Circuit Breaker logic
    if (node.kind === 'BREAKER') {
      if (this.breakerState === 'OPEN') {
        if (this.asyncQueueDeployed) {
          if (this.asyncQueueBuffer.length < 22) {
            this.asyncQueueBuffer.push(p);
            this.burstParticles(node.x, node.y, COLORS.cyan, 4);
            if (Math.random() < 0.3) {
              this.addFloat(node.x, node.y - 28, 'QUEUED ASYNC', COLORS.cyan);
            }
          } else {
            this.recordDrop(node.x, node.y, 'QUEUE FULL 503');
          }
        } else {
          // Fail fast! If downstream IS actually down, fail-fast saves workers (tiny penalty vs meltdown)
          if (this.downstreamDown) {
            this.recordSuccess(25, 8);
            if (Math.random() < 0.25) {
              this.addFloat(node.x, node.y - 28, 'FAIL-FAST OK', COLORS.amber);
            }
          } else {
            // Left breaker OPEN while downstream is healthy -> dropped valid traffic!
            this.slaUptime -= 0.9;
            this.combo = 1;
            this.addFloat(node.x, node.y - 28, 'BREAKER BLOCKED!', COLORS.red);
          }
        }
        return;
      }

      // Breaker is CLOSED -> forward to Downstream API
      p.fromNodeId = node.id;
      p.targetNodeId = 'downstream';
      p.progress = 0;
      this.packets.push(p);
      return;
    }

    // Level 4 Downstream API
    if (node.kind === 'DOWNSTREAM_API') {
      if (this.downstreamDown || p.kind === 'TIMEOUT') {
        // Stalls and spills back onto workers / overflows!
        node.queue.push({ ...p, processRemaining: 1.9 });
        if (node.queue.length > node.capacity) {
          node.queue.pop();
          this.spillOverflow(node, p);
        }
        return;
      }
      this.recordSuccess(60, 26);
      this.burstParticles(node.x, node.y, COLORS.green, 5);
      return;
    }

    // Level 5 Zone DBs under Partition
    if (node.kind === 'ZONE_A_DB' || node.kind === 'ZONE_B_DB') {
      if (this.partitionActive && p.kind === 'POST') {
        if (this.capMode === 'CP') {
          if (node.kind === 'ZONE_B_DB') {
            // Minority partition rejects writes cleanly to protect consistency
            this.addFloat(node.x, node.y - 32, '503 QUORUM LOCK', COLORS.amber);
            this.slaUptime -= 0.45;
            return;
          }
        } else {
          // AP Mode: Both sides accept writes, creating Vector Clock Conflicts!
          if (node.kind === 'ZONE_B_DB' || Math.random() < 0.35) {
            this.splitConflicts++;
            this.addFloat(515, 290 - 30, 'CONFLICT +1', COLORS.magenta);
            this.burstParticles(515, 290, COLORS.magenta, 5);
          }
        }
      }
    }

    // Standard queuing node (Monolith, Worker, DB, Replica, Shard)
    if (node.queue.length >= node.capacity) {
      this.spillOverflow(node, p);
      return;
    }

    const baseProc =
      node.kind === 'MONOLITH'
        ? 0.46
        : node.kind === 'PRIMARY_DB'
        ? 0.34
        : node.kind === 'READ_REPLICA'
        ? 0.22
        : 0.27;
    p.processRemaining = (baseProc * p.weight) / (1 + this.upgrades.overclock * 0.18);
    node.queue.push(p);
  }

  private pickDbTarget(p: PacketEntity): string {
    if (this.level === 3) {
      if (p.kind === 'GET' && this.replicaDeployed) {
        return 'replica';
      }
      if (this.shardingDeployed) {
        this.shardCursor++;
        return this.shardCursor % 2 === 0 ? 'shard_a' : 'shard_b';
      }
      return 'db';
    }
    if (this.level === 4) {
      return p.kind === 'POST' || p.kind === 'TIMEOUT' ? 'breaker' : 'db';
    }
    return 'db';
  }

  private updateNodes(dt: number) {
    let anyCritical = false;

    for (const node of this.nodes) {
      if (node.highlightTimer > 0) node.highlightTimer = Math.max(0, node.highlightTimer - dt);
      if (node.kind === 'INGRESS' || node.kind === 'LOAD_BALANCER' || node.kind === 'CACHE' || node.kind === 'BREAKER' || node.kind === 'ASYNC_QUEUE' || node.kind === 'CAP_BRIDGE') {
        continue;
      }

      node.load = node.queue.length;
      const loadRatio = node.capacity > 0 ? node.load / node.capacity : 0;
      node.heat += ((loadRatio > 0.75 ? loadRatio : 0) - node.heat) * Math.min(1, dt * 6);

      if (loadRatio >= 0.85) {
        anyCritical = true;
        if (Math.random() < dt * 7) {
          this.burstParticles(node.x + (Math.random() - 0.5) * node.w * 0.6, node.y - node.h / 2, COLORS.amber, 1);
        }
      }

      // Process front packet(s) — up to 2 concurrent threads on DB/Workers
      const concurrency = node.kind === 'MONOLITH' ? 1 : 2;
      for (let slot = 0; slot < concurrency && slot < node.queue.length; slot++) {
        const pkt = node.queue[slot];
        pkt.processRemaining -= dt * (node.processRate / 3.0);
      }

      // Pop completed packets
      for (let q = node.queue.length - 1; q >= 0; q--) {
        if (node.queue[q].processRemaining <= 0) {
          const done = node.queue.splice(q, 1)[0];
          this.onNodeFinishPacket(node, done);
        }
      }
    }

    if (anyCritical) {
      soundEngine.playKlaxon();
    }
  }

  private onNodeFinishPacket(node: ClusterNode, p: PacketEntity) {
    if (node.kind === 'MONOLITH') {
      p.fromNodeId = node.id;
      p.targetNodeId = 'db';
      p.progress = 0;
      this.packets.push(p);
      return;
    }

    if (node.kind === 'WORKER') {
      if (this.level === 5) {
        p.fromNodeId = node.id;
        p.targetNodeId = node.id === 'w_east' ? 'zone_a_db' : 'zone_b_db';
        p.progress = 0;
        this.packets.push(p);
        return;
      }
      if (this.level === 4) {
        p.fromNodeId = node.id;
        p.targetNodeId = p.kind === 'GET' ? 'db' : 'breaker';
        p.progress = 0;
        this.packets.push(p);
        return;
      }
      if (this.cacheDeployed) {
        p.fromNodeId = node.id;
        p.targetNodeId = 'cache';
        p.progress = 0;
        this.packets.push(p);
        return;
      }
      p.fromNodeId = node.id;
      p.targetNodeId = this.pickDbTarget(p);
      p.progress = 0;
      this.packets.push(p);
      return;
    }

    // DB / Replica / Shard / Zone DB completed!
    if (node.kind === 'READ_REPLICA' && (node.replicationLag ?? 0) >= 75) {
      this.slaUptime -= 0.7;
      this.combo = 1;
      this.addFloat(node.x, node.y - 34, 'REPLICA LAG STALE!', COLORS.amber);
      soundEngine.playKlaxon();
      return;
    }

    const baseLatency = 16 + Math.round((node.queue.length / Math.max(1, node.capacity)) * 65);
    this.recordSuccess(45 * p.weight, baseLatency);
    soundEngine.playOk();
    this.burstParticles(node.x, node.y, COLORS.green, 4);
  }

  private spillOverflow(node: ClusterNode, p: PacketEntity) {
    // Limit simultaneous floor overflow packets for readability
    const overflowCount = this.packets.filter((x) => x.overflow).length;
    if (overflowCount >= 14) {
      this.recordDrop(node.x, node.y, '503 OVERFLOW');
      return;
    }
    const angle = Math.random() * Math.PI * 2;
    const speed = 120 + Math.random() * 90;
    this.packets.push({
      ...p,
      x: node.x,
      y: node.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      overflow: true,
      ttl: 4.6,
      maxTtl: 4.6
    });
    this.burstParticles(node.x, node.y, COLORS.amber, 5);
    if (Math.random() < 0.35) {
      this.addFloat(node.x, node.y - 32, 'SPILL! CATCH [E]', COLORS.amber);
    }
  }

  private recordSuccess(basePoints: number, latencyMs: number) {
    this.packetsServed++;
    this.score += Math.round(basePoints * (1 + (this.combo - 1) * 0.2));
    this.credits += 4;
    this.slaUptime = Math.min(100, this.slaUptime + 0.04);

    this.latencySamples.push(latencyMs);
    if (this.latencySamples.length > 40) this.latencySamples.shift();
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    this.p99LatencyMs = Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? latencyMs);
  }

  private recordDrop(x: number, y: number, reason: string) {
    this.packetsDropped++;
    this.combo = 1;
    this.slaUptime = Math.max(0, this.slaUptime - 2.4);
    this.latencySamples.push(280);
    if (this.latencySamples.length > 40) this.latencySamples.shift();
    soundEngine.play503();
    this.burstParticles(x, y, COLORS.red, 12);
    this.addFloat(x, y - 16, reason, COLORS.red);
    this.logEvent(`${reason} dropped SLA to ${this.slaUptime.toFixed(1)}%`, 'error');
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy * dt;
      ft.life -= dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
    for (let i = this.dashGhosts.length - 1; i >= 0; i--) {
      const g = this.dashGhosts[i];
      g.life -= dt;
      if (g.life <= 0) this.dashGhosts.splice(i, 1);
    }
  }

  private burstParticles(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 150) this.particles.shift();
      const angle = Math.random() * Math.PI * 2;
      const spd = 45 + Math.random() * 140;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.55,
        size: 2.5 + Math.random() * 3,
        color,
        square: true
      });
    }
  }

  private addFloat(x: number, y: number, text: string, color: string) {
    if (this.floatingTexts.length >= 24) this.floatingTexts.shift();
    this.floatingTexts.push({
      id: this.nextId++,
      x,
      y,
      vy: -36,
      text,
      color,
      life: 0.95,
      maxLife: 0.95
    });
  }

  private spawnRing(x: number, y: number, color: string) {
    this.burstParticles(x, y, color, 10);
  }

  private logEvent(message: string, severity: ClusterEvent['severity']) {
    const now = new Date();
    const ts = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    this.events.unshift({
      id: this.nextId++,
      timestamp: ts,
      message,
      severity
    });
    if (this.events.length > 6) this.events.pop();
  }

  private getMaxNodeLoadPct(): number {
    let maxPct = 0;
    for (const n of this.nodes) {
      if (n.kind === 'INGRESS' || n.kind === 'LOAD_BALANCER' || n.kind === 'CACHE' || n.kind === 'BREAKER' || n.kind === 'CAP_BRIDGE') {
        continue;
      }
      const pct = n.capacity > 0 ? Math.round((n.queue.length / n.capacity) * 100) : 0;
      if (pct > maxPct) maxPct = pct;
    }
    return maxPct;
  }

  // ==================== CANVAS RENDERER ====================

  private draw() {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(ARENA_W * dpr);
    const targetH = Math.round(ARENA_H * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Deep Midnight Background + PCB Circuit Grid
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);

    ctx.strokeStyle = 'rgba(0, 245, 212, 0.045)';
    ctx.lineWidth = 1;
    const grid = 40;
    ctx.beginPath();
    for (let x = grid; x < ARENA_W; x += grid) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ARENA_H);
    }
    for (let y = grid; y < ARENA_H; y += grid) {
      ctx.moveTo(0, y);
      ctx.lineTo(ARENA_W, y);
    }
    ctx.stroke();

    // Subtle radial ambient glow under cluster
    const rad = ctx.createRadialGradient(ARENA_W * 0.55, ARENA_H * 0.5, 20, ARENA_W * 0.55, ARENA_H * 0.5, 420);
    rad.addColorStop(0, 'rgba(0, 245, 212, 0.055)');
    rad.addColorStop(1, 'rgba(11, 15, 25, 0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);

    // 2. Draw Edges / Data Bus Conduits
    for (const edge of this.edges) {
      const from = this.getNode(edge.from);
      const to = this.getNode(edge.to);
      if (!from || !to) continue;

      ctx.save();
      ctx.strokeStyle = edge.color ?? 'rgba(131, 148, 143, 0.28)';
      ctx.lineWidth = 2;
      if (edge.dashed) {
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -this.totalTime * 28;
      }
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      // Animated data pulse dot along conduit
      const t = (this.totalTime * 0.65 + (from.y + to.y) * 0.001) % 1;
      const px = from.x + (to.x - from.x) * t;
      const py = from.y + (to.y - from.y) * t;
      ctx.fillStyle = edge.color ?? 'rgba(0, 245, 212, 0.45)';
      ctx.beginPath();
      ctx.arc(px, py, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Level 5 Network Partition Lightning Bolt
    if (this.level === 5 && this.gameState === 'PLAYING') {
      this.drawPartitionLightning(ctx);
    }

    // 4. Draw Nodes
    const nearbyNode = this.gameState === 'PLAYING' ? this.getNearbyInteractiveNode() : null;
    for (const node of this.nodes) {
      this.drawNode(ctx, node, nearbyNode?.id === node.id);
    }

    // 5. Draw Packets
    for (const pkt of this.packets) {
      this.drawPacket(ctx, pkt);
    }

    // 6. Draw Pingy Dash Ghosts & Pingy
    for (const g of this.dashGhosts) {
      const alpha = (g.life / g.maxLife) * 0.45;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = COLORS.cyan;
      ctx.fillRect(g.x - 16, g.y - 16, 32, 32);
      ctx.restore();
    }

    this.drawPingy(ctx);

    // 7. Particles & Floating Combat Text
    for (const pt of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      ctx.restore();
    }

    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (ft.life / ft.maxLife) * 1.4);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    ctx.restore();
  }

  private drawPartitionLightning(ctx: CanvasRenderingContext2D) {
    ctx.save();
    if (!this.partitionActive) {
      // Healed bridge shimmer
      ctx.strokeStyle = 'rgba(0, 245, 212, 0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(515, 36);
      ctx.lineTo(515, ARENA_H - 36);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Jagged electric magenta/cyan partition bolt
    ctx.strokeStyle = COLORS.magenta;
    ctx.lineWidth = 3;
    ctx.shadowColor = COLORS.magenta;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    const segments = 14;
    for (let i = 0; i <= segments; i++) {
      const y = 30 + ((ARENA_H - 60) / segments) * i;
      const jitter = i === 0 || i === segments ? 0 : Math.sin(this.totalTime * 22 + i * 2.3) * 14;
      if (i === 0) ctx.moveTo(515 + jitter, y);
      else ctx.lineTo(515 + jitter, y);
    }
    ctx.stroke();

    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.magenta;
    ctx.textAlign = 'center';
    ctx.fillText('NETWORK PARTITION (P)', 515, 24);
    ctx.restore();
  }

  private drawNode(ctx: CanvasRenderingContext2D, node: ClusterNode, isNearby: boolean) {
    const loadPct = node.capacity > 0 ? node.queue.length / node.capacity : 0;
    const isOverheat =
      loadPct >= 0.85 &&
      node.kind !== 'INGRESS' &&
      node.kind !== 'LOAD_BALANCER' &&
      node.kind !== 'CACHE' &&
      node.kind !== 'BREAKER';

    const shakeX = isOverheat ? (Math.random() - 0.5) * 3 : 0;
    const shakeY = isOverheat ? (Math.random() - 0.5) * 3 : 0;
    const x = node.x - node.w / 2 + shakeX;
    const y = node.y - node.h / 2 + shakeY;

    ctx.save();

    // Node border color by status
    let borderColor = '#2b3347';
    if (node.highlightTimer > 0) borderColor = COLORS.cyan;
    else if (node.degraded || isOverheat) borderColor = COLORS.red;
    else if (node.staleKeys || (node.replicationLag ?? 0) >= 70) borderColor = COLORS.amber;
    else if (node.kind === 'CACHE' || node.kind === 'LOAD_BALANCER' || node.kind === 'ASYNC_QUEUE') {
      borderColor = 'rgba(0, 245, 212, 0.55)';
    } else if (node.kind === 'BREAKER') {
      borderColor = this.breakerState === 'OPEN' ? COLORS.amber : COLORS.green;
    } else if (node.kind === 'CAP_BRIDGE') {
      borderColor = this.capMode === 'CP' ? COLORS.cyan : COLORS.magenta;
    }

    // Card background
    ctx.fillStyle = COLORS.surface;
    this.roundRect(ctx, x, y, node.w, node.h, 8);
    ctx.fill();

    ctx.strokeStyle = isNearby ? COLORS.cyan : borderColor;
    ctx.lineWidth = isNearby || node.highlightTimer > 0 ? 2 : 1.5;
    if (isNearby) {
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 10;
    }
    this.roundRect(ctx, x, y, node.w, node.h, 8);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Header label
    ctx.fillStyle = COLORS.text;
    ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(node.label, node.x + shakeX, y + 18);

    // Sublabel
    ctx.fillStyle = node.degraded
      ? COLORS.red
      : node.staleKeys
      ? COLORS.amber
      : node.kind === 'BREAKER'
      ? this.breakerState === 'OPEN'
        ? COLORS.amber
        : COLORS.green
      : COLORS.cyanDim;
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillText(node.sublabel, node.x + shakeX, y + 33);

    // Load gauge bar for queuing nodes
    if (
      node.kind !== 'INGRESS' &&
      node.kind !== 'LOAD_BALANCER' &&
      node.kind !== 'CACHE' &&
      node.kind !== 'BREAKER' &&
      node.kind !== 'CAP_BRIDGE'
    ) {
      const barW = node.w - 20;
      const barH = 7;
      const barX = x + 10;
      const barY = y + node.h - 22;

      ctx.fillStyle = '#0B0F19';
      this.roundRect(ctx, barX, barY, barW, barH, 3);
      ctx.fill();

      const fillPct = Math.min(1, node.queue.length / Math.max(1, node.capacity));
      ctx.fillStyle = fillPct >= 0.85 ? COLORS.red : fillPct >= 0.6 ? COLORS.amber : COLORS.cyan;
      if (fillPct > 0) {
        this.roundRect(ctx, barX, barY, Math.max(4, barW * fillPct), barH, 3);
        ctx.fill();
      }

      ctx.fillStyle = COLORS.muted;
      ctx.font = '500 9px "JetBrains Mono", monospace';
      ctx.fillText(`${node.queue.length}/${node.capacity} SLOTS`, node.x + shakeX, y + node.h - 6);
    } else if (node.kind === 'CAP_BRIDGE') {
      ctx.fillStyle = (node.conflicts ?? 0) > 0 ? COLORS.magenta : COLORS.muted;
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillText(`CONFLICTS: ${node.conflicts ?? 0}`, node.x, y + node.h - 14);
    }

    // Nearby [E] interact badge
    if (isNearby && node.interactiveHint) {
      ctx.fillStyle = '#00201a';
      this.roundRect(ctx, node.x - 74, y - 24, 148, 18, 4);
      ctx.fill();
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 1;
      this.roundRect(ctx, node.x - 74, y - 24, 148, 18, 4);
      ctx.stroke();
      ctx.fillStyle = COLORS.cyan;
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.fillText(node.interactiveHint.slice(0, 22), node.x, y - 12);
    }

    ctx.restore();
  }

  private drawPacket(ctx: CanvasRenderingContext2D, p: PacketEntity) {
    ctx.save();
    let color = COLORS.cyan;
    if (p.kind === 'POST') color = COLORS.amber;
    else if (p.kind === 'HEAVY') color = COLORS.magenta;
    else if (p.kind === 'INVALIDATE') color = '#FFE066';
    else if (p.kind === 'TIMEOUT') color = COLORS.red;

    if (p.overflow) {
      // Draw fuse ring around spilled packets so Pingy spots them immediately
      const fusePct = Math.max(0, p.ttl / p.maxTtl);
      ctx.strokeStyle = fusePct < 0.35 ? COLORS.red : COLORS.amber;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fusePct);
      ctx.stroke();
    }

    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = p.overflow ? 10 : 6;

    if (p.kind === 'HEAVY') {
      // Diamond shape for heavy packets
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-p.radius * 0.8, -p.radius * 0.8, p.radius * 1.6, p.radius * 1.6);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Tiny type tag on overflow or special packets
    if (p.overflow || p.kind === 'INVALIDATE' || p.kind === 'TIMEOUT') {
      ctx.fillStyle = '#0B0F19';
      ctx.font = '700 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label =
        p.kind === 'INVALIDATE' ? '!' : p.kind === 'TIMEOUT' ? 'X' : p.kind === 'HEAVY' ? 'H' : p.kind[0];
      ctx.fillText(label, p.x, p.y + 0.5);
    }

    ctx.restore();
  }

  private drawPingy(ctx: CanvasRenderingContext2D) {
    const p = this.pingy;
    ctx.save();

    // Expanding Catch / Interact Shockwave Ring
    if (p.interactPulse > 0) {
      const catchRadius = 96 * (1 + this.upgrades.capacitor * 0.2);
      const r = 18 + (1 - p.interactPulse) * catchRadius;
      ctx.strokeStyle = COLORS.cyan;
      ctx.globalAlpha = p.interactPulse * 0.85;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.translate(p.x, p.y);
    const speedMag = Math.hypot(p.vx, p.vy);
    const bob = speedMag > 20 ? Math.sin(p.walkPhase) * 2.5 : Math.sin(this.totalTime * 3) * 1.2;

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 21, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Neon Sneakers (animated step)
    const stepL = speedMag > 20 ? Math.sin(p.walkPhase) * 4 : 0;
    const stepR = speedMag > 20 ? -Math.sin(p.walkPhase) * 4 : 0;
    // Left sneaker
    ctx.fillStyle = COLORS.magenta;
    this.roundRect(ctx, -13, 12 + stepL, 10, 7, 3);
    ctx.fill();
    ctx.fillStyle = COLORS.cyan;
    ctx.fillRect(-13, 17 + stepL, 10, 2);
    // Right sneaker
    ctx.fillStyle = COLORS.magenta;
    this.roundRect(ctx, 3, 12 + stepR, 10, 7, 3);
    ctx.fill();
    ctx.fillStyle = COLORS.cyan;
    ctx.fillRect(3, 17 + stepR, 10, 2);

    ctx.translate(0, bob);

    // Coffee-Cup Antenna
    ctx.strokeStyle = COLORS.cyanDim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.quadraticCurveTo(4, -24, 2, -29);
    ctx.stroke();

    // Little Coffee Mug on top of antenna
    ctx.fillStyle = '#dfe2f1';
    this.roundRect(ctx, -5, -39, 12, 10, 2);
    ctx.fill();
    ctx.strokeStyle = '#dfe2f1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(8, -34, 3, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    // Coffee liquid top
    ctx.fillStyle = '#7e5800';
    ctx.fillRect(-3, -38, 8, 2.5);

    // Rising Steam puffs
    for (let s = 0; s < 2; s++) {
      const ph = (p.steamPhase + s * 1.6) % 3.2;
      const alpha = Math.max(0, 1 - ph / 3.2) * 0.7;
      ctx.fillStyle = `rgba(0, 245, 212, ${alpha})`;
      ctx.beginPath();
      ctx.arc(-1 + Math.sin(ph * 3 + s) * 3, -42 - ph * 5, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Server-Cube Chassis
    ctx.fillStyle = '#182138';
    ctx.strokeStyle = p.mood === 'ALERT' ? COLORS.red : COLORS.cyan;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = p.mood === 'ALERT' ? COLORS.red : COLORS.cyan;
    ctx.shadowBlur = 10;
    this.roundRect(ctx, -17, -17, 34, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Server rack vent lines at bottom of chassis
    ctx.fillStyle = '#2b3654';
    ctx.fillRect(-11, 6, 22, 2);
    ctx.fillRect(-11, 9.5, 14, 2);

    // Glowing Visor Shades
    ctx.fillStyle = '#070b14';
    this.roundRect(ctx, -13, -11, 26, 11, 3);
    ctx.fill();
    ctx.strokeStyle = p.mood === 'HYPE' ? COLORS.magenta : COLORS.cyan;
    ctx.lineWidth = 1.4;
    this.roundRect(ctx, -13, -11, 26, 11, 3);
    ctx.stroke();

    // Expressive LED Eyes inside visor shades
    ctx.fillStyle = p.mood === 'ALERT' ? COLORS.amber : p.mood === 'HYPE' ? COLORS.magenta : COLORS.cyan;
    const lookX = Math.max(-2, Math.min(2, p.facingX * 2));
    if (p.mood === 'DASH') {
      ctx.fillRect(-9 + lookX, -7, 6, 2.5);
      ctx.fillRect(3 + lookX, -7, 6, 2.5);
    } else if (p.mood === 'ALERT') {
      ctx.fillRect(-8, -9, 3, 6);
      ctx.fillRect(5, -9, 3, 6);
    } else {
      ctx.fillRect(-9 + lookX, -8, 4, 4);
      ctx.fillRect(5 + lookX, -8, 4, 4);
    }

    ctx.restore();
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ==================== HUD SNAPSHOT ====================

  private getActionControls(): ActionControl[] {
    if (this.level === 1) {
      return [
        {
          key: '1',
          id: 'l1_deploy_lb',
          label: this.lbDeployed ? 'LB + Workers Active' : 'Deploy LB + 3 Workers',
          subtext: this.lbDeployed ? 'Horizontal cluster online' : 'Splits monolith load',
          cost: this.lbDeployed ? undefined : 80,
          active: this.lbDeployed,
          disabled: this.lbDeployed || this.credits < 80,
          accent: 'cyan'
        },
        {
          key: '2',
          id: 'l1_toggle_policy',
          label: `Routing: ${this.routingPolicy === 'ROUND_ROBIN' ? 'Round Robin' : 'Least Conn'}`,
          subtext:
            this.routingPolicy === 'ROUND_ROBIN'
              ? 'Sequential (clicks to switch)'
              : 'Dynamic load-aware routing',
          active: this.routingPolicy === 'LEAST_CONN',
          disabled: !this.lbDeployed,
          accent: 'cyan'
        }
      ];
    }

    if (this.level === 2) {
      return [
        {
          key: '1',
          id: 'l2_deploy_cache',
          label: this.cacheDeployed ? 'Redis Cache Active' : 'Deploy Redis Cache',
          subtext: this.cacheDeployed ? 'Absorbing GET surge' : 'Sub-5ms in-memory reads',
          cost: this.cacheDeployed ? undefined : 100,
          active: this.cacheDeployed,
          disabled: this.cacheDeployed || this.credits < 100,
          accent: 'cyan'
        },
        {
          key: '2',
          id: 'l2_cycle_ttl',
          label: `Cache TTL: ${this.cacheTTL} (${this.getTtlSeconds()}s)`,
          subtext: 'Cycle Short / Balanced / Long',
          active: this.cacheDeployed,
          disabled: !this.cacheDeployed,
          accent: 'amber'
        },
        {
          key: '3',
          id: 'l2_flush_cache',
          label: this.cacheStale ? 'Flush Stale Keys!' : 'Flush Cache',
          subtext: this.cacheStale ? 'Stale data detected!' : 'Clear cached entries',
          active: this.cacheStale,
          disabled: !this.cacheDeployed,
          accent: this.cacheStale ? 'magenta' : 'cyan'
        }
      ];
    }

    if (this.level === 3) {
      return [
        {
          key: '1',
          id: 'l3_deploy_replica',
          label: this.replicaDeployed ? 'Read Replica Active' : 'Deploy Read Replica',
          subtext: this.replicaDeployed ? 'Offloading GET reads' : 'Isolate reads from writes',
          cost: this.replicaDeployed ? undefined : 100,
          active: this.replicaDeployed,
          disabled: this.replicaDeployed || this.credits < 100,
          accent: 'cyan'
        },
        {
          key: '2',
          id: 'l3_deploy_sharding',
          label: this.shardingDeployed ? 'DB Sharding Active' : 'Enable DB Sharding',
          subtext: this.shardingDeployed ? 'Shard A + Shard B active' : '2x POST write capacity',
          cost: this.shardingDeployed ? undefined : 140,
          active: this.shardingDeployed,
          disabled: this.shardingDeployed || this.credits < 140,
          accent: 'amber'
        },
        {
          key: '3',
          id: 'l3_sync_replica',
          label: `Sync Replica (${Math.round(this.replicationLag)}% lag)`,
          subtext: 'Prevent stale replica reads',
          active: this.replicationLag >= 60,
          disabled: !this.replicaDeployed,
          accent: this.replicationLag >= 60 ? 'magenta' : 'cyan'
        }
      ];
    }

    if (this.level === 4) {
      return [
        {
          key: '1',
          id: 'l4_toggle_breaker',
          label: `Breaker: ${this.breakerState}`,
          subtext:
            this.breakerState === 'OPEN'
              ? 'Failing fast (click to close)'
              : 'Forwarding to Payments API',
          active: this.breakerState === 'OPEN',
          disabled: false,
          accent: this.breakerState === 'OPEN' ? 'amber' : 'green'
        },
        {
          key: '2',
          id: 'l4_deploy_queue',
          label: this.asyncQueueDeployed ? 'Async Queue Active' : 'Deploy Async Queue',
          subtext: this.asyncQueueDeployed ? 'Buffering retries safely' : 'Decouple timeouts',
          cost: this.asyncQueueDeployed ? undefined : 120,
          active: this.asyncQueueDeployed,
          disabled: this.asyncQueueDeployed || this.credits < 120,
          accent: 'cyan'
        },
        {
          key: '3',
          id: 'l4_drain_queue',
          label: `Drain Queue (${this.asyncQueueBuffer.length})`,
          subtext: 'Process buffered retries',
          active: this.asyncQueueBuffer.length > 0,
          disabled: !this.asyncQueueDeployed || this.asyncQueueBuffer.length === 0,
          accent: 'cyan'
        }
      ];
    }

    return [
      {
        key: '1',
        id: 'l5_toggle_cap',
        label: `CAP Policy: ${this.capMode}`,
        subtext:
          this.capMode === 'CP'
            ? 'Consistency (lock minority writes)'
            : 'Availability (accept all writes)',
        active: true,
        disabled: false,
        accent: this.capMode === 'CP' ? 'cyan' : 'magenta'
      },
      {
        key: '2',
        id: 'l5_reconcile',
        label: `Merge Conflicts (${this.splitConflicts})`,
        subtext: 'Reconcile AP vector-clock drift',
        active: this.splitConflicts > 0,
        disabled: this.splitConflicts === 0,
        accent: this.splitConflicts > 0 ? 'magenta' : 'cyan'
      }
    ];
  }

  private pushHud() {
    const nearby = this.gameState === 'PLAYING' ? this.getNearbyInteractiveNode() : null;
    const hitRate =
      this.cacheLookups > 0 ? Math.round((this.cacheHits / this.cacheLookups) * 100) : 0;

    this.onHudUpdate({
      gameState: this.gameState,
      level: this.level,
      waveTimeLeft: Math.ceil(this.waveTimeLeft),
      waveDuration: this.waveDuration,
      score: this.score,
      combo: this.combo,
      peakCombo: this.peakCombo,
      p99LatencyMs: this.p99LatencyMs,
      slaUptime: Number(this.slaUptime.toFixed(1)),
      credits: this.credits,
      packetsServed: this.packetsServed,
      packetsDropped: this.packetsDropped,
      packetsCaught: this.packetsCaught,
      muted: soundEngine.isMuted(),
      victory: this.victory,
      failureReason: this.failureReason,
      maxNodeLoadPct: this.getMaxNodeLoadPct(),
      lbDeployed: this.lbDeployed,
      routingPolicy: this.routingPolicy,
      cacheDeployed: this.cacheDeployed,
      cacheTTL: this.cacheTTL,
      cacheStale: this.cacheStale,
      cacheHitRate: hitRate,
      replicaDeployed: this.replicaDeployed,
      shardingDeployed: this.shardingDeployed,
      replicationLag: Math.round(this.replicationLag),
      breakerState: this.breakerState,
      asyncQueueDeployed: this.asyncQueueDeployed,
      asyncQueueCount: this.asyncQueueBuffer.length,
      downstreamDown: this.downstreamDown,
      capMode: this.capMode,
      partitionActive: this.partitionActive,
      splitConflicts: this.splitConflicts,
      upgrades: { ...this.upgrades },
      actions: this.getActionControls(),
      events: [...this.events],
      nearbyPrompt: nearby?.interactiveHint ?? null
    });
  }
}
