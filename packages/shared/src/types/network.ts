export type PeerStatus = "ONLINE" | "OFFLINE" | "SYNCING";

export interface NetworkPeer {
  id: string;
  name: string;
  endpoint: string;
  status: PeerStatus;
  lastSeenAt?: string;
  createdAt: string;
}
