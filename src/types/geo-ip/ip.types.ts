export type IPReservedRoleEnum = "NETWORK ADDRESS" | "DEFAULT GATEWAY" | "BROADCAST" | "LOOPBACK" | "LINK LOCAL";
export type IPTypeEnum = "GLOBAL" | "PRIVATE" | "MULTICAST" | "BROADCAST" | "LOOPBACK" | "LINK LOCAL" | "UNKNOWN";

export interface IPType {
    version: number;
    address: string;
    family: string;
    isCanonical: boolean;
    isMulticast: boolean;
    isLoopback: boolean;
    isLinkLocal: boolean;
    isPrivate: boolean;
    isPublic: boolean;
    isReserved: boolean;
    isUnicast: boolean;
    isBroadcast: boolean;
    isUnknown: boolean;
    reservedRole?: IPReservedRoleEnum | null;
    type: IPTypeEnum;
};