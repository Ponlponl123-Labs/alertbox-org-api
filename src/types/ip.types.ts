/**
 * @deprecated
 * This type is no longer used
 * @see /src/types/geo-ip/ip.types.ts
 * @see /src/types/geo-ip/geoip.types.ts
 * 
 * @todo Remove this file when all usages are migrated
 */

export interface IPGeolocation {
  ip: string;
  city: string;
  region: string;
  region_code: string;
  country_code: string;
  country_code_iso3: string;
  country_name: string;
  country_capital: string;
  country_tld: string;
  continent_code: string;
  in_eu: boolean;
  postal: string;
  latitude: number;
  longitude: number;
  timezone: string;
  utc_offset: string;
  country_calling_code: string;
  currency: string;
  currency_name: string;
  languages: string;
  asn: string;
  org: string;
}
