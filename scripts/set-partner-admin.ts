import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

async function main() {
const email = process.argv.find((value) => value.includes("@"))?.trim().toLowerCase();
const confirmed = process.argv.includes("--confirm");

if (!email || !confirmed) {
  throw new Error("Usage: npm run partner:admin -- person@example.com --confirm");
}

const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
if (!user) throw new Error(`No application user exists for ${email}.`);

if (user.role !== UserRole.ADMIN) {
  await prisma.user.update({ where: { id: user.id }, data: { role: UserRole.ADMIN } });
}

console.info(`Administrator access is enabled for ${email}.`);
await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
