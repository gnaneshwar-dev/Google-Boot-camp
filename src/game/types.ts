export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'ROUND_SUMMARY' | 'GAME_OVER';

export type PacketKind = 'GET' | 'POST' | 'HEAVY' | 'INVALIDATE' | 'TIMEOUT';

export type RoutingPolicy = 'ROUND_ROBIN' | 'LEAST_CONN';
export type CacheTTL = 'SHORT' | 'BALANCED' | 'LONG';
export type BreakerState = 'CLOSED' | 'OPEN';
export type CapMode = 'CP' | 'AP';

export type NodeKind =
  | 'INGRESS'
  | 'MONOLITH'
  | 'LOAD_BALANCER'
  | 'WORKER'
  | 'CACHE'
  | 'PRIMARY_DB'
  | 'READ_REPLICA'
  | 'SHARD_A'
  | 'SHARD_B'
  | 'BREAKER'
  | 'ASYNC_QUEUE'
  | 'DOWNSTREAM_API'
  | 'ZONE_A_DB'
  | 'ZONE_B_DB'
  | 'CAP_BRIDGE';

export interface ClusterNode {
  id: string;
  label: string;
  sublabel: string;
  kind: NodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  load: number; // active processing slots used
  capacity: number; // max concurrent slots
  queue: PacketEntity[]; // queued packets inside node
  processRate: number; // slots per second
  heat: number; // 0..1 visual overheat intensity
  highlightTimer: number;
  interactiveHint?: string;
  degraded?: boolean; // for downstream API in L4
  replicationLag?: number; // 0..100 for L3 replica
  staleKeys?: boolean; // for L2 cache
  conflicts?: number; // for L5 AP mode
  disabled?: boolean;
}

export interface PacketEntity {
  id: number;
  kind: PacketKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fromNodeId: string;
  targetNodeId: string | null;
  progress: number; // 0..1 along edge
  speed: number;
  weight: number; // processing cost (HEAVY = 2.6, normal = 1)
  processRemaining: number; // seconds left when inside a node
  overflow: boolean; // spilled on floor, Pingy can catch!
  ttl: number; // fuse before 503 if overflow
  maxTtl: number;
  radius: number;
  hanging: boolean; // L4 timeout stall
  requeued?: boolean;
  zone?: 'A' | 'B';
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  square?: boolean;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface DashGhost {
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

export interface PingyState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingX: number;
  facingY: number;
  dashTimer: number;
  dashCooldown: number;
  dashMaxCooldown: number;
  interactPulse: number; // 0..1 expanding ring
  walkPhase: number;
  mood: 'CHILL' | 'DASH' | 'ALERT' | 'HYPE';
  steamPhase: number;
}

export interface UpgradeLevels {
  sneakers: number; // +move speed
  capacitor: number; // -dash cd & +catch radius
  overclock: number; // +node process speed
  buffer: number; // +node capacity
}

export interface UpgradeDef {
  id: keyof UpgradeLevels | 'sla_patch';
  name: string;
  shortDesc: string;
  effectLabel: (lvl: number) => string;
  baseCost: number;
  costStep: number;
  maxLevel: number;
}

export interface ClusterEvent {
  id: number;
  timestamp: string;
  message: string;
  severity: 'info' | 'warn' | 'error' | 'success';
}

export interface ActionControl {
  key: string; // '1', '2', '3'
  id: string;
  label: string;
  subtext: string;
  cost?: number;
  active?: boolean;
  disabled?: boolean;
  accent?: 'cyan' | 'magenta' | 'amber' | 'green';
}

export interface HudSnapshot {
  gameState: GameState;
  level: number;
  waveTimeLeft: number;
  waveDuration: number;
  score: number;
  combo: number;
  peakCombo: number;
  p99LatencyMs: number;
  slaUptime: number;
  credits: number;
  packetsServed: number;
  packetsDropped: number;
  packetsCaught: number;
  muted: boolean;
  victory: boolean;
  failureReason: string;
  maxNodeLoadPct: number;
  // Level-specific tactical state
  lbDeployed: boolean;
  routingPolicy: RoutingPolicy;
  cacheDeployed: boolean;
  cacheTTL: CacheTTL;
  cacheStale: boolean;
  cacheHitRate: number;
  replicaDeployed: boolean;
  shardingDeployed: boolean;
  replicationLag: number;
  breakerState: BreakerState;
  asyncQueueDeployed: boolean;
  asyncQueueCount: number;
  downstreamDown: boolean;
  capMode: CapMode;
  partitionActive: boolean;
  splitConflicts: number;
  upgrades: UpgradeLevels;
  actions: ActionControl[];
  events: ClusterEvent[];
  nearbyPrompt: string | null;
}
