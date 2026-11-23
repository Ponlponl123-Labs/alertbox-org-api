export interface ViolationItem {
  timestamp: string;
  message: string;
  level: number;
}

export interface ViolationResponse {
  level: number;
  violate: ViolationItem[];
}
