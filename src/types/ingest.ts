export interface JournalPayload {
  timestamp: string;
  eventType: string;
  data: Record<string, unknown>;
}

export interface StatusPayload {
  timestamp: string;
  flags?: number;
  fsdCharging?: boolean;
  fuel?: {
    main?: number;
    reserve?: number;
  };
  cargo?: number;
  hull?: number;
  shields?: number;
  starSystem?: string;
  bodyName?: string;
  stationName?: string;
}
