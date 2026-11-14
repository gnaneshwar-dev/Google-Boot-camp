import { UpgradeDef } from './types';

export interface LevelConfig {
  level: number;
  title: string;
  subtitle: string;
  objective: string;
  durationSec: number;
  startingCredits: number;
  packetRateBase: number;
  packetRatePeak: number;
  takeaways: [string, string, string];
  architectureTip: string;
}

export const LEVELS: LevelConfig[] = [
  {
    level: 1,
    title: 'The Lonely Monolith',
    subtitle: 'Single-Node Overheat & Horizontal Scaling',
    objective:
      'Deploy a Load Balancer + 3 Stateless Workers before the Monolith melts down, then switch to Least Connections when heavy requests clog queues.',
    durationSec: 45,
    startingCredits: 100,
    packetRateBase: 2.3,
    packetRatePeak: 5.4,
    architectureTip:
      'Use [1] or walk to the Deploy Pad and press [E] to split the Monolith. Switch to Least Connections [2] so HEAVY requests never stall behind queued workers.',
    takeaways: [
      'A single monolith creates a Single Point of Failure (SPOF) and vertical CPU ceiling; horizontal scaling distributes load across stateless workers.',
      'Round Robin sends requests blindly in sequence, causing head-of-line blocking when heavy jobs share nodes with fast requests.',
      'Least Connections dynamically routes each incoming packet to the worker with the fewest active slots, flattening P99 tail latency.'
    ]
  },
  {
    level: 2,
    title: 'Viral Read Storm',
    subtitle: '90% GET Surge & Cache Invalidation',
    objective:
      'Place an In-Memory Cache in front of the Core DB to absorb 90% GET traffic. Tune TTL and flush stale keys when INVALIDATE writes land.',
    durationSec: 45,
    startingCredits: 140,
    packetRateBase: 4.0,
    packetRatePeak: 8.2,
    architectureTip:
      'Deploy Redis Cache [1] ASAP. Watch for yellow INVALIDATE writes—hit Flush Cache [3] or press [E] near the Cache to prevent stale reads!',
    takeaways: [
      'Read-heavy workloads (90%+ GETs) saturate database IOPS fast; an in-memory cache cuts read latency from tens of milliseconds to sub-5ms.',
      'Longer TTLs maximize cache hit ratio and protect the database, but increase the window for serving stale data after mutations.',
      'Explicit cache invalidation (write-through or targeted flush on mutations) balances high hit rates with fresh data correctness.'
    ]
  },
  {
    level: 3,
    title: 'Write Bottleneck',
    subtitle: 'Heavy POST Surge, Read Replicas & Sharding',
    objective:
      'Heavy POST writes are choking the Primary DB. Offload GETs to a Read Replica, Shard writes across Shard A/B, and sync replication lag.',
    durationSec: 45,
    startingCredits: 160,
    packetRateBase: 4.4,
    packetRatePeak: 8.8,
    architectureTip:
      'Deploy Read Replica [1] to isolate reads and Sharding [2] to double POST write throughput. Keep Replication Lag low with Sync [3]!',
    takeaways: [
      'Read Replicas scale GET capacity horizontally but do not increase write throughput, since every mutation still hits the Primary DB.',
      'Replication lag occurs when write volume outpaces async log shipping; reading immediately from a lagging replica risks stale state.',
      'Horizontal Sharding partitions data by key hash across independent primaries, multiplying write IOPS at the cost of cross-shard complexity.'
    ]
  },
  {
    level: 4,
    title: 'Domino Meltdown',
    subtitle: 'Cascading Timeouts, Circuit Breakers & Async Queues',
    objective:
      'A flaky Downstream API is hanging worker threads with red TIMEOUTs. Flip the Circuit Breaker OPEN during outages and buffer retries in an Async Queue.',
    durationSec: 45,
    startingCredits: 170,
    packetRateBase: 4.5,
    packetRatePeak: 8.6,
    architectureTip:
      'When Downstream turns RED, flip Circuit Breaker OPEN [1] immediately! Deploy Async Queue [2] so failed calls retry safely once Downstream recovers.',
    takeaways: [
      'Slow or hanging dependencies are often deadlier than instant errors because blocked threads exhaust worker pools and cascade upstream.',
      'A Circuit Breaker fails fast when downstream error/timeout rates spike, preserving upstream worker capacity while giving the dependency room to recover.',
      'Async Message Queues decouple ingestion from downstream execution, smoothing traffic spikes and enabling reliable background retries.'
    ]
  },
  {
    level: 5,
    title: 'Split-Brain Boss',
    subtitle: 'CAP Theorem Under Active Network Partition',
    objective:
      'A Network Partition splits US-EAST and US-WEST! Toggle between CP (Consistency) and AP (Availability), and reconcile AP conflicts before split-brain crashes SLA.',
    durationSec: 45,
    startingCredits: 200,
    packetRateBase: 5.0,
    packetRatePeak: 9.8,
    architectureTip:
      'Toggle [1] between CP (rejects minority writes safely during POST bursts) and AP (serves everything, then press [2] or [E] at the bridge to merge conflicts!).',
    takeaways: [
      'Under a Network Partition (P), the CAP theorem forces a strict runtime choice: preserve Consistency (CP) by fencing minority writes or preserve Availability (AP).',
      'CP systems protect invariants and avoid divergent state during splits, trading availability on the isolated side via quorum locks.',
      'AP systems stay writable on both sides of a partition, requiring conflict resolution mechanisms (CRDTs, vector clocks, or merge reconciliation) upon healing.'
    ]
  }
];

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'sneakers',
    name: 'Overclocked Sneakers',
    shortDesc: 'Boost Pingy movement speed across the server rack.',
    effectLabel: (lvl) => `+${(lvl + 1) * 16}% Move Speed`,
    baseCost: 70,
    costStep: 55,
    maxLevel: 3
  },
  {
    id: 'capacitor',
    name: 'Quantum Dash Capacitor',
    shortDesc: 'Faster dash recharge and wider packet-catch pulse.',
    effectLabel: (lvl) => `-${(lvl + 1) * 18}% Cooldown · +${(lvl + 1) * 20}% Radius`,
    baseCost: 85,
    costStep: 65,
    maxLevel: 3
  },
  {
    id: 'overclock',
    name: 'Worker Kernel Overclock',
    shortDesc: 'All compute and DB nodes drain request queues faster.',
    effectLabel: (lvl) => `+${(lvl + 1) * 18}% Node Throughput`,
    baseCost: 100,
    costStep: 75,
    maxLevel: 3
  },
  {
    id: 'buffer',
    name: 'NVMe Queue Buffers',
    shortDesc: 'Expand max concurrent queue capacity on every node.',
    effectLabel: (lvl) => `+${(lvl + 1) * 2} Max Slots / Node`,
    baseCost: 90,
    costStep: 70,
    maxLevel: 3
  },
  {
    id: 'sla_patch',
    name: 'Emergency SLA Hotfix',
    shortDesc: 'Restore +12% SLA uptime buffer before the next traffic wave.',
    effectLabel: () => '+12.0% SLA Uptime (One-Time)',
    baseCost: 65,
    costStep: 0,
    maxLevel: 99
  }
];
