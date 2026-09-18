export interface GeoIPCountry {
  name?: string;
  code?: string;
}

export interface GeoIPRegion {
  name?: string;
  code?: string;
}

export interface GeoIPContinent {
  name?: string;
  code?: string;
}

export interface GeoIPASN {
  asn?: string;
  name?: string;
  domain?: string;
  type?: string;
  last_changed?: string;
}

export interface GeoIPResponse {
  ip: string;
  ip_version?: number;
  country?: GeoIPCountry;
  region?: GeoIPRegion;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  postal_code?: string;
  continent?: GeoIPContinent;
  asn?: GeoIPASN;
  is_anonymous?: boolean;
  is_anycast?: boolean;
  is_hosting?: boolean;
  is_mobile?: boolean;
  is_satellite?: boolean;
  is_proxy?: boolean;
  is_relay?: boolean;
  is_tor?: boolean;
  is_vpn?: boolean;
  is_res_proxy?: boolean;
}
