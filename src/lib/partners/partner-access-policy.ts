import { PartnerStatus } from "@prisma/client";

export function partnerCanRefer(partner: {
  status: PartnerStatus;
  referralEnabled: boolean;
}) {
  return partner.status === PartnerStatus.ACTIVE && partner.referralEnabled;
}

export function partnerCanScan(partner: {
  status: PartnerStatus;
  scannerEnabled: boolean;
}) {
  return partner.status === PartnerStatus.ACTIVE && partner.scannerEnabled;
}
