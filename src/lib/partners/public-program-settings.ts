import "server-only";

import type { PartnerProgramSettings } from "@prisma/client";

import { logError } from "@/lib/observability/log";
import { getPartnerProgramSettings } from "@/lib/partners/config";

type SettingsLoader = () => Promise<PartnerProgramSettings>;
type FailureReporter = (error: unknown) => void;

function reportSettingsFailure(error: unknown) {
  logError("public_partner_program_settings_unavailable", error);
}

export async function loadPublicPartnerProgramSettings(
  loadSettings: SettingsLoader = getPartnerProgramSettings,
  reportFailure: FailureReporter = reportSettingsFailure,
) {
  try {
    return await loadSettings();
  } catch (error) {
    reportFailure(error);
    return null;
  }
}
